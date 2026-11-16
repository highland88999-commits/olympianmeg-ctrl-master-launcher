#!/usr/bin/env python3
"""Generate the Hollow Earth hero / cluster / mission orb faces
(Merlin, Nov 16, 2026 — the hunter-pick + missions-map orb rework).

The hunter-pick screen used to offer 6 rectangular chips with
truncated names; the missions map offered rectangular Hunt /
Free Roam pills. The orb law says every pick is a circle orb
wearing that pick's graphic, no words — so each hero, each
cluster and each mission gets its own face here, in exactly the
TRON house style of scripts/gen-tron-orb-art.py (near-black
disc, neon ring, circuit rings + ticks, ONE bold centered
symbol, 256x256 webp, public/images/shadow-realm/ui/).

Files land as tron-hero-<key>.webp, tron-cluster-<id>.webp and
tron-mission-<slug>.webp — no collision with the vehicle faces
(tron-vehicle-*.webp, another workstream) or the function faces
(tron-<fn>.webp, gen-tron-orb-art.py, which this script does NOT
touch). Re-run to regenerate; nothing here overwrites any
existing TRON file (none of these names is in that script).
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
GOLD = (255, 196, 77)
GREEN = (60, 227, 107)
RED = (255, 95, 77)
ORANGE = (255, 154, 60)
AMBER = (255, 179, 71)
VIOLET = (183, 166, 255)
WHITE = (238, 242, 242)
BG = (5, 7, 10)
# Element colours, as DATA.INTRO.orbs in app/hollow-earth/data.js.
ACID = (143, 212, 58)
FIRE = (255, 106, 34)
LIGHTNING = (255, 225, 77)
POISON = (192, 106, 224)
SAND = (232, 200, 122)
FROST = (159, 216, 232)


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


# --- symbol helpers (draw on a transparent layer, color = (r, g, b)) ---
def L(d, pts, c, w=8):
    d.line(pts, fill=c + (255,), width=w, joint="curve")


def P(d, pts, c, w=8):
    d.line(pts + [pts[0]], fill=c + (255,), width=w, joint="curve")


def F(d, pts, c):
    d.polygon(pts, fill=c + (255,))


def O(d, box, c, w=8):
    d.ellipse(box, outline=c + (255,), width=w)


def DOT(d, x, y, r, c):
    d.ellipse([x - r, y - r, x + r, y + r], fill=c + (255,))


# --- heroes: one symbol per hunter (characters.js HERO_ORDER) ---
def s_hero_hunter(d, c):
    # Kael's hunting spear, diagonal, head up-right.
    L(d, [(96, 164), (148, 100)], c, 8)
    F(d, [(148, 100), (168, 88), (152, 118)], c)
    L(d, [(120, 132), (138, 146)], c, 6)
    DOT(d, 92, 168, 5, c)


def s_hero_wizard(d, c):
    # The Grey Pilgrim's staff, crowned with a four-point star.
    L(d, [(128, 112), (128, 168)], c, 8)
    F(d, [(128, 82), (136, 98), (154, 98), (140, 108),
          (146, 124), (128, 114), (110, 124), (116, 108),
          (102, 98), (120, 98)], c)


def s_hero_ranger(d, c):
    # A Ranger's longbow, strung, arrow nocked across.
    d.arc([92, 84, 148, 172], start=270, end=90, fill=c + (255,), width=8)
    L(d, [(120, 92), (120, 164)], c, 5)
    L(d, [(96, 128), (168, 128)], c, 6)
    F(d, [(168, 128), (150, 118), (150, 138)], c)


def s_hero_elf(d, c):
    # An Elf of the Valley: a valley leaf, veined.
    d.arc([96, 92, 160, 150], start=180, end=360, fill=c + (255,), width=7)
    d.arc([96, 118, 160, 176], start=0, end=180, fill=c + (255,), width=7)
    L(d, [(100, 132), (156, 132)], c, 5)
    L(d, [(128, 132), (128, 168)], c, 6)


def s_hero_dwarf(d, c):
    # A Dwarf's forge-axe, double-headed.
    L(d, [(112, 164), (144, 96)], c, 9)
    F(d, [(144, 96), (168, 104), (158, 128), (138, 118)], c)
    F(d, [(144, 96), (120, 104), (130, 128), (150, 118)], c)


def s_hero_halfling(d, c):
    # A Halfling's dagger, short and quiet.
    F(d, [(128, 90), (138, 118), (128, 150), (118, 118)], c)
    L(d, [(106, 152), (150, 152)], c, 7)
    L(d, [(128, 152), (128, 168)], c, 7)


# --- clusters: one symbol per cluster (data.js CLUSTER_ORDER) ---
def s_cluster_wilds(d, c):
    # Ooze droplet over a ripple — the Wilds' acid pools.
    F(d, [(128, 88), (150, 122), (128, 156), (106, 122)], c)
    d.ellipse([104, 160, 152, 172], outline=c + (255,), width=5)
    d.ellipse([92, 168, 164, 178], outline=c + (160,), width=4)


def s_cluster_stormlands(d, c):
    # A storm bolt over ember ridges — the Stormlands.
    F(d, [(136, 86), (112, 128), (128, 128), (118, 164),
          (146, 118), (130, 118)], c)
    L(d, [(92, 172), (164, 172)], c, 6)


def s_cluster_dark(d, c):
    # Crescent moon + two stars — the Dark Reaches' gloom.
    d.ellipse([100, 96, 152, 148], fill=c + (255,))
    d.ellipse([116, 88, 164, 140], fill=BG + (255,))
    DOT(d, 168, 100, 4, c)
    DOT(d, 92, 156, 3, c)
    L(d, [(96, 168), (160, 168)], c, 5)


# --- missions: one symbol per mission (data.js CLUSTERS) ---
def s_mission_ooze(d, c):
    # Crossing the ooze: concentric pool ripples.
    O(d, [108, 108, 148, 148], c, 6)
    O(d, [92, 92, 164, 164], c, 5)
    DOT(d, 128, 128, 6, c)


def s_mission_mire(d, c):
    # Hunting the mire: a diamond sight over the hunt.
    P(d, [(128, 88), (168, 128), (128, 168), (88, 128)], c, 7)
    DOT(d, 128, 128, 8, c)
    L(d, [(128, 78), (128, 88)], c, 5)
    L(d, [(128, 168), (128, 178)], c, 5)


def s_mission_pylon(d, c):
    # The pylon run: a storm pylon, crossbarred.
    L(d, [(128, 88), (108, 168)], c, 7)
    L(d, [(128, 88), (148, 168)], c, 7)
    L(d, [(112, 118), (144, 118)], c, 5)
    L(d, [(118, 142), (138, 142)], c, 5)
    DOT(d, 128, 88, 6, c)


def s_mission_storm(d, c):
    # Storm hunt: a storm cloud, bolt underneath.
    d.ellipse([92, 96, 128, 124], outline=c + (255,), width=6)
    d.ellipse([116, 88, 152, 118], outline=c + (255,), width=6)
    d.ellipse([140, 100, 168, 124], outline=c + (255,), width=6)
    F(d, [(136, 128), (122, 156), (132, 156), (126, 176), (146, 150), (136, 150)], c)


def s_mission_wreck(d, c):
    # The wreck field: a tilted hull, mast broken.
    F(d, [(92, 128), (164, 128), (150, 158), (106, 158)], c)
    L(d, [(128, 128), (128, 96)], c, 6)
    L(d, [(128, 96), (148, 106)], c, 5)
    DOT(d, 110, 142, 4, c)
    DOT(d, 146, 142, 4, c)


def s_mission_gloom(d, c):
    # Gloom hunt: a monster's eye in the dark.
    d.arc([92, 100, 164, 156], start=200, end=340, fill=c + (255,), width=7)
    d.arc([92, 100, 164, 156], start=20, end=160, fill=c + (255,), width=7)
    O(d, [116, 116, 140, 140], c, 6)
    DOT(d, 128, 128, 5, c)


def s_mission_throne(d, c):
    # The throne road: Korus's crown.
    F(d, [(96, 156), (96, 108), (112, 130), (128, 96),
          (144, 130), (160, 108), (160, 156)], c)
    L(d, [(96, 156), (160, 156)], c, 7)
    DOT(d, 128, 140, 5, c)


# name -> (palette colour, symbol drawer). Files land as
# tron-<name>.webp in public/images/shadow-realm/ui/.
SYMBOLS = {
    # Heroes (characters.js HERO_ORDER).
    "hero-monster-hunter": (GOLD, s_hero_hunter),
    "hero-wizard": (VIOLET, s_hero_wizard),
    "hero-ranger": (GREEN, s_hero_ranger),
    "hero-elf-archer": (CYAN, s_hero_elf),
    "hero-dwarf": (ORANGE, s_hero_dwarf),
    "hero-halfling": (AMBER, s_hero_halfling),
    # Clusters (data.js CLUSTER_ORDER), first-biome element colours.
    "cluster-wilds": (ACID, s_cluster_wilds),
    "cluster-stormlands": (FIRE, s_cluster_stormlands),
    "cluster-dark-reaches": (VIOLET, s_cluster_dark),
    # Missions (data.js CLUSTERS), element-of-the-hunt colours.
    "mission-ooze-crossing": (ACID, s_mission_ooze),
    "mission-mire-hunt": (POISON, s_mission_mire),
    "mission-pylon-run": (LIGHTNING, s_mission_pylon),
    "mission-storm-hunt": (FIRE, s_mission_storm),
    "mission-wreck-field": (SAND, s_mission_wreck),
    "mission-gloom-hunt": (VIOLET, s_mission_gloom),
    "mission-throne-road": (GOLD, s_mission_throne),
}


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
    for name, (color, fn) in sorted(SYMBOLS.items()):
        print(render(name, color, fn))
    print("done: %d faces" % len(SYMBOLS))
