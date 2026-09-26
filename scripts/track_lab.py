#!/usr/bin/env python3
"""
APEX KART — Track Lab.
Replicates the engine's spline math (closed Catmull-Rom, 320 samples) to
CALIBRATE the 12 redesigned circuits before they are transcribed to
TrackCatalog.ts:

  * length (target 1150-1400 m  =>  ~60 s lap at 100cc)
  * lap-time estimate from the AI speed-profile algorithm
  * corner census (hairpins / sweepers / esses)
  * elevation profile (crests, dips, total climb)
  * tunnel runs and real jump gaps (arc length, drop, flight-range check)
  * start-zone sanity (flat + straight + no gap under the grid)
  * self-intersection warnings (corridor discipline)
  * shortcut span derivation (mirrors TrackBuilder.computeShortcutSpans)

Usage:
  python3 scripts/track_lab.py               # full report
  python3 scripts/track_lab.py meadow volcano
  python3 scripts/track_lab.py --dump meadow # TS-ready control tuples
"""
import math
import sys

SAMPLES = 320
RAMP_SLOPE = 0.22      # launch-lip slope baked by TrackBuilder.applyJumpRamps
RAMP_LEN = 20.0        # meters of ramp before a gap (lip ~ 4.4 m)
GRAV = 26.0            # PHYS.gravity

# player model for lap estimate (100cc, medium class, decent drifting)
P_VTOP, P_ALAT, P_BRAKE, P_ACCEL, P_FUDGE = 23.6, 12.8, 12.0, 9.2, 1.07


def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * (2 * p1 + (-p0 + p2) * t +
                  (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                  (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


class Pt:
    __slots__ = ('x', 'y', 'z', 'bank', 'width', 'jump', 'tunnel')

    def __init__(self, x, y, z, bank=0.0, width=0.0, jump=False, tunnel=False):
        self.x, self.y, self.z = x, y, z
        self.bank, self.width, self.jump, self.tunnel = bank, width, jump, tunnel


def P(x, y, z, bank=0.0, width=0.0, jump=False, tunnel=False):
    return Pt(x, y, z, bank, width, jump, tunnel)


class Track:
    def __init__(self, tid, hw, pts, shortcuts=(), scale=1.0):
        self.id, self.hw, self.scale = tid, hw, scale
        if scale != 1.0:
            pts = [P(p.x * scale, p.y, p.z * scale, p.bank, p.width, p.jump, p.tunnel)
                   for p in pts]
            shortcuts = [[P(p.x * scale, p.y, p.z * scale) for p in sc] for sc in shortcuts]
        self.ctrl, self.shortcuts = list(pts), list(shortcuts)
        self.samples = []
        self._build()

    def _build(self):
        n = len(self.ctrl)
        get = lambda i: self.ctrl[(i % n + n) % n]
        cum = 0.0
        prev = None
        for i in range(SAMPLES):
            t = i / SAMPLES
            ft = t * n
            seg = int(ft)
            lt = ft - seg
            p0, p1, p2, p3 = get(seg - 1), get(seg), get(seg + 1), get(seg + 2)
            pos = (
                catmull(p0.x, p1.x, p2.x, p3.x, lt),
                catmull(p0.y, p1.y, p2.y, p3.y, lt),
                catmull(p0.z, p1.z, p2.z, p3.z, lt),
            )
            jump = p1.jump and p2.jump      # NEW semantics: gap only between the pair
            tunnel = p1.tunnel or p2.tunnel
            if prev is not None:
                cum += math.dist(pos, prev)
            self.samples.append({'pos': pos, 'jump': jump, 'tunnel': tunnel, 'dist': cum})
            prev = pos
        self.length = cum + math.dist(self.samples[0]['pos'], self.samples[-1]['pos'])
        for s in self.samples:
            s['s'] = s['dist'] / self.length

    # ------------------------------------------------------------------ utils
    def tangent(self, i):
        a = self.samples[(i - 1) % SAMPLES]['pos']
        b = self.samples[(i + 1) % SAMPLES]['pos']
        dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        l = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
        return dx / l, dy / l, dz / l

    def nearest_s(self, p):
        q = (p.x, p.y, p.z)
        best, bd = 0, 1e18
        for i in range(0, SAMPLES, 2):
            d = math.dist(self.samples[i]['pos'], q)
            if d < bd:
                bd, best = d, i
        return self.samples[best]['s']

    # ------------------------------------------------------------- lap profile
    def lap_estimate(self):
        N = SAMPLES
        kappa = [0.0] * N
        for i in range(N):
            a, b = self.tangent((i - 3) % N), self.tangent((i + 3) % N)
            cross = a[0] * b[2] - a[2] * b[0]
            ds = max(0.5, math.dist(self.samples[(i - 3) % N]['pos'],
                                    self.samples[(i + 3) % N]['pos']))
            kappa[i] = math.asin(max(-1.0, min(1.0, cross))) / ds
        vMax = [min(P_VTOP, math.sqrt(P_ALAT / max(abs(k), 1e-4))) for k in kappa]
        for _ in range(2):
            for i in range(N - 1, -1, -1):
                j = (i + 1) % N
                ds = max(0.5, math.dist(self.samples[j]['pos'], self.samples[i]['pos']))
                vMax[i] = min(vMax[i], math.sqrt(vMax[j] ** 2 + 2 * P_BRAKE * ds))
            for i in range(1, N + 1):
                j, p = i % N, i - 1
                ds = max(0.5, math.dist(self.samples[j]['pos'], self.samples[p]['pos']))
                vMax[j] = min(vMax[j], math.sqrt(vMax[p] ** 2 + 2 * P_ACCEL * ds))
        tt = 0.0
        for i in range(N):
            ds = self.samples[(i + 1) % N]['dist'] - self.samples[i]['dist']
            if ds <= 0:
                ds = self.length / N
            tt += ds / max(2.0, vMax[i])
        return tt * P_FUDGE

    # ------------------------------------------------------------- diagnostics
    def corners(self):
        """corners = 20-sample windows with >= 30 deg of net yaw change."""
        N = SAMPLES
        W = 20
        out = []
        i = 0
        while i < N:
            yaw0 = math.atan2(self.tangent(i)[0], self.tangent(i)[2])
            acc = 0.0
            sign = 0.0
            for k in range(1, W + 1):
                yaw = math.atan2(self.tangent((i + k) % N)[0], self.tangent((i + k) % N)[2])
                d = (yaw - yaw0 + math.pi) % (2 * math.pi) - math.pi
                if abs(d) > abs(acc):
                    acc = d
            if abs(math.degrees(acc)) >= 30.0:
                out.append((self.samples[i]['s'], math.degrees(acc)))
                i += W // 2
            else:
                i += 4
        return out

    def gaps(self):
        out, i = [], 0
        N = SAMPLES
        while i < N:
            if not self.samples[i]['jump']:
                i += 1
                continue
            start = i
            while i < N and self.samples[i]['jump']:
                i += 1
            end = min(i, N) - 1
            s0 = self.samples[start]
            s1 = self.samples[end % N]
            out.append({
                'at': s0['s'],
                'len': (s1['dist'] - s0['dist']) + 1.5 * (self.length / N),
                'drop': s1['pos'][1] - s0['pos'][1],
                'y0': s0['pos'][1],
            })
        return out

    def tunnels(self):
        runs, i = [], 0
        N = SAMPLES
        while i < N:
            if not self.samples[i]['tunnel']:
                i += 1
                continue
            start = i
            while i < N and self.samples[i]['tunnel']:
                i += 1
            end = min(i, N) - 1
            runs.append((self.samples[start]['s'],
                         self.samples[end % N]['dist'] - self.samples[start]['dist']))
        return runs

    def start_check(self):
        n0 = max(2, int(70 / (self.length / SAMPLES)))
        yaw0 = math.atan2(self.tangent(0)[0], self.tangent(0)[2])
        dyaw = 0.0
        for i in range(1, n0):
            yaw = math.atan2(self.tangent(i)[0], self.tangent(i)[2])
            d = (yaw - yaw0 + math.pi) % (2 * math.pi) - math.pi
            dyaw = max(dyaw, abs(d))
        ys = [self.samples[i]['pos'][1] for i in range(n0)]
        tail = list(range(SAMPLES - 18, SAMPLES))
        gapbad = any(self.samples[i]['jump'] for i in list(range(n0)) + tail)
        return dyaw, max(ys) - min(ys), gapbad

    def self_intersect(self):
        N = SAMPLES
        # NOTE: void themes (space/prism) float with no terrain aprons, so only
        # a true <15 m interlock is a problem there.
        bad = []
        for i in range(0, N, 2):
            for j in range(i + 24, N - 24, 2):
                dij = min(j - i, N - (j - i))
                if dij < 24:
                    continue
                d = math.dist(self.samples[i]['pos'], self.samples[j]['pos'])
                dy = abs(self.samples[i]['pos'][1] - self.samples[j]['pos'][1])
                if d < 15.0 or (tr.id not in ('space', 'prism') and d < 40.0 and dy < 10.0 and dij > 60):
                    bad.append((round(self.samples[i]['s'], 3), round(self.samples[j]['s'], 3),
                                round(d, 1)))
        return bad[:6]

    def shortcut_spans(self):
        out = []
        for sc in self.shortcuts:
            frm = self.nearest_s(sc[0])
            to = self.nearest_s(sc[-1])
            span = to - frm
            if span < 0:
                span += 1
            ok = 0.012 <= span <= 0.3
            weird = 0
            for p in sc:
                q = (p.x, p.y, p.z)
                for i in range(0, SAMPLES, 2):
                    smp = self.samples[i]
                    if math.dist(smp['pos'], q) < 9.0:
                        ins = (frm - 0.02) <= smp['s'] <= (to + 0.02)
                        if not ins:
                            weird += 1
                            break
            out.append((round(frm, 3), round(to, 3), round(span, 3), ok, weird))
        return out


def flight_range(speed, slope, drop):
    vy = slope * speed
    g = GRAV
    t = (vy + math.sqrt(vy * vy + 2 * g * max(0.1, -drop))) / g
    return speed * t


def report(tr: Track):
    ys = [s['pos'][1] for s in tr.samples]
    laps = tr.lap_estimate()
    turns = tr.corners()
    gaps = tr.gaps()
    tunnels = tr.tunnels()
    dyaw, dyy, gapbad = tr.start_check()
    inter = tr.self_intersect()
    hair = [t for t in turns if abs(t[1]) > 110]
    len_flag = '' if 1150 <= tr.length <= 1420 else '  << TUNE LENGTH'
    lap_flag = '' if 52 <= laps <= 72 else '  << TUNE LAP'
    print(f"== {tr.id} ({len(tr.ctrl)} pts) ==========================================")
    print(f"  length {tr.length:6.0f} m{len_flag}   lap@100cc ~{laps:5.1f} s{lap_flag}   "
          f"150cc ~{laps / 1.22:5.1f} s")
    print(f"  y range {min(ys):5.1f} .. {max(ys):5.1f}  (climb {max(ys) - min(ys):4.1f} m)"
          f"   corners {len(turns)} (hairpins {len(hair)})")
    if tunnels:
        print(f"  tunnels: {len(tunnels)}  " + ", ".join(f"@{a:.2f} ({l:.0f}m)" for a, l in tunnels))
    else:
        print("  tunnels: NONE  << add one!")
    for gp in gaps:
        lip = RAMP_SLOPE * RAMP_LEN
        drop = (gp['y0'] + gp['drop']) - (gp['y0'] + lip)   # lip height -> landing
        rng24 = flight_range(24, RAMP_SLOPE, drop)
        rng21 = flight_range(21.5, RAMP_SLOPE, drop)
        flag = "OK " if rng21 > gp['len'] * 1.25 else "!! "
        print(f"  gap {flag}@{gp['at']:.2f}  len {gp['len']:4.1f} m  drop {gp['drop']:5.1f} m"
              f"  flight@24 {rng24:4.1f} m  @21.5 {rng21:4.1f} m")
    if not gaps:
        print("  gaps: NONE")
    print(f"  start: dyaw {math.degrees(dyaw):4.1f} deg  dy {dyy:4.1f} m  gapNearGrid {gapbad}")
    if inter:
        print(f"  !! self-intersect pairs: {inter}")
    for r in tr.shortcut_spans():
        print(f"  shortcut from {r[0]} to {r[1]} span {r[2]} ok={r[3]} weirdHits={r[4]}")
    print()


def dump(tr: Track):
    """TS-ready control tuples (scaled coordinates)."""
    print(f"// {tr.id}  (len {tr.length:.0f} m, lap ~{tr.lap_estimate():.0f} s)")
    for p in tr.ctrl:
        extra = []
        if p.bank:
            extra.append(f"{round(p.bank, 2)}")
        elif p.width or p.jump or p.tunnel:
            extra.append("0")
        if p.width:
            extra.append(f"{round(p.width, 1)}")
        elif p.jump or p.tunnel:
            extra.append("0")
        if p.jump:
            extra.append("true")
        elif p.tunnel:
            extra.append("false")
        if p.tunnel:
            extra.append("true")
        head = f"[{round(p.x, 1)}, {round(p.y, 1)}, {round(p.z, 1)}"
        if extra:
            head += ", " + ", ".join(extra)
        print("    " + head + "],")
    print()


# ================================================================ THE 12 CIRCUITS
# Corridor discipline (ring topology: out along the south, up the east,
# back along the north, down the west, closing bend aligned with +Z) +
# Mario-Kart rhythm: sweeper -> climb -> summit hairpin -> tunnel descent ->
# valley esses -> REAL jump gap (launch ramp baked) -> banked sweeper ->
# S/switchback -> final bend. Tunnels are exactly 2 consecutive control
# points (~150 m tube). Gaps are ~6 m pairs with a 2.5 m lower landing.
TRACKS = []


def add(tid, hw, pts, shortcuts=(), scale=1.0):
    TRACKS.append(Track(tid, hw, pts, shortcuts, scale))


# ---------------------------------------------------------------- COPA VERDE
# Meadow: rolling park ring. Banked right out east, climb to the summit
# hairpin, hill tunnel back west along the north corridor, valley esses,
# creek gap, banked left home, windmill S, closing esses.
add('meadow', 9, [
    P(0, 0, -128), P(0, 0, -88), P(6, 0, -50),                 # grid straight
    P(30, 1, -16, 0.12), P(80, 3, -6), P(126, 5, -2),          # banked right sweeper
    P(164, 8, -6), P(174, 11, 28),                             # the climb (east side)
    P(162, 12, 62, 0, 8),                                      # summit hairpin (pinch)
    P(114, 10, 58),
    P(92, 8, 44, 0, 0, False, True),                           # hill tunnel (descending)
    P(56, 7, 52, 0, 0, False, True),
    P(18, 6, 62), P(-16, 4, 68), P(-46, 3, 56),                # valley esses (dip)
    P(-78, 4, 58),
    P(-88, 4, 53, 0, 0, True), P(-93, 2, 49, 0, 0, True),      # creek gap (6m pair)
    P(-120, 3, 34), P(-148, 3, -4, 0.12),                      # left sweeper
    P(-152, 4, -46), P(-122, 5, -72), P(-90, 4, -62),          # windmill S
    P(-70, 3, -90), P(-48, 2, -118), P(-42, 1, -144),          # final esses south
    P(-13, 0, -152),                                           # final bend onto straight
], shortcuts=[
    [P(168, 11, 42), P(146, 11, 52)],                          # summit hairpin cut
    [P(-112, 4, -82), P(-92, 4, -80)],                         # windmill S cut
], scale=1.28)

# Beach: shore run out east, cape hairpin, inlet gap, lagoon chicane, cliff
# climb with a long arch tunnel, downhill esses, final switchback.
add('beach', 8.5, [
    P(0, 0, -132), P(0, 0, -92), P(8, 0, -54),
    P(36, 1, -22, 0.10), P(84, 3, -6), P(120, 4, 16),          # shore sweeper
    P(122, 5, 54, 0, 8), P(80, 5, 52),                         # cape hairpin (pinch)
    P(54, 4, 44, 0, 0, True), P(49, 2, 40, 0, 0, True),        # inlet gap (6m pair)
    P(22, 2, 30), P(-8, 3, 14), P(-38, 4, 42),                 # lagoon chicane
    P(-74, 6, 54), P(-108, 6, 38, 0.12),                       # cliff climb
    P(-134, 8, 2, 0, 0, False, True),                          # cliff arch tunnel
    P(-118, 10, -34, 0, 0, False, True),
    P(-88, 11, -62),
    P(-52, 10, -76), P(-28, 8, -66), P(-44, 6, -98),           # downhill esses
    P(-74, 4, -116), P(-54, 3, -144), P(-26, 2, -154),         # final switchback
], shortcuts=[
    [P(112, 4, 32), P(96, 5, 44)],                             # cape hairpin cut
    [P(-34, 7, -78), P(-42, 5, -104)],                         # downhill esses cut
], scale=1.34)

# Jungle: tight technical ring. Double right out east, chicane pinch, temple
# cave climb, canopy esses west, vine gap, descent sweeper, double-apex left.
add('jungle', 8, [
    P(0, 0, -126), P(0, 0, -88), P(10, 1, -52),
    P(48, 2, -28, 0.10), P(96, 4, -36), P(128, 6, -8),         # double right
    P(112, 8, 28, 0, 8), P(142, 10, 58),                       # chicane pinch
    P(104, 12, 82, 0, 0, False, True),                         # temple cave climb
    P(66, 14, 92, 0, 0, False, True),
    P(28, 15, 86),
    P(-6, 14, 74), P(-32, 12, 92), P(-68, 11, 86),             # canopy esses
    P(-96, 10, 72, 0, 0, True), P(-101, 8, 67, 0, 0, True),    # vine gap (6m pair)
    P(-124, 8, 42), P(-104, 6, 10),                            # descent sweeper
    P(-132, 5, -22, 0.12), P(-102, 4, -52),                    # double-apex left
    P(-66, 3, -46), P(-46, 2, -76), P(-44, 1, -112),           # jungle esses south
    P(-20, 0, -146), P(6, 0, -154),                            # final bend
], shortcuts=[
    [P(-28, 13, 80), P(-52, 12, 84)],                          # canopy esses cut
    [P(-88, 4, -34), P(-70, 3, -44)],                          # double-apex cut
], scale=1.24)

# ---------------------------------------------------------------- COPA AMBAR
# Desert: flat-out straight, banked climb right, dune rollers, slot canyon
# tunnel, dune leap gap, big left sweeper home.
add('desert', 9.5, [
    P(0, 0, -136), P(0, 0, -96), P(0, 0, -58),                 # flat-out straight
    P(32, 1, -24, 0.12), P(88, 3, -8), P(140, 6, 10),          # banked climb right
    P(174, 9, 48), P(144, 7, 82), P(98, 9, 96),                # dune rollers
    P(50, 7, 88), P(12, 9, 104), P(-30, 11, 94),               # whoops up-down
    P(-72, 12, 68, 0, 0, False, True),                         # slot canyon tunnel
    P(-108, 12, 42, 0, 0, False, True),
    P(-130, 11, 8),
    P(-144, 10, -24, 0, 0, True), P(-148, 8, -28, 0, 0, True), # dune leap (6m pair)
    P(-140, 8, -62), P(-98, 6, -94), P(-54, 4, -124),          # big left home
    P(-20, 2, -152), P(8, 0, -146),                            # final kink
], shortcuts=[
    [P(152, 7, 32), P(148, 7, 62)],                            # dune crest cut
    [P(-120, 6, -70), P(-98, 5, -88)],                         # oasis cut
], scale=1.27)

# Factory: machine chicane out east, climb to the assembly line, plant
# tunnel across the north, conveyor gap on the NW descent, press-gate
# chicade down the west, esses home.
add('factory', 8.5, [
    P(0, 0, -128), P(0, 0, -92), P(8, 0, -58),
    P(42, 1, -34, 0, 8), P(68, 2, -10), P(42, 3, 14),          # machine chicane
    P(62, 4, 44), P(88, 6, 48),                                # climb NE
    P(134, 8, 50, 0, 8),                                       # top hairpin (pinch)
    P(92, 8, 86),
    P(48, 8, 84, 0, 0, False, True),                           # plant tunnel (north)
    P(4, 8, 72, 0, 0, False, True),
    P(-42, 8, 52),
    P(-68, 8, 44, 0, 0, True), P(-73, 5.5, 40, 0, 0, True),    # conveyor gap (6m pair)
    P(-100, 5, 18), P(-120, 4, -24, 0.12),                     # NW descent + gates
    P(-92, 3, -54), P(-58, 2, -72), P(-66, 1, -102),           # SW esses
    P(-40, 0, -126), P(-10, 0, -148),                          # final bend
], shortcuts=[
    [P(108, 8, 64), P(88, 8, 80)],                             # top hairpin cut
    [P(-74, 3, -42), P(-54, 2, -58)],                          # SW esses cut
], scale=1.42)

# Volcano: THE climb — crater wall sweepers up to the rim, lava tube, lava
# leap, huge banked descent, dive-bank left, switchback home.
add('volcano', 8.5, [
    P(0, 0, -134), P(0, 0, -96), P(10, 2, -58),
    P(46, 4, -30, 0.10), P(92, 8, -14),                        # crater wall climb
    P(130, 12, 10), P(150, 16, 46, 0.14),                      # high banked right
    P(124, 19, 80), P(74, 21, 92),
    P(32, 23, 96, 0, 0, False, True),                          # lava tube at the rim
    P(-10, 24, 84, 0, 0, False, True),
    P(-48, 24, 64),
    P(-76, 23, 52, 0, 0, True), P(-80, 21, 48, 0, 0, True),    # lava leap (6m pair)
    P(-110, 19, 26), P(-142, 15, -10),                         # the big descent
    P(-116, 11, -48, 0.12), P(-74, 8, -60),                    # dive-bank left
    P(-102, 6, -88), P(-56, 4, -110), P(-28, 2, -140),         # switchback
    P(4, 0, -154),                                             # final bend
], shortcuts=[
    [P(136, 15, 62), P(124, 17, 78)],                          # rim cut
    [P(-80, 7, -72), P(-72, 5, -96)],                          # switchback cut
], scale=1.32)

# ---------------------------------------------------------------- COPA ESCARCHA
# Snow: village drop to the valley floor, ice chicane, chasm gap on the
# climb, ice cave through the pass, plateau sweeper, descent switchback.
add('snow', 9, [
    P(0, 8, -126), P(0, 6, -88), P(10, 4, -52),                # village drop
    P(44, 2, -22, 0.10), P(92, 1, -6), P(126, 2, 18),          # valley floor
    P(108, 4, 54, 0, 8), P(138, 7, 84),                        # ice chicane + climb
    P(104, 9, 100, 0, 0, True), P(100, 6.5, 96, 0, 0, True),   # chasm gap (6m pair)
    P(66, 9, 100),
    P(22, 12, 94, 0, 0, False, True),                          # ice cave through pass
    P(-20, 14, 78, 0, 0, False, True),
    P(-58, 15, 50),
    P(-92, 14, 24), P(-126, 12, -12),                          # plateau sweeper
    P(-100, 10, -48, 0.12), P(-60, 8, -62),                    # descent switchback
    P(-32, 7, -46), P(-58, 8, -86), P(-50, 5, -120),           # final rolls (wide S)
    P(-20, 6, -148), P(6, 7, -152),                            # final bend
], shortcuts=[
    [P(110, 2, 34), P(100, 3, 60)],                            # chicane cut
    [P(-40, 8, -64), P(-50, 7, -100)],                         # final rolls cut
], scale=1.30)

# Glacier: crevasse gap early, blue ice tunnel, second crevasse, banked icy
# left, S + switchback home.
add('glacier', 8, [
    P(0, 0, -130), P(0, 0, -92), P(10, 2, -54),
    P(48, 4, -28, 0.12), P(96, 6, -12),                        # banked approach
    P(124, 7, 8, 0, 0, True), P(128, 4.5, 11, 0, 0, True),     # crevasse gap 1
    P(110, 4, 44),
    P(72, 6, 70, 0, 0, False, True),                           # blue ice tunnel
    P(30, 8, 84, 0, 0, False, True),
    P(-14, 10, 80),
    P(-54, 11, 62), P(-92, 12, 68),
    P(-124, 12, 52, 0, 0, True), P(-128, 9.5, 47, 0, 0, True), # crevasse gap 2
    P(-124, 8, 12), P(-142, 7, -30, 0.12),                     # banked icy left
    P(-108, 5, -58), P(-68, 4, -50), P(-92, 3, -90),           # S + switchback
    P(-54, 2, -116), P(-22, 1, -146), P(6, 0, -154),           # final bend
], shortcuts=[
    [P(114, 5, 26), P(104, 5, 52)],                            # icy sweeper cut
    [P(-92, 4, -62), P(-84, 4, -84)],                          # switchback cut
], scale=1.32)

# Castle: rampart climb, courtyard chicane, dungeon tunnel, keep descent,
# moat gap, outer wall sweeper, switchback home.
add('castle', 8.5, [
    P(0, 0, -130), P(0, 0, -92), P(12, 0, -54),
    P(52, 2, -30, 0.10), P(100, 4, -16), P(132, 6, 14),        # rampart climb
    P(110, 8, 50, 0, 8), P(138, 10, 78),                       # courtyard chicane
    P(100, 12, 96, 0, 0, False, True),                         # dungeon tunnel
    P(56, 13, 100, 0, 0, False, True),
    P(10, 12, 88),
    P(-42, 11, 64),                                            # keep descent
    P(-72, 10, 50, 0, 0, True), P(-76, 7.5, 46, 0, 0, True),   # moat gap (6m pair)
    P(-106, 8, 22), P(-136, 6, -14),                           # outer wall sweeper
    P(-108, 4, -48, 0.12), P(-66, 3, -60), P(-94, 2, -90),     # switchback
    P(-56, 1, -114), P(-24, 0, -144), P(4, 0, -154),           # final bend
], shortcuts=[
    [P(112, 9, 62), P(100, 10, 84)],                           # courtyard cut
    [P(-92, 3, -60), P(-82, 3, -82)],                          # switchback cut
], scale=1.32)

# ---------------------------------------------------------------- COPA COSMICA
# City: avenue rights, block chicane, overpass gap, subway tube, grid turns,
# neon esses home.
add('city', 9, [
    P(0, 0, -130), P(0, 0, -94), P(10, 1, -58),
    P(48, 2, -40), P(106, 4, -44), P(126, 6, -2),              # avenue rights
    P(102, 7, 36, 0, 8), P(130, 9, 70),                        # block chicane
    P(88, 10, 88, 0, 0, True), P(84, 7.5, 84, 0, 0, True),      # overpass gap (6m pair)
    P(48, 8, 88),
    P(8, 7, 80, 0, 0, False, True),                            # subway tube
    P(-28, 6, 52, 0, 0, False, True),
    P(-64, 5, 34),
    P(-98, 4, 46), P(-84, 3, 12), P(-116, 3, -20),             # grid turns
    P(-84, 2, -44, 0, 8),
    P(-52, 2, -30), P(-30, 1, -58), P(-62, 1, -84),            # neon esses
    P(-46, 0, -116), P(-17, 0, -146), P(8, 0, -154),           # final bend
], shortcuts=[
    [P(112, 5, -20), P(102, 6, 22)],                           # block cut
    [P(-42, 1, -68), P(-54, 1, -80)],                          # neon alley cut
], scale=1.22)

# Space: floating station. Approach sweep, station tube, star gap, return
# tube, floaty esses home.
add('space', 7.5, [
    P(0, 12, -128), P(0, 12, -92), P(10, 13, -56),
    P(52, 15, -32, 0.10), P(102, 17, -16), P(134, 19, 16),     # approach sweep
    P(96, 20, 56, 0, 0, False, True),                          # station tube
    P(54, 21, 70, 0, 0, False, True),
    P(14, 22, 62),
    P(-16, 22, 46, 0, 0, True), P(-19, 20.5, 42, 0, 0, True),  # star gap (5m pair)
    P(-52, 20, 28),
    P(-88, 19, 6, 0, 0, False, True),                          # return tube
    P(-68, 18, -30, 0, 0, False, True),
    P(-32, 17, -46),
    P(-60, 16, -80, 0.12), P(-32, 15, -108),                   # floaty esses
    P(-32, 14, -140), P(-7, 13, -154), P(10, 12, -150),        # final bend
], shortcuts=[
    [P(116, 18, 20), P(106, 19, 44)],                          # tube bypass
    [P(-50, 16, -60), P(-46, 15, -92)],                        # floaty cut
], scale=1.50)

# Prism: the finale. Rising sweeper, neon tube climb, the inward coil, then
# THE DIVE — a 20 m drop back to the finish straight.
add('prism', 8, [
    P(0, 0, -138), P(0, 0, -98), P(10, 2, -60),
    P(54, 5, -36, 0.10), P(112, 8, -20), P(140, 11, 18),       # rising sweeper
    P(102, 14, 50),
    P(52, 17, 68, 0, 0, False, True),                          # neon tube (rising)
    P(6, 19, 60, 0, 0, False, True),
    P(-44, 21, 36),
    P(-92, 23, 6), P(-64, 25, -30), P(-18, 26, -20),           # the coil
    P(32, 27, -42), P(-2, 28, -58), P(-38, 26, -66),
    P(-50, 21, -80, 0, 0, True), P(-45, 4, -84, 0, 0, True),   # THE DIVE
    P(-20, 2, -108), P(-26, 0, -136), P(-8, 0, -148),          # run-out + final bend
], shortcuts=[
    [P(-44, 25, -34), P(-18, 27, -48)],                        # coil bypass
], scale=1.34)

# ================================================================ run
if __name__ == '__main__':
    args = sys.argv[1:]
    dump_mode = False
    if args and args[0] == '--dump':
        dump_mode = True
        args = args[1:]
    for tr in TRACKS:
        if args and tr.id not in args:
            continue
        if dump_mode:
            dump(tr)
        else:
            report(tr)
