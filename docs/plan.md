# План работ: landing-master

Отмечаю выполненное по ходу работы.

## 0. Подготовка
- [x] Прочитать TZ.md и PROMPT.md
- [x] git init, .gitignore (секреты — с первого коммита)
- [x] docs/plan.md, docs/decisions.md
- [x] dev/ — инструменты проверки (sharp, playwright, lighthouse, wrangler); в комплект не входят

## 1. Ресурсы
- [x] Шрифты (woff2, кириллица+латиница, OFL) в fonts/
- [x] Фото со свободной лицензией (Wikimedia Commons), оптимизация в webp, источники в docs/REPORT.md
- [x] Сертификаты (выдуманные, рисую сам), favicon, og-image

## 2. Вёрстка
- [x] CSS: переменные, 3 палитры × светлая/тёмная, адаптив 375/768/1280
- [x] index.html: 8 секций, комментарии «РЕДАКТИРОВАТЬ», SEO, Open Graph, Schema.org
- [x] policy.html — шаблон политики с полями
- [x] JS: меню по секциям, lightbox со свайпом, ленивая карта, форма (маска, валидация, состояния), Метрика
- [x] js/config.js — одна строка адреса обработчика, номер Метрики

## 3. Обработчики формы
- [x] handlers/send.php + config.example.php (токен только в config.php)
- [x] worker/ — Cloudflare Worker + wrangler.toml
- [x] Антиспам: honeypot, минимальное время, лимит частоты, экранирование
- [x] Фейковый Telegram API (dev/fake-telegram.mjs)
- [x] Тесты Worker (юнит + wrangler dev)
- [x] Тесты PHP в Docker

## 4. Демо
- [x] Контент выдуманного мастера маникюра
- [x] Демо-режим формы (показывает карточку «как в Telegram»), переключатель палитр только в демо
- [x] scripts/build-demo.sh + GitHub Actions workflow для Pages (без пуша)

## 5. Проверки
- [x] Скриншоты Playwright 375/768/1280, светлая и тёмная тема; просмотр и исправление
- [x] Нет горизонтальной прокрутки
- [x] Удаление любой секции не ломает страницу и меню (автотест)
- [x] Lighthouse mobile ≥ 90 по всем четырём
- [x] Контраст палитр (скрипт)
- [x] Токен не во фронтенде (grep-тест)

## 6. Комплект покупателя
- [x] README.md (русский, пошагово)
- [x] docs/ADMIN.md, LICENSE.md, CHANGELOG.md 1.0.0
- [x] scripts/package.sh → dist/landing-master-v1.0.0.zip
- [x] docs/REPORT.md
