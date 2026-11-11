#!/usr/bin/env bash
# Lấy bản mới từ GitHub cho /opt/game-3d (chạy bởi lop-hoc-update.timer, quyền root).
# Chỉ khởi động lại dịch vụ khi mã máy chủ đổi; nhân vật và giao diện mới thì có hiệu lực ngay.
set -euo pipefail
cd /opt/game-3d
old="$(git rev-parse HEAD)"
git fetch -q origin main
new="$(git rev-parse FETCH_HEAD)"
[ "$old" = "$new" ] && exit 0
changed="$(git diff --name-only "$old" "$new")"
git merge -q --ff-only FETCH_HEAD
echo "Đã cập nhật $old -> $new"
if grep -qE '^lop-hoc/(server\.js|package(-lock)?\.json)$' <<<"$changed"; then
  (cd lop-hoc && npm ci --omit=dev --no-audit --no-fund >/dev/null)
  systemctl restart lop-hoc
  echo "Mã máy chủ thay đổi: đã khởi động lại dịch vụ (các lớp đang mở sẽ phải vào lại)."
fi
