# -*- coding: utf-8 -*-
"""Graficos del informe de consultoria APEX KART (espanol, paleta Crystal Blue)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams["font.sans-serif"] = ["DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False

# Paleta Crystal Blue (Template 07, cuerpo)
ACCENT = "#2d7ab3"      # serie principal / objetivo
MUTED = "#5a7a96"       # serie secundaria / actual
DEEP = "#1a4a7a"        # terciario
BORDER = "#c0d0e2"
TEXT = "#142840"
GRID = dict(linestyle="--", linewidth=0.6, alpha=0.22, color=TEXT)

OUT = "/home/z/my-project/scripts/informe_assets"


def style_ax(ax):
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(BORDER)
    ax.spines["bottom"].set_color(BORDER)
    ax.tick_params(colors=TEXT, labelsize=10)


# ---------------------------------------------------------------- Radar ----
def radar():
    labels = [
        "Bucle salto-\nderrape-turbo",
        "Dirección\ne input",
        "Feedback de\nvelocidad",
        "Tensión en\numbrales",
        "Economia\nde objetos",
        "Ritmo y\nrubber-banding",
    ]
    actual = [6, 5, 6, 3, 8, 5]
    objetivo = [9, 8, 9, 8, 9, 8]

    n = len(labels)
    ang = np.linspace(0, 2 * np.pi, n, endpoint=False).tolist()
    ang += ang[:1]
    a = actual + actual[:1]
    o = objetivo + objetivo[:1]

    fig, ax = plt.subplots(figsize=(7.0, 5.4), dpi=200,
                           subplot_kw=dict(polar=True), constrained_layout=True)
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_ylim(0, 10)
    ax.set_yticks([2, 4, 6, 8, 10])
    ax.set_yticklabels(["2", "4", "6", "8", "10"], fontsize=8, color=MUTED)
    ax.set_rlabel_position(10)
    ax.plot(ang, a, color=MUTED, linewidth=2.0)
    ax.fill(ang, a, color=MUTED, alpha=0.16)
    ax.plot(ang, o, color=ACCENT, linewidth=2.4)
    ax.fill(ang, o, color=ACCENT, alpha=0.18)
    ax.set_xticks(ang[:-1])
    ax.set_xticklabels(labels, fontsize=10.5, color=TEXT)
    ax.grid(True, linestyle="--", linewidth=0.5, alpha=0.30, color=TEXT)
    ax.spines["polar"].set_color(BORDER)
    leg = ax.legend(["Estado actual", "Objetivo (Fases 1-3)"], loc="lower center",
                    bbox_to_anchor=(0.5, -0.16), ncol=2, frameon=False, fontsize=10.5)
    for t in leg.get_texts():
        t.set_color(TEXT)
    fig.savefig(f"{OUT}/fig1_radar.png")
    plt.close(fig)


# ------------------------------------------------------- Mini-turbo bars ----
def miniturbo():
    niveles = ["Nivel 1\n(azul)", "Nivel 2\n(naranja)", "Nivel 3\n(purpura)"]
    carga_actual = [0.85, 2.10, 3.40]
    carga_ref = [0.60, 1.30, 2.30]
    dur_actual = [0.65, 1.05, 1.55]
    dur_ref = [0.72, 1.28, 1.85]

    fig, axes = plt.subplots(1, 2, figsize=(9.4, 4.0), dpi=200,
                             constrained_layout=True)
    x = np.arange(len(niveles))
    w = 0.36

    panels = [
        (axes[0], "Tiempo de carga (s)", carga_actual, carga_ref),
        (axes[1], "Duración del impulso (s)", dur_actual, dur_ref),
    ]
    for ax, title, act, ref in panels:
        b1 = ax.bar(x - w / 2, act, w, color=MUTED, edgecolor="none", label="Actual")
        b2 = ax.bar(x + w / 2, ref, w, color=ACCENT, edgecolor="none",
                    label="Referencia MK8")
        for bars in (b1, b2):
            for b in bars:
                ax.annotate(f"{b.get_height():.2f}".replace(".", ","),
                            (b.get_x() + b.get_width() / 2, b.get_height()),
                            textcoords="offset points", xytext=(0, 3),
                            ha="center", fontsize=9, color=TEXT)
        ax.set_xticks(x)
        ax.set_xticklabels(niveles, fontsize=10)
        ax.set_title(title, fontsize=11.5, color=TEXT, pad=10)
        ax.grid(True, axis="y", **GRID)
        ax.set_axisbelow(True)
        ax.set_ylim(0, 3.9)
        style_ax(ax)
    axes[0].set_ylabel("Segundos", fontsize=10, color=TEXT)
    leg = axes[1].legend(loc="upper left", frameon=False, fontsize=10)
    for t in leg.get_texts():
        t.set_color(TEXT)
    fig.savefig(f"{OUT}/fig2_miniturbo.png")
    plt.close(fig)


# ------------------------------------------------- Impacto / esfuerzo ----
def roadmap():
    items = [
        ("Charcos Reflector + FX premium", 5.5, 7.5),
        ("Sombras suaves + asfalto PBR", 7.5, 6.0),
        ("Materiales PBR + clearcoat + IBL", 8.5, 6.5),
        ("Feedback de velocidad (FOV, lineas, roll)", 8.0, 4.5),
        ("Salida turbo con tension", 7.0, 2.5),
        ("Mini-turbo legible y re-timed", 9.0, 3.0),
        ("Ramp de direccion (input shaping)", 8.5, 3.5),
        ("Hop + entrada a derrape", 9.5, 4.0),
    ]
    names = [i[0] for i in items]
    imp = [i[1] for i in items]
    eff = [i[2] for i in items]

    fig, ax = plt.subplots(figsize=(9.4, 4.8), dpi=200, constrained_layout=True)
    y = np.arange(len(items))
    h = 0.36
    b1 = ax.barh(y + h / 2, imp, h, color=ACCENT, edgecolor="none", label="Impacto en la experiencia")
    b2 = ax.barh(y - h / 2, eff, h, color=MUTED, edgecolor="none", label="Esfuerzo de implementacion")
    for bars in (b1, b2):
        for b in bars:
            ax.annotate(f"{b.get_width():.1f}".replace(".", ","),
                        (b.get_width(), b.get_y() + b.get_height() / 2),
                        textcoords="offset points", xytext=(5, -3.5),
                        fontsize=9, color=TEXT)
    ax.set_yticks(y)
    ax.set_yticklabels(names, fontsize=10.5)
    ax.set_xlim(0, 11.2)
    ax.set_xlabel("Puntuacion (1-10)", fontsize=10, color=TEXT)
    ax.grid(True, axis="x", **GRID)
    ax.set_axisbelow(True)
    style_ax(ax)
    leg = ax.legend(loc="lower right", frameon=False, fontsize=10)
    for t in leg.get_texts():
        t.set_color(TEXT)
    fig.savefig(f"{OUT}/fig3_roadmap.png")
    plt.close(fig)


if __name__ == "__main__":
    radar()
    miniturbo()
    roadmap()
    print("OK charts ->", OUT)
