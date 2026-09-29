# Procedural hull-wrap recreations for the Luge module.
#
# The original GitHub repo (highland88999-commits/Luge-Refuge) contains NO
# image assets — only pygame source files describing each sled's livery
# (hull base color + signature motifs). Three launcher wraps had base hull
# colors that contradicted the OG descriptions, so they are recreated here
# from the descriptions, faithfully and deterministically (seeded RNG).
#
# OG sources (src/bobsleds/*.py in Luge-Refuge):
#   g2  Urban Glider  — COMPOSITE_GRAY (128,128,128), neon underglow,
#                       adaptive fins (triangles), neon-blue runners
#   p3  Street Samurai — BLADE_SILVER (192,192,192), katana blade chassis,
#                       glowing red samurai runes (侍), glow-green edge blades
#   p11 Rift Marauder  — RIFT_GRAY (100,100,100), vortex-purple side
#                       emitter circles, energy-orange wisps, glow-green runners
#
# Output: 1600x1600 webp, same as the existing hull wraps.
# These are labeled in lib/luge_data.js as recreated-from-description.

import random
from PIL import Image, ImageDraw

SIZE = 1600
OUT = str(__import__('pathlib').Path(__file__).resolve().parent.parent / 'public' / 'textures' / 'luge') + '/'

rng = random.Random(20260929)


def noise_overlay(img, amount, seed):
    r = random.Random(seed)
    px = img.load()
    for y in range(0, SIZE, 4):
        for x in range(0, SIZE, 4):
            n = r.randint(-amount, amount)
            cr, cg, cb = px[x, y]
            px[x, y] = (
                max(0, min(255, cr + n)),
                max(0, min(255, cg + n)),
                max(0, min(255, cb + n)),
            )
    return img


def panel_lines(d, step, color, width=3):
    for x in range(0, SIZE + 1, step):
        d.line([(x, 0), (x, SIZE)], fill=color, width=width)
    for y in range(0, SIZE + 1, step):
        d.line([(0, y), (SIZE, y)], fill=color, width=width)


# ---------------------------------------------------------------- g2 ---
def make_g2():
    img = Image.new('RGB', (SIZE, SIZE), (128, 128, 128))
    d = ImageDraw.Draw(img)
    panel_lines(d, 200, (104, 104, 104), 4)
    # composite weave: subtle diagonal cross-hatch
    for i in range(-SIZE, SIZE * 2, 26):
        d.line([(i, 0), (i + SIZE, SIZE)], fill=(138, 138, 138), width=2)
    # adaptive fins: rows of triangles, darker fill, neon-blue edges
    fin_fill = (88, 88, 88)
    fin_edge = (0, 255, 255)
    for row in range(4):
        y0 = 180 + row * 340
        for col in range(6):
            x0 = 120 + col * 240 + (120 if row % 2 else 0)
            tri = [(x0, y0 + 150), (x0 + 90, y0 + 150), (x0 + 45, y0 + 20)]
            d.polygon(tri, fill=fin_fill, outline=fin_edge, width=3)
    # neon underglow band along the bottom (runner glow)
    for k in range(6):
        alpha = 1 - k / 6
        c = (0, int(255 * alpha), int(255 * alpha))
        d.rectangle([0, SIZE - 120 + k * 14, SIZE, SIZE - 106 + k * 14], fill=c)
    d.rectangle([0, SIZE - 130, SIZE, SIZE - 116], fill=(0, 255, 255))
    img = noise_overlay(img, 7, 11)
    img.save(OUT + 'hull-g2.webp', quality=86)
    print('wrote hull-g2.webp')


# ---------------------------------------------------------------- p3 ---
# Hand-drawn 侍 (samurai) rune — no CJK font on this box, so the strokes are
# defined explicitly. Stylized but legible: 亻 radical + 寺 body.
SAMURAI_STROKES = [
    ((90, 20), (40, 140)),      # 亻 left-falling
    ((105, 60), (105, 280)),    # 亻 vertical
    ((130, 30), (270, 30)),     # 寺 top horizontal
    ((140, 90), (260, 90)),     # 寺 second horizontal
    ((200, 30), (140, 180)),    # 寺 left-falling sweep
    ((200, 90), (200, 270)),    # 寺 vertical
    ((200, 270), (235, 245)),   # 寺 hook foot
    ((130, 280), (270, 280)),   # 寺 bottom horizontal
]


def draw_samurai_rune(d, x, y, size, color, glow=None, width=14):
    s = size / 300.0
    for (x1, y1), (x2, y2) in SAMURAI_STROKES:
        p1 = (x + x1 * s, y + y1 * s)
        p2 = (x + x2 * s, y + y2 * s)
        if glow:
            d.line([p1, p2], fill=glow, width=int(width * s * 2.2))
        d.line([p1, p2], fill=color, width=int(width * s))
def make_p3():
    img = Image.new('RGB', (SIZE, SIZE), (192, 192, 192))
    d = ImageDraw.Draw(img)
    # brushed steel: horizontal streaks
    r = random.Random(77)
    for _ in range(900):
        y = r.randint(0, SIZE - 1)
        x = r.randint(0, SIZE - 200)
        shade = r.randint(-22, 22)
        d.line([(x, y), (x + r.randint(60, 200), y)],
               fill=(192 + shade, 192 + shade, 192 + shade), width=2)
    # katana blade facet: diagonal light/dark bands
    d.polygon([(0, 0), (SIZE, 0), (SIZE, 260), (0, 560)], fill=(214, 214, 214))
    d.polygon([(0, SIZE), (SIZE, SIZE), (SIZE, SIZE - 260), (0, SIZE - 560)], fill=(168, 168, 168))
    d.line([(0, 560), (SIZE, 260)], fill=(150, 150, 150), width=4)
    d.line([(0, SIZE - 560), (SIZE, SIZE - 260)], fill=(150, 150, 150), width=4)
    panel_lines(d, 400, (160, 160, 160), 3)
    # glowing red samurai runes (hand-drawn 侍 strokes)
    draw_samurai_rune(d, 260, 420, 340, (255, 30, 30), glow=(120, 0, 0))
    draw_samurai_rune(d, 1010, 900, 300, (255, 30, 30), glow=(120, 0, 0))
    draw_samurai_rune(d, 680, 180, 190, (230, 20, 20), glow=(100, 0, 0), width=16)
    # faint watermark runes scattered across the blade
    r = random.Random(4242)
    for _ in range(7):
        draw_samurai_rune(d, r.randint(0, SIZE - 120), r.randint(0, SIZE - 120),
                          r.randint(90, 140), (255, 60, 60), width=10)
    # glow-green edge blades top and bottom
    d.rectangle([0, 40, SIZE, 58], fill=(0, 255, 0))
    d.rectangle([0, SIZE - 58, SIZE, SIZE - 40], fill=(0, 255, 0))
    for k in range(1, 5):
        d.rectangle([0, 40 - k * 8, SIZE, 46 - k * 8], fill=(0, 200 - k * 40, 0))
        d.rectangle([0, SIZE - 46 + k * 8, SIZE, SIZE - 40 + k * 8],
                    fill=(0, 200 - k * 40, 0))
    img = noise_overlay(img, 6, 23)
    img.save(OUT + 'hull-p3.webp', quality=86)
    print('wrote hull-p3.webp')


# --------------------------------------------------------------- p11 ---
def radial_glow(img, cx, cy, radius, color):
    """Paint a soft radial glow circle (additive-ish) onto img."""
    glow = Image.new('RGB', (radius * 2, radius * 2), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for rr in range(radius, 0, -4):
        k = 1 - rr / radius
        c = tuple(int(v * k * k) for v in color)
        gd.ellipse([radius - rr, radius - rr, radius + rr, radius + rr], fill=c)
    img.paste(glow, (cx - radius, cy - radius),
              mask=glow.convert('L').point(lambda v: min(255, v * 2)))
    return img


def make_p11():
    img = Image.new('RGB', (SIZE, SIZE), (100, 100, 100))
    d = ImageDraw.Draw(img)
    panel_lines(d, 200, (78, 78, 78), 4)
    # riveted seams
    r = random.Random(55)
    for _ in range(60):
        x, y = r.randint(0, SIZE), r.randint(0, SIZE)
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(70, 70, 70))
    # vortex harvester emitters: purple glowing circles
    emitters = [(400, 400, 150), (1200, 500, 190), (700, 1150, 170),
                (1300, 1250, 140), (250, 1250, 120)]
    for cx, cy, rad in emitters:
        img = radial_glow(img, cx, cy, rad, (170, 0, 200))
    d = ImageDraw.Draw(img)
    for cx, cy, rad in emitters:
        d.ellipse([cx - 34, cy - 34, cx + 34, cy + 34],
                  outline=(220, 120, 255), width=6)
        d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=(240, 200, 255))
    # energy-orange rift wisps: jagged arcs between emitters
    r = random.Random(91)
    for _ in range(14):
        x, y = r.randint(0, SIZE), r.randint(0, SIZE)
        pts = [(x, y)]
        for _ in range(6):
            x += r.randint(-160, 160)
            y += r.randint(-160, 160)
            pts.append((x, y))
        d.line(pts, fill=(255, 165, 0), width=5)
        d.line(pts, fill=(255, 210, 120), width=2)
    # glow-green runner lines
    d.rectangle([0, SIZE - 90, SIZE, SIZE - 72], fill=(0, 255, 0))
    d.rectangle([0, 72, SIZE, 90], fill=(0, 255, 0))
    img = noise_overlay(img, 8, 37)
    img.save(OUT + 'hull-p11.webp', quality=86)
    print('wrote hull-p11.webp')


make_g2()
make_p3()
make_p11()
