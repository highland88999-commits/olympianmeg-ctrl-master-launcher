#!/usr/bin/env python3
"""Generate the TRON-style vehicle face for the Mars 2 space orb
(Merlin, Nov 17, 2026 — redesigned: the ship is a see-through orb).

House style, read off scripts/gen-tron-orb-art.py: a near-black
disc, one neon ring (cyan), thin circuit rings + ticks, and ONE
bold centered symbol. The symbol here is the orb itself: a glassy
bubble (pale cyan outline + white top-left highlight arc + a small
rider dot at the centre) with its equator ring. 256x256 webp, same
folder, tron-vehicle-space-orb naming — the vehicle menu wears it.
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "public", "images", "shadow-realm", "ui",
)
S, C = 256, 128
CYAN = (47, 232, 216)
WHITE = (238, 242, 242)
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


def space_orb():
    img = frame(CYAN)
    d = ImageDraw.Draw(img)
    # The glass bubble: a big pale-cyan circle, bright rim.
    d.ellipse([58, 58, 198, 198], outline=(191, 239, 255, 255), width=6)
    # The equator ring across the bubble.
    d.ellipse([52, 118, 204, 138], outline=CYAN + (255,), width=4)
    # The glass highlight: a white arc, top-left.
    d.arc([66, 66, 190, 190], start=200, end=290, fill=WHITE + (255,), width=7)
    # The rider: a small dot at the bubble's heart.
    d.ellipse([122, 122, 134, 134], fill=CYAN + (255,))
    return img


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    space_orb().save(os.path.join(OUT, "tron-vehicle-space-orb.webp"), "WEBP")
    print("wrote tron-vehicle-space-orb.webp")
