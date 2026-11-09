# Draws the PNG app icons (matches icons/icon.svg). Run: python tools/make_icons.py
from PIL import Image, ImageDraw
def icon(size, path):
    S = 4 * size; k = S / 512
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S, S], radius=112 * k, fill='#b83a2a')
    d.rounded_rectangle([150*k, 130*k, 382*k, 402*k], radius=40*k, fill='#fbf6ec')
    d.rectangle([150*k, 342*k, 382*k, 362*k], fill='#e9dcc8')
    d.rectangle([170*k, 130*k, 190*k, 340*k], fill='#4f7a3a')
    # fork
    for x in (237, 249, 261):
        d.rectangle([x*k, 180*k, (x+6)*k, 240*k], fill='#b83a2a')
    d.rounded_rectangle([237*k, 230*k, 267*k, 262*k], radius=10*k, fill='#b83a2a')
    d.rectangle([246*k, 255*k, 258*k, 324*k], fill='#b83a2a')
    # knife
    d.pieslice([292*k, 180*k, 340*k, 290*k], 270, 90, fill='#b83a2a')
    d.rectangle([312*k, 180*k, 318*k, 290*k], fill='#b83a2a')
    d.rectangle([312*k, 250*k, 324*k, 324*k], fill='#b83a2a')
    im.resize((size, size), Image.LANCZOS).save(path)
icon(192, 'icons/icon-192.png'); icon(512, 'icons/icon-512.png')
