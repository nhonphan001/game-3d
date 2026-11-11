# Lớp Học Nét Vẽ

Lớp học ảo nơi nhân vật vẽ tay của học sinh gặp nhau. Mỗi lớp có **1 giáo viên** và tối đa **40 học sinh**.

## Cách dùng

1. **Giáo viên** mở trang, chọn "Giáo viên", nhập tên (ảnh nhân vật là tuỳ chọn) và bấm "Tạo lớp". Mã lớp 6 ký tự hiện ở góc trên và trên bảng.
2. **Học sinh** mở cùng trang, nhập mã lớp + tên (biệt danh), chọn ảnh chụp nhân vật vẽ trên giấy. Trình duyệt tự tách nền giấy; có thanh "Tách nền" để chỉnh.
3. Giáo viên thấy hình và tên trong mục "Chờ duyệt", bấm ✓ để cho vào lớp hoặc ✗ để từ chối. Giáo viên cũng có thể "Mời ra" một học sinh đang trong lớp.
4. Khi tải ảnh, mỗi người chọn kiểu hiển thị cho nhân vật: **Nét vẽ** (tấm cắt giấy phẳng), **3D** (hình được bơm phồng thành khối, giữ nét vẽ gốc, tô bóng bằng nét gạch) hoặc **3D tô màu** (khối 3D, các vùng kín trong nét vẽ được tự tô màu; nút 🎲 đổi bộ màu). Vào lớp rồi vẫn đổi được, cả lớp thấy ngay.
5. Trong lớp: chạm vào sân để đi, bấm biểu cảm (chào, cười, nhảy, tim, sao, khóc, giận) hoặc một câu chọn sẵn. Không có chat tự do.

## Nhân vật đóng gói và tài khoản gán sẵn

Ngoài cách tải ảnh, một người có thể vào lớp bằng **nhân vật được gán sẵn** (có bộ xương, biểu cảm, ba kiểu hiển thị như Queen of White):

1. Gói nhân vật nằm trong `public/characters/<id>/` (tạo bằng skill `tao-nhan-vat`, xem `.claude/skills/tao-nhan-vat/SKILL.md`). Xem thử một gói: `/nhan-vat.html?id=<id>`.
2. Quản trị viên mở `/admin.html`, nhập mã quản trị, rồi gán **tên + nhân vật + mã bảo mật** (để trống mã thì máy chủ tự sinh 6 số; mã chỉ hiện một lần).
3. Người dùng nhập mã lớp, đúng tên và mã bảo mật là vào thẳng lớp với nhân vật đó, không cần tải ảnh và không qua bước duyệt. Tên đã gán không ai khác dùng được.

Mã bảo mật chỉ lưu dạng băm trong `DATA_DIR/accounts.json`. Sai mã 5 lần thì tên đó bị khoá 5 phút. Mã quản trị lấy từ biến `ADMIN_TOKEN`; không đặt biến này thì trang quản trị bị tắt.

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

Script cài Node.js và git, tải repo vào `/opt/game-3d`, tạo dịch vụ systemd `lop-hoc` chạy bằng tài khoản riêng `lophoc` ở cổng 3000 (đổi bằng `PORT=3001`), và mở cổng đó trên firewalld. Lần đầu, script tạo mã quản trị trong `/etc/lop-hoc.env` và in ra một lần. Script cũng bật bộ hẹn giờ `lop-hoc-update.timer`: 5 phút một lần VPS tự lấy bản mới từ GitHub; nhân vật mới có ngay, còn khi mã máy chủ đổi thì dịch vụ tự khởi động lại (các lớp đang mở phải vào lại). Tài khoản đã gán lưu ở `/var/lib/lop-hoc`. Sau đó mở `http://<IP của VPS>:3000`.

### HTTPS qua Cloudflare

Nếu có tên miền đang dùng Cloudflare, tạo một tên miền con cho lớp học (ví dụ `lophoc.<tên miền>`):

1. **DNS:** thêm bản ghi `A` tên `lophoc` trỏ về IP của VPS, bật Proxy (đám mây màu cam).
2. **Rules → Origin Rules:** tạo luật "Hostname equals `lophoc.<tên miền>`" → **Destination Port: Rewrite to 3000**.
3. **Chế độ SSL cho tên miền con này phải là Flexible** (Cloudflare nối tới VPS bằng HTTP). Nếu cả tên miền đang ở Full, tạo một **Configuration Rule** cho hostname này đặt SSL = Flexible.

Máy chủ tự nhận địa chỉ thật của người dùng từ tiêu đề `CF-Connecting-IP` khi kết nối đến từ dải địa chỉ của Cloudflare. Với Flexible, chặng Cloudflare → VPS không mã hoá.

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
- `public/rig/` – bộ xương, chuyển động, biểu cảm và đồ nghề dựng hình dùng chung cho các gói nhân vật
- `public/characters/` – các gói nhân vật (`_mau` là mẫu để chép)
- `public/admin.html` – trang gán nhân vật + tên + mã bảo mật
- `public/figure.js` – dựng hình theo ba kiểu: cắt giấy, bơm phồng thành khối 3D, tự tô màu
- `public/app.js` – tách nền ảnh, cảnh 3D (three.js), giao diện vào lớp và bảng duyệt
- `public/index.html`, `public/style.css` – giao diện kiểu giấy vở
