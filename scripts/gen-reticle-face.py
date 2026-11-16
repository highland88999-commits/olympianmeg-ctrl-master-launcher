#!/usr/bin/env python3
"""Generate the FIRE reticle orb face (Merlin, Nov 16, 2026 — J2 layout).

The existing fire face, public/images/shadow-realm/ui/tron-fire.webp,
is a ROCKET (checked on disk: red body, gold flame) — not a reticle.
FIRE = ATTACK on foot, so its orb wears a real reticle: four corner
brackets framing a centre dot, in fire red.

House style, read off scripts/gen-tron-orb-art.py (NOT imported —
this script is standalone, so it carries its own copy of the frame):
a near-black disc, one neon ring, thin circuit rings + ticks, and ONE
bold centered symbol, 256x256 webp, tron-<fn> naming. The brackets
are drawn to read at 56 px, distinct from SHOOT's circle-crosshair
(tron-shoot.webp) so the two attack orbs never read as twins.

Run: python3 scripts/gen-reticle-face.py
Writes: public/images/shadow-realm/ui/tron-reticle.webp
Never touches tron-fire.webp or any other face.
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "public", "images", "shadow-realm", "ui",
)
S, C = 256, 128
RED = (255, 95, 77)
BG = (5, 7, 10)


def _layer():
    return Image.new("RGBA", (S, S), (0, 0, 0, 0))


def _glow(img, layer, blur=5):
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))
    img.alpha_composite(layer)


def frame(color):
    """The TRON disc: black ground, neon ring, circuit rings + ticks."""
    img = Image.new("RGBA", (S, S), BG + (255,))
    d = ImageDraw.Draw(img)
    d.ellipse([12, 12, 244, 244], fill=(10, 17, 24, 255))
    ring = _layer()
    rd = ImageDraw.Draw(ring)
    rd.ellipse([8, 8, 248, 248], outline=color + (255,), width=4)
    _glow(img, ring, 7)
    d = ImageDraw.Draw(img)
    d.ellipse([8, 8, 248, 248], outline=color + (255,), width=3)
    d.ellipse([24, 24, 232, 232], outline=color + (110,), width=1)
    for deg in range(0, 360, 15):
        a = math.radians(deg)
        long = deg % 90 == 0
        r1 = 104 if long else 108
        d.line([C + r1 * math.cos(a), C + r1 * math.sin(a),
                C + 114 * math.cos(a), C + 114 * math.sin(a)],
               fill=color + (150 if long else 80,), width=2 if long else 1)
    d.arc([14, 14, 242, 242], start=205, end=245, fill=color + (255,), width=3)
    for deg in (45, 135, 225, 315):
        a = math.radians(deg)
        x, y = C + 98 * math.cos(a), C + 98 * math.sin(a)
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=color + (200,))
    return img


def L(d, pts, c, w=8):
    d.line(pts, fill=c + (255,), width=w, joint="curve")


def DOT(d, x, y, r, c):
    d.ellipse([x - r, y - r, x + r, y + r], fill=c + (255,))


def s_reticle(d, c):
    """Four corner brackets framing a centre dot — a targeting
    reticle, not SHOOT's circle-crosshair. Brackets open toward
    the centre; short mid-ticks mark the axes without joining it."""
    # Corner brackets: each an L of 34 px arms, 30 px off centre.
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        x0, y0 = C + sx * 78, C + sy * 78
        x1, y1 = C + sx * 44, C + sy * 44
        L(d, [(x0, y1), (x0, y0), (x1, y0)], c, 9)
    # Mid-axis ticks (short, clear of the centre dot).
    L(d, [(C, 84), (C, 100)], c, 6)
    L(d, [(C, 156), (C, 172)], c, 6)
    L(d, [(84, C), (100, C)], c, 6)
    L(d, [(156, C), (172, C)], c, 6)
    DOT(d, C, C, 8, c)


def render(name, color, fn):
    img = frame(color)
    layer = _layer()
    fn(ImageDraw.Draw(layer), color)
    _glow(img, layer, 4)
    path = os.path.join(OUT, "tron-%s.webp" % name)
    img.convert("RGB").save(path, "WEBP", quality=90)
    return path


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print(render("reticle", RED, s_reticle))
    print("done: 1 face")
