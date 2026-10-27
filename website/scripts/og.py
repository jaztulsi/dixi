"""Build the share images: the waving mascot, eyes painted on, on marble.
  public/og.jpg                       1200x630   link preview (set in app/layout.tsx). Mascot only, centered, so a
                                                 square crop (iMessage, WhatsApp) still shows the whole face.
  ../branding/linkedin-square.jpg     1200x1200  upload to a LinkedIn post or ad (1:1)
  ../branding/linkedin-vertical.jpg   1080x1350  upload to a LinkedIn post or ad (4:5, biggest in the mobile feed)
Run: `python3 -I scripts/og.py`. macOS only (SF Pro for the wordmark, like the site).
Uses wave.webp, not face.webp: face has its eyes erased because the site draws live SVG eyes over it.
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, "..", "public")
BRAND = os.path.join(HERE, "..", "..", "branding")
FG, FG2 = (0x1D, 0x1D, 0x1F), (0x58, 0x58, 0x5C)  # tokens.css --light-text / --light-text-2

marble = Image.open(os.path.join(PUB, "img", "marble-white.webp")).convert("RGB")
wave = Image.open(os.path.join(PUB, "mascot", "wave.webp")).convert("RGBA")


def font(size, weight):
    f = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", size)
    f.set_variation_by_axes([100, 96, 400, weight])  # width, optical size (display), grade, weight
    return f


def tracked(draw, x, y, runs, tracking):
    """Draw [(text, font, color)] left to right with letter-spacing (em), like the site's tight headlines."""
    for text, f, color in runs:
        for ch in text:
            draw.text((x, y), ch, font=f, fill=color)
            x += f.getlength(ch) + tracking * f.size


def width(runs, tracking):
    return sum(f.getlength(ch) + tracking * f.size for text, f, _ in runs for ch in text)


def make(path, W, H, mascot_h, words=False):
    out = marble.crop((0, 0, W, H))
    m = wave.resize((round(wave.width * mascot_h / wave.height), mascot_h), Image.LANCZOS)
    if not words:
        out.paste(m, ((W - m.width) // 2, (H - mascot_h) // 2), m)
    else:
        mark_f, tag_f = font(round(W * 0.2), 800), font(round(W * 0.056), 700)
        mark = [("Dixi", mark_f, FG)]
        tag = [("The web, ", tag_f, FG), ("hands‑free.", tag_f, FG2)]
        # Lay out by ink boxes, not font boxes, so the gaps are what you see.
        mark_box, tag_box = mark_f.getbbox("Dixi"), tag_f.getbbox("The web, hands-free.")
        mark_h, tag_h = mark_box[3] - mark_box[1], tag_box[3] - tag_box[1]
        gap1, gap2 = round(H * 0.035), round(H * 0.03)
        top = (H - (mascot_h + gap1 + mark_h + gap2 + tag_h)) // 2
        out.paste(m, ((W - m.width) // 2, top), m)
        d = ImageDraw.Draw(out)
        y = top + mascot_h + gap1
        tracked(d, (W - width(mark, -0.06)) / 2, y - mark_box[1], mark, -0.06)
        y += mark_h + gap2
        tracked(d, (W - width(tag, -0.035)) / 2, y - tag_box[1], tag, -0.035)
    out.save(path, quality=88, optimize=True)  # JPEG keeps og.jpg far under WhatsApp's ~300 KB preview limit
    print(f"{os.path.relpath(path)}  {W}x{H}  {os.path.getsize(path) / 1024:.0f} KB")


make(os.path.join(PUB, "og.jpg"), 1200, 630, 560)
make(os.path.join(BRAND, "linkedin-square.jpg"), 1200, 1200, 700, words=True)
make(os.path.join(BRAND, "linkedin-vertical.jpg"), 1080, 1350, 760, words=True)
