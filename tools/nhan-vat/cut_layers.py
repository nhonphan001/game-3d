#!/usr/bin/env python3
"""Tách nền và cắt lớp một bức vẽ tay thành các lớp của "con rối giấy".

  python3 tools/nhan-vat/cut_layers.py CAU_HINH.json

Cấu hình (mọi toạ độ là điểm ảnh của ẢNH GỐC, đọc bằng grid.py):
{
  "src": "duong/dan/anh-goc.jpg",          # ảnh chụp, KHÔNG đưa vào repo
  "out": "lop-hoc/public/characters/<id>",  # thư mục gói nhân vật
  "crop": [x0, y0, x1, y1],                # vùng chứa nhân vật
  "erase": [[x0, y0, x1, y1], ...],        # vùng cần xoá: chữ ký, ngày tháng, tên
  "scale": 0.5,                            # thu nhỏ khi xuất (ảnh lớp nên rộng 300–800px)
  "height": 1.9,                           # chiều cao nhân vật trong game (mét), không tính bạn đồng hành
  "feet": [x, y],                          # điểm giữa hai chân chạm đất
  "layers": {
    "body":      { "pivot": [x, y] },                          # không có polygon = phần còn lại
    "head":      { "polygon": [[x, y], ...], "pivot": [x, y] },  # pivot = cổ
    "companion": { "polygon": [[x, y], ...], "pivot": [x, y] }   # tuỳ chọn: thú cưng / vật bay theo
  }
}
Kết quả: <out>/layers/*.png và khối "doll" in ra màn hình để dán vào character.json
(toạ độ đã đổi sang hệ của bản đã cắt + thu nhỏ). Sau đó tự điền "face", "hand", "anger"."""
import json, os, sys
import numpy as np, cv2
from PIL import Image, ImageDraw

cfg = json.load(open(sys.argv[1]))
im = np.asarray(Image.open(cfg['src']).convert('RGB')).astype(np.float32)
H, W = im.shape[:2]
X0, Y0, X1, Y1 = cfg['crop']
S = cfg.get('scale', 0.5)

# Màu giấy cục bộ (bao sáng, làm mờ) -> độ "có mực" = tối hơn hoặc lệch màu so với giấy, bút màu nào cũng bắt được
paper = np.stack([cv2.blur(cv2.dilate(im[..., c], np.ones((25, 25), np.uint8)), (151, 151)) for c in range(3)], 2)
ink = np.clip(((paper - im).max(2) - 18) / 60, 0, 1)
keep = np.zeros((H, W), np.float32)
keep[Y0:Y1, X0:X1] = 1
for x0, y0, x1, y1 in cfg.get('erase', []):
    keep[y0:y1, x0:x1] = 0
ink *= keep
norm = np.clip(im / np.maximum(paper, 1) * 245, 0, 255)  # cân sáng: giấy thành gần trắng
PAPER = np.array([253, 250, 244], np.float32)

def mask_of(poly):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in poly], fill=255)
    return np.asarray(m) > 0

names = list(cfg['layers'])
masks, used = {}, np.zeros((H, W), bool)
for n in names:
    if cfg['layers'][n].get('polygon'):
        masks[n] = mask_of(cfg['layers'][n]['polygon']) & ~used
        used |= masks[n]
for n in names:
    if n not in masks:
        masks[n] = ~used

os.makedirs(os.path.join(cfg['out'], 'layers'), exist_ok=True)
doll = {}
for n in names:
    a = ink * masks[n]
    b = (a > 0.35).astype(np.uint8)
    b = cv2.morphologyEx(b, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)))
    ff = b.copy()
    cv2.floodFill(ff, np.zeros((H + 2, W + 2), np.uint8), (0, 0), 1)  # lấp kín phần giấy nằm trong nét vẽ
    sil = (b | (1 - ff)).astype(np.uint8)
    sil = cv2.morphologyEx(sil, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    cnt, lab, st, _ = cv2.connectedComponentsWithStats(sil)
    for i in range(1, cnt):
        if st[i, cv2.CC_STAT_AREA] < 2500:
            sil[lab == i] = 0  # bỏ mảnh vụn
    if not sil.any():
        sys.exit(f'Lớp "{n}" trống: xem lại polygon / crop.')
    sil = cv2.dilate(sil, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    alpha = cv2.GaussianBlur(sil.astype(np.float32), (5, 5), 0)
    ys, xs = np.where(alpha > 0.02)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    a2 = np.clip((a - 0.08) / 0.6, 0, 1) ** 0.9
    rgb = PAPER * (1 - a2[..., None]) + (norm * 0.9) * a2[..., None]
    out = np.dstack([rgb, alpha[..., None] * 255]).astype(np.uint8)[y0:y1, x0:x1]
    img = Image.fromarray(out, 'RGBA')
    img = img.resize((max(1, round(img.width * S)), max(1, round(img.height * S))), Image.LANCZOS)
    img.save(os.path.join(cfg['out'], 'layers', f'{n}.png'), optimize=True)
    px, py = cfg['layers'][n]['pivot']
    doll[n] = dict(file=f'layers/{n}.png', x=round((x0 - X0) * S), y=round((y0 - Y0) * S), w=img.width, h=img.height,
                   px=round((px - X0) * S), py=round((py - Y0) * S))

fx, fy = cfg['feet']
feet = dict(x=round((fx - X0) * S), y=round((fy - Y0) * S))
main = [doll[n] for n in names if n != 'companion']
top = min(l['y'] for l in main)
block = dict(metersPerPx=round(cfg.get('height', 1.9) / max(1, feet['y'] - top), 5), feet=feet, **doll)
print('Dán khối này vào "doll" của character.json (rồi thêm face / hand / anger):')
print(json.dumps(block, ensure_ascii=False, indent=2))
# ảnh ghép để kiểm tra bằng mắt
cw, ch = round((X1 - X0) * S), round((Y1 - Y0) * S)
comp = Image.new('RGBA', (cw, ch), (120, 160, 120, 255))
for n in names:
    L = doll[n]
    comp.alpha_composite(Image.open(os.path.join(cfg['out'], 'layers', f'{n}.png')), (max(0, L['x']), max(0, L['y'])))
d = ImageDraw.Draw(comp)
for n in names:
    d.ellipse([doll[n]['px'] - 6, doll[n]['py'] - 6, doll[n]['px'] + 6, doll[n]['py'] + 6], outline=(255, 0, 0, 255), width=3)
d.line([feet['x'] - 20, feet['y'], feet['x'] + 20, feet['y']], fill=(255, 0, 0, 255), width=3)
comp.convert('RGB').save(os.path.join(cfg['out'], 'layers', '_kiem-tra.jpg'), quality=85)
print('Ảnh kiểm tra (chấm đỏ = điểm xoay, gạch đỏ = chân):', os.path.join(cfg['out'], 'layers', '_kiem-tra.jpg'))
