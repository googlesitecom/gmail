#!/usr/bin/env python3
"""Parse APEX QA clean log lines into a readable table."""
import json
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'tmp_qa/qa_clean.log'
raw = open(path).read()
rows = []
for m in re.finditer(r'\\"track\\":\\"(\w+)\\",(.*?)\}"', raw):
    track = m.group(1)
    body = m.group(2)
    fields = dict(re.findall(r'\\?"(\w+)\\?":(\d+)', body))
    rows.append((track, fields))

print(f"{'pista':>10} | karts | mediana L1 | rango  | eventos vuelta")
print('-' * 62)
for track, f in rows:
    med = f.get('medianLap1', 0)
    lo, hi = f.get('minLap1', 0), f.get('maxLap1', 0)
    ev = f.get('totalLapEvents', 0)
    kr = f.get('kartsRacing', 0)
    print(f"{track:>10} | {kr:>5} | {med:>10} | {lo:>3}-{hi:<3} | {ev:>6}")

full = [r for r in rows if r[1].get('kartsRacing') == 11]
print(f"\n{len(full)}/12 pistas con los 11 bots corriendo vueltas")
