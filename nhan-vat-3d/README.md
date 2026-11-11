# Queen of White 3D

Webapp dựng nhân vật 3D từ bức tranh bút bi "Queen of White" (cô bé thắt nơ, hoa hồng xanh, váy caro và bạn thú bông), hiển thị theo nét bút bi trên giấy vở: mực xanh, tô bóng bằng nét gạch, nét viền run tay. Nút "Tô màu" chuyển sang bản màu, với các chuyển động cơ bản của nhân vật game.

## Ba kiểu hiển thị

- **Nét vẽ gốc** (mặc định): nhân vật là hình cắt giấy từ chính nét vẽ tay (3 lớp thân, đầu, thú bông trong `assets/`), biểu cảm được vẽ đè bằng nét mực.
- **3D bút bi**: mô hình 3D hiển thị bằng nét gạch mực xanh trên giấy.
- **3D tô màu**: mô hình 3D tô màu.

## Chuyển động

| Nút | Phím | Mô tả |
| --- | --- | --- |
| Đứng | `1` | Đứng yên, thở nhẹ, tự chớp mắt |
| Đi | `2` hoặc WASD / phím mũi tên | Đi bộ (nút bấm: tự đi vòng tròn) |
| Chạy | `3` hoặc giữ Shift khi đi | Chạy |
| Nhảy | `4` hoặc Space | Nhảy |
| Nói | `5` | Nói một câu (có bong bóng thoại và giọng đọc nếu trình duyệt hỗ trợ) |
| Cười | `6` | Cười |
| Chào | `7` | Vẫy tay chào |
| Khóc | `8` | Khóc |
| Chớp mắt | `9` | Chớp mắt |
| Giận dữ | `0` | Giận dữ, giậm chân |

Kéo chuột / vuốt để xoay góc nhìn, cuộn để phóng to. Trên điện thoại có cần điều khiển ảo. Có thể đổi màu tóc, màu váy và gõ câu muốn nhân vật nói.

## Chạy thử

Không cần build. Mở thư mục này bằng một máy chủ tĩnh bất kỳ:

```bash
cd nhan-vat-3d
python3 -m http.server 8000
# mở http://localhost:8000
```

Hoặc bật GitHub Pages cho repo rồi mở `/nhan-vat-3d/`.

## Cấu trúc

- `src/character.js` – dựng mô hình nhân vật và thú bông bằng khối hình cơ bản (three.js)
- `src/face.js` – khuôn mặt vẽ bằng canvas (mắt, miệng, má hồng, nước mắt)
- `src/doll.js` – con rối giấy từ các lớp cắt của bản vẽ gốc
- `src/main.js` – cảnh, điều khiển, máy trạng thái chuyển động
- `vendor/` – three.js r170 (giấy phép MIT)
