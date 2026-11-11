# Lớp Học Nét Vẽ

Lớp học ảo nơi nhân vật vẽ tay của học sinh gặp nhau. Mỗi lớp có **1 giáo viên** và tối đa **40 học sinh**.

## Cách dùng

1. **Giáo viên** mở trang, chọn "Giáo viên", nhập tên (ảnh nhân vật là tuỳ chọn) và bấm "Tạo lớp". Mã lớp 6 ký tự hiện ở góc trên và trên bảng.
2. **Học sinh** mở cùng trang, nhập mã lớp + tên (biệt danh), chọn ảnh chụp nhân vật vẽ trên giấy. Trình duyệt tự tách nền giấy; có thanh "Tách nền" để chỉnh.
3. Giáo viên thấy hình và tên trong mục "Chờ duyệt", bấm ✓ để cho vào lớp hoặc ✗ để từ chối. Giáo viên cũng có thể "Mời ra" một học sinh đang trong lớp.
4. Khi tải ảnh, mỗi người chọn kiểu hiển thị cho nhân vật: **Nét vẽ** (tấm cắt giấy phẳng), **3D** (hình được bơm phồng thành khối, giữ nét vẽ gốc, tô bóng bằng nét gạch) hoặc **3D tô màu** (khối 3D, các vùng kín trong nét vẽ được tự tô màu; nút 🎲 đổi bộ màu). Vào lớp rồi vẫn đổi được, cả lớp thấy ngay.
5. Trong lớp: chạm vào sân để đi, bấm biểu cảm (chào, cười, nhảy, tim, sao, khóc, giận) hoặc một câu chọn sẵn. Không có chat tự do.

## Chạy máy chủ

Cần Node.js 18 trở lên.

```bash
cd lop-hoc
npm install
npm start          # mặc định cổng 3000, đổi bằng biến PORT
```

Mở `http://localhost:3000`. Để nhiều máy cùng vào, đưa thư mục repo lên một dịch vụ chạy được Node.js có hỗ trợ WebSocket (máy chủ dùng thư viện three.js trong `../nhan-vat-3d/vendor`, nên cần triển khai cả repo). Khi chạy thật nên đặt sau HTTPS.

## Cài lên VPS (Rocky Linux)

Trên VPS, chạy bằng root:

```bash
curl -fsSL https://raw.githubusercontent.com/nhonphan001/game-3d/main/deploy/install.sh | sudo bash
```

Script cài Node.js và git, tải repo vào `/opt/game-3d`, tạo dịch vụ systemd `lop-hoc` chạy bằng tài khoản riêng `lophoc` ở cổng 3000 (đổi bằng `PORT=3001`), và mở cổng đó trên firewalld. Chạy lại đúng lệnh này để cập nhật bản mới. Sau đó mở `http://<IP của VPS>:3000`.

## Dữ liệu và quyền riêng tư

- Ảnh gốc không rời khỏi máy học sinh: chỉ hình nhân vật đã tách nền (PNG, tối đa 400 KB) được gửi lên.
- Học sinh chỉ nhập mã lớp và biệt danh, không cần email hay số điện thoại.
- Mọi thứ chỉ nằm trong bộ nhớ máy chủ: học sinh rời lớp thì hình bị xoá; lớp trống quá 10 phút thì bị xoá; khởi động lại máy chủ là mất hết.
- Giáo viên tải lại trang vẫn vào lại đúng lớp (trong cùng thẻ trình duyệt).
- Trước khi dùng với học sinh thật, cần đối chiếu Nghị định 13/2023 về dữ liệu cá nhân trẻ em.

## Chưa có

- Nút báo cáo cho giáo viên, trang quản lý nhiều lớp, lưu trữ lâu dài.
- Tách nền bằng mô hình phân đoạn; hiện chỉ dựa trên màu giấy nên ảnh cần nền giấy sáng, tương đối đều màu.
- Khối 3D được suy ra tự động từ hình phẳng (dày ở giữa, mỏng ở mép), mặt sau là hình mặt trước lật lại; chưa tách khớp đầu/thân/tay.
- Màu tự tô là phỏng đoán theo vùng kín, không hiểu đâu là tóc hay áo; vùng lớn ở phần trên được coi là da mặt.

## Cấu trúc

- `server.js` – máy chủ HTTP + WebSocket, giữ trạng thái lớp, kiểm tra quyền giáo viên
- `public/figure.js` – dựng hình theo ba kiểu: cắt giấy, bơm phồng thành khối 3D, tự tô màu
- `public/app.js` – tách nền ảnh, cảnh 3D (three.js), giao diện vào lớp và bảng duyệt
- `public/index.html`, `public/style.css` – giao diện kiểu giấy vở
