"""Render app icons: deep-navy tile, 'CPT' set in Cardo Bold, and a gold rule.
Usage: python3 tools/make-icons.py /path/to/Cardo-Bold.ttf
(Convert node_modules/@fontsource/cardo/files/cardo-latin-700-normal.woff2 to TTF with fontTools first.)
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

FONT = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'icons')
os.makedirs(OUT, exist_ok=True)

NAVY = (10, 22, 40)        # #0A1628
IVORY = (241, 238, 228)    # #F1EEE4
GOLD = (242, 193, 78)      # #F2C14E


def tile(size, safe=1.0):
    S = size * 4  # supersample for clean edges
    img = Image.new('RGB', (S, S), NAVY)
    d = ImageDraw.Draw(img)
    box = S * safe
    font = ImageFont.truetype(FONT, int(box * 0.40))
    text = 'CPT'
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    tw, th = r - l, b - t
    bar_h = max(4, int(box * 0.045))
    gap = box * 0.075
    group_h = th + gap + bar_h
    top = (S - group_h) / 2
    d.text(((S - tw) / 2 - l, top - t), text, font=font, fill=IVORY)
    bar_w = tw * 0.62
    y = top + th + gap
    x = (S - bar_w) / 2
    d.rounded_rectangle([x, y, x + bar_w, y + bar_h], radius=bar_h / 2, fill=GOLD)
    return img.resize((size, size), Image.LANCZOS)


outputs = {
    'icon-512.png': (512, 0.95),
    'icon-192.png': (192, 0.95),
    'maskable-512.png': (512, 0.74),
    'apple-touch-icon.png': (180, 0.9),
    'favicon-32.png': (32, 1.15),
}
for name, (size, safe) in outputs.items():
    tile(size, safe).save(os.path.join(OUT, name), optimize=True)
    print('wrote', name)
