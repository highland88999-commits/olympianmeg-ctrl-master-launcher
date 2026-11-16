#!/usr/bin/env python3
"""Generate the missing TRON-style orb faces (Merlin, Nov 16, 2026).

The TRON motion-control graphics live in public/images/shadow-realm/ui/
(checked on disk: tron-boost/gas/brake/leave/pause/recenter/steer-left/
steer-right, all 256x256 webp) and are already worn by the Shadow Realm
ride controls via lib/god-menus.js tronUiArtFor() + the glyphFace pattern
(app/shadow-realm/page.jsx): the art fills the circle, a text label sits
underneath as the fallback and shows only if the art fails to load.

House style, read off those files: a near-black disc, one neon ring
(cyan; gold for boost/trade-class faces), thin circuit rings + ticks,
and ONE bold centered symbol. This script draws the faces that do not
exist yet in exactly that style, 256x256 webp, same folder, tron-<fn>
naming — so the shared OrbButton layer can wear one graphic per
function everywhere. Re-run to regenerate: nothing here overwrites
the 8 existing TRON files (they are not in SYMBOLS).
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
PAL = {"cyan": CYAN, "gold": GOLD, "green": GREEN, "red": RED,
       "orange": ORANGE, "amber": AMBER, "violet": VIOLET,
       "white": WHITE, "bg": BG}


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


def rays(d, c, r1=26, r2=36, cx=128, cy=128):
    for deg in range(0, 360, 45):
        a = math.radians(deg)
        d.line([cx + r1 * math.cos(a), cy + r1 * math.sin(a),
                cx + r2 * math.cos(a), cy + r2 * math.sin(a)],
               fill=c + (255,), width=5)

# --- one symbol per function: bold strokes, centred, reads at 56 px ---
def s_jump(d, c):
    L(d, [(100, 152), (128, 124), (156, 152)], c)
    L(d, [(100, 126), (128, 98), (156, 126)], c)
    L(d, [(88, 178), (168, 178)], c, 7)


def s_shoot(d, c):
    O(d, [94, 94, 162, 162], c, 7)
    L(d, [(128, 82), (128, 98)], c, 7)
    L(d, [(128, 158), (128, 174)], c, 7)
    L(d, [(82, 128), (98, 128)], c, 7)
    L(d, [(158, 128), (174, 128)], c, 7)
    DOT(d, 128, 128, 7, c)


def s_strike(d, c):
    L(d, [(92, 92), (164, 164)], c)
    L(d, [(82, 102), (102, 82)], c, 7)
    L(d, [(164, 92), (92, 164)], c)
    L(d, [(154, 82), (174, 102)], c, 7)


def s_map(d, c):
    P(d, [(92, 100), (128, 88), (164, 100), (164, 156), (128, 168), (92, 156)], c, 7)
    L(d, [(128, 88), (128, 168)], c, 4)
    O(d, [102, 118, 118, 134], c, 4)


def s_trade(d, c):
    P(d, [(170, 128), (149, 164), (107, 164), (86, 128), (107, 92), (149, 92)], c, 7)
    L(d, [(108, 118), (148, 118)], c, 6)
    F(d, [(148, 118), (136, 110), (136, 126)], c)
    L(d, [(148, 140), (108, 140)], c, 6)
    F(d, [(108, 140), (120, 132), (120, 148)], c)


def s_fullscreen(d, c):
    L(d, [(88, 112), (88, 88), (112, 88)], c)
    L(d, [(144, 88), (168, 88), (168, 112)], c)
    L(d, [(88, 144), (88, 168), (112, 168)], c)
    L(d, [(144, 168), (168, 168), (168, 144)], c)


def s_fullscreen_exit(d, c):
    L(d, [(104, 128), (104, 104), (128, 104)], c)
    L(d, [(128, 104), (152, 104), (152, 128)], c)
    L(d, [(104, 128), (104, 152), (128, 152)], c)
    L(d, [(152, 128), (152, 152), (128, 152)], c)


def s_close(d, c):
    L(d, [(100, 100), (156, 156)], c, 9)
    L(d, [(156, 100), (100, 156)], c, 9)


def s_mount(d, c):
    d.arc([88, 84, 168, 164], start=180, end=360, fill=c + (255,), width=9)
    DOT(d, 90, 124, 5, c)
    DOT(d, 166, 124, 5, c)


def s_dismount(d, c):
    L(d, [(128, 94), (128, 146)], c)
    F(d, [(108, 128), (128, 150), (148, 128)], c)
    L(d, [(92, 168), (164, 168)], c, 7)


def s_summon(d, c):
    L(d, [(128, 158), (128, 104)], c)
    F(d, [(108, 122), (128, 100), (148, 122)], c)
    L(d, [(92, 168), (164, 168)], c, 7)


def s_board(d, c):
    O(d, [94, 94, 162, 162], c, 7)
    O(d, [118, 118, 138, 138], c, 6)
    L(d, [(128, 94), (128, 118)], c, 6)
    L(d, [(128, 138), (128, 162)], c, 6)
    L(d, [(94, 128), (118, 128)], c, 6)
    L(d, [(138, 128), (162, 128)], c, 6)


def s_home(d, c):
    P(d, [(88, 134), (128, 94), (168, 134)], c)
    L(d, [(98, 134), (98, 166)], c, 7)
    L(d, [(158, 134), (158, 166)], c, 7)
    L(d, [(98, 166), (158, 166)], c, 7)
    d.rectangle([120, 142, 136, 166], outline=c + (255,), width=5)


def s_weapon(d, c):
    L(d, [(128, 90), (128, 146)], c)
    L(d, [(106, 146), (150, 146)], c, 7)
    L(d, [(128, 146), (128, 166)], c, 7)


def s_buy_shield(d, c):
    P(d, [(128, 88), (160, 102), (160, 136), (128, 168), (96, 136), (96, 102)], c, 7)
    L(d, [(114, 126), (124, 136), (144, 112)], c, 6)


def s_recharge(d, c):
    d.rectangle([90, 106, 158, 150], outline=c + (255,), width=7)
    F(d, [(158, 120), (170, 120), (170, 136), (158, 136)], c)
    F(d, [(134, 112), (118, 136), (129, 136), (122, 152), (142, 130), (131, 130)], c)


def s_buy_weapon(d, c):
    L(d, [(100, 156), (150, 106)], c)
    F(d, [(158, 98), (134, 102), (152, 122)], c)
    L(d, [(100, 156), (86, 150)], c, 5)
    L(d, [(100, 156), (106, 142)], c, 5)


def s_fire(d, c):
    F(d, [(128, 86), (142, 112), (142, 146), (114, 146), (114, 112)], c)
    d.ellipse([120, 110, 136, 126], fill=BG + (255,))
    F(d, [(114, 146), (100, 164), (114, 156)], c)
    F(d, [(142, 146), (156, 164), (142, 156)], c)
    F(d, [(128, 174), (120, 154), (136, 154)], GOLD)


def s_fly(d, c):
    P(d, [(92, 132), (168, 100), (128, 164)], c, 7)
    L(d, [(128, 164), (146, 116)], c, 5)


def s_walk(d, c):
    O(d, [132, 86, 148, 102], c, 6)
    L(d, [(136, 102), (128, 126)], c, 7)
    L(d, [(128, 126), (114, 152)], c, 7)
    L(d, [(128, 126), (144, 150)], c, 7)
    L(d, [(133, 114), (116, 126)], c, 6)
    L(d, [(133, 114), (152, 106)], c, 6)


def s_orbit(d, c):
    d.ellipse([74, 102, 182, 154], outline=c + (255,), width=6)
    DOT(d, 128, 128, 16, c)
    DOT(d, 172, 110, 5, c)


def s_live_time(d, c):
    O(d, [108, 108, 148, 148], c, 7)
    rays(d, c, 26, 34)
    d.arc([88, 88, 168, 168], start=300, end=210, fill=c + (255,), width=6)
    F(d, [(93, 148), (84, 132), (104, 136)], c)


def s_dawn(d, c):
    L(d, [(88, 142), (168, 142)], c, 7)
    d.arc([106, 106, 150, 150], start=180, end=360, fill=c + (255,), width=7)
    L(d, [(128, 96), (128, 106)], c, 5)
    L(d, [(108, 102), (112, 110)], c, 5)
    L(d, [(148, 102), (144, 110)], c, 5)


def s_day(d, c):
    O(d, [106, 106, 150, 150], c, 7)
    rays(d, c, 30, 40)


def s_dusk(d, c):
    L(d, [(88, 128), (168, 128)], c, 7)
    d.arc([106, 106, 150, 150], start=0, end=180, fill=c + (255,), width=7)
    L(d, [(128, 96), (128, 106)], c, 5)
    L(d, [(108, 102), (112, 110)], c, 5)
    L(d, [(148, 102), (144, 110)], c, 5)


def s_night(d, c):
    d.ellipse([102, 100, 154, 152], fill=c + (255,))
    d.ellipse([118, 92, 166, 144], fill=BG + (255,))
    DOT(d, 170, 100, 3, c)
    DOT(d, 94, 96, 2, c)


def s_sprint(d, c):
    L(d, [(96, 98), (126, 128), (96, 158)], c)
    L(d, [(130, 98), (160, 128), (130, 158)], c)


def s_mission(d, c):
    F(d, [(128, 90), (137, 119), (166, 128), (137, 137),
          (128, 166), (119, 137), (90, 128), (119, 119)], c)


def s_tour(d, c):
    O(d, [94, 94, 162, 162], c, 7)
    F(d, [(118, 108), (118, 148), (152, 128)], c)


def s_tour_prev(d, c):
    L(d, [(154, 98), (120, 128), (154, 158)], c, 9)


def s_tour_next(d, c):
    L(d, [(102, 98), (136, 128), (102, 158)], c, 9)


def _pin(d, c, cx=128, cy=118, r=18):
    O(d, [cx - r, cy - r, cx + r, cy + r], c, 7)
    L(d, [(cx - r + 2, cy + r - 4), (cx, cy + 42)], c, 7)
    L(d, [(cx + r - 2, cy + r - 4), (cx, cy + 42)], c, 7)
    DOT(d, cx, cy, 6, c)


def s_here(d, c):
    _pin(d, c)
    d.ellipse([92, 86, 164, 164], outline=c + (70,), width=3)


def s_visit(d, c):
    P(d, [(88, 128), (128, 104), (168, 128), (128, 152)], c, 7)
    O(d, [119, 119, 137, 137], c, 6)


def s_claim(d, c):
    L(d, [(104, 88), (104, 168)], c, 7)
    F(d, [(104, 92), (162, 92), (150, 110), (162, 128), (104, 128)], c)


def s_ascend(d, c):
    L(d, [(128, 158), (128, 104)], c, 9)
    F(d, [(102, 126), (128, 98), (154, 126)], c)


def s_descend(d, c):
    L(d, [(128, 98), (128, 152)], c, 9)
    F(d, [(102, 130), (128, 158), (154, 130)], c)


def s_back(d, c):
    L(d, [(158, 128), (102, 128)], c, 9)
    F(d, [(126, 102), (98, 128), (126, 154)], c)


def s_build(d, c):
    L(d, [(106, 164), (146, 102)], c, 9)
    L(d, [(128, 88), (166, 114)], c, 13)


def s_style(d, c):
    O(d, [96, 96, 160, 160], c, 7)
    O(d, [136, 136, 152, 152], c, 5)
    DOT(d, 116, 116, 5, c)
    DOT(d, 142, 112, 5, c)
    DOT(d, 120, 142, 5, c)


def s_place(d, c):
    _pin(d, c)
    L(d, [(108, 88), (108, 78)], c, 5)
    L(d, [(128, 84), (128, 74)], c, 5)
    L(d, [(148, 88), (148, 78)], c, 5)


def s_edit(d, c):
    L(d, [(102, 154), (150, 106)], c, 9)
    F(d, [(102, 154), (90, 166), (114, 162)], c)
    L(d, [(146, 100), (158, 112)], c, 6)


def s_turn(d, c):
    d.arc([88, 88, 168, 168], start=40, end=330, fill=c + (255,), width=8)
    F(d, [(164, 106), (144, 100), (158, 124)], c)


def s_orient(d, c):
    L(d, [(128, 116), (128, 96)], c, 7)
    F(d, [(116, 108), (128, 94), (140, 108)], c)
    L(d, [(128, 140), (128, 160)], c, 7)
    F(d, [(116, 148), (128, 162), (140, 148)], c)


def s_delete(d, c):
    L(d, [(98, 102), (158, 102)], c, 7)
    L(d, [(118, 102), (118, 94), (138, 94), (138, 102)], c, 5)
    P(d, [(104, 112), (152, 112), (148, 164), (108, 164)], c, 7)
    L(d, [(120, 122), (118, 154)], c, 4)
    L(d, [(136, 122), (138, 154)], c, 4)

def s_portal(d, c):
    pts = []
    steps = 90
    for i in range(steps + 1):
        t = (i / steps) * 3.5 * math.pi
        r = 8 + (i / steps) * 34
        pts.append((128 + r * math.cos(t), 128 + r * math.sin(t)))
    L(d, pts, c, 7)
    DOT(d, 128, 128, 5, c)


def s_done(d, c):
    L(d, [(96, 130), (120, 154), (162, 102)], c, 9)


def s_oblivion(d, c):
    P(d, [(128, 88), (170, 158), (86, 158)], c, 7)
    F(d, [(132, 112), (116, 136), (128, 136), (122, 156), (142, 130), (130, 130)], c)


def s_grapple(d, c):
    L(d, [(128, 88), (128, 132)], c)
    d.arc([96, 104, 160, 168], start=0, end=180, fill=c + (255,), width=8)
    L(d, [(160, 136), (150, 124)], c, 6)


def s_egg(d, c):
    d.ellipse([106, 94, 150, 162], outline=c + (255,), width=7)
    L(d, [(118, 128), (126, 136), (120, 144), (130, 150)], c, 4)


def s_exchange(d, c):
    d.arc([106, 118, 150, 162], start=0, end=180, fill=c + (255,), width=7)
    L(d, [(106, 140), (128, 94)], c, 7)
    L(d, [(150, 140), (128, 94)], c, 7)


def s_fossil(d, c):
    L(d, [(102, 154), (154, 102)], c, 9)
    DOT(d, 100, 156, 9, c)
    DOT(d, 112, 144, 9, c)
    DOT(d, 144, 112, 9, c)
    DOT(d, 156, 100, 9, c)


def s_drive_cam(d, c):
    d.rounded_rectangle([92, 106, 164, 150], radius=8, outline=c + (255,), width=7)
    d.rectangle([116, 98, 140, 106], outline=c + (255,), width=6)
    O(d, [114, 114, 142, 142], c, 6)
    DOT(d, 128, 128, 4, c)


def s_flight_axis(d, c):
    L(d, [(92, 128), (164, 128)], c, 7)
    F(d, [(92, 128), (108, 120), (108, 136)], c)
    F(d, [(164, 128), (148, 120), (148, 136)], c)
    L(d, [(128, 92), (128, 164)], c, 7)
    F(d, [(128, 92), (120, 108), (136, 108)], c)
    F(d, [(128, 164), (120, 148), (136, 148)], c)


def s_console(d, c):
    O(d, [96, 96, 160, 160], c, 7)
    d.ellipse([112, 96, 144, 160], outline=c + (255,), width=5)
    L(d, [(96, 128), (160, 128)], c, 5)


def s_minimize(d, c):
    L(d, [(96, 128), (160, 128)], c, 9)


def s_expand(d, c):
    L(d, [(112, 112), (96, 96)], c, 7)
    F(d, [(96, 96), (112, 98), (98, 112)], c)
    L(d, [(144, 112), (160, 96)], c, 7)
    F(d, [(160, 96), (144, 98), (158, 112)], c)
    L(d, [(112, 144), (96, 160)], c, 7)
    F(d, [(96, 160), (112, 158), (98, 144)], c)
    L(d, [(144, 144), (160, 160)], c, 7)
    F(d, [(160, 160), (144, 158), (158, 144)], c)


def s_forge(d, c):
    F(d, [(128, 90), (142, 114), (154, 130), (150, 152),
          (128, 166), (106, 152), (102, 130), (114, 114)], c)
    F(d, [(128, 124), (136, 136), (134, 150), (128, 156), (122, 150), (120, 136)], GOLD)


def s_ferry(d, c):
    P(d, [(94, 132), (162, 132), (150, 156), (106, 156)], c, 7)
    L(d, [(128, 132), (128, 102)], c, 6)
    F(d, [(128, 104), (128, 128), (154, 128)], c)


def s_guide(d, c):
    d.rectangle([120, 112, 136, 156], outline=c + (255,), width=6)
    F(d, [(128, 94), (136, 106), (128, 116), (120, 106)], c)
    L(d, [(110, 162), (146, 162)], c, 6)


def s_atlas(d, c):
    P(d, [(96, 96), (160, 96), (160, 160), (96, 160)], c, 7)
    L(d, [(117, 96), (117, 160)], c, 4)
    L(d, [(139, 96), (139, 160)], c, 4)
    L(d, [(96, 117), (160, 117)], c, 4)
    L(d, [(96, 139), (160, 139)], c, 4)


def s_autopilot(d, c):
    O(d, [94, 94, 162, 162], c, 7)
    L(d, [(128, 128), (158, 100)], c, 6)
    DOT(d, 150, 108, 4, c)
    O(d, [112, 112, 144, 144], c, 4)


def s_info(d, c):
    DOT(d, 128, 100, 7, c)
    L(d, [(128, 118), (128, 158)], c, 9)


# name -> (palette colour, symbol drawer). Names are the ORB_FUNCTIONS
# keys in components/world/OrbButton.jsx; files land as tron-<name>.webp.
SYMBOLS = {
    "jump": (CYAN, s_jump),
    "shoot": (CYAN, s_shoot),
    "strike": (CYAN, s_strike),
    "map": (CYAN, s_map),
    "trade": (GOLD, s_trade),
    "fullscreen": (CYAN, s_fullscreen),
    "fullscreen-exit": (CYAN, s_fullscreen_exit),
    "close": (CYAN, s_close),
    "mount": (CYAN, s_mount),
    "dismount": (CYAN, s_dismount),
    "summon": (CYAN, s_summon),
    "board": (CYAN, s_board),
    "home": (GOLD, s_home),
    "weapon": (CYAN, s_weapon),
    "buy-shield": (GOLD, s_buy_shield),
    "recharge": (CYAN, s_recharge),
    "buy-weapon": (CYAN, s_buy_weapon),
    "fire": (RED, s_fire),
    "fly": (CYAN, s_fly),
    "walk": (CYAN, s_walk),
    "orbit": (CYAN, s_orbit),
    "live-time": (GOLD, s_live_time),
    "time-dawn": (GOLD, s_dawn),
    "time-day": (GOLD, s_day),
    "time-dusk": (ORANGE, s_dusk),
    "time-night": (CYAN, s_night),
    "sprint": (CYAN, s_sprint),
    "mission": (CYAN, s_mission),
    "tour": (CYAN, s_tour),
    "tour-prev": (CYAN, s_tour_prev),
    "tour-next": (CYAN, s_tour_next),
    "here": (CYAN, s_here),
    "visit": (CYAN, s_visit),
    "claim": (GOLD, s_claim),
    "ascend": (CYAN, s_ascend),
    "descend": (CYAN, s_descend),
    "back-to-hub": (GOLD, s_back),
    "build": (GOLD, s_build),
    "style": (CYAN, s_style),
    "place": (CYAN, s_place),
    "edit": (CYAN, s_edit),
    "turn": (CYAN, s_turn),
    "orient": (CYAN, s_orient),
    "delete": (RED, s_delete),
    "portal": (CYAN, s_portal),
    "done": (GOLD, s_done),
    "oblivion": (GREEN, s_oblivion),
    "grapple": (AMBER, s_grapple),
    "steal-egg": (GREEN, s_egg),
    "exchange": (RED, s_exchange),
    "trade-fossils": (AMBER, s_fossil),
    "drive-cam": (CYAN, s_drive_cam),
    "flight-axis": (CYAN, s_flight_axis),
    "console": (CYAN, s_console),
    "minimize": (CYAN, s_minimize),
    "expand": (CYAN, s_expand),
    "forge": (ORANGE, s_forge),
    "ferry": (GOLD, s_ferry),
    "guide": (VIOLET, s_guide),
    "atlas": (CYAN, s_atlas),
    "autopilot": (CYAN, s_autopilot),
    "info": (WHITE, s_info),
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
