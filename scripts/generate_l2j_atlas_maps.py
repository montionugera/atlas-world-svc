#!/usr/bin/env python3
"""
Deterministic L2J.RU / L2Hub / PMFun Cartographic Map Plate Generator.

Generates 6 high-resolution top-down raster map plates in `content/studio/maps/`:
1. `all_interlaced_world_grid.png` (960x768) — Master 17x16 `[10.10]..[26.25]` interlaced satellite terrain & polygon zone map (`all_interlaced.jpg` standard)
2. `c3_continent_parchment_relief.png` (1120x920) — Illustrated antique parchment relief map with 50+ named towns, castles, harbors, dungeons, catacombs & roads (`c3_aden.jpg` standard)
3. `d01_field_common_map.png` (520x420) — Enlarged parchment zone map for `Clover South-Gate Meadow: lvl.1 [1-12]` with red zone boundary & 185 red spawn pins (`zone_map_enlarged.php` standard)
4. `d01_field_radar_map.png` (520x420) — Enlarged top-down orthographic 3D terrain radar map for `Clover South-Gate Meadow: lvl.1 [1-12]` (`zone_map_enlarged_radar.php` standard)
5. `d01_dungeon_common_map.png` (913x200) & `d01_dungeon_radar_map.png` (913x340) — Enlarged dual parchment + underground multi-room stone labyrinth radar map for `Kiln Cellar Ruins: lvl.9 [9-22]` (`Elven Ruins id=53` standard)
6. `d01_town_detailed_blueprint.png` (640x500) — Detailed architectural town street & building roof blueprint for `Lantern Hollow Village: lvl.1 [1-10]` (`PMFun town map` standard)
"""

from __future__ import annotations

import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "content" / "studio" / "maps"


def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        [
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            "/Library/Fonts/Arial Bold.ttf",
        ]
        if bold
        else [
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            "/Library/Fonts/Arial.ttf",
        ]
    )
    for c in candidates:
        if Path(c).exists():
            try:
                return ImageFont.truetype(c, size=size)
            except Exception:
                pass
    return ImageFont.load_default()


def _hash2(ix: int, iy: int, seed: int = 1337) -> float:
    n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFF) / float(0x1000000)


def _value_noise(x: float, y: float, seed: int = 1337) -> float:
    ix = math.floor(x)
    iy = math.floor(y)
    fx = x - ix
    fy = y - iy
    ux = fx * fx * (3.0 - 2.0 * fx)
    uy = fy * fy * (3.0 - 2.0 * fy)
    a = _hash2(ix, iy, seed)
    b = _hash2(ix + 1, iy, seed)
    c = _hash2(ix, iy + 1, seed)
    d = _hash2(ix + 1, iy + 1, seed)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy


def _fbm(x: float, y: float, octaves: int = 5, seed: int = 1337) -> float:
    val = 0.0
    amp = 0.5
    freq = 1.0
    norm = 0.0
    for i in range(octaves):
        val += amp * _value_noise(x * freq, y * freq, seed + i * 97)
        norm += amp
        freq *= 2.03
        amp *= 0.5
    return val / norm


def _lerp_color(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return (
        int(c1[0] + (c2[0] - c1[0]) * t),
        int(c1[1] + (c2[1] - c1[1]) * t),
        int(c1[2] + (c2[2] - c1[2]) * t),
    )


def _draw_halo_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    font: ImageFont.ImageFont,
    fill: tuple[int, int, int] = (255, 255, 255),
    halo: tuple[int, int, int] = (15, 12, 8),
    anchor: str | None = None,
    halo_px: int = 1,
) -> None:
    x, y = xy
    for dx in range(-halo_px, halo_px + 1):
        for dy in range(-halo_px, halo_px + 1):
            if dx == 0 and dy == 0:
                continue
            draw.text((x + dx, y + dy), text, font=font, fill=halo, anchor=anchor)
    draw.text((x, y), text, font=font, fill=fill, anchor=anchor)


def _world_elevation(nx: float, ny: float) -> float:
    """
    Deterministic elevation field matching L2J `all_interlaced.jpg` continental layout:
    - West (nx < 0.34): Western Continent (Gracia / Astral Reach) + Isle of Souls (0.27, 0.71) + Talking Island (0.38, 0.88)
    - East (nx >= 0.36): Massive contiguous Mainland (Aden + Elmore / Hearthbloom + Clockwork + High-Halo)
    """
    n_macro = _fbm(nx * 5.2, ny * 5.2, octaves=5, seed=401)
    n_detail = _fbm(nx * 18.0, ny * 18.0, octaves=4, seed=911)
    n_ridge = 1.0 - abs(2.0 * _fbm(nx * 9.5, ny * 9.5, octaves=4, seed=709) - 1.0)

    elev = -0.35

    # 1. Main Eastern Supercontinent (Cols 16..26, Rows 10..25 -> nx 0.37..0.96, ny 0.06..0.93)
    cx, cy = 0.67, 0.49
    dx = (nx - cx) / 0.31
    dy = (ny - cy) / 0.43
    main_mask = 1.0 - (dx * dx * 0.85 + dy * dy * 0.92)
    # Carve inland sea / bays & southern fjords
    bay_south = math.exp(-((nx - 0.56) ** 2 / 0.006 + (ny - 0.84) ** 2 / 0.005)) * 0.65
    bay_west = math.exp(-((nx - 0.40) ** 2 / 0.005 + (ny - 0.52) ** 2 / 0.008)) * 0.55
    bay_east = math.exp(-((nx - 0.91) ** 2 / 0.004 + (ny - 0.66) ** 2 / 0.007)) * 0.55
    inland_lake = math.exp(-((nx - 0.58) ** 2 / 0.0018 + (ny - 0.68) ** 2 / 0.0012)) * 0.52
    north_lake = math.exp(-((nx - 0.72) ** 2 / 0.0015 + (ny - 0.32) ** 2 / 0.0010)) * 0.48

    main_elev = main_mask + (n_macro - 0.48) * 0.72 + (n_detail - 0.5) * 0.22 - bay_south - bay_west - bay_east - inland_lake - north_lake
    elev = max(elev, main_elev)

    # 2. Western Continent (Gracia / Shattered Halo West Wing: Cols 10..14, Rows 12..21 -> nx 0.05..0.28, ny 0.16..0.72)
    w_dx = (nx - 0.15) / 0.13
    w_dy = (ny - 0.45) / 0.25
    west_elev = (1.0 - (w_dx * w_dx + w_dy * w_dy)) * 0.82 + (n_macro - 0.48) * 0.65 + (n_detail - 0.5) * 0.2
    elev = max(elev, west_elev)

    # 3. Teacup Starter Island / Talking Island [17_24..18_25] (nx 0.43, ny 0.89)
    ti_d = ((nx - 0.435) / 0.058) ** 2 + ((ny - 0.885) / 0.048) ** 2
    ti_elev = (1.0 - ti_d) * 0.72 + (n_detail - 0.48) * 0.28
    elev = max(elev, ti_elev)

    # 4. Cinnamon-Mill Isle / Isle of Souls [15_20..16_21] (nx 0.33, ny 0.67)
    ios_d = ((nx - 0.335) / 0.055) ** 2 + ((ny - 0.665) / 0.048) ** 2
    ios_elev = (1.0 - ios_d) * 0.74 + (n_detail - 0.48) * 0.26
    elev = max(elev, ios_elev)

    # 5. Glaze-Barge Archipelago / Heine & Devil's Isle [20_24..21_25] (nx 0.63, ny 0.90)
    hei_d = ((nx - 0.635) / 0.065) ** 2 + ((ny - 0.895) / 0.045) ** 2
    hei_elev = (1.0 - hei_d) * 0.68 + (n_detail - 0.48) * 0.26
    elev = max(elev, hei_elev)

    # 6. Cinder Key / Hellbound [15_24] (nx 0.31, ny 0.90)
    hb_d = ((nx - 0.31) / 0.048) ** 2 + ((ny - 0.89) / 0.042) ** 2
    hb_elev = (1.0 - hb_d) * 0.66 + (n_detail - 0.48) * 0.25
    elev = max(elev, hb_elev)

    # Add mountain spines across Northern Halo (ny < 0.26) & Central Spine
    if elev > 0.05:
        spine = math.exp(-((ny - 0.22) ** 2) / 0.008) * 0.35 + math.exp(-((nx - 0.68) ** 2) / 0.012) * 0.22
        elev += spine * (0.4 + 0.6 * n_ridge)

    return elev


def generate_all_interlaced_world_grid() -> Path:
    """
    1. Generates `all_interlaced_world_grid.png` (960x768) matching `https://l2j.ru/graciafinal/img/maps/all_interlaced.jpg`.
    """
    w, h = 960, 768
    cols, rows = 17, 16  # 10..26 (17 cols), 10..25 (16 rows)
    Scale = 2  # compute heightmap at 480x384 then bilinear upscale + crisp vector text
    hw, hh = w // Scale, h // Scale

    elev_grid = [[0.0] * hw for _ in range(hh)]
    for y in range(hh):
        ny = y / float(hh - 1)
        for x in range(hw):
            nx = x / float(hw - 1)
            elev_grid[y][x] = _world_elevation(nx, ny)

    base_small = Image.new("RGB", (hw, hh))
    px = base_small.load()

    for y in range(hh):
        ny = y / float(hh - 1)
        for x in range(hw):
            nx = x / float(hw - 1)
            e = elev_grid[y][x]
            # Directional hillshading from NW
            ex = elev_grid[y][min(hw - 1, x + 1)] - elev_grid[y][max(0, x - 1)]
            ey = elev_grid[min(hh - 1, y + 1)][x] - elev_grid[max(0, y - 1)][x]
            shade = max(-0.28, min(0.28, (-ex * 5.8 - ey * 5.8)))

            if e < -0.14:
                # Deep ocean (#7D89B8 -> #8390BF)
                t = max(0.0, min(1.0, (e + 0.45) / 0.31))
                col = _lerp_color((112, 122, 172), (138, 156, 204), t)
            elif e < 0.0:
                # Shallow shelf (#97D2F3 -> #A8DBFF)
                t = (e + 0.14) / 0.14
                col = _lerp_color((138, 156, 204), (165, 220, 252), t)
            elif e < 0.05:
                # Coastal sandbar (#D2AD7A)
                col = _lerp_color((198, 178, 134), (134, 152, 102), (e / 0.05))
            else:
                # Land biomes based on latitude (ny) & longitude (nx) & elevation (e)
                moisture = _fbm(nx * 8.0 + 3.1, ny * 8.0 + 1.7, octaves=3, seed=555)
                if ny < 0.24 or e > 0.62:
                    # Alpine / Schuttgart / High-Halo snow & slate (#806958 -> #D9D4D9 -> #F5FBFF)
                    t = min(1.0, max(0.0, (e - 0.35) / 0.38 + (0.24 - ny) * 1.4))
                    if t < 0.5:
                        col = _lerp_color((118, 102, 86), (195, 188, 182), t * 2.0)
                    else:
                        col = _lerp_color((195, 188, 182), (246, 250, 255), (t - 0.5) * 2.0)
                elif nx > 0.66 and 0.26 <= ny <= 0.62:
                    # Clockwork Steppe / Oren-Goddard-Aden basalt & amber plains (#806958, #C89D70, #C3816B)
                    if e > 0.38:
                        col = _lerp_color((118, 92, 68), (168, 132, 104), (e - 0.38) / 0.25)
                    elif moisture < 0.45:
                        col = _lerp_color((195, 148, 108), (168, 138, 96), moisture / 0.45)
                    else:
                        col = _lerp_color((116, 132, 82), (153, 144, 106), (moisture - 0.45) / 0.55)
                elif nx < 0.30:
                    # Western Gracia / Crimson-Violet & Ochre plateau (#BDA777, #C3816B, #7C74B1)
                    col = _lerp_color((168, 132, 112), (198, 168, 122), min(1.0, e * 1.8))
                else:
                    # Hearthbloom Basin / Talking Island / Elven / Dion / Giran lush valleys (#55635A, #778451, #99906A)
                    if e > 0.36:
                        col = _lerp_color((102, 106, 68), (138, 120, 98), (e - 0.36) / 0.25)
                    elif moisture > 0.52:
                        col = _lerp_color((72, 112, 74), (108, 134, 82), (moisture - 0.52) / 0.48)
                    else:
                        col = _lerp_color((138, 142, 92), (186, 166, 118), (0.52 - moisture) / 0.52)

            # Apply hillshade
            r = max(0, min(255, int(col[0] * (1.0 + shade))))
            g = max(0, min(255, int(col[1] * (1.0 + shade))))
            b = max(0, min(255, int(col[2] * (1.0 + shade))))
            px[x, y] = (r, g, b)

    img = base_small.resize((w, h), resample=Image.Resampling.BILINEAR)
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    cw = w / float(cols)
    ch = h / float(rows)

    # Helper to convert grid coordinate (gx in 10..27, gy in 10..26) to pixel (x, y)
    def g2p(gx: float, gy: float) -> tuple[float, float]:
        return ((gx - 10.0) * cw, (gy - 10.0) * ch)

    # 2. Draw Tessellated Hunting Zone & Town Polygons over the Continents (matching `all_interlaced.jpg`)
    zones = [
        # (code, name, [(gx, gy), ...], border_rgba, fill_rgba)
        ("243", "Cinnamon-Mill / Isle of Souls", [(15.1, 20.1), (16.4, 20.0), (16.5, 21.4), (15.0, 21.3)], (255, 245, 157, 220), (234, 179, 8, 42)),
        ("101", "Lantern Hollow [18_24]", [(17.0, 23.6), (18.4, 23.5), (18.5, 24.8), (16.9, 24.7)], (253, 224, 71, 245), (16, 185, 129, 68)),
        ("102", "Clover South-Gate", [(18.4, 23.5), (19.5, 23.6), (19.4, 24.8), (18.5, 24.8)], (74, 222, 128, 235), (16, 185, 129, 52)),
        ("53", "Kiln Cellar Ruins", [(17.1, 24.7), (18.5, 24.8), (18.4, 25.6), (17.0, 25.5)], (248, 113, 113, 235), (239, 68, 68, 52)),
        ("104", "Glaze-Barge Port", [(19.5, 23.6), (21.2, 23.5), (21.1, 24.9), (19.4, 24.8)], (56, 189, 248, 225), (14, 165, 233, 44)),
        ("105", "Carillon Belfry (Dark-Lunar)", [(17.2, 21.2), (18.8, 21.1), (18.7, 22.4), (17.1, 22.4)], (216, 180, 254, 220), (168, 85, 247, 38)),
        ("106", "Porcelain Loom (Elven)", [(18.8, 21.1), (20.2, 21.2), (20.1, 22.5), (18.7, 22.4)], (134, 239, 172, 220), (34, 197, 94, 38)),
        ("107", "Draft-Kiln Post (Ogre)", [(18.6, 22.4), (19.9, 22.5), (19.8, 23.6), (18.4, 23.5)], (253, 186, 116, 220), (249, 115, 22, 38)),
        ("108", "Kilnwatch Bastion (Hub)", [(19.9, 22.5), (21.6, 22.4), (21.5, 23.6), (19.8, 23.6)], (253, 224, 71, 255), (234, 179, 8, 64)),
        ("109", "Root-Train Roundhouse", [(20.2, 21.2), (21.8, 21.1), (21.6, 22.4), (20.1, 22.5)], (253, 224, 71, 220), (202, 138, 4, 38)),
        ("110", "Sunken Potter Cruma", [(18.7, 19.8), (20.3, 19.9), (20.2, 21.2), (18.8, 21.1)], (248, 113, 113, 220), (239, 68, 68, 38)),
        ("111", "Saffron-Press Floran", [(17.3, 19.8), (18.7, 19.8), (18.8, 21.1), (17.2, 21.2)], (167, 243, 208, 210), (16, 185, 129, 32)),
        ("112", "Cinder Execution Grounds", [(20.3, 19.9), (21.9, 19.8), (21.8, 21.1), (20.2, 21.2)], (252, 165, 165, 215), (220, 38, 38, 34)),
        ("201", "Pinion Terminus [21_20]", [(21.9, 19.4), (23.6, 19.3), (23.5, 20.9), (21.8, 21.1)], (56, 189, 248, 235), (2, 132, 199, 48)),
        ("202", "Pendulum Ant Nest", [(21.8, 21.1), (23.5, 20.9), (23.4, 22.4), (21.6, 22.4)], (248, 113, 113, 220), (220, 38, 38, 38)),
        ("203", "Brass-Spur Ridge", [(23.6, 19.3), (25.4, 19.5), (25.2, 21.2), (23.5, 20.9)], (251, 191, 36, 210), (217, 119, 6, 34)),
        ("204", "Escapement Anvil (Oren)", [(21.6, 17.6), (23.6, 17.5), (23.6, 19.3), (21.9, 19.4)], (56, 189, 248, 230), (14, 165, 233, 42)),
        ("205", "Mainspring Caldera", [(23.6, 17.5), (25.6, 17.6), (25.4, 19.5), (23.6, 19.3)], (251, 146, 60, 215), (234, 88, 12, 36)),
        ("206", "Chronometer Labyrinth", [(19.8, 17.6), (21.6, 17.6), (21.9, 19.4), (20.3, 19.9)], (192, 132, 252, 215), (147, 51, 234, 36)),
        ("207", "Inductor Switchyard (Goddard)", [(21.8, 15.5), (24.2, 15.4), (23.6, 17.5), (21.6, 17.6)], (253, 224, 71, 230), (202, 138, 4, 42)),
        ("208", "Galvanic Leyden Forge", [(24.2, 15.4), (26.1, 15.6), (25.6, 17.6), (23.6, 17.5)], (248, 113, 113, 215), (220, 38, 38, 36)),
        ("301", "Starfall Haven (Rune)", [(18.2, 13.5), (20.4, 13.4), (20.2, 15.5), (18.0, 15.4)], (56, 189, 248, 235), (2, 132, 199, 45)),
        ("302", "Star-Tether Causeway", [(20.4, 13.4), (22.2, 13.5), (21.8, 15.5), (20.2, 15.5)], (192, 132, 252, 220), (147, 51, 234, 38)),
        ("303", "Crown-Beacon Citadel (Aden)", [(22.2, 12.2), (24.6, 12.3), (24.2, 15.4), (21.8, 15.5)], (253, 224, 71, 245), (234, 179, 8, 52)),
        ("304", "Tower of Insolence Spire", [(20.2, 11.4), (22.2, 11.5), (22.2, 13.5), (20.4, 13.4)], (248, 113, 113, 235), (239, 68, 68, 48)),
        ("305", "High-Halo Alpine Reach", [(17.8, 11.2), (20.2, 11.4), (20.4, 13.4), (18.2, 13.5)], (226, 232, 240, 220), (148, 163, 184, 38)),
        ("306", "Forbidden Architect Path", [(24.6, 11.8), (26.2, 12.0), (26.1, 15.6), (24.2, 15.4)], (216, 180, 254, 225), (126, 34, 206, 42)),
        ("401", "Gracia Astral Union Base", [(11.2, 15.2), (13.8, 15.0), (13.9, 17.8), (11.1, 17.9)], (192, 132, 252, 220), (147, 51, 234, 42)),
        ("402", "Seed of Infinity / West", [(10.8, 12.6), (13.4, 12.5), (13.8, 15.0), (11.2, 15.2)], (248, 113, 113, 215), (220, 38, 38, 36)),
        ("403", "Seed of Destruction", [(11.1, 17.9), (13.9, 17.8), (13.6, 20.4), (11.0, 20.2)], (251, 191, 36, 215), (217, 119, 6, 36)),
        ("404", "Cinder Key (Hellbound)", [(14.6, 23.8), (16.1, 23.8), (16.0, 25.1), (14.5, 25.0)], (248, 113, 113, 220), (220, 38, 38, 42)),
    ]

    font_grid = _load_font(10, bold=True)
    font_zone = _load_font(9, bold=True)
    font_title = _load_font(12, bold=True)

    for code, zname, pts, stroke_c, fill_c in zones:
        poly_px = [g2p(gx, gy) for gx, gy in pts]
        draw.polygon(poly_px, fill=fill_c, outline=stroke_c, width=2)
        cx = sum(p[0] for p in poly_px) / len(poly_px)
        cy = sum(p[1] for p in poly_px) / len(poly_px)
        # Draw red/gold center pin
        draw.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), fill=(251, 36, 0, 255), outline=(255, 255, 255, 240))
        _draw_halo_text(
            draw,
            (cx, cy - 8),
            f"[{code}]",
            font=font_zone,
            fill=(253, 224, 71),
            halo=(10, 10, 14),
            anchor="mm",
        )
        _draw_halo_text(
            draw,
            (cx, cy + 4),
            zname,
            font=font_zone,
            fill=(255, 255, 255),
            halo=(10, 10, 14),
            anchor="mm",
        )

    # 3. Draw 17x16 Interlaced Server Grid Lines & [X.Y] Coordinate Labels in EVERY Cell (10.10 .. 26.25)
    for c_idx in range(cols):
        gx = 10 + c_idx
        x0 = int(c_idx * cw)
        draw.line([(x0, 0), (x0, h)], fill=(255, 255, 255, 95), width=1)
        for r_idx in range(rows):
            gy = 10 + r_idx
            y0 = int(r_idx * ch)
            if c_idx == 0:
                draw.line([(0, y0), (w, y0)], fill=(255, 255, 255, 95), width=1)
            # Highlight T-Deep cell [18.24]
            if gx == 18 and gy == 24:
                draw.rectangle((x0 + 1, y0 + 1, int((c_idx + 1) * cw) - 1, int((r_idx + 1) * ch) - 1), outline=(16, 185, 129, 255), width=2)
            label_col = (253, 224, 71) if (gx == 18 and gy == 24) else (240, 246, 255)
            _draw_halo_text(
                draw,
                (x0 + 3, y0 + 2),
                f"{gx}.{gy}",
                font=font_grid,
                fill=label_col,
                halo=(18, 20, 28),
                halo_px=1,
            )

    # Watermark / Corner Legend matching L2J `base.l2j.ru`
    draw.rectangle((8, h - 28, 430, h - 6), fill=(15, 23, 42, 210), outline=(253, 224, 71, 180))
    _draw_halo_text(
        draw,
        (16, h - 17),
        "atlas.l2j-standard · Interlaced World Grid [10.10–26.25] · ★ [18.24] Teacup Meadows (T-Deep)",
        font=font_title,
        fill=(253, 224, 71),
        halo=(0, 0, 0),
        anchor="lm",
    )

    out = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    out_path = OUT_DIR / "all_interlaced_world_grid.png"
    out.save(out_path, optimize=True)
    return out_path


def generate_c3_continent_parchment_relief() -> Path:
    """
    2. Generates `c3_continent_parchment_relief.png` (1120x920) matching `https://l2j.ru/graciafinal/img/maps/c3_aden.jpg`.
    """
    w, h = 1120, 920
    Scale = 2
    hw, hh = w // Scale, h // Scale

    elev_grid = [[0.0] * hw for _ in range(hh)]
    for y in range(hh):
        ny = y / float(hh - 1)
        for x in range(hw):
            # Focus on the main continent & starter islands (nx 0.28..0.96 of world)
            wx = 0.28 + nx_unit(x, hw) * 0.68
            wy = 0.06 + ny * 0.90
            elev_grid[y][x] = _world_elevation(wx, wy)

    base_small = Image.new("RGB", (hw, hh))
    px = base_small.load()

    for y in range(hh):
        ny = y / float(hh - 1)
        for x in range(hw):
            nx = x / float(hw - 1)
            e = elev_grid[y][x]
            ex = elev_grid[y][min(hw - 1, x + 1)] - elev_grid[y][max(0, x - 1)]
            ey = elev_grid[min(hh - 1, y + 1)][x] - elev_grid[max(0, y - 1)][x]
            shade = max(-0.26, min(0.26, (-ex * 6.5 - ey * 6.5)))
            grain = (_fbm(nx * 45.0, ny * 45.0, octaves=3, seed=808) - 0.5) * 14.0

            if e < 0.0:
                # Warm antique parchment sea (#E8E2D3 -> #D8D1C1) with shoreline ripple rings
                dist_shore = abs(e)
                ripple = math.sin(dist_shore * 160.0)
                base_sea = _lerp_color((216, 209, 193), (233, 227, 212), min(1.0, dist_shore * 4.5))
                if dist_shore < 0.055 and ripple > 0.65:
                    base_sea = _lerp_color(base_sea, (165, 155, 132), 0.45)
                r = int(max(0, min(255, base_sea[0] + grain)))
                g = int(max(0, min(255, base_sea[1] + grain)))
                b = int(max(0, min(255, base_sea[2] + grain)))
                px[x, y] = (r, g, b)
            elif e < 0.022:
                # Dark ink coastline stroke (#4A3E2D)
                px[x, y] = (78, 66, 48)
            else:
                # Parchment relief landmass (#C0B399, #A1966C, #8E8E6E, #7A6A46, snow peaks #EFECE6)
                forest = _fbm(nx * 14.0 + 2.0, ny * 14.0 + 5.0, octaves=3, seed=313)
                if e > 0.52 or (ny < 0.22 and e > 0.32):
                    col = _lerp_color((128, 116, 94), (235, 231, 221), min(1.0, (e - 0.32) / 0.38))
                elif e > 0.30:
                    col = _lerp_color((152, 138, 104), (118, 102, 72), (e - 0.30) / 0.22)
                elif forest > 0.54:
                    col = _lerp_color((148, 146, 112), (114, 118, 84), (forest - 0.54) / 0.46)
                else:
                    col = _lerp_color((196, 184, 154), (168, 154, 118), min(1.0, e / 0.30))

                r = int(max(0, min(255, col[0] * (1.0 + shade) + grain)))
                g = int(max(0, min(255, col[1] * (1.0 + shade) + grain)))
                b = int(max(0, min(255, col[2] * (1.0 + shade) + grain)))
                px[x, y] = (r, g, b)

    img = base_small.resize((w, h), resample=Image.Resampling.BILINEAR)
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Subtle parchment coordinate grid & ornate double border
    for gx in range(80, w, 100):
        draw.line([(gx, 16), (gx, h - 16)], fill=(120, 105, 80, 48), width=1)
    for gy in range(80, h, 100):
        draw.line([(16, gy), (w - 16, gy)], fill=(120, 105, 80, 48), width=1)
    draw.rectangle((8, 8, w - 8, h - 8), outline=(92, 64, 40, 230), width=3)
    draw.rectangle((14, 14, w - 14, h - 14), outline=(140, 112, 78, 190), width=1)

    # Dashed Kingdom Territory Borders (`c3_aden.jpg` style)
    territory_lines = [
        [(230, 620), (420, 610), (590, 635), (780, 620)],
        [(310, 430), (540, 445), (760, 420), (960, 435)],
        [(280, 250), (560, 265), (840, 240)],
        [(540, 140), (555, 445), (585, 635), (565, 810)],
    ]
    for line in territory_lines:
        draw.line(line, fill=(138, 42, 28, 145), width=2)

    # Road network connecting Towns, Castles, Dungeons & Fields
    roads = [
        # Teacup Island [18_24] roads
        [(225, 815), (185, 785), (155, 805)],
        [(225, 815), (245, 775), (285, 790)],
        [(225, 815), (210, 855)],
        # Mainland South (Hearthbloom Basin)
        [(395, 645), (495, 650), (595, 675), (525, 795)],
        [(395, 645), (345, 555), (465, 540), (595, 675)],
        [(465, 540), (625, 535), (745, 555), (595, 675)],
        # Mainland Central (Clockwork Steppe)
        [(595, 675), (715, 475), (745, 365), (885, 385)],
        [(715, 475), (555, 455), (465, 540)],
        [(745, 365), (775, 255), (905, 265)],
        # Mainland North (Shattered Halo / Aden-Rune-Schuttgart)
        [(775, 255), (615, 235), (425, 235)],
        [(615, 235), (645, 145), (815, 165), (775, 255)],
    ]
    for r_pts in roads:
        draw.line(r_pts, fill=(92, 52, 28, 210), width=4)
        draw.line(r_pts, fill=(212, 128, 72, 220), width=2)

    # 48 Named Landmarks across the Parchment Map (matching `c3_aden.jpg` density & style)
    # kind: 'town' | 'castle' | 'dungeon' | 'catacomb' | 'field' | 'harbor'
    landmarks = [
        # Teacup Meadows / Talking Island [18_24] (T-Deep Slice)
        ("town", 225, 815, "Lantern Hollow Village [1-10]", True),
        ("field", 190, 778, "Obelisk of the First Meridian", False),
        ("dungeon", 150, 802, "Kiln Cellar Ruins [9-22]", True),
        ("field", 258, 782, "Clover South-Gate Meadow [1-12]", True),
        ("field", 295, 812, "Kiln-East Glaze Orchard [5-14]", False),
        ("harbor", 198, 862, "Clarissa's Talking Harbor", False),
        ("field", 268, 845, "Cedric's Training Hall", False),
        # Cinnamon-Mill Isle / Isle of Souls [16_21]
        ("town", 118, 605, "Cinnamon-Mill Haven (Kamael) [1-10]", False),
        ("dungeon", 95, 562, "Spice-Kiln Nornil's Cave [9-20]", False),
        ("field", 158, 575, "Cinnamon-Bark Viaduct [1-12]", False),
        ("field", 142, 642, "Hills of Gold / Dystopia [1-13]", False),
        # Western Mainland (Dark-Lunar, Lunar, Gludin/Gludio)
        ("town", 345, 555, "Carillon Hearth Belfry (Dark Elf) [1-10]", False),
        ("dungeon", 292, 522, "School of Dark Arts [9-20]", False),
        ("field", 365, 512, "Swampland & Chime-Pipe [1-12]", False),
        ("catacomb", 322, 478, "Catacomb of Dark Omens [28-40]", False),
        ("town", 465, 540, "Porcelain Loom Sanctuary (Elven) [1-10]", False),
        ("dungeon", 432, 578, "Medallion-Heart Elven Fortress [9-20]", False),
        ("field", 505, 572, "Iris Glaze Lake & Causeway [1-12]", False),
        ("town", 395, 645, "Draft-Kiln Post (Ogre/Orc) [1-10]", False),
        ("dungeon", 348, 678, "Ember-Bellows Cave of Trials [9-22]", False),
        ("field", 435, 685, "Firebrick Bellows Valley [1-15]", False),
        # Central Convergence Basin (Kilnwatch Bastion / Gludio-Dion-Giran)
        ("castle", 595, 675, "Town of Kilnwatch Bastion [10-20 Hub]", True),
        ("castle", 625, 645, "Kilnwatch Shared Castle", False),
        ("dungeon", 535, 612, "Sunken Potter Cruma Tower [15-25]", False),
        ("catacomb", 568, 635, "Heretic Kiln Catacomb [20-30]", False),
        ("town", 495, 715, "Saffron-Press Floran Village [10-18]", False),
        ("field", 662, 688, "Cinder Apron Execution Ground [12-22]", False),
        ("catacomb", 645, 725, "Branded Bellows Catacomb [28-40]", False),
        ("town", 525, 795, "Glaze-Barge Port Town (Heine) [12-25]", False),
        ("harbor", 462, 785, "Glaze-Barge Deepwater Harbor", False),
        ("town", 655, 535, "Root-Train Roundhouse (Dwarf) [1-10]", False),
        ("dungeon", 715, 558, "Sap-Heart Coal Mines [9-20]", False),
        # Clockwork Steppe (Oren / Hardin / Goddard)
        ("town", 715, 475, "Pinion Terminus Town [18-25]", False),
        ("dungeon", 635, 468, "Pendulum Shaft Ant Nest [20-26]", False),
        ("field", 795, 495, "Brass-Spur Dragon Valley [20-26]", False),
        ("catacomb", 755, 435, "Dynamo Necropolis of Worship [35-45]", False),
        ("castle", 745, 365, "Town of Escapement Anvil (Oren) [25-30]", False),
        ("dungeon", 648, 355, "Chronometer Foundry Labyrinth [25-32]", False),
        ("field", 875, 385, "Mainspring Caldera Rim [25-30]", False),
        ("town", 845, 435, "Hunters Cog-Village [24-32]", False),
        ("castle", 775, 255, "Town of Inductor Switchyard (Goddard) [30-40]", False),
        ("field", 905, 265, "Galvanic Leyden Hot Springs [30-38]", False),
        # Northern High-Halo Reach (Rune / Schuttgart / Aden)
        ("castle", 425, 235, "Starfall Haven Township (Rune) [38-50]", False),
        ("field", 535, 255, "Star-Tether Swamp of Screams [35-45]", False),
        ("catacomb", 485, 195, "Astral Witch Catacomb [40-52]", False),
        ("castle", 815, 165, "Town of Crown-Beacon Citadel (Aden) [50-75]", False),
        ("dungeon", 695, 175, "Star-Heart Tower of Insolence [50-85]", False),
        ("catacomb", 615, 145, "Necropolis of Deep Devotion [50-65]", False),
        ("catacomb", 915, 155, "Forbidden Architect Path [70-99]", False),
    ]

    font_lbl = _load_font(11, bold=True)
    font_sub = _load_font(10, bold=False)
    font_header = _load_font(16, bold=True)

    for kind, x, y, label, is_highlight in landmarks:
        if kind == "castle":
            draw.rectangle((x - 6, y - 6, x + 6, y + 6), fill=(220, 38, 38, 255), outline=(255, 248, 220, 255), width=2)
            draw.rectangle((x - 3, y - 3, x + 3, y + 3), fill=(253, 224, 71, 255))
        elif kind == "town":
            r = 6 if is_highlight else 5
            draw.ellipse((x - r, y - r, x + r, y + r), fill=(234, 179, 8, 255), outline=(45, 28, 12, 255), width=2)
            draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(255, 255, 255, 255))
        elif kind == "dungeon":
            draw.polygon([(x, y - 6), (x + 6, y), (x, y + 6), (x - 6, y)], fill=(239, 68, 68, 255), outline=(255, 255, 255, 240))
        elif kind == "catacomb":
            draw.polygon([(x, y - 6), (x + 5, y + 5), (x - 5, y + 5)], fill=(168, 85, 247, 255), outline=(255, 255, 255, 240))
        elif kind == "harbor":
            draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=(14, 165, 233, 255), outline=(255, 255, 255, 240))
        else:
            draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(185, 28, 28, 255), outline=(255, 245, 230, 220))

        text_color = (165, 22, 12) if is_highlight else (32, 22, 12)
        halo_color = (248, 242, 226)
        _draw_halo_text(
            draw,
            (x, y - 11),
            label,
            font=font_lbl if is_highlight else font_sub,
            fill=text_color,
            halo=halo_color,
            anchor="mm",
            halo_px=2,
        )

    # Highlight box around T-Deep District D01 [18_24]
    draw.rectangle((122, 752, 338, 882), outline=(185, 28, 28, 220), width=2)
    _draw_halo_text(
        draw,
        (230, 742),
        "★ T-DEPTH VERTICAL SLICE: D01 TEACUP MEADOWS [18_24]",
        font=font_lbl,
        fill=(185, 28, 28),
        halo=(248, 242, 226),
        anchor="mm",
        halo_px=2,
    )

    # Parchment Cartouche Title Box (Top-Left)
    draw.rectangle((24, 24, 470, 78), fill=(236, 228, 208, 235), outline=(92, 64, 40, 240), width=2)
    _draw_halo_text(
        draw,
        (36, 40),
        "CRADLE OF EMBERS — CONTINENTAL PARCHMENT ATLAS",
        font=font_header,
        fill=(68, 42, 22),
        halo=(248, 242, 226),
        anchor="lm",
    )
    _draw_halo_text(
        draw,
        (36, 61),
        "L2J.RU c3_aden.jpg & PMFun Relief Standard · 48 Towns, Dungeons, Catacombs & Hunting Grounds",
        font=font_sub,
        fill=(98, 72, 46),
        halo=(248, 242, 226),
        anchor="lm",
    )

    out = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    out_path = OUT_DIR / "c3_continent_parchment_relief.png"
    out.save(out_path, optimize=True)
    return out_path


def nx_unit(x: int, hw: int) -> float:
    return x / float(hw - 1)


def _generate_d01_spawn_points() -> list[tuple[float, float, int]]:
    """
    Generates 185 deterministic (u, v, mob_group) spawn points across Clover South-Gate Meadow [18_24]
    matching the dense red `+` / `•` scatter of `zone243_common.jpg` and `zone243_radar.jpg`.
    """
    rng = random.Random(20535)
    pts: list[tuple[float, float, int]] = []
    clusters = [
        # (cx, cy, rx, ry, count, mob_group)
        (0.47, 0.34, 0.08, 0.06, 28, 1),  # Young Grey Keltir near North-South road
        (0.55, 0.46, 0.14, 0.11, 48, 2),  # Prairie Keltir (#20535) main clover pasture
        (0.42, 0.56, 0.11, 0.09, 36, 3),  # Dominant Grey Keltir & Black Wolf hedgerows
        (0.64, 0.58, 0.10, 0.09, 34, 4),  # Kiln Clay Toad irrigation ditch
        (0.52, 0.72, 0.11, 0.08, 29, 5),  # Cracked-Glaze Golem & Dre Vanul Scout near ruins
        (0.44, 0.25, 0.04, 0.02, 10, 0),  # South-Gate Marksmen Guards
    ]
    for cx, cy, rx, ry, cnt, grp in clusters:
        for _ in range(cnt):
            ang = rng.uniform(0, math.tau)
            rad = math.sqrt(rng.uniform(0.05, 1.0))
            u = cx + math.cos(ang) * rad * rx
            v = cy + math.sin(ang) * rad * ry
            pts.append((u, v, grp))
    return pts


def generate_d01_field_dual_maps() -> tuple[Path, Path]:
    """
    3 & 4. Generates `d01_field_common_map.png` and `d01_field_radar_map.png` (520x420 each)
    matching `zone243_common.jpg` and `zone243_radar.jpg` (`Isle of Souls: Dystopia: lvl.1 [1-13]`).
    """
    w, h = 520, 420
    spawns = _generate_d01_spawn_points()

    # Zone boundary polygon around Clover South-Gate Meadow
    zone_poly_uv = [
        (0.34, 0.22),
        (0.68, 0.24),
        (0.79, 0.45),
        (0.75, 0.74),
        (0.48, 0.83),
        (0.30, 0.68),
        (0.28, 0.38),
    ]
    zone_poly_px = [(int(u * w), int(v * h)) for u, v in zone_poly_uv]

    # --- A. COMMON PARCHMENT MAP (`d01_field_common_map.png`) ---
    common_img = Image.new("RGB", (w, h))
    c_px = common_img.load()
    for y in range(h):
        ny = y / float(h - 1)
        for x in range(w):
            nx = x / float(w - 1)
            # Island shape in local coordinates
            dist = ((nx - 0.50) / 0.43) ** 2 + ((ny - 0.52) / 0.43) ** 2
            n1 = _fbm(nx * 7.5, ny * 7.5, octaves=4, seed=1824)
            n2 = _fbm(nx * 24.0, ny * 24.0, octaves=3, seed=2418)
            elev = (1.0 - dist) * 0.65 + (n1 - 0.48) * 0.45 + (n2 - 0.5) * 0.14
            if elev < 0.0:
                # Parchment water (#B4B2A2 -> #979889)
                c_px[x, y] = _lerp_color((152, 154, 138), (180, 178, 162), min(1.0, abs(elev) * 3.0))
            elif elev < 0.025:
                c_px[x, y] = (72, 64, 52)
            else:
                # Parchment terrain (#999884, #7D6E52, #686559)
                shade = (_fbm((nx + 0.01) * 14.0, (ny + 0.01) * 14.0, octaves=3, seed=77) - 0.5) * 0.32
                base = _lerp_color((162, 158, 136), (118, 106, 82), min(1.0, elev * 1.3))
                c_px[x, y] = (
                    max(0, min(255, int(base[0] * (1.0 + shade)))),
                    max(0, min(255, int(base[1] * (1.0 + shade)))),
                    max(0, min(255, int(base[2] * (1.0 + shade)))),
                )

    c_draw = ImageDraw.Draw(common_img)
    # Roads on Common Map
    c_draw.line([(225, 95), (245, 165), (265, 245), (235, 325), (165, 340)], fill=(112, 78, 48), width=3)
    c_draw.line([(245, 165), (375, 195)], fill=(112, 78, 48), width=2)
    # Red zone boundary contour (`#943928` / `#FB2400`)
    c_draw.polygon(zone_poly_px, outline=(195, 42, 22), width=2)

    # Neighboring Landmarks on Common Map (matching `zone243_common.jpg` / `zone53_common.jpg` text style)
    font_map = _load_font(12, bold=True)
    labels = [
        (225, 78, "Lantern Hollow\nVillage"),
        (142, 148, "Obelisk of\nVictory"),
        (398, 172, "Kiln-East\nGlaze Orchard"),
        (362, 285, "Cedric's\nTraining Hall"),
        (145, 265, "Einhovant's\nKiln School"),
        (158, 355, "Kiln Cellar\nRuins [9-22]"),
        (268, 368, "Hills of\nClover Gold"),
    ]
    for lx, ly, txt in labels:
        _draw_halo_text(c_draw, (lx, ly), txt, font=font_map, fill=(255, 252, 240), halo=(22, 16, 10), anchor="mm", halo_px=2)

    # Draw 185 bright red `+` and dot spawn pins (`#FB2400`)
    for u, v, _grp in spawns:
        sx, sy = int(u * w), int(v * h)
        c_draw.line([(sx - 2, sy), (sx + 2, sy)], fill=(251, 36, 0), width=1)
        c_draw.line([(sx, sy - 2), (sx, sy + 2)], fill=(251, 36, 0), width=1)
        c_draw.point((sx, sy), fill=(255, 220, 200))

    common_path = OUT_DIR / "d01_field_common_map.png"
    common_img.save(common_path, optimize=True)

    # --- B. TOP-DOWN ORTHOGRAPHIC RADAR MAP (`d01_field_radar_map.png`) ---
    radar_img = Image.new("RGB", (w, h))
    r_px = radar_img.load()
    for y in range(h):
        ny = y / float(h - 1)
        for x in range(w):
            nx = x / float(w - 1)
            dist = ((nx - 0.50) / 0.43) ** 2 + ((ny - 0.52) / 0.43) ** 2
            n1 = _fbm(nx * 7.5, ny * 7.5, octaves=4, seed=1824)
            n2 = _fbm(nx * 28.0, ny * 28.0, octaves=4, seed=2418)
            elev = (1.0 - dist) * 0.65 + (n1 - 0.48) * 0.45 + (n2 - 0.5) * 0.16
            if elev < 0.0:
                # Exact L2J radar water (`#677873` -> `#708283`)
                r_px[x, y] = _lerp_color((103, 120, 115), (114, 133, 132), min(1.0, abs(elev) * 3.2))
            else:
                # Exact L2J radar 3D heightmap (`#3E3E34`, `#5D5A52`, `#55635A`, `#2E2E2E` cliff shadows)
                n_slope = _fbm((nx + 0.008) * 22.0, (ny + 0.008) * 22.0, octaves=3, seed=901) - n2
                if elev > 0.36:
                    base = _lerp_color((62, 62, 52), (98, 94, 84), min(1.0, (elev - 0.36) / 0.3))
                else:
                    base = _lerp_color((72, 86, 74), (93, 90, 82), min(1.0, elev / 0.36))
                mult = 1.0 + max(-0.38, min(0.38, n_slope * 2.6))
                r_px[x, y] = (
                    max(0, min(255, int(base[0] * mult))),
                    max(0, min(255, int(base[1] * mult))),
                    max(0, min(255, int(base[2] * mult))),
                )

    r_draw = ImageDraw.Draw(radar_img)
    # Stone roads & terracotta structures on Radar Map (`#7C493C`, `#9C8D7F`)
    r_draw.line([(225, 95), (245, 165), (265, 245), (235, 325), (165, 340)], fill=(124, 73, 60), width=4)
    r_draw.line([(245, 165), (375, 195)], fill=(124, 73, 60), width=3)
    # Town & Ruin roof footprints on radar
    for rx, ry, rw, rh in [(215, 70, 22, 18), (238, 76, 16, 14), (152, 332, 24, 20), (355, 275, 20, 16)]:
        r_draw.rectangle((rx, ry, rx + rw, ry + rh), fill=(134, 78, 62), outline=(46, 46, 46))

    # Red zone boundary contour on radar
    r_draw.polygon(zone_poly_px, outline=(165, 42, 32), width=2)

    # 185 bright red `#FB2600` spawn dots on Radar Map
    for u, v, _grp in spawns:
        sx, sy = int(u * w), int(v * h)
        r_draw.rectangle((sx - 2, sy - 2, sx + 2, sy + 2), fill=(251, 38, 0))
        r_draw.point((sx, sy), fill=(255, 200, 190))

    radar_path = OUT_DIR / "d01_field_radar_map.png"
    radar_img.save(radar_path, optimize=True)
    return common_path, radar_path


def generate_d01_dungeon_dual_maps() -> tuple[Path, Path]:
    """
    5. Generates `d01_dungeon_common_map.png` (913x200) & `d01_dungeon_radar_map.png` (913x340)
    matching `Image 3: Elven Ruins: lvl.9 [9-22]` (`zone53_common.jpg` + `zone53_radar.jpg`).
    """
    w, h_com, h_rad = 913, 200, 340

    # --- A. DUNGEON COMMON MAP (`d01_dungeon_common_map.png`) ---
    com_img = Image.new("RGB", (w, h_com))
    c_px = com_img.load()
    for y in range(h_com):
        ny = y / float(h_com - 1)
        for x in range(w):
            nx = x / float(w - 1)
            # Left side (nx < 0.42) is Teacup Island parchment; right side (nx > 0.55) is underground parchment sheet
            island_d = ((nx - 0.20) / 0.17) ** 2 + ((ny - 0.55) / 0.44) ** 2
            n1 = _fbm(nx * 12.0, ny * 6.0, octaves=3, seed=5301)
            elev = (1.0 - island_d) * 0.6 + (n1 - 0.48) * 0.35
            if elev > 0.0 and nx < 0.42:
                c_px[x, y] = _lerp_color((158, 152, 130), (116, 104, 82), min(1.0, elev))
            else:
                # Parchment ocean / background (`#B8B7A5` -> `#C8C6B4`)
                c_px[x, y] = _lerp_color((184, 183, 165), (200, 198, 180), n1)

    c_draw = ImageDraw.Draw(com_img)
    font_m = _load_font(11, bold=True)
    # Surface landmarks on left (matching `zone53_common.jpg` OCR positions!)
    surface_lbls = [
        (58, 48, "Kiln Cellar Ruins\n(Elven Ruins)"),
        (128, 52, "Obelisk of Victory"),
        (210, 98, "Lantern Hollow Village"),
        (118, 132, "Einhovant's\nSchool of Magic"),
        (108, 182, "Talking Island Harbor"),
        (265, 165, "Cedric's Training Hall"),
        (485, 22, "Kiln Cellar Underground Labyrinth [loc=48391:248464]"),
    ]
    for lx, ly, t in surface_lbls:
        _draw_halo_text(c_draw, (lx, ly), t, font=font_m, fill=(255, 252, 240), halo=(20, 15, 10), anchor="mm", halo_px=2)

    # Entrance pin on left
    c_draw.ellipse((52, 64, 64, 76), fill=(251, 36, 0), outline=(255, 255, 255))

    # Underground chamber outline & red spawn markers on right (`x = 520..880`)
    c_draw.rectangle((510, 38, 885, 182), outline=(185, 28, 28), width=2)
    rng = random.Random(53)
    dungeon_rooms = [
        (525, 92, 65, 36, 14),   # Room 1: Entrance Vestibule
        (605, 52, 72, 42, 22),   # Room 2: North Relic Werewolf Gallery
        (605, 126, 72, 42, 22),  # Room 3: South Tunath Orc Barracks
        (692, 52, 78, 42, 26),   # Room 4: North Skeleton Pillared Hall
        (692, 126, 78, 42, 26),  # Room 5: South Misery Skeleton Crypt
        (785, 48, 82, 46, 30),   # Room 6: Flooded Undine & Salamander Conduit
        (785, 124, 82, 46, 28),  # Room 7: Cave Blade Spider & Silent Horror Vault
        (705, 96, 68, 26, 18),   # Room 8: Central Boss Sanctum (Discarded Kiln-Guardian)
    ]
    spawn_xy_rad: list[tuple[int, int]] = []
    for rx, ry, rw, rh, cnt in dungeon_rooms:
        c_draw.rectangle((rx, ry, rx + rw, ry + rh), outline=(120, 95, 75), width=1)
        for _ in range(cnt):
            sx = rng.randint(rx + 5, rx + rw - 5)
            sy = rng.randint(ry + 5, ry + rh - 5)
            c_draw.rectangle((sx - 1, sy - 1, sx + 1, sy + 1), fill=(251, 36, 0))

    com_path = OUT_DIR / "d01_dungeon_common_map.png"
    com_img.save(com_path, optimize=True)

    # --- B. DUNGEON TOP-DOWN ARCHITECTURAL RADAR BLUEPRINT (`d01_dungeon_radar_map.png`) ---
    rad_img = Image.new("RGB", (w, h_rad))
    r_px = rad_img.load()
    for y in range(h_rad):
        ny = y / float(h_rad - 1)
        for x in range(w):
            nx = x / float(w - 1)
            n = _fbm(nx * 24.0, ny * 12.0, octaves=3, seed=5309)
            # Exact L2J radar slate background (`#667973` / `#5A6B65`)
            r_px[x, y] = _lerp_color((92, 108, 103), (108, 125, 120), n)

    r_draw = ImageDraw.Draw(rad_img)

    # Left Miniature Surface Inset (`x = 18..255`) showing surface entrance on Teacup Island radar
    r_draw.rectangle((14, 16, 262, h_rad - 16), fill=(68, 82, 78), outline=(42, 52, 48), width=2)
    r_draw.polygon([(36, 52), (215, 38), (242, 165), (218, 295), (65, 305), (28, 195)], fill=(78, 92, 72), outline=(46, 56, 44), width=2)
    r_draw.ellipse((64, 96, 82, 114), fill=(251, 38, 0), outline=(255, 255, 255), width=2)
    _draw_halo_text(r_draw, (138, 32), "SURFACE ENTRANCE [18_24]", font=font_m, fill=(253, 224, 71), halo=(15, 20, 18), anchor="mm")
    _draw_halo_text(r_draw, (125, 105), "Kiln Cellar Entrance\nloc=-113490:235526", font=_load_font(10, bold=True), fill=(255, 255, 255), halo=(15, 20, 18), anchor="lm")
    # Dashed teleport link from Surface Entrance to Underground Vestibule
    r_draw.line([(82, 105), (308, 170)], fill=(253, 224, 71), width=2)

    # Right Full-Detail Underground Multi-Room Labyrinth Blueprint (`x = 285..895`, `y = 18..322`)
    r_draw.rectangle((280, 16, 898, h_rad - 16), fill=(39, 46, 41), outline=(92, 108, 103), width=2)

    # Corridors connecting rooms (drawn first so rooms sit cleanly on top)
    corridors = [
        (305, 156, 395, 184),  # Entrance stairs -> Vestibule
        (430, 72, 448, 268),   # West N-S cross-hall
        (395, 162, 565, 178),  # Central axial spine west
        (440, 68, 845, 86),    # North long gallery corridor
        (440, 254, 845, 272),  # South long gallery corridor
        (565, 68, 585, 272),   # Mid-west N-S connector
        (705, 68, 725, 272),   # Mid-east N-S connector
        (835, 68, 855, 272),   # Far-east N-S colonnade
        (575, 160, 845, 180),  # Central Sanctum approach bridge
    ]
    for x0, y0, x1, y1 in corridors:
        r_draw.rectangle((x0, y0, x1, y1), fill=(62, 66, 58), outline=(112, 118, 106), width=2)

    # 8 Detailed Architectural Dungeon Chambers with stone bevel walls, pillars, and water conduits
    rooms_rad = [
        # (x0, y0, x1, y1, title, sub, is_water, is_boss, spawn_cnt)
        (302, 138, 398, 202, "1. Entrance Stairs", "Lv.9–11 Scout & Eye", False, False, 18),
        (412, 42, 528, 118, "2. Relic Werewolf Hall", "Lv.9–12 Werewolf & Bat", False, False, 28),
        (412, 222, 528, 298, "3. Tunath Orc Barracks", "Lv.10–12 Orc Marksman", False, False, 28),
        (548, 42, 672, 118, "4. Skeleton Pillared Hall", "Lv.12–14 Skeleton & Giant", False, False, 34),
        (548, 222, 672, 298, "5. Misery Skeleton Crypt", "Lv.14–16 Dungeon Spider", False, False, 34),
        (692, 38, 825, 118, "6. Flooded Elemental Wing", "Lv.17–18 Undine & Salamander", True, False, 38),
        (692, 222, 825, 302, "7. Silent Horror Vault", "Lv.16–18 Wererat & Blade Spider", False, False, 36),
        (572, 134, 718, 206, "8. Inner Kiln Sanctum", "★ Lv.20 Discarded Kiln-Guardian", False, True, 24),
    ]

    rng_r = random.Random(20109)
    for x0, y0, x1, y1, rtitle, rsub, is_water, is_boss, scnt in rooms_rad:
        floor_col = (48, 76, 82) if is_water else ((78, 48, 42) if is_boss else (74, 76, 68))
        wall_col = (56, 189, 248) if is_water else ((253, 224, 71) if is_boss else (142, 146, 132))
        r_draw.rectangle((x0, y0, x1, y1), fill=floor_col, outline=wall_col, width=2)
        # Inner stone step bevel
        r_draw.rectangle((x0 + 4, y0 + 4, x1 - 4, y1 - 4), outline=(45, 48, 42), width=1)
        # Corner architectural pillars
        for px_c in (x0 + 10, x1 - 10):
            for py_c in (y0 + 10, y1 - 10):
                r_draw.rectangle((px_c - 3, py_c - 3, px_c + 3, py_c + 3), fill=(168, 162, 148), outline=(30, 32, 28))

        # Red spawn dots (`#FB2600`) inside room
        for _ in range(scnt):
            sx = rng_r.randint(x0 + 14, x1 - 14)
            sy = rng_r.randint(y0 + 16, y1 - 16)
            r_draw.rectangle((sx - 2, sy - 2, sx + 2, sy + 2), fill=(251, 38, 0))
            r_draw.point((sx, sy), fill=(255, 220, 210))

        if is_boss:
            bx, by = (x0 + x1) // 2, (y0 + y1) // 2
            r_draw.ellipse((bx - 6, by - 6, bx + 6, by + 6), fill=(253, 224, 71), outline=(251, 38, 0), width=2)

        _draw_halo_text(
            r_draw,
            ((x0 + x1) // 2, y0 + 12),
            rtitle,
            font=_load_font(10, bold=True),
            fill=(253, 224, 71) if is_boss else (255, 255, 255),
            halo=(18, 20, 18),
            anchor="mm",
        )
        _draw_halo_text(
            r_draw,
            ((x0 + x1) // 2, y1 - 11),
            rsub,
            font=_load_font(9, bold=False),
            fill=(186, 230, 253) if is_water else (226, 232, 240),
            halo=(18, 20, 18),
            anchor="mm",
        )

    rad_path = OUT_DIR / "d01_dungeon_radar_map.png"
    rad_img.save(rad_path, optimize=True)
    return com_path, rad_path


def generate_d01_town_detailed_blueprint() -> Path:
    """
    6. Generates `d01_town_detailed_blueprint.png` (640x500) matching PMFun's detailed Town Blueprints
    (`Dion Castle Town (detailed).png` / `Talking Island Village.jpg`).
    """
    w, h = 640, 500
    img = Image.new("RGB", (w, h))
    px = img.load()

    for y in range(h):
        ny = y / float(h - 1)
        for x in range(w):
            nx = x / float(w - 1)
            n = _fbm(nx * 16.0, ny * 16.0, octaves=3, seed=101)
            # Warm cobblestone/grass town ground (`#6F785A` outer meadow, `#8E8672` inner town)
            dist = ((nx - 0.50) / 0.38) ** 2 + ((ny - 0.50) / 0.39) ** 2
            if dist < 1.0:
                px[x, y] = _lerp_color((142, 134, 114), (164, 154, 132), n)
            else:
                px[x, y] = _lerp_color((92, 112, 78), (118, 136, 96), n)

    draw = ImageDraw.Draw(img)

    # Octagonal stone town fortification wall
    wall_pts = [
        (195, 58),
        (445, 58),
        (548, 155),
        (548, 345),
        (445, 442),
        (195, 442),
        (92, 345),
        (92, 155),
    ]
    draw.polygon(wall_pts, outline=(58, 48, 38), width=8)
    draw.polygon(wall_pts, outline=(188, 176, 152), width=3)

    # Cobblestone main streets (N-S, E-W, and ring plaza)
    draw.rectangle((302, 42, 338, 458), fill=(182, 174, 156), outline=(112, 102, 86))
    draw.rectangle((76, 232, 564, 268), fill=(182, 174, 156), outline=(112, 102, 86))
    draw.ellipse((238, 172, 402, 328), fill=(196, 188, 168), outline=(112, 102, 86), width=2)

    # Architectural Building Roof Footprints (`#944A34` terracotta & `#526878` slate roofs)
    buildings = [
        # (x0, y0, x1, y1, roof_col, num, title)
        (255, 78, 385, 142, (82, 104, 124), "4", "Cedric's Warrior & Mystic Hall"),
        (135, 125, 232, 205, (148, 74, 52), "2", "Neutral Adventure Guild Hall"),
        (408, 125, 505, 205, (158, 82, 48), "3", "Blacksmith Clan Hearth-Anvil Forge"),
        (135, 292, 228, 368, (124, 96, 68), "6", "Dwarf Warehouse & Freight Vault"),
        (412, 292, 505, 368, (138, 78, 58), "7", "Apprentice Weapon & Armor Shop"),
        (215, 372, 288, 422, (112, 88, 118), "8", "Grocery & Soulshot Apothecary"),
        (304, 234, 336, 266, (234, 179, 8), "1", "First Meridian Keystone Plaza"),
        (345, 286, 392, 326, (14, 165, 233), "5", "Gatekeeper Clarissa (#30006)"),
    ]

    font_b = _load_font(10, bold=True)
    font_num = _load_font(11, bold=True)
    for x0, y0, x1, y1, rcol, num, btitle in buildings:
        draw.rectangle((x0 + 3, y0 + 3, x1 + 3, y1 + 3), fill=(38, 32, 26))
        draw.rectangle((x0, y0, x1, y1), fill=rcol, outline=(245, 238, 220), width=2)
        # Roof ridge line
        draw.line([(x0 + 6, (y0 + y1) // 2), (x1 - 6, (y0 + y1) // 2)], fill=(235, 220, 195), width=1)
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        draw.ellipse((cx - 10, cy - 10, cx + 10, cy + 10), fill=(251, 36, 0), outline=(255, 255, 255), width=2)
        draw.text((cx, cy), num, font=font_num, fill=(255, 255, 255), anchor="mm")
        _draw_halo_text(draw, (cx, y1 + 11), btitle, font=font_b, fill=(255, 250, 235), halo=(22, 18, 12), anchor="mm", halo_px=2)

    # Town Gates & Guard Posts (Red/Blue pins)
    gates = [
        (320, 48, "North Gate (To Obelisk)"),
        (555, 250, "East Gate (To Glaze Orchard)"),
        (320, 454, "South Gate (To Clover Meadow [1-12])"),
        (85, 250, "West Pier (To Talking Harbor)"),
    ]
    for gx, gy, gtxt in gates:
        draw.rectangle((gx - 7, gy - 7, gx + 7, gy + 7), fill=(56, 189, 248), outline=(255, 255, 255), width=2)
        _draw_halo_text(draw, (gx, gy - 14 if gy < 400 else gy + 16), gtxt, font=font_b, fill=(253, 224, 71), halo=(18, 16, 12), anchor="mm", halo_px=2)

    out_path = OUT_DIR / "d01_town_detailed_blueprint.png"
    img.save(out_path, optimize=True)
    return out_path


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    p1 = generate_all_interlaced_world_grid()
    p2 = generate_c3_continent_parchment_relief()
    p3, p4 = generate_d01_field_dual_maps()
    p5, p6 = generate_d01_dungeon_dual_maps()
    p7 = generate_d01_town_detailed_blueprint()
    for p in (p1, p2, p3, p4, p5, p6, p7):
        print(f"Generated {p.name} ({p.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
