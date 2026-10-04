#!/usr/bin/env bash
# Собирает демо-версию сайта в папку _site/ (её публикует GitHub Pages).
# Демо отличается от рабочего сайта тремя вещами:
#   1. форма ничего не отправляет, а показывает, как заявка выглядела бы в Telegram;
#   2. внизу страницы есть переключатель трёх палитр;
#   3. адреса example.ru заменены на адрес демо.
#
# Использование:  DEMO_URL=https://имя.github.io/landing-master bash scripts/build-demo.sh
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="${OUT:-_site}"
DEMO_URL="${DEMO_URL:-https://example.github.io/landing-master}"
DEMO_URL="${DEMO_URL%/}"

rm -rf "$OUT"
mkdir -p "$OUT/demo"

# Всё, что нужно браузеру. send.php, config и worker в демо не нужны.
cp index.html policy.html favicon.svg favicon.ico apple-touch-icon.png robots.txt sitemap.xml "$OUT/"
cp -r css js fonts img "$OUT/"
cp demo/demo.js demo/demo.css "$OUT/demo/"
touch "$OUT/.nojekyll"

# Включаем демо-режим в настройках
sed -i 's/demo: false/demo: true/' "$OUT/js/config.js"
grep -q 'demo: true' "$OUT/js/config.js" || { echo "demo flag was not switched on" >&2; exit 1; }

# Подключаем демо-стили и скрипт, подставляем адрес демо
for f in index.html policy.html; do
  sed -i "s#https://example.ru#${DEMO_URL}#g" "$OUT/$f"
done
sed -i 's#</head>#  <link rel="stylesheet" href="demo/demo.css">\n</head>#' "$OUT/index.html"
sed -i 's#</body>#  <script src="demo/demo.js" defer></script>\n</body>#' "$OUT/index.html"
sed -i "s#https://example.ru#${DEMO_URL}#g" "$OUT/sitemap.xml" "$OUT/robots.txt"

echo "Demo built into $OUT/ (url: $DEMO_URL)"
