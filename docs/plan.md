# План работ: landing-master

Отмечаю выполненное по ходу работы.

## 0. Подготовка
- [x] Прочитать TZ.md и PROMPT.md
- [x] git init, .gitignore (секреты — с первого коммита)
- [ ] docs/plan.md, docs/decisions.md
- [ ] dev/ — инструменты проверки (sharp, playwright, lighthouse, wrangler); в комплект не входят

## 1. Ресурсы
- [ ] Шрифты (woff2, кириллица+латиница, OFL) в fonts/
- [ ] Фото со свободной лицензией (Wikimedia Commons), оптимизация в webp, источники в docs/REPORT.md
- [ ] Сертификаты (выдуманные, рисую сам), favicon, og-image

## 2. Вёрстка
- [ ] CSS: переменные, 3 палитры × светлая/тёмная, адаптив 375/768/1280
- [ ] index.html: 8 секций, комментарии «РЕДАКТИРОВАТЬ», SEO, Open Graph, Schema.org
- [ ] policy.html — шаблон политики с полями
- [ ] JS: меню по секциям, lightbox со свайпом, ленивая карта, форма (маска, валидация, состояния), Метрика
- [ ] js/config.js — одна строка адреса обработчика, номер Метрики

## 3. Обработчики формы
- [ ] handlers/send.php + config.example.php (токен только в config.php)
- [ ] worker/ — Cloudflare Worker + wrangler.toml
- [ ] Антиспам: honeypot, минимальное время, лимит частоты, экранирование
- [ ] Фейковый Telegram API (dev/fake-telegram.mjs)
- [ ] Тесты Worker (юнит + wrangler dev)
- [ ] Тесты PHP в Docker

## 4. Демо
- [ ] Контент выдуманного мастера маникюра
- [ ] Демо-режим формы (показывает карточку «как в Telegram»), переключатель палитр только в демо
- [ ] scripts/build-demo.sh + GitHub Actions workflow для Pages (без пуша)

## 5. Проверки
- [ ] Скриншоты Playwright 375/768/1280, светлая и тёмная тема; просмотр и исправление
- [ ] Нет горизонтальной прокрутки
- [ ] Удаление любой секции не ломает страницу и меню (автотест)
- [ ] Lighthouse mobile ≥ 90 по всем четырём
- [ ] Контраст палитр (скрипт)
- [ ] Токен не во фронтенде (grep-тест)

## 6. Комплект покупателя
- [ ] README.md (русский, пошагово)
- [ ] docs/ADMIN.md, LICENSE.md, CHANGELOG.md 1.0.0
- [ ] scripts/package.sh → dist/landing-master-v1.0.0.zip
- [ ] docs/REPORT.md
