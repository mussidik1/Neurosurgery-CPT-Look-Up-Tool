"""Render app icons: drape-green tile, condensed 'CPT', and a violet running-suture line.
Usage: python3 tools/make-icons.py /path/to/BarlowCondensed-Bold.ttf
"""
import sys, math, os
from PIL import Image, ImageDraw, ImageFont

FONT = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'icons')
os.makedirs(OUT, exist_ok=True)

DRAPE = (15, 75, 71)       # #0F4B47
PAPER = (246, 248, 247)    # #F6F8F7
VICRYL = (183, 156, 245)   # #B79CF5 (light violet for contrast on green)
INCISION = (246, 248, 247, 90)

def tile(size, safe=1.0):
    S = size * 4  # supersample
    img = Image.new('RGBA', (S, S), DRAPE + (255,))
    d = ImageDraw.Draw(img)
    # content box (maskable icons keep content inside the central safe zone)
    box = S * safe
    ox = (S - box) / 2
    # Text
    font = ImageFont.truetype(FONT, int(box * 0.46))
    text = 'CPT'
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (S - tw) / 2 - bbox[0]
    ty = ox + box * 0.235 - bbox[1]
    d.text((tx, ty), text, font=font, fill=PAPER)
    # Incision line + stitches under the text
    y = ty + bbox[1] + th + box * 0.14
    x0, x1 = ox + box * 0.20, ox + box * 0.80
    lw = max(2, int(box * 0.012))
    overlay = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.line([(x0, y), (x1, y)], fill=INCISION, width=lw)
    img = Image.alpha_composite(img, overlay)
    d = ImageDraw.Draw(img)
    n = 5
    sw = max(3, int(box * 0.03))
    half = box * 0.055
    for i in range(n):
        cx = x0 + (x1 - x0) * (i + 0.5) / n
        dx = half * math.sin(math.radians(28))
        dy = half * math.cos(math.radians(28))
        d.line([(cx - dx, y - dy), (cx + dx, y + dy)], fill=VICRYL, width=sw)
        r = sw / 2
        for (px, py) in [(cx - dx, y - dy), (cx + dx, y + dy)]:
            d.ellipse([px - r, py - r, px + r, py + r], fill=VICRYL)
    return img.resize((size, size), Image.LANCZOS)

outputs = {
    'icon-512.png': (512, 0.92),
    'icon-192.png': (192, 0.92),
    'maskable-512.png': (512, 0.72),
    'apple-touch-icon.png': (180, 0.86),
    'favicon-32.png': (32, 1.0),
}
for name, (size, safe) in outputs.items():
    im = tile(size, safe).convert('RGB')
    im.save(os.path.join(OUT, name), optimize=True)
    print('wrote', name, im.size)
