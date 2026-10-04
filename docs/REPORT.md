# Отчёт: лендинг мастера (landing-master) v1.0.0

Решения — в [decisions.md](decisions.md), план — в [plan.md](plan.md). Скриншоты (3 палитры × светлая/тёмная тема × 375/768/1280 px) — в [docs/screenshots](screenshots).

## Что сделано по пунктам ТЗ

| Пункт ТЗ | Статус | Где |
| --- | --- | --- |
| Технологии: чистые HTML/CSS/JS, шрифты в проекте, без внешних зависимостей, комментарии «РЕДАКТИРОВАТЬ», цвета и шрифты в переменных в начале CSS | Сделано | `index.html`, `css/style.css`, `js/`, `fonts/` |
| 8 секций (первый экран, услуги, обо мне + сертификаты, работы с просмотром и свайпом, отзывы, шаги, FAQ на `details`, контакты с картой и формой) | Сделано | `index.html` |
| Удаление любой секции не ломает страницу и меню; меню строится само | Сделано, автотест: удаляется каждая секция, пара секций, все сразу | `dev/test/e2e.test.mjs` |
| Форма: поля, маска телефона, услуга из списка, согласие со ссылкой на политику, без согласия не отправляется | Сделано | `index.html`, `js/main.js` |
| Токен не в браузере; два обработчика (`send.php`, Cloudflare Worker); адрес обработчика в одной строке JS | Сделано | `send.php`, `worker/`, `js/config.js` |
| Антиспам: ловушка, минимальное время, лимит частоты, экранирование | Сделано в обоих обработчиках | см. тесты |
| Состояния формы: отправка, успех, ошибка с предложением написать напрямую | Сделано | `js/main.js` |
| 3 палитры одним атрибутом на `html` | Сделано (+ тёмная тема для каждой) | `css/style.css` |
| SEO: title, description, Open Graph, Schema.org, favicon | Сделано; плюс `robots.txt`, `sitemap.xml`, og-картинка | `index.html` |
| `policy.html` с полями для заполнения и предупреждением в README | Сделано | `policy.html`, `README.md` |
| Яндекс Метрика одним номером | Сделано; грузится после `load`, цель `lead` | `js/config.js` |
| README: тексты и фото, российский хостинг с PHP, GitHub Pages + Worker, домен | Сделано | `README.md` |
| Демо: выдуманный мастер, форма не отправляет и показывает заявку «как в Telegram», переключатель палитр только в демо, фото со свободной лицензией | Сделано | `demo/`, `scripts/build-demo.sh`, `.github/workflows/pages.yml` |
| Комплект покупателя: README, ADMIN.md, LICENSE.md, CHANGELOG.md 1.0.0, `scripts/package.sh` | Сделано | см. корень |

## «Готово, когда»

- [x] **Lighthouse на мобильном ≥ 90 по всем показателям.** Лучший из худших из 3 прогонов (Lighthouse 13, мобильный профиль, симуляция 4G/CPU по умолчанию, локальный сервер с gzip): производительность 99, доступность 100, рекомендации 100, SEO 100 — для рабочего сайта, демо и `policy.html`. LCP 1,9 с, TBT 0, CLS 0. Запуск: `cd dev && node lighthouse.mjs`.
- [x] **Нет горизонтальной прокрутки на 375, 768 и 1280 px** — автотест (все палитры, обе темы) и скриншоты, просмотренные вручную: `dev/shots.mjs`, `docs/screenshots`.
- [x] **Оба обработчика проверены с фейковым Telegram API.** Один и тот же набор из 14 проверок прогнан для: `send.php` на PHP 7.4 и 8.3 (Docker, `php -S`), Worker в процессе Node, Worker под настоящим `wrangler dev`. Фейковый API отклоняет невалидный HTML как настоящий Telegram, поэтому экранирование проверяется по-настоящему. Запуск: `cd dev && npm test`. Тест нашёл и помог исправить баг: `send.php` принимал JSON-массив как заявку.
- [x] **Удаление любой секции не ломает страницу и меню** — см. выше.
- [x] **Общие требования, применимые к статическому сайту** — см. ниже.

## Общие требования: что применимо

- Секреты не в git: `.gitignore` с первого коммита (`/config.php`, `.env`, `.dev.vars`, базы, сессии); тест проверяет, что токена нет в браузерных файлах и в `git ls-files`.
- Скриншоты Playwright на 375 и 1280 (и 768) в светлой и тёмной теме просмотрены; найденное исправлено (кнопки лайтбокса на телефоне перекрывались подписью; кнопка отправки/цифры в заголовочном шрифте; выравнивание чекбокса и жирный текст согласия; усечённый текст в `select`).
- Тесты зелёные (`npm test` в `dev/`: 106 пройдено, 1 пропущен намеренно — лимит частоты под `wrangler dev`, который в локальном режиме не передаёт IP из заголовка; тот же тест проходит в двух других прогонах), живых запросов к Telegram нет.
- README на русском с командами, LICENSE.md-заготовка (текст проверите вы), CHANGELOG 1.0.0, `scripts/package.sh` (zip без `.git`, `dev/`, TZ.md, PROMPT.md, `docs/plan.md`, `decisions.md`, `REPORT.md`, `.env`, `config.php`, баз; проверено: 69 файлов, распакованный архив открывается без ошибок).
- Не применимо к этому шаблону: aiogram, FSM, Mini App, `docker compose`, pytest/ruff/vitest, `.env.example`, `config/*.yaml`, демо-режим бота и ночной сброс данных.

## Где отклонился от ТЗ

1. **Тёмная тема** (в ТЗ шаблона нет) — добавил, потому что общие требования просят скриншоты в обеих темах. Автоматическая, фиксируется `data-theme`.
2. **Демо-версия собирается скриптом**, а не лежит как отдельная копия: рабочий сайт остаётся чистым (`demo: false`), демо-код в архив не попадает.
3. **ADMIN.md** — админки нет, документ превращён в памятку владельцу.
4. **Docker** используется только для проверки PHP; в комплекте покупателя его нет.
5. **Карта в демо** — виджет Яндекса по координатам, а не код конструктора (нужен аккаунт; инструкция для покупателя в README).
6. **Меню без JS не строится** (по ТЗ строится автоматически).
7. **Лимит частоты в Worker** — запасной в памяти, надёжный через биндинг Cloudflare (нужно включить в `wrangler.toml`); ограничение Cloudflare: период 10 или 60 секунд.

## Не сделано / ограничения

- Демо не опубликовано: репозиторий и пуш не создавались по вашему запросу. Всё готово: `.github/workflows/pages.yml` (включить Pages → Source: GitHub Actions).
- Lighthouse проверен на локальном сервере с gzip, а не на реальной публикации. На GitHub Pages результат должен быть таким же (сжатие и кеш включены), но стоит перепроверить после публикации.
- Минимальное время заполнения и поле-ловушка — базовая защита; от целенаправленного спама защищает только лимит частоты и, при необходимости, Cloudflare Turnstile (не входит в ТЗ).
- Текст `policy.html` и `LICENSE.md` — заготовки, их нужно проверить юристу/вам.
- Адрес/телефон/Telegram в демо — заглушки (`your_username`, `+7 (900) 000-00-00`, `example.ru`).

## Источники фото

Все с Wikimedia Commons, подробности и ссылки — в `img/CREDITS.md`. Сертификаты, favicon, og-картинка нарисованы мной.

| Файл | Автор | Лицензия | Источник |
| --- | --- | --- | --- |
| hero-*.webp | Ajls1111 | CC BY-SA 4.0 | [Acrylic nail art with crystal.jpg](https://commons.wikimedia.org/wiki/File:Acrylic_nail_art_with_crystal.jpg) |
| about-*.webp | DIYNailArtDesigns | CC BY 2.0 | [Nail art kit (1).jpg](https://commons.wikimedia.org/wiki/File:Nail_art_kit_(1).jpg) |
| works/w1 | Lelê Breveglieri | CC BY 2.0 | [Dark violete nail polish and shimmer.jpg](https://commons.wikimedia.org/wiki/File:Dark_violete_nail_polish_and_shimmer.jpg) |
| works/w2 | Lelê Breveglieri | CC BY 2.0 | [Pink nail colour.jpg](https://commons.wikimedia.org/wiki/File:Pink_nail_colour.jpg) |
| works/w3 | lisa bentley | CC BY 2.0 | [Nail art - Glitter Diamond.jpg](https://commons.wikimedia.org/wiki/File:Nail_art_-_Glitter_Diamond.jpg) |
| works/w4 | Lelê Breveglieri | CC BY 2.0 | [Green nail colour.jpg](https://commons.wikimedia.org/wiki/File:Green_nail_colour.jpg) |
| works/w5 | Kate Brady | CC BY 2.0 | [Red nail polish (4149676692).jpg](https://commons.wikimedia.org/wiki/File:Red_nail_polish_(4149676692).jpg) |
| works/w6 | Lelê Breveglieri | CC BY 2.0 | [Nail art with stripes.jpg](https://commons.wikimedia.org/wiki/File:Nail_art_with_stripes.jpg) |
| works/w7 | Köttbulleledaren | CC BY-SA 4.0 | [Polished purple nails with nail art on.jpg](https://commons.wikimedia.org/wiki/File:Polished_purple_nails_with_nail_art_on.jpg) |
| works/w8 | Lelê Breveglieri | CC BY 2.0 | [Flower nail art.jpg](https://commons.wikimedia.org/wiki/File:Flower_nail_art.jpg) |

Шрифты Manrope и Cormorant — SIL OFL 1.1 (через пакеты Fontsource).

## Как запустить демо

1. Создайте репозиторий на GitHub (публичный), запушьте проект (`git remote add origin …`, `git push -u origin main`).
2. Settings → Pages → Source: **GitHub Actions**. Workflow `.github/workflows/pages.yml` сам соберёт демо (`scripts/build-demo.sh`) и опубликует.
3. Локально: `DEMO_URL=http://localhost:8080 bash scripts/build-demo.sh`, затем `cd _site && python -m http.server 8080`.

## Что нужно от вас

- **Для демо:** только GitHub-аккаунт и репозиторий. По желанию: реальный логин Telegram для кнопок (замена `your_username`), номер телефона и адрес (иначе заглушки), домен вместо `example.ru` (`DEMO_URL` подставится автоматически).
- **Для живой формы в боевом сайте покупателя** (не для демо): токен бота от @BotFather и chat_id; для Worker — аккаунт Cloudflare.
- **Для своей карты:** код из конструктора Яндекс.Карт с вашим адресом.

## Как проверить самому

```bash
cd dev
npm install          # один раз
npm test             # все тесты (Docker нужен для PHP-тестов)
node lighthouse.mjs  # Lighthouse mobile
node shots.mjs .. soft   # скриншоты в dev/screenshots
bash ../scripts/package.sh   # zip для продажи в dist/
```

Известные ограничения: тесты PHP используют образы `php:7.4-cli` и `php:8.3-cli` и скачивают их при первом запуске.
