"""Build the site's marble into public/img/. Run once: `python3 -I scripts/images.py [cache_dir]`.

Sources (all CC0 from ambientCG, see /credits):
  Marble019: white Carrara-style base.  Onyx013 (inverted): bold black stripes.
Grain is generated here. Outputs are committed, so the site never hotlinks.
"""
import io, os, sys, urllib.request, zipfile
from PIL import Image, ImageFilter, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "img")
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, ".cache")
ACG = "https://ambientcg.com/get?file={}_2K-JPG.zip"
BUDGET = 600 * 1024


def acg(asset):
    path = os.path.join(CACHE, asset + ".zip")
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        req = urllib.request.Request(ACG.format(asset), headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
    z = zipfile.ZipFile(path)
    color = next(n for n in z.namelist() if n.endswith("_Color.jpg"))
    return ImageOps.autocontrast(Image.open(io.BytesIO(z.read(color))).convert("L"), cutoff=1)


def smoothstep(a, b):
    """Curve that keeps only the real veins/stripes dark and pushes the rest of the stone to white."""
    out = []
    for v in range(256):
        t = min(1, max(0, (v / 255 - a) / (b - a)))
        out.append(round(255 * t * t * (3 - 2 * t)))
    return out


def tone(gray, lo, hi):
    """Map black..white of a grayscale stone onto lo..hi (RGB)."""
    return Image.merge("RGB", [gray.point([round(l + (h - l) * v / 255) for v in range(256)]) for l, h in zip(lo, hi)])


def main():
    os.makedirs(OUT, exist_ok=True)
    stones = {
        # White base: faint veins #D2D2D7 on #F5F5F7, so body text stays AA anywhere on it.
        "marble-white": tone(acg("Marble019").filter(ImageFilter.GaussianBlur(0.8)).point(smoothstep(0.05, 0.55)), (0xD2, 0xD2, 0xD7), (0xF5, 0xF5, 0xF7)),
        # Black stripes: inverted onyx bands, #1C1C1E on #F5F5F7. Used only as masked masses away from text.
        "marble-stripes": tone(ImageOps.invert(acg("Onyx013")).filter(ImageFilter.GaussianBlur(1.2)).point(smoothstep(0.35, 0.70)), (0x1C, 0x1C, 0x1E), (0xF5, 0xF5, 0xF7)),
    }
    sizes = {}
    for name, im in stones.items():
        side = 1100 if name == "marble-stripes" else 1400  # bold bands upscale fine; fine detail costs bytes
        im = im.resize((side, side), Image.LANCZOS)
        for ext, kw in (("avif", {"quality": 55}), ("webp", {"quality": 72, "method": 6})):
            p = os.path.join(OUT, f"{name}.{ext}")
            im.save(p, **kw)
            sizes[f"{name}.{ext}"] = os.path.getsize(p)

    noise = Image.effect_noise((128, 128), 64).convert("L")
    p = os.path.join(OUT, "grain.png")
    noise.save(p, optimize=True)
    sizes["grain.png"] = os.path.getsize(p)

    for k, v in sorted(sizes.items()):
        print(f"{k:24s} {v / 1024:7.1f} KB")
    # A browser fetches one format per stone, so budget the larger of each pair.
    worst = sum(max(sizes[f"{n}.avif"], sizes[f"{n}.webp"]) for n in stones) + sizes["grain.png"]
    print(f"marble payload (worst case): {worst / 1024:.1f} KB / {BUDGET / 1024:.0f} KB")
    assert worst < BUDGET, "marble payload over budget"


if __name__ == "__main__":
    main()
