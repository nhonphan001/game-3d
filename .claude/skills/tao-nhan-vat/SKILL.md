---
name: tao-nhan-vat
description: Biến một bức vẽ tay trên giấy thành "gói nhân vật" cho game Lớp Học Nét Vẽ (rối giấy có biểu cảm + mô hình 3D có chuyển động như Queen of White) rồi đẩy lên GitHub để VPS tự nhận. Dùng khi người dùng gửi ảnh phác thảo và muốn có nhân vật mới, hoặc muốn sửa một gói nhân vật đã có.
---

# Tạo gói nhân vật từ bức vẽ tay

Đầu vào: một ảnh chụp bức vẽ trên giấy. Đầu ra: thư mục `lop-hoc/public/characters/<id>/` đã đẩy lên
nhánh `main` của repo `game-3d`. VPS tự lấy bản mới trong vòng 5 phút; sau đó **người dùng** (không phải bạn)
vào trang `/admin.html` để gán nhân vật cho một tên và mã bảo mật.

Làm thủ công, có kiểm tra bằng mắt ở từng bước. Nhân vật mẫu để đối chiếu: `characters/queen-of-white/`.

## Quy tắc bắt buộc

- **Không đưa ảnh gốc vào repo.** Ảnh gốc để trong thư mục tạm; repo là công khai.
- **Xoá chữ ký, họ tên, ngày tháng** trên tranh (mục `erase`). Kiểm tra lại trên ảnh `_kiem-tra.jpg`. Không đặt
  tên thật của trẻ vào `id`, `title`, tên file hay lời nhắn commit.
- `id` chỉ gồm chữ thường, số, gạch nối (`^[a-z0-9-]{1,40}$`). Thư mục bắt đầu bằng `_` không hiện trong game.
- Không tự gán tài khoản, không đụng tới VPS: việc gán tên + mã bảo mật là của người dùng.
- Một gói có thể chỉ có rối giấy (bỏ `"model"`), chỉ có 3D (bỏ `"doll"`), hoặc cả hai. Nói rõ với người dùng
  nếu bạn bỏ phần nào và vì sao.

## Chuẩn bị

```bash
pip install opencv-python-headless numpy pillow   # cho cut_layers.py
cd lop-hoc && npm install && npm start             # máy chủ thử ở cổng 3000 (chạy nền)
```

## Bước 1 — Đọc tranh

Xem ảnh và ghi ra trước khi làm: nhân vật chính là gì; các bộ phận (tóc, mũ/nơ, áo, váy/quần, phụ kiện);
có bạn đồng hành (thú cưng, vật bay theo) không; bút màu gì; chỗ nào là chữ cần xoá. Nếu tranh có nhiều
nhân vật và không rõ ai là chính, hỏi người dùng.

## Bước 2 — Rối giấy từ nét vẽ gốc (`doll`)

1. Đọc toạ độ trên ảnh gốc: `python3 tools/nhan-vat/grid.py ANH --out luoi.png` (thêm `x0 y0 x1 y1` để phóng to
   một vùng), rồi xem `luoi.png`. Số trên lưới là toạ độ ảnh gốc.
2. Viết file cấu hình JSON (để trong thư mục tạm) theo mô tả ở đầu `tools/nhan-vat/cut_layers.py`:
   `crop`, `erase`, `feet`, `height`, và các lớp:
   - `head`: đa giác bao đầu + tóc trên vai + mũ/nơ; `pivot` ở cổ.
   - `companion` (nếu có): đa giác bao bạn đồng hành; `pivot` ở giữa thân nó.
   - `body`: không có đa giác (phần còn lại); `pivot` ở giữa gấu váy / giữa hai chân.
   Đường cắt nên đi theo chỗ nét vẽ thưa (cổ, khe giữa hai hình).
3. Chạy `python3 tools/nhan-vat/cut_layers.py cau-hinh.json`. Xem `layers/_kiem-tra.jpg`: không còn chữ, không
   mất mảng nào của nhân vật, chấm đỏ đúng điểm xoay. Chỉnh cấu hình và chạy lại tới khi đạt. Xoá `_kiem-tra.jpg`
   trước khi commit.
4. Dán khối `doll` công cụ in ra vào `character.json`, rồi thêm (toạ độ đọc bằng `grid.py`):
   - `"face"`: tính **trong ảnh `layers/head.png`**: `"eyes": [[x, y, bán_kính], [x, y, bán_kính]]` (tâm mỗi mắt),
     `"mouth": [x, y]`. Bỏ `face` nếu mặt không nhìn thẳng hoặc không có mắt/miệng rõ: rối vẫn cử động, chỉ không
     có biểu cảm vẽ đè.
   - `"hand"`: chỗ đặt bàn tay vẫy, `"anger"`: chỗ đặt dấu giận — toạ độ trong **hệ bản vẽ đã cắt** (cùng hệ
     với `x, y` của các lớp).
   - `"ink"`, `"paper"`: màu mực và màu giấy của các lớp (để nét vẽ đè tiệp màu).

## Bước 3 — Mô hình 3D (`model.js`)

Chép `characters/_mau/model.js` và sửa theo tranh. Hợp đồng với bộ xương ghi ở đầu file mẫu; tóm tắt:

- Nhìn về +z, chân chạm y = 0, cao khoảng 1.8–2.0 (không tính nơ/mũ). `"height"` trong `character.json` là độ
  cao đặt nhãn tên, tính cả mũ/nơ.
- Bắt buộc trả về: `root, body, hips, torso, head, armL, elbowL, armR, elbowR, legL, legR, face, mats`.
  Tuỳ chọn: `skirt, hairLong, bow, anger` (rig tự đung đưa nếu có).
- Dựng bằng đồ nghề trong `rig/kit.js`: `toon(màu, tuỳ chọn, độ_đậm_mực, hướng_gạch)`, `part(hình, vật_liệu)`,
  `strand(điểm, bán_kính, vật_liệu)` cho lọn tóc/dải dài, `lathe(biên_dạng)` cho váy, `makeRose`,
  `zigzagGeometry`, `checkerTexture`, `stripeTexture`, `angerSprite`, `Face`.
- Độ đậm mực quyết định kiểu "3D bút bi": −0.2 không gạch (da), 0.1–0.3 gạch thưa, 0.45–0.6 gạch chéo,
  0.8 tô kín. Chọn theo cách tranh gốc tô: chỗ tô đặc thì đậm, chỗ để trắng thì để trắng.
- Giữ các nét đặc trưng của tranh (kiểu tóc, phụ kiện, hoạ tiết) hơn là thêm chi tiết mới.
- `createCompanion(kit)` nếu tranh có bạn đồng hành.

## Bước 4 — Kiểm tra

```bash
node tools/nhan-vat/preview.cjs <id> /thu-muc-tam      # cần máy chủ thử đang chạy
```

Xem ảnh ghép (hàng = kiểu hiển thị, cột = idle, walk, run, jump, talk, laugh, wave, cry, angry) và soát:

- Không có lỗi trình duyệt (công cụ thoát mã 1 nếu có).
- Rối giấy: mắt nhắm / mắt cười / miệng / nước mắt nằm đúng chỗ, không lệch khỏi mặt.
- 3D: tay không xuyên qua tóc/thân khi vẫy, khóc; mặt không bị tóc che; chân chạm đất; nhìn ra được là
  nhân vật trong tranh.
- Sửa và chụp lại tới khi đạt. Gửi ảnh ghép cho người dùng xem trước khi đẩy.

## Bước 5 — Đẩy lên

```bash
git add lop-hoc/public/characters/<id> && git commit -m "Add character <id>" && git push origin main
```

Báo cho người dùng: mã nhân vật, gói có những kiểu hiển thị nào, chỗ nào còn khác tranh, và bước tiếp theo
của họ: chờ tối đa 5 phút, mở `http://<VPS>:3000/admin.html`, gán nhân vật cho một tên (mã bảo mật tự sinh
hoặc tự đặt), rồi đưa tên + mã cho người dùng cuối. Xem thử gói trên VPS: `/nhan-vat.html?id=<id>`.

## Cấu trúc một gói

```
characters/<id>/
  character.json   id, title, version, height, model, doll{...}
  model.js         createCharacter(kit) [+ createCompanion(kit)]
  layers/          body.png, head.png, companion.png (PNG trong suốt)
```
