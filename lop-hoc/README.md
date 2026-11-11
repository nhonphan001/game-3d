# Lớp Học Nét Vẽ

Lớp học ảo nơi nhân vật vẽ tay của học sinh gặp nhau. Mỗi lớp có **1 giáo viên** và tối đa **40 học sinh**.

## Cách dùng

1. **Giáo viên** mở trang, chọn "Giáo viên", nhập tên (ảnh nhân vật là tuỳ chọn) và bấm "Tạo lớp". Mã lớp 6 ký tự hiện ở góc trên và trên bảng.
2. **Học sinh** mở cùng trang, nhập mã lớp + tên (biệt danh), chọn ảnh chụp nhân vật vẽ trên giấy. Trình duyệt tự tách nền giấy; có thanh "Tách nền" để chỉnh.
3. Giáo viên thấy hình và tên trong mục "Chờ duyệt", bấm ✓ để cho vào lớp hoặc ✗ để từ chối. Giáo viên cũng có thể "Mời ra" một học sinh đang trong lớp.
4. Khi tải ảnh, mỗi người chọn kiểu hiển thị cho nhân vật: **Nét vẽ** (tấm cắt giấy phẳng), **3D** (hình được bơm phồng thành khối, giữ nét vẽ gốc, tô bóng bằng nét gạch) hoặc **3D tô màu** (khối 3D, các vùng kín trong nét vẽ được tự tô màu; nút 🎲 đổi bộ màu). Vào lớp rồi vẫn đổi được, cả lớp thấy ngay.
5. **Trò chuyện:** nút "💬 Trò chuyện" ở góc trên mở ô chat; tin hiện cả trong ô chat lẫn bóng thoại trên đầu nhân vật. Mỗi tin dài tối đa 120 ký tự, chỉ chữ (không gửi được hình hay đường dẫn bấm được), và mỗi người nhắn tối đa khoảng 1 tin mỗi giây, 8 tin mỗi 20 giây.
6. **Hình vẽ:** nút "🖼️ Gửi hình vẽ" cho mỗi người gửi một bức vẽ (ảnh chụp, tự thu nhỏ). Hình chờ giáo viên duyệt; duyệt xong nhân vật **cầm hình** trên tay cho cả lớp thấy. Có nút "Cất hình" / "Cầm lại hình". Mỗi người giữ tối đa 2 hình, hình mới đẩy hình cũ nhất ra.
7. **Bảng:** giáo viên bấm vào một hình trong mục "Hình trong lớp" để chiếu lên bảng cho cả lớp; bấm "Gỡ hình khỏi bảng" để trở lại. Ai bấm vào bảng cũng xem được hình to.
8. **Video YouTube:** giáo viên dán đường dẫn YouTube vào mục "Video YouTube" trong bảng quản lý rồi bấm "Chiếu". Video phát **ngay trên bảng** cho cả lớp (trên máy tính khung video phủ khít lên bảng; trên điện thoại, hoặc khi camera quay lệch khỏi bảng, video thành cửa sổ nổi ở trên cùng, bấm ⛶ để phóng to). Giáo viên điều khiển bằng nút phát, tạm dừng, tua của YouTube; học sinh xem **theo giáo viên** (cùng vị trí, tự bắt kịp nếu lệch quá vài giây, bạn vào muộn nhận đúng vị trí hiện tại). Học sinh không có nút điều khiển video, chỉ tắt tiếng và phóng to cho riêng mình. Nếu trình duyệt chặn tự phát, học sinh thấy nút "Chạm để xem". Chọn một hình lên bảng thì video tự dừng, và ngược lại. Nhận các dạng: `youtube.com/watch?v=…`, `youtu.be/…`, `/shorts/…`, `/embed/…`, `/live/…`, có thể kèm `t=90` hoặc `t=1m30s`; máy chủ chỉ giữ mã video 11 ký tự, không nhúng địa chỉ tuỳ ý. Dùng tên miền riêng tư `youtube-nocookie.com`.
9. **Công cụ của giáo viên:** "Tắt tiếng" từng bạn, xoá từng tin nhắn (✕ cạnh tin), "Tắt trò chuyện cả lớp", "Tự duyệt hình vẽ" (bỏ bước xem trước), xoá hình khỏi thư viện, "Mời ra". Hình của một bạn tự mất khi bạn rời lớp.
10. Trong lớp: chạm vào sân để đi, bấm biểu cảm (chào, cười, nhảy, tim, sao, khóc, giận) hoặc một câu chọn sẵn, hoặc nhắn tin ở ô trò chuyện.

## Nhân vật đóng gói và tài khoản gán sẵn

Ngoài cách tải ảnh, một người có thể vào lớp bằng **nhân vật được gán sẵn** (có bộ xương, biểu cảm, ba kiểu hiển thị như Queen of White):

1. Gói nhân vật nằm trong `public/characters/<id>/` (tạo bằng skill `tao-nhan-vat`, xem `.claude/skills/tao-nhan-vat/SKILL.md`). Xem thử một gói: `/nhan-vat.html?id=<id>`.
2. Quản trị viên mở `/admin.html`, nhập mã quản trị, rồi gán **tên + nhân vật + mã bảo mật** (để trống mã thì máy chủ tự sinh 6 số; mã chỉ hiện một lần).
3. Người dùng nhập mã lớp, đúng tên và mã bảo mật là vào thẳng lớp với nhân vật đó, không cần tải ảnh và không qua bước duyệt. Tên đã gán không ai khác dùng được.

Mã bảo mật chỉ lưu dạng băm trong `DATA_DIR/accounts.json`. Sai mã 5 lần thì tên đó bị khoá 5 phút. Mã quản trị lấy từ biến `ADMIN_TOKEN`; không đặt biến này thì trang quản trị bị tắt.

## Lớp được lưu lại, tự nối lại, dùng trên điện thoại

- **Lớp được lưu:** khi giáo viên tạo lớp, máy chủ lưu lớp xuống đĩa (`DATA_DIR/classes`) và đưa **mã giáo viên** (hiện một lần, dạng `XXXXX-XXXXX`). Trên máy đã tạo lớp, trang đầu có mục **"Lớp của tôi"**: bấm "Mở lại" là vào đúng lớp cũ, cùng mã lớp. Từ máy khác: mục "Mở lớp cũ bằng mã giáo viên". Tạo lớp có thể đặt **tên lớp** (hiện trên bảng).
- **Lưu những gì:** tên lớp, mã giáo viên (dạng băm), hình giáo viên, **danh sách học sinh đã được duyệt** (tên + hình nhân vật + kiểu hiển thị + dấu nhận máy), 50 tin nhắn gần nhất, cài đặt chat/duyệt hình. **Không lưu:** hình vẽ gửi lên và hình trên bảng (mất khi người gửi rời lớp), ai đang ở trong lớp.
- **Quay lại không cần duyệt:** học sinh đã được duyệt vào lại bằng đúng điện thoại cũ chỉ cần mã lớp + đúng tên, không cần chọn lại ảnh và không cần giáo viên duyệt lại. Máy khác dùng trùng tên bị từ chối. "Mời ra" là xoá luôn khỏi danh sách (muốn vào lại phải xin duyệt lại); bạn đang vắng có nút "Xoá" riêng.
- **Hết hạn và xoá:** lớp không ai vào quá 30 ngày (đổi bằng biến `CLASS_TTL_DAYS`) bị xoá cùng dữ liệu. Giáo viên có nút "Xoá lớp này" trong bảng quản lý.
- **Tự nối lại:** mất mạng, điện thoại khoá màn hình hoặc tải lại trang thì trình duyệt tự nối lại và vào đúng chỗ cũ. Người mất kết nối vẫn giữ chỗ **15 phút** (đổi bằng biến `GRACE_MIN`), nhân vật hiện 💤; quá hạn thì rời lớp. Bấm "Rời lớp" là rời ngay.
- **Điện thoại:** thanh công cụ gọn ở trên (💬 chat, 👩‍🏫 quản lý, 🎨 kiểu, 🚪 rời lớp); chat và bảng quản lý của giáo viên trượt từ dưới lên, đẩy lên trên bàn phím khi gõ.
- **Cloudflare:** máy chủ báo `Cloudflare-CDN-Cache-Control: no-store` cho trang và mã nguồn, và gắn mã phiên bản vào địa chỉ các tệp `.js`/`.css`, nên cập nhật có hiệu lực ngay, không cần xoá bộ nhớ đệm.

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
- Tin nhắn (50 tin gần nhất) được lưu cùng lớp, giáo viên đọc lại được khi mở lại lớp. Hình vẽ dùng tối đa 300 MB bộ nhớ cho mọi lớp cộng lại.
- Dữ liệu lớp được lưu trên máy chủ (xem mục "Lớp được lưu lại"); hình vẽ gửi lên chỉ nằm trong bộ nhớ.
- Hình nhân vật của học sinh đã duyệt nằm trên đĩa máy chủ cho tới khi giáo viên xoá bạn đó, xoá lớp, hoặc lớp hết hạn. Cần cân nhắc điều này theo Nghị định 13/2023.
- Trước khi dùng với học sinh thật, cần đối chiếu Nghị định 13/2023 về dữ liệu cá nhân trẻ em.

## Chưa có

- Video YouTube cần máy học sinh vào được `youtube.com`; video bị chủ kênh tắt chế độ nhúng sẽ không phát và hiện thông báo. Video không được lưu lại: tắt lớp là hết.
- Bộ lọc từ ngữ cho chat: hiện chỉ có tắt tiếng, xoá tin và tắt chat do giáo viên làm thủ công. Không có nhắn riêng giữa hai người. Chưa có nút báo cáo, trang quản lý nhiều lớp, lưu trữ lâu dài.
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
