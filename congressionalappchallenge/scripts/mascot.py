"""Cut the Dixi mascot renders into transparent sprites in public/mascot/.
Run: `python3 -I scripts/mascot.py <dir with expressions.png, wave.png, turnaround.png>`.
The renders are on a flat near-black backdrop; the mascot is white marble with glossy black eyes.
Background = dark pixels connected to the crop border (flood fill), so the eyes and mouth stay opaque.
Also builds "face": the high-res waving render with its painted eyes removed, so the site can draw eyes
that follow the cursor. Writes lib/mascot-sizes.json (sprite sizes + eye geometry).
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "mascot")
SRC = sys.argv[1]
DARK = 40  # backdrop is ~20; antialiased marble edges start around 40
MAX = 640  # longest side: sharp at 2x for the ~260px hero "i"

# name: (file, (left, top, right, bottom)) in source pixels. Grid cells are 418 px (3x3) / 313 px (turnaround row 2).
SPRITES = {
    "neutral": ("expressions.png", (0, 0, 418, 418)),
    "happy": ("expressions.png", (418, 0, 836, 418)),
    "worried": ("expressions.png", (836, 0, 1254, 418)),
    "angry": ("expressions.png", (0, 418, 418, 836)),
    "curious": ("expressions.png", (418, 418, 836, 836)),
    "sign": ("expressions.png", (836, 418, 1254, 836)),
    "nod": ("expressions.png", (0, 836, 418, 1254)),
    "shrug": ("expressions.png", (418, 836, 836, 1254)),
    "sleep": ("expressions.png", (836, 836, 1254, 1254)),
    "wave": ("wave.png", (180, 120, 1074, 1200)),
    "front": ("turnaround.png", (0, 40, 418, 560)),
    "side": ("turnaround.png", (418, 40, 836, 560)),
    "back": ("turnaround.png", (836, 40, 1254, 560)),
    "side-left": ("turnaround.png", (0, 640, 313, 1130)),
    "three-quarter": ("turnaround.png", (313, 640, 680, 1130)),
}

# Eyes in wave.png (source pixels), found by a dark-component search inside the head: left, top, right, bottom.
EYES = [(430, 541, 556, 699), (730, 482, 844, 640)]
PAD = 12  # also erase the soft shadow ring around each eye


def cut(img, box):
    """Transparent sprite of the mascot in `box`, trimmed. Returns (sprite, (x, y) of the trim in source pixels)."""
    crop = img.crop(box).convert("RGB")
    binary = crop.convert("L").point(lambda v: 128 if v > DARK else 0)
    w, h = binary.size
    seeds = [(x, y) for x in range(0, w, 4) for y in (0, h - 1)] + [(x, y) for y in range(0, h, 4) for x in (0, w - 1)]
    for s in seeds:
        if binary.getpixel(s) == 0:
            ImageDraw.floodfill(binary, s, 255, thresh=0)
    solid = binary.point(lambda v: 0 if v == 255 else 255)
    # Pull the edge in a pixel (drops the dark fringe) and soften it.
    solid = solid.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = crop.convert("RGBA")
    out.putalpha(solid)
    bb = out.getbbox()
    return out.crop(bb), (box[0] + bb[0], box[1] + bb[1])


def inpaint(img, ellipses):
    """Fill each ellipse by diffusing the surrounding marble inward (smooth shading, no seams)."""
    a = np.asarray(img.convert("RGB"), dtype=np.float32).copy()
    mask = Image.new("L", img.size, 0)
    d = ImageDraw.Draw(mask)
    for e in ellipses:
        d.ellipse(e, fill=255)
    m = np.asarray(mask) > 0
    a[m] = a[~m].mean(axis=0)
    for _ in range(2500):  # Jacobi: each hole pixel becomes the mean of its 4 neighbours
        avg = (np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 4
        a[m] = avg[m]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


def save(sprite, name):
    sprite = sprite.copy()
    scale = min(1, MAX / max(sprite.size))
    sprite = sprite.resize((round(sprite.width * scale), round(sprite.height * scale)), Image.LANCZOS)
    p = os.path.join(OUT, f"{name}.webp")
    sprite.save(p, quality=86, method=6)
    print(f"{name:14s} {sprite.size}  {os.path.getsize(p) / 1024:5.1f} KB")
    return sprite.size, os.path.getsize(p)


def main():
    os.makedirs(OUT, exist_ok=True)
    meta, total = {}, 0
    for name, (file, box) in SPRITES.items():
        sprite, _ = cut(Image.open(os.path.join(SRC, file)), box)
        meta[name], size = save(sprite, name)
        total += size

    # "face": waving render, eyes erased. Eye geometry is stored as fractions of the sprite, so it survives resizing.
    file, box = SPRITES["wave"]
    src = Image.open(os.path.join(SRC, file)).convert("RGB")
    rx0, ry0 = min(e[0] for e in EYES) - 60, min(e[1] for e in EYES) - 60
    rx1, ry1 = max(e[2] for e in EYES) + 60, max(e[3] for e in EYES) + 60
    holes = [(l - PAD - rx0, t - PAD - ry0, r + PAD - rx0, b + PAD - ry0) for l, t, r, b in EYES]
    src.paste(inpaint(src.crop((rx0, ry0, rx1, ry1)), holes), (rx0, ry0))
    sprite, (ox, oy) = cut(src, box)
    w, h = sprite.size
    meta["face"], size = save(sprite, "face")
    total += size
    meta["eyes"] = [
        {"cx": ((l + r) / 2 - ox) / w, "cy": ((t + b) / 2 - oy) / h, "rx": (r - l) / 2 / w, "ry": (b - t) / 2 / h} for l, t, r, b in EYES
    ]

    print(f"total {total / 1024:.0f} KB")
    with open(os.path.join(HERE, "..", "lib", "mascot-sizes.json"), "w") as f:
        json.dump(meta, f, indent=2)


if __name__ == "__main__":
    main()
