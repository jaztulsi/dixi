"""Build every image the site uses into public/img/. Run once: `python3 -I scripts/images.py [cache_dir]`.

Sources (all verified CC0, see /credits):
  The Met Open Access (isPublicDomain: true): 248118 bust, 251036 hand, 257641 drapery, 248205 relief.
  ambientCG (CC0): Marble019 (white), Marble016 (black). Grain is generated here.
Outputs are committed, so the site never hotlinks.
"""
import io, os, sys, urllib.request, zipfile
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "img")
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, ".cache")
MET = "https://images.metmuseum.org/CRDImages/gr/original/{}.jpg"
ACG = "https://ambientcg.com/get?file={}_2K-JPG.zip"
MARBLE_BUDGET = 600 * 1024


def fetch(name, url):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
    return path


def met(image_id):
    return Image.open(fetch(image_id + ".jpg", MET.format(image_id))).convert("L")


def acg(asset):
    z = zipfile.ZipFile(fetch(asset + ".zip", ACG.format(asset)))
    color = next(n for n in z.namelist() if n.endswith("_Color.jpg"))
    return Image.open(io.BytesIO(z.read(color))).convert("L")


def levels(im, black, white, gamma=1.0):
    """Map [black, white] to [0, 255] with a gamma; values outside clip."""
    lut = [round(255 * min(1, max(0, (v - black) / (white - black))) ** gamma) for v in range(256)]
    return im.point(lut)


def feather(size, inset=0.06, blur=0.08):
    """Elliptical alpha that dissolves an image's edges into whatever is behind it."""
    w, h = size
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).ellipse([w * inset, h * inset, w * (1 - inset), h * (1 - inset)], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(min(w, h) * blur))
    # Guarantee alpha 0 on every border, or a faint rectangle shows over light marble.
    ramp = round(min(w, h) * 0.08)
    edge = Image.new("L", size, 0)
    d = ImageDraw.Draw(edge)
    for i in range(ramp):
        d.rectangle([i, i, w - 1 - i, h - 1 - i], outline=round(255 * i / ramp))
    d.rectangle([ramp, ramp, w - 1 - ramp, h - 1 - ramp], fill=255)
    return ImageChops.multiply(m, edge)


def save(im, name, widths):
    """AVIF + WebP at each width. Returns written sizes for the report."""
    os.makedirs(OUT, exist_ok=True)
    sizes = {}
    for w in widths:
        r = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        for ext, kw in (("avif", {"quality": 60}), ("webp", {"quality": 78, "method": 6})):
            p = os.path.join(OUT, f"{name}-{w}.{ext}")
            r.save(p, **kw)
            sizes[os.path.basename(p)] = os.path.getsize(p)
    return sizes


def cutout_on_black(gray, crop, black, white, gamma, inset=0.04, blur=0.07):
    """Studio backdrop crushed to black, edges feathered: clean on the black page."""
    im = levels(gray.crop(crop), black, white, gamma)
    rgba = Image.merge("RGBA", (im, im, im, feather(im.size, inset, blur)))
    return rgba


def tone(gray, lo, hi, tint=(0, 0, 0)):
    """Remap a grayscale texture so its darkest/brightest 1% land on lo/hi (RGB tuples)."""
    g = ImageOps.autocontrast(gray, cutoff=1)
    chans = [g.point([round(l + (h - l) * v / 255) for v in range(256)]) for l, h in zip(lo, hi)]
    return Image.merge("RGB", chans)


def main():
    report = {}

    # Hero bust: rim-lit on black. Drop the plinth (bottom 14%).
    bust = met("DP335892")
    w, h = bust.size
    report |= save(cutout_on_black(bust, (0, 0, w, int(h * 0.86)), 40, 235, 1.15, .1, .08), "bust", [640, 1200])

    # Hand holding a scroll: mid-gray backdrop with a vignette, crushed to black.
    hand = met("DP231306")
    w, h = hand.size
    report |= save(cutout_on_black(hand, (int(w * .12), int(h * .1), int(w * .95), int(h * .9)), 128, 250, 1.1, .02, .09), "hand", [640, 1200])

    # Toga folds: the drapery band of the imperial-family statue.
    drape = met("DP-1353-002")
    w, h = drape.size
    report |= save(cutout_on_black(drape, (int(w * .18), int(h * .38), int(w * .85), int(h * .86)), 45, 235, 1.1), "drapery", [640, 1000])

    # Relief: tight crop inside the frieze band, then thirds for I / II / III.
    relief = met("DP138718")
    w, h = relief.size
    band = levels(relief.crop((int(w * .095), int(h * .29), int(w * .905), int(h * .735))), 30, 245, 1.05)
    third = band.width // 3
    for i in range(3):
        part = band.crop((i * third, 0, (i + 1) * third, band.height))
        report |= save(part.convert("RGB"), f"relief-{i + 1}", [560, 1000])

    # Marble: white Carrara (base #EDEDF0, veins #BFBFC4..#D2D2D7) and black Nero (veins #1C1C1E..#2C2C2E).
    # Vein pixels are the dark ones in Marble019 and the bright ones in Marble016.
    white = tone(acg("Marble019"), (0xBF, 0xBF, 0xC4), (0xED, 0xED, 0xF0)).resize((1600, 1600), Image.LANCZOS)
    black = tone(acg("Marble016"), (0x00, 0x00, 0x00), (0x2C, 0x2C, 0x2E)).resize((1600, 1600), Image.LANCZOS)
    marble = {}
    for name, im in (("marble-white", white), ("marble-black", black)):
        for ext, kw in (("avif", {"quality": 55}), ("webp", {"quality": 72, "method": 6})):
            p = os.path.join(OUT, f"{name}.{ext}")
            im.save(p, **kw)
            marble[os.path.basename(p)] = os.path.getsize(p)

    # Grain: our own noise tile, overlaid at ~2.5% to stop banding.
    noise = Image.effect_noise((128, 128), 64).convert("L")
    p = os.path.join(OUT, "grain.png")
    noise.save(p, optimize=True)
    marble["grain.png"] = os.path.getsize(p)

    report |= marble
    for k, v in sorted(report.items()):
        print(f"{k:28s} {v / 1024:7.1f} KB")
    # The browser downloads one format per stone (AVIF, or WebP as fallback), so budget the larger of each pair.
    worst = sum(max(marble[f"{n}.avif"], marble[f"{n}.webp"]) for n in ("marble-white", "marble-black")) + marble["grain.png"]
    print(f"marble payload (worst case): {worst / 1024:.1f} KB / {MARBLE_BUDGET / 1024:.0f} KB")
    assert worst < MARBLE_BUDGET, "marble payload over budget"


if __name__ == "__main__":
    main()
