# -*- coding: utf-8 -*-
"""Cuerpo del informe de consultoría APEX KART (ReportLab, sin portada).

- TocDocTemplate + multiBuild (TOC automático con enlaces).
- Paleta fija del Template 07 Crystal Blue (cuerpo claro).
- Numeración: TOC en romanos, cuerpo arábigo reiniciado en 1.
"""
import os
import sys
import hashlib

PDF_SKILL_DIR = '/home/z/my-project/skills/pdf'
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, 'scripts'))
sys.path.insert(0, '/home/z/my-project/scripts')

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
                                Table, TableStyle, Image, KeepTogether,
                                CondPageBreak, HRFlowable)
from reportlab.platypus.tableofcontents import TableOfContents
from PIL import Image as PILImage

from informe_content_a import A
from informe_content_b import B

# ---------------------------------------------------------------- fuentes ---
FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
try:
    pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
    pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
    registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
except Exception:
    pass
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                   italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')

from pdf import install_font_fallback  # noqa: E402  (skill helper)
install_font_fallback()

# --------------------------------------------- paleta Template 07 (cuerpo) ---
PAGE_BG      = colors.HexColor('#f5f8fc')
SECTION_BG   = colors.HexColor('#edf2f9')
CARD_BG      = colors.HexColor('#e4ecf5')
TABLE_STRIPE = colors.HexColor('#eef3fa')
HEADER_FILL  = colors.HexColor('#1a4a7a')
BORDER       = colors.HexColor('#c0d0e2')
ACCENT       = colors.HexColor('#2d7ab3')
TEXT_PRIMARY = colors.HexColor('#142840')
TEXT_MUTED   = colors.HexColor('#5a7a96')

# ------------------------------------------------------------------- layout --
MARGIN = 0.9 * inch
PAGE_W, PAGE_H = A4
AVAIL = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
DOC_TITLE = 'APEX KART — Informe de Consultoría de Diseño de Videojuegos'
OUT = '/home/z/my-project/scripts/informe_body.pdf'
ASSETS = '/home/z/my-project/scripts/informe_assets'

# ------------------------------------------------------------------ estilos --
body_st = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10.5, leading=17,
                         alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY,
                         spaceBefore=0, spaceAfter=10)
h1_st = ParagraphStyle('H1', fontName='FreeSerif', fontSize=19, leading=25,
                       alignment=TA_LEFT, textColor=HEADER_FILL,
                       spaceBefore=18, spaceAfter=4)
h2_st = ParagraphStyle('H2', fontName='FreeSerif', fontSize=13.5, leading=19,
                       alignment=TA_LEFT, textColor=HEADER_FILL,
                       spaceBefore=14, spaceAfter=6)
h3_st = ParagraphStyle('H3', fontName='FreeSerif', fontSize=11.5, leading=16,
                       alignment=TA_LEFT, textColor=TEXT_PRIMARY,
                       spaceBefore=10, spaceAfter=4)
caption_st = ParagraphStyle('Caption', fontName='FreeSerif', fontSize=8.5, leading=12,
                            alignment=TA_CENTER, textColor=TEXT_MUTED,
                            spaceBefore=3, spaceAfter=6)
th_st = ParagraphStyle('TH', fontName='FreeSerif', fontSize=9.5, leading=13,
                       alignment=TA_CENTER, textColor=colors.white)
td_st = ParagraphStyle('TD', fontName='FreeSerif', fontSize=9, leading=12.5,
                       alignment=TA_LEFT, textColor=TEXT_PRIMARY)
td_c_st = ParagraphStyle('TDC', parent=td_st, alignment=TA_CENTER)
stat_st = ParagraphStyle('Stat', fontName='FreeSerif', fontSize=19, leading=23,
                         alignment=TA_CENTER, textColor=ACCENT)
stat_lb_st = ParagraphStyle('StatLb', fontName='FreeSerif', fontSize=8, leading=11,
                            alignment=TA_CENTER, textColor=TEXT_MUTED)
toc_l0 = ParagraphStyle('TOC0', fontName='FreeSerif', fontSize=10.5, leading=15,
                        textColor=TEXT_PRIMARY, leftIndent=6)
toc_l1 = ParagraphStyle('TOC1', fontName='FreeSerif', fontSize=9, leading=12,
                        textColor=TEXT_MUTED, leftIndent=24)
toc_title_st = ParagraphStyle('TOCTitle', fontName='FreeSerif', fontSize=19, leading=25,
                              textColor=HEADER_FILL, spaceAfter=14)


# ------------------------------------------------------------ plantilla TOC --
class TocDocTemplate(SimpleDocTemplate):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.body_start_page = None

    def handle_documentBegin(self):
        # Cada pasada de multiBuild recomienza el marcador de primer heading;
        # body_start_page se actualiza al primer bookmark de CADA pasada, y el
        # pie de página usa el valor ya convergido de la pasada anterior.
        self._seen_first_bookmark = False
        super().handle_documentBegin()

    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            if not getattr(self, '_seen_first_bookmark', False):
                self.body_start_page = self.page
                self._seen_first_bookmark = True
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            shown = self.page - self.body_start_page + 1
            self.notify('TOCEntry', (level, text, shown, key))


ROMAN = {1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v', 6: 'vi'}


def decorate(canvas, doc):
    canvas.saveState()
    # Fondo de página (familia azul clara del Template 07)
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # Cabecera
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 34, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 40, PAGE_W - MARGIN, PAGE_H - 40)
    # Pie
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 38, PAGE_W - MARGIN, 38)
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 27, 'Consultoría de Diseño de Videojuegos')
    bs = doc.body_start_page
    if bs is None or doc.page < bs:
        num = ROMAN.get(doc.page, str(doc.page))
    else:
        num = str(doc.page - bs + 1)
    canvas.drawRightString(PAGE_W - MARGIN, 27, num)
    canvas.restoreState()


# ---------------------------------------------------------------- helpers ---
def add_heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p


def safe_keep(elements, max_ratio=0.4):
    total = 0
    for el in elements:
        _, h = el.wrap(AVAIL, PAGE_H)
        total += h
    if total <= PAGE_H * max_ratio:
        return [KeepTogether(elements)]
    if len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)


def embed_image(path, max_w, max_h):
    img = PILImage.open(path)
    ow, oh = img.size
    ratio = min(max_w / ow, max_h / oh, 1.0)
    return Image(path, width=ow * ratio, height=oh * ratio)


def make_table(spec):
    header, rows, ratios = spec['header'], spec['rows'], spec['ratios']
    col_w = [r * AVAIL for r in ratios]
    assert sum(col_w) <= AVAIL + 0.5, 'tabla excede el ancho disponible'
    data = [[Paragraph('<b>%s</b>' % h, th_st) for h in header]]
    for row in rows:
        cells = []
        for i, cell in enumerate(row):
            st = td_c_st if i > 0 and len(str(cell)) <= 14 else td_st
            cells.append(Paragraph(str(cell), st))
        data.append(cells)
    t = Table(data, colWidths=col_w, hAlign='CENTER', repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        style.append(('BACKGROUND', (0, i), (-1, i),
                      TABLE_STRIPE if i % 2 == 0 else colors.white))
    t.setStyle(TableStyle(style))
    out = [Spacer(1, 14), t, Spacer(1, 4),
           Paragraph(spec['caption'], caption_st), Spacer(1, 12)]
    if len(rows) <= 6:
        return [Spacer(1, 14)] + safe_keep([t, Spacer(1, 4),
                Paragraph(spec['caption'], caption_st)]) + [Spacer(1, 12)]
    return out


def make_callouts(items):
    n = len(items)
    gap = 8
    cw = (AVAIL - gap * (n - 1)) / n
    cells = []
    for big, label in items:
        inner = Table([[Paragraph('<b>%s</b>' % big, stat_st)],
                       [Paragraph(label, stat_lb_st)]], colWidths=[cw - 4])
        inner.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
            ('BOX', (0, 0), (-1, -1), 0.8, ACCENT),
            ('TOPPADDING', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 9),
            ('TOPPADDING', (0, 1), (-1, 1), 2),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        cells.append(inner)
    row, widths = [], []
    for i, c in enumerate(cells):
        row.append(c)
        widths.append(cw)
    outer = Table([row], colWidths=widths, hAlign='CENTER')
    outer.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0 if n == 1 else 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), gap / 2),
        ('LEFTPADDING', (1, 0), (-1, -1), gap / 2),
        ('RIGHTPADDING', (-1, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    return [Spacer(1, 8), outer, Spacer(1, 14)]


def h1_rule():
    return HRFlowable(width='100%', color=ACCENT, thickness=1.5,
                      spaceBefore=0, spaceAfter=10)


# ------------------------------------------------------------------ story ---
def build_story():
    story = []
    toc = TableOfContents()
    toc.levelStyles = [toc_l0, toc_l1]
    story.append(Paragraph('<b>Índice</b>', toc_title_st))
    story.append(HRFlowable(width='100%', color=ACCENT, thickness=1.5,
                            spaceBefore=0, spaceAfter=8))
    story.append(toc)
    story.append(PageBreak())

    blocks = A + B
    i = 0
    h1_count = 0
    while i < len(blocks):
        kind, payload = blocks[i]
        if kind == 'h1':
            h1_count += 1
            threshold = AVAIL_H * 0.25
            head = add_heading(payload, h1_st, level=0)
            rule = h1_rule()
            # título + regla + primer párrafo juntos (anti-huérfano)
            nxt = []
            if i + 1 < len(blocks) and blocks[i + 1][0] == 'body':
                nxt = [Paragraph(blocks[i + 1][1], body_st)]
                i += 1
            story.append(CondPageBreak(threshold))
            story.extend(safe_keep([head, rule] + nxt))
        elif kind == 'h2':
            head = add_heading(payload, h2_st, level=1)
            nxt = []
            if i + 1 < len(blocks) and blocks[i + 1][0] == 'body':
                nxt = [Paragraph(blocks[i + 1][1], body_st)]
                i += 1
            story.extend(safe_keep([head] + nxt))
        elif kind == 'h3':
            story.append(add_heading(payload, h3_st, level=2))
        elif kind == 'body':
            story.append(Paragraph(payload, body_st))
        elif kind == 'bullet':
            for item in payload:
                story.append(Paragraph('• %s' % item,
                    ParagraphStyle('Bul', parent=body_st, alignment=TA_LEFT,
                                   leftIndent=14, spaceAfter=4)))
        elif kind == 'callouts':
            story.extend(make_callouts(payload))
        elif kind == 'table':
            story.extend(make_table(payload))
        elif kind == 'chart':
            fname, caption, max_h = payload
            img = embed_image(os.path.join(ASSETS, fname), AVAIL, max_h)
            cap = Paragraph(caption, caption_st)
            story.append(Spacer(1, 16))
            story.extend(safe_keep([img, Spacer(1, 6), cap]))
            story.append(Spacer(1, 14))
        i += 1
    return story


def main():
    doc = TocDocTemplate(
        OUT, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN + 8, bottomMargin=MARGIN - 6,
        title=DOC_TITLE, author='Z.ai', creator='Z.ai',
        subject='Diagnóstico de game feel y dirección visual realista para APEX KART')
    doc.multiBuild(build_story(), onFirstPage=decorate, onLaterPages=decorate)
    print('OK body ->', OUT)


if __name__ == '__main__':
    main()
