// Dev: full-page screenshots at 375/768/1280, light+dark. Usage: node shots.mjs <dir> [palette]
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2] || '..';
const palette = process.argv[3] || 'soft';
const out = path.resolve(import.meta.dirname, 'screenshots', palette);
fs.mkdirSync(out, { recursive: true });
const server = await serve(dir, 8101);
const browser = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  for (const w of [375, 768, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:8101/index.html');
    await page.evaluate((p) => document.documentElement.setAttribute('data-palette', p), palette);
    // trigger lazy images/map
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(500);
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    console.log(scheme, w, 'scrollWidth', sw[0], 'viewport', sw[1], sw[0] > sw[1] ? 'HORIZONTAL SCROLL!' : 'ok');
    await page.screenshot({ path: path.join(out, `${scheme}-${w}.png`), fullPage: true });
    await ctx.close();
  }
}
await browser.close(); server.close();
