# -*- coding: utf-8 -*-
"""Fusiona portada + cuerpo en el PDF final del informe (normalizado a A4)."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89
COVER = '/home/z/my-project/scripts/informe_cover.pdf'
BODY = '/home/z/my-project/scripts/informe_body.pdf'
OUT = '/home/z/my-project/download/Informe_Consultoria_APEX_KART.pdf'


def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page


writer = PdfWriter()
writer.add_page(normalize(PdfReader(COVER).pages[0]))
for p in PdfReader(BODY).pages:
    writer.add_page(normalize(p))
writer.add_metadata({
    '/Title': 'APEX KART — Informe de Consultoría de Diseño de Videojuegos',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'Diagnóstico de game feel y dirección visual realista para APEX KART',
})
with open(OUT, 'wb') as f:
    writer.write(f)
print('OK final ->', OUT, '| páginas:', 1 + len(PdfReader(BODY).pages))
