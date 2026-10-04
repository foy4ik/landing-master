#!/usr/bin/env bash
# Собирает архив для продажи: dist/landing-master-v<версия>.zip
# В архив попадает только то, что нужно покупателю. Не попадают: .git, dev/ (тесты и инструменты),
# demo/ и .github/ (демо-версия), TZ.md, PROMPT.md, docs/plan.md, docs/decisions.md, docs/REPORT.md,
# .env, config.php, базы и сессии.
set -euo pipefail

cd "$(dirname "$0")/.."
SLUG="landing-master"
VERSION="$(grep -m1 -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' CHANGELOG.md | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
[ -n "$VERSION" ] || { echo "Не нашёл версию в CHANGELOG.md" >&2; exit 1; }

INCLUDE=(
  index.html policy.html send.php config.example.php .htaccess robots.txt sitemap.xml
  favicon.svg favicon.ico apple-touch-icon.png
  css js fonts img worker
  README.md LICENSE.md CHANGELOG.md docs/ADMIN.md
)
EXCLUDE_RE='(^|/)(node_modules|\.git|\.wrangler|\.dev\.vars|\.env(\..*)?|config\.php|.*\.(sqlite3?|db|session)|Thumbs\.db|\.DS_Store)$'

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
ROOT="$STAGE/$SLUG"
mkdir -p "$ROOT"

for item in "${INCLUDE[@]}"; do
  [ -e "$item" ] || { echo "Нет файла $item" >&2; exit 1; }
  mkdir -p "$ROOT/$(dirname "$item")"
  cp -r "$item" "$ROOT/$item"
done

# Убираем всё, что не должно уйти покупателю
find "$ROOT" -type f | while read -r f; do
  rel="${f#"$ROOT"/}"
  if [[ "$rel" =~ $EXCLUDE_RE ]]; then rm -f "$f"; fi
done

# Страховка: в архиве не должно быть токена
if grep -rIlE '[0-9]{6,12}:[A-Za-z0-9_-]{30,}' "$ROOT" >/dev/null 2>&1; then
  echo "В файлах найден похожий на токен бота текст — архив не собран" >&2
  exit 1
fi

mkdir -p dist
OUT="$PWD/dist/${SLUG}-v${VERSION}.zip"
rm -f "$OUT"
if command -v zip >/dev/null 2>&1; then
  (cd "$STAGE" && zip -qr "$OUT" "$SLUG")
else
  PY=""
  for cand in python3 python py; do
    if command -v "$cand" >/dev/null 2>&1 && "$cand" -c "import zipfile" >/dev/null 2>&1; then PY="$cand"; break; fi
  done
  [ -n "$PY" ] || { echo "Нужна программа zip или Python" >&2; exit 1; }
  "$PY" - "$STAGE" "$SLUG" "$OUT" <<'PYEOF'
import os, sys, zipfile
stage, slug, out = sys.argv[1:4]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for base, _, files in os.walk(os.path.join(stage, slug)):
        for name in sorted(files):
            full = os.path.join(base, name)
            z.write(full, os.path.relpath(full, stage).replace(os.sep, "/"))
PYEOF
fi
echo "Готово: dist/${SLUG}-v${VERSION}.zip ($(du -h "$OUT" | cut -f1))"
