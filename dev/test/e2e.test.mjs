// Browser tests (Playwright): menu, section removal, form, lightbox, lazy map, demo mode.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { serve } from '../serve.mjs';
import { startFakeTelegram } from './fake-telegram.mjs';
import { handleRequest } from '../../worker/index.js';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const SITE_PORT = 8103;
const API_PORT = 8104;
const DEMO_PORT = 8105;
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const SECTIONS = ['services', 'about', 'works', 'reviews', 'process', 'faq', 'contacts'];

const fake = await startFakeTelegram({ token: '123456:FAKE-TOKEN' });
const env = {
  BOT_TOKEN: '123456:FAKE-TOKEN', CHAT_ID: '555001', ALLOWED_ORIGINS: SITE,
  TELEGRAM_API: `http://127.0.0.1:${fake.port}`, MIN_FILL_SECONDS: '1', RATE_LIMIT_MAX: '1000',
};
// Worker exposed over HTTP so the real page can post to it (CORS included)
const api = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const r = await handleRequest(new Request(`http://127.0.0.1:${API_PORT}/`, {
    method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body,
  }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((r) => api.listen(API_PORT, '127.0.0.1', r));

let removeIds = [];
const transform = (p, data) => {
  if (p === '/js/config.js') return Buffer.from(data.toString().replace('formEndpoint: "send.php"', `formEndpoint: "http://127.0.0.1:${API_PORT}/"`));
  if (p === '/index.html' && removeIds.length) {
    let html = data.toString();
    for (const id of removeIds) html = html.replace(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`), '');
    return Buffer.from(html);
  }
  return null;
};
const site = await serve(root, SITE_PORT, transform);

let demo;
let browser;
before(async () => {
  execFileSync('bash', ['scripts/build-demo.sh'], { cwd: root, stdio: 'ignore', env: { ...process.env, DEMO_URL: 'https://demo.example/landing' } });
  demo = await serve(path.join(root, '_site'), DEMO_PORT);
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
  site.close(); demo.close(); api.close(); await fake.close();
});

/** Opens a page and records every console error / page error / failed request. */
async function open(url, { width = 1280, height = 900, scheme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, hasTouch: width < 800 });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('yandex')) problems.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(url);
  return { ctx, page, problems };
}
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

describe('page basics', () => {
  for (const width of [375, 768, 1280]) {
    it(`loads without errors and without horizontal scroll at ${width}px`, async () => {
      const { ctx, page, problems } = await open(`${SITE}/index.html`, { width });
      assert.deepEqual(problems, []);
      assert.ok(await noHScroll(page), 'horizontal scroll');
      await ctx.close();
    });
  }

  it('builds the menu from sections with data-nav', async () => {
    const { ctx, page } = await open(`${SITE}/index.html`);
    const expected = await page.$$eval('main [data-nav]', (els) => els.map((e) => e.getAttribute('data-nav')));
    const actual = await page.$$eval('#site-nav a', (els) => els.map((e) => e.textContent));
    assert.deepEqual(actual, expected);
    assert.equal(actual.length, 7);
    await ctx.close();
  });

  it('opens and closes the mobile menu, links scroll to sections', async () => {
    const { ctx, page } = await open(`${SITE}/index.html`, { width: 375 });
    const toggle = page.locator('.nav-toggle');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await page.locator('#site-nav a', { hasText: 'Контакты' }).click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await page.waitForFunction(() => document.getElementById('contacts').getBoundingClientRect().top < 200);
    await ctx.close();
  });

  it('works in dark theme and all three palettes without horizontal scroll', async () => {
    for (const palette of ['soft', 'strict', 'bright']) {
      const { ctx, page } = await open(`${SITE}/index.html`, { width: 375, scheme: 'dark' });
      await page.evaluate((p) => document.documentElement.setAttribute('data-palette', p), palette);
      assert.ok(await noHScroll(page), palette);
      await ctx.close();
    }
  });
});

describe('removing sections never breaks the page', () => {
  const cases = [...SECTIONS.map((s) => [s]), ['top'], ['services', 'contacts'], [...SECTIONS, 'top']];
  for (const ids of cases) {
    it(`without: ${ids.join(', ')}`, async () => {
      removeIds = ids;
      try {
        const { ctx, page, problems } = await open(`${SITE}/index.html`, { width: 375 });
        assert.deepEqual(problems, []);
        assert.ok(await noHScroll(page));
        const remainingNav = SECTIONS.filter((s) => !ids.includes(s)).length;
        assert.equal(await page.locator('#site-nav a').count(), remainingNav);
        // no visible link may point to a missing anchor
        const dead = await page.$$eval('a[href^="#"]', (as) => as
          .filter((a) => !a.hidden && a.getAttribute('href').length > 1 && !document.getElementById(a.getAttribute('href').slice(1)))
          .map((a) => a.getAttribute('href')));
        assert.deepEqual(dead, []);
        if (!remainingNav) assert.equal(await page.locator('.nav-toggle').count(), 0, 'no empty burger');
        await ctx.close();
      } finally { removeIds = []; }
    });
  }

  it('hero "Записаться" buttons hide when the contacts section is removed', async () => {
    removeIds = ['contacts'];
    try {
      const { ctx, page } = await open(`${SITE}/index.html`, { width: 1280 });
      assert.equal(await page.locator('.hero-actions a[href="#contacts"]').isVisible(), false);
      assert.equal(await page.locator('.hero-actions a[href^="https://t.me"]').isVisible(), true);
      await ctx.close();
    } finally { removeIds = []; }
  });
});

describe('lead form', () => {
  async function fill(page, { name = 'Анна', phone = '9123456789', consent = true, service, comment } = {}) {
    await page.locator('#f-name').fill(name);
    await page.locator('#f-phone').click();
    await page.locator('#f-phone').pressSequentially(phone);
    if (service) await page.locator('#f-service').selectOption(service);
    if (comment) await page.locator('#f-comment').fill(comment);
    if (consent) await page.locator('#f-consent').check();
  }

  it('lists services from the cards and preselects one from a card button', async () => {
    const { ctx, page } = await open(`${SITE}/index.html`, { width: 1280 });
    const options = await page.$$eval('#f-service option', (o) => o.map((x) => x.value));
    assert.equal(options.length, 7);
    assert.ok(options.includes('Наращивание'));
    await page.locator('[data-service="Наращивание"]').click();
    assert.equal(await page.locator('#f-service').inputValue(), 'Наращивание');
    await ctx.close();
  });

  it('applies the phone mask for typed, pasted and 8-prefixed numbers, and deletion works', async () => {
    const { ctx, page } = await open(`${SITE}/index.html`);
    const phone = page.locator('#f-phone');
    await phone.click();
    await phone.pressSequentially('9123456789');
    assert.equal(await phone.inputValue(), '+7 (912) 345-67-89');
    await phone.fill('');
    await phone.fill('89123456789');
    assert.equal(await phone.inputValue(), '+7 (912) 345-67-89');
    await phone.fill('+79123456789');
    assert.equal(await phone.inputValue(), '+7 (912) 345-67-89');
    await phone.fill('');
    await phone.click();
    await phone.pressSequentially('912345');
    assert.equal(await phone.inputValue(), '+7 (912) 345');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
    assert.equal(await phone.inputValue(), '+7 (91');
    await ctx.close();
  });

  it('does not submit without consent and shows errors for empty fields', async () => {
    fake.reset();
    const { ctx, page } = await open(`${SITE}/index.html`);
    await page.locator('#lead-form .form-submit').click();
    assert.match(await page.locator('#f-name-err').innerText(), /имя/i);
    assert.match(await page.locator('#f-phone-err').innerText(), /номер/i);
    assert.match(await page.locator('#f-consent-err').innerText(), /согласие/i);
    await fill(page, { consent: false });
    await page.locator('#lead-form .form-submit').click();
    assert.match(await page.locator('#f-consent-err').innerText(), /согласие/i);
    assert.equal(await page.locator('#f-name-err').innerText(), '');
    assert.equal(fake.calls.length, 0);
    await ctx.close();
  });

  it('sends a lead to Telegram and shows the success state', async () => {
    fake.reset();
    const { ctx, page, problems } = await open(`${SITE}/index.html`);
    await fill(page, { service: 'Наращивание', comment: 'Вечером, <b>пожалуйста</b> & спасибо' });
    await page.waitForTimeout(1100); // minimum fill time on this test server is 1s
    await page.locator('#lead-form .form-submit').click();
    await page.locator('.form-status--ok').waitFor();
    assert.match(await page.locator('.form-status').innerText(), /Спасибо/);
    assert.equal(fake.calls.length, 1);
    const text = fake.calls[0].params.text;
    assert.ok(text.includes('Анна') && text.includes('+7 (912) 345-67-89') && text.includes('Наращивание'));
    assert.ok(text.includes('&lt;b&gt;пожалуйста&lt;/b&gt; &amp; спасибо'));
    assert.equal(await page.locator('#f-name').inputValue(), '', 'form reset after success');
    assert.deepEqual(problems, []);
    await ctx.close();
  });

  it('shows the sending state while the request is in flight', async () => {
    const { ctx, page } = await open(`${SITE}/index.html`);
    await page.route(`http://127.0.0.1:${API_PORT}/`, async (route) => {
      if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await fill(page);
    await page.waitForTimeout(1100);
    await page.locator('#lead-form .form-submit').click();
    await page.waitForSelector('.form-submit .spinner');
    assert.equal(await page.locator('.form-submit').isDisabled(), true);
    await page.locator('.form-status--ok').waitFor();
    assert.equal(await page.locator('.form-submit').isDisabled(), false);
    await ctx.close();
  });

  it('shows an error with direct-contact links when sending fails', async () => {
    fake.reset(); fake.mode = 'fail';
    const { ctx, page } = await open(`${SITE}/index.html`);
    await fill(page);
    await page.waitForTimeout(1100);
    await page.locator('#lead-form .form-submit').click();
    const err = page.locator('.form-status--err');
    await err.waitFor();
    assert.match(await err.innerText(), /Не получилось/);
    assert.equal(await err.locator('a[href^="https://t.me"]').count(), 1);
    assert.equal(await err.locator('a[href^="tel:"]').count(), 1);
    assert.equal(await page.locator('#f-name').inputValue(), 'Анна', 'data kept so the user can retry');
    fake.reset();
    await ctx.close();
  });

  it('shows an error when the network is down', async () => {
    const { ctx, page } = await open(`${SITE}/index.html`);
    await page.route(`http://127.0.0.1:${API_PORT}/`, (route) => route.abort());
    await fill(page);
    await page.waitForTimeout(1100);
    await page.locator('#lead-form .form-submit').click();
    await page.locator('.form-status--err').waitFor();
    assert.match(await page.locator('.form-status--err').innerText(), /нет связи/);
    await ctx.close();
  });

  it('keeps the honeypot invisible and untabbable', async () => {
    const { ctx, page } = await open(`${SITE}/index.html`);
    const box = await page.locator('input[name="website"]').boundingBox();
    assert.ok(!box || box.x < -1000 || box.width <= 1);
    assert.equal(await page.locator('input[name="website"]').getAttribute('tabindex'), '-1');
    await ctx.close();
  });
});

describe('gallery lightbox', () => {
  it('opens, navigates by buttons, keyboard and swipe, closes on Escape', async () => {
    const { ctx, page } = await open(`${SITE}/index.html`, { width: 375 });
    await page.locator('.gallery a').first().click();
    const dlg = page.locator('dialog.lightbox');
    assert.equal(await dlg.evaluate((d) => d.open), true);
    const src = () => dlg.locator('img').getAttribute('src');
    assert.match(await src(), /w1\.webp$/);
    assert.match(await dlg.locator('.lb-info').innerText(), /1 \/ 8/);
    await dlg.locator('.lb-next').click();
    assert.match(await src(), /w2\.webp$/);
    await page.keyboard.press('ArrowLeft');
    assert.match(await src(), /w1\.webp$/);
    await page.keyboard.press('ArrowLeft');
    assert.match(await src(), /w8\.webp$/, 'wraps around');
    // swipe left = next
    const stage = dlg.locator('.lb-stage');
    const b = await stage.boundingBox();
    const y = b.y + b.height / 2;
    await page.mouse.move(b.x + 300, y);
    await page.mouse.down();
    await page.mouse.move(b.x + 80, y, { steps: 5 });
    await page.mouse.up();
    assert.match(await src(), /w1\.webp$/);
    await page.keyboard.press('Escape');
    assert.equal(await dlg.evaluate((d) => d.open), false);
    await ctx.close();
  });

  it('certificates open as their own group', async () => {
    const { ctx, page } = await open(`${SITE}/index.html`, { width: 1280 });
    await page.locator('.cert-list a').first().click();
    const dlg = page.locator('dialog.lightbox');
    assert.match(await dlg.locator('.lb-info').innerText(), /1 \/ 3/);
    await ctx.close();
  });
});

describe('lazy map', () => {
  it('does not load the map until it is scrolled into view', async () => {
    const { ctx, page } = await open(`${SITE}/index.html`, { width: 1280 });
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.map iframe').count(), 0);
    await page.locator('#contacts').scrollIntoViewIfNeeded();
    await page.locator('.map').scrollIntoViewIfNeeded();
    await page.locator('.map iframe').waitFor({ state: 'attached' });
    assert.match(await page.locator('.map iframe').getAttribute('src'), /^https:\/\/yandex\.ru\/map-widget\//);
    await ctx.close();
  });
});

describe('demo build', () => {
  const DEMO = `http://127.0.0.1:${DEMO_PORT}`;

  it('shows the palette switcher only in the demo', async () => {
    const real = await open(`${SITE}/index.html`);
    assert.equal(await real.page.locator('.demo-bar').count(), 0);
    await real.ctx.close();
    const { ctx, page, problems } = await open(`${DEMO}/index.html`);
    assert.equal(await page.locator('.demo-bar').isVisible(), true);
    for (const [label, id] of [['Строгая', 'strict'], ['Яркая', 'bright'], ['Нежная', 'soft']]) {
      await page.locator('.demo-bar button', { hasText: label }).click();
      assert.equal(await page.locator('html').getAttribute('data-palette'), id);
    }
    assert.deepEqual(problems, []);
    await ctx.close();
  });

  it('form does not send anything and shows a Telegram-style preview (escaped)', async () => {
    const { ctx, page } = await open(`${DEMO}/index.html`);
    const posts = [];
    page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url()); });
    await page.locator('#f-name').fill('<img src=x onerror=alert(1)> Мария');
    await page.locator('#f-phone').click();
    await page.locator('#f-phone').pressSequentially('9001112233');
    await page.locator('#f-consent').check();
    await page.locator('#lead-form .form-submit').click();
    const dlg = page.locator('dialog.demo-tg');
    await dlg.waitFor({ state: 'visible' });
    const text = await dlg.innerText();
    assert.match(text, /Новая заявка/);
    assert.ok(text.includes('<img src=x onerror=alert(1)> Мария'));
    assert.equal(await dlg.locator('img').count(), 0, 'user input must not become markup');
    assert.deepEqual(posts, []);
    await ctx.close();
  });

  it('uses the demo URL in meta tags', async () => {
    const { ctx, page } = await open(`${DEMO}/index.html`);
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://demo.example/landing/');
    await ctx.close();
  });
});
