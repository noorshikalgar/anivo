"""
Build assets/fonts/anivo-symbols.woff2: a small fallback font with arrows,
check marks, and shapes that the Inter subsets do not have. The renderers use
it after the main font. Run: python3 scripts/build-symbols-font.py
(needs fontTools and brotli). The glyphs are original line drawings (MIT).
"""
import math
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 2048
AXIS = 700  # the math axis of Inter at this size: arrows sit on it
W = 150     # stroke width

def poly(pen, pts):
    pen.moveTo(pts[0])
    for p in pts[1:]:
        pen.lineTo(p)
    pen.closePath()

def rot(pts, cx, cy, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return [(round(cx + (x - cx) * c - (y - cy) * s), round(cy + (x - cx) * s + (y - cy) * c)) for x, y in pts]

def arrow_right(pen, adv, deg=0):
    cx, cy = adv / 2, AXIS
    shaft = [(170, AXIS - W / 2), (adv - 520, AXIS - W / 2), (adv - 520, AXIS + W / 2), (170, AXIS + W / 2)]
    head = [(adv - 600, AXIS - 360), (adv - 150, AXIS), (adv - 600, AXIS + 360)]
    poly(pen, rot(shaft, cx, cy, deg))
    poly(pen, rot(head, cx, cy, deg))

def arrow_both(pen, adv):
    shaft = [(500, AXIS - W / 2), (adv - 500, AXIS - W / 2), (adv - 500, AXIS + W / 2), (500, AXIS + W / 2)]
    poly(pen, shaft)
    poly(pen, [(adv - 580, AXIS - 360), (adv - 130, AXIS), (adv - 580, AXIS + 360)])
    poly(pen, [(580, AXIS + 360), (130, AXIS), (580, AXIS - 360)])

def stroke(pen, a, b, w=W * 1.2):
    (x1, y1), (x2, y2) = a, b
    dx, dy = x2 - x1, y2 - y1
    l = math.hypot(dx, dy)
    nx, ny = -dy / l * w / 2, dx / l * w / 2
    poly(pen, [(round(x1 + nx), round(y1 + ny)), (round(x2 + nx), round(y2 + ny)), (round(x2 - nx), round(y2 - ny)), (round(x1 - nx), round(y1 - ny))])

def check(pen, adv):
    stroke(pen, (220, 720), (520, 380))
    stroke(pen, (470, 380), (adv - 200, 1200))

def cross(pen, adv):
    stroke(pen, (260, 300), (adv - 260, 1150))
    stroke(pen, (260, 1150), (adv - 260, 300))

def star(pen, adv):
    cx, cy, r1, r2 = adv / 2, 760, 560, 230
    pts = []
    for i in range(10):
        r = r1 if i % 2 == 0 else r2
        a = math.radians(90 - i * 36)
        pts.append((round(cx + r * math.cos(a)), round(cy + r * math.sin(a))))
    poly(pen, pts)

def circle(pen, adv, r=380):
    cx, cy = adv / 2, AXIS
    poly(pen, [(round(cx + r * math.cos(math.radians(-i * 10))), round(cy + r * math.sin(math.radians(-i * 10)))) for i in range(36)])

def triangle(pen, adv):
    poly(pen, [(300, AXIS - 420), (adv - 260, AXIS), (300, AXIS + 420)])

GLYPHS = {
    # name: (codepoint, advance, draw)
    "arrowright": (0x2192, 1400, lambda p, a: arrow_right(p, a)),
    "arrowleft": (0x2190, 1400, lambda p, a: arrow_right(p, a, 180)),
    "arrowup": (0x2191, 1100, lambda p, a: arrow_right(p, a, 90)),
    "arrowdown": (0x2193, 1100, lambda p, a: arrow_right(p, a, -90)),
    "arrowboth": (0x2194, 1700, arrow_both),
    "check": (0x2713, 1300, check),
    "heavycheck": (0x2714, 1300, check),
    "cross": (0x2717, 1200, cross),
    "multiply2": (0x2715, 1200, cross),
    "star": (0x2605, 1400, star),
    "bullet": (0x25CF, 1100, circle),
    "triangleright": (0x25B6, 1200, triangle),
    "implies": (0x21D2, 1400, lambda p, a: arrow_right(p, a)),
}

order = [".notdef"] + list(GLYPHS)
fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap({cp: name for name, (cp, _, _) in GLYPHS.items()})
glyphs, metrics = {}, {}
pen = TTGlyphPen(None)
glyphs[".notdef"] = pen.glyph()
metrics[".notdef"] = (600, 0)
for name, (_, adv, draw) in GLYPHS.items():
    pen = TTGlyphPen(None)
    draw(pen, adv)
    glyphs[name] = pen.glyph()
    metrics[name] = (adv, 0)
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=1984, descent=-494)
fb.setupNameTable({"familyName": "Anivo Symbols", "styleName": "Regular"})
fb.setupOS2(sTypoAscender=1984, sTypoDescender=-494, usWinAscent=1984, usWinDescent=494)
fb.setupPost()
fb.font.flavor = "woff2"
fb.save("assets/fonts/anivo-symbols.woff2")
print("Wrote assets/fonts/anivo-symbols.woff2 with", len(GLYPHS), "glyphs")
