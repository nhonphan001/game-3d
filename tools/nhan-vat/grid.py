#!/usr/bin/env python3
"""Phóng to một vùng ảnh kèm lưới toạ độ, để đọc toạ độ điểm ảnh (mắt, miệng, điểm xoay, đường cắt lớp).

  python3 tools/nhan-vat/grid.py ANH [x0 y0 x1 y1] [--step 20] [--out luoi.png]

Số ghi trên lưới là toạ độ trong ảnh gốc. Không truyền vùng thì lấy cả ảnh."""
import argparse
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument('image')
ap.add_argument('box', nargs='*', type=int)
ap.add_argument('--step', type=int, default=0)
ap.add_argument('--out', default='luoi.png')
a = ap.parse_args()

im = Image.open(a.image).convert('RGBA')
bg = Image.new('RGBA', im.size, (120, 160, 120, 255))  # nền xanh lá để thấy vùng trong suốt
bg.alpha_composite(im)
x0, y0, x1, y1 = a.box if len(a.box) == 4 else (0, 0, im.width, im.height)
crop = bg.crop((x0, y0, x1, y1))
k = max(1, round(1100 / max(crop.size)))
big = crop.resize((crop.width * k, crop.height * k), Image.LANCZOS if k == 1 else Image.NEAREST)
step = a.step or max(5, round(max(crop.size) / 12 / 5) * 5)
d = ImageDraw.Draw(big)
for x in range((x0 // step + 1) * step, x1, step):
    d.line([((x - x0) * k, 0), ((x - x0) * k, big.height)], fill=(255, 0, 0, 255))
    d.text(((x - x0) * k + 2, 2), str(x), fill=(255, 0, 0, 255))
for y in range((y0 // step + 1) * step, y1, step):
    d.line([(0, (y - y0) * k), (big.width, (y - y0) * k)], fill=(255, 0, 0, 255))
    d.text((2, (y - y0) * k + 2), str(y), fill=(255, 0, 0, 255))
big.convert('RGB').save(a.out)
print(f'{a.out}: vùng ({x0},{y0})-({x1},{y1}), phóng {k} lần, lưới {step}px')
