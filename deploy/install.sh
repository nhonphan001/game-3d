#!/usr/bin/env bash
# Cài đặt / cập nhật Lớp Học Nét Vẽ trên VPS Rocky Linux (chạy bằng root hoặc sudo).
# Chạy lại script này bất cứ lúc nào để cập nhật lên bản mới nhất.
#   PORT=3000 bash install.sh      (đổi cổng bằng biến PORT)
set -euo pipefail

REPO="https://github.com/nhonphan001/game-3d.git"
DIR="/opt/game-3d"
PORT="${PORT:-3000}"
SERVICE="lop-hoc"

[ "$(id -u)" -eq 0 ] || { echo "Hãy chạy bằng root: sudo bash install.sh"; exit 1; }

# Không cài đè lên cổng mà chương trình khác đang dùng
if ss -ltnH "sport = :$PORT" | grep -q . && ! systemctl is-active --quiet "$SERVICE"; then
  echo "Cổng $PORT đang được chương trình khác sử dụng. Chọn cổng khác: PORT=3001 bash install.sh"
  exit 1
fi

echo "==> Cài Node.js và git"
dnf -y -q install nodejs npm git
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || { echo "Cần Node.js 18 trở lên (đang có $(node -v))."; exit 1; }

echo "==> Tải mã nguồn vào $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone --depth 1 "$REPO" "$DIR"
fi
(cd "$DIR/lop-hoc" && npm ci --omit=dev --no-audit --no-fund)

echo "==> Tạo tài khoản dịch vụ và đăng ký với systemd"
id lophoc >/dev/null 2>&1 || useradd --system --no-create-home --shell /sbin/nologin lophoc
sed "s/^Environment=PORT=.*/Environment=PORT=$PORT/" "$DIR/deploy/lop-hoc.service" > "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable --quiet "$SERVICE"
systemctl restart "$SERVICE"

if systemctl is-active --quiet firewalld; then
  echo "==> Mở cổng $PORT trên tường lửa"
  firewall-cmd --quiet --permanent --add-port="$PORT/tcp"
  firewall-cmd --quiet --reload
fi

sleep 2
if systemctl is-active --quiet "$SERVICE" && curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then
  IP="$(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | head -n1)"
  echo
  echo "Xong. Lớp Học Nét Vẽ đang chạy tại: http://${IP:-<IP của VPS>}:$PORT"
  echo "Xem nhật ký: journalctl -u $SERVICE -f      Dừng: systemctl stop $SERVICE"
else
  echo "Dịch vụ chưa chạy được. Xem lỗi: journalctl -u $SERVICE -n 50"
  exit 1
fi
