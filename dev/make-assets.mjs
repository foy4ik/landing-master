// Dev helper: draws fictional certificates, favicon set and the Open Graph image.
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
fs.mkdirSync(path.join(root, 'img/certs'), { recursive: true });

const certs = [
  { n: 1, title: 'Аппаратный маникюр', school: 'Школа ногтевого сервиса «Эстет»', year: '2018', hours: '48 часов' },
  { n: 2, title: 'Наращивание ногтей гелем', school: 'Академия красоты «Лотос»', year: '2020', hours: '72 часа' },
  { n: 3, title: 'Дизайн и ручная роспись', school: 'Студия Nail Art Lab', year: '2023', hours: '36 часов' },
];
const certHtml = (c) => `<!doctype html><meta charset="utf-8"><style>
 body{margin:0;width:1000px;height:700px;background:#fbf6f3;font-family:Georgia,'Times New Roman',serif;color:#3a2a2e}
 .f{position:absolute;inset:26px;border:3px solid #c98a96;} .f2{position:absolute;inset:40px;border:1px solid #d9b0b8;}
 .c{position:absolute;inset:80px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}
 .k{letter-spacing:.35em;font-size:20px;color:#a8405e;text-transform:uppercase}
 h1{font-size:64px;margin:22px 0 10px;font-weight:600}
 .s{font-size:24px;color:#6b5a5e;margin:6px 0}
 .t{font-size:44px;font-style:italic;margin:22px 0;color:#a8405e}
 .m{margin-top:34px;font-size:20px;color:#6b5a5e}
 .seal{position:absolute;right:110px;bottom:100px;width:110px;height:110px;border-radius:50%;background:#c98a96;color:#fff;display:grid;place-items:center;font-size:15px;letter-spacing:.1em;text-align:center}
</style><div class="f"></div><div class="f2"></div><div class="c">
 <div class="k">Сертификат</div><h1>Мария Светлова</h1>
 <div class="s">успешно прошла обучение по программе</div>
 <div class="t">«${c.title}»</div>
 <div class="s">${c.school}</div>
 <div class="m">${c.hours} · ${c.year} год · Демонстрационный образец</div></div>
 <div class="seal">ЭСТЕТ<br>${c.year}</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
for (const c of certs) {
  await page.setContent(certHtml(c));
  const png = await page.screenshot();
  await sharp(png).webp({ quality: 80 }).toFile(path.join(root, `img/certs/cert-${c.n}.webp`));
  await sharp(png).resize(400, 280).webp({ quality: 78 }).toFile(path.join(root, `img/certs/cert-${c.n}-thumb.webp`));
}

// favicon: polish drop on a rounded square
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#a8405e"/><path d="M32 12c7 9 13 16 13 24a13 13 0 0 1-26 0c0-8 6-15 13-24z" fill="#fff"/><path d="M26 38a6 6 0 0 0 6 6" stroke="#a8405e" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`;
fs.writeFileSync(path.join(root, 'favicon.svg'), svg + '\n');
await sharp(Buffer.from(svg)).resize(180, 180).png().toFile(path.join(root, 'apple-touch-icon.png'));
const png32 = await sharp(Buffer.from(svg)).resize(32, 32).png().toBuffer();
const hdr = Buffer.alloc(22);
hdr.writeUInt16LE(0, 0); hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(1, 4);
hdr.writeUInt8(32, 6); hdr.writeUInt8(32, 7); hdr.writeUInt16LE(1, 10); hdr.writeUInt16LE(32, 12);
hdr.writeUInt32LE(png32.length, 14); hdr.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(root, 'favicon.ico'), Buffer.concat([hdr, png32]));

// Open Graph 1200x630
const hero = fs.readFileSync(path.join(root, 'img/hero-800.webp')).toString('base64');
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<!doctype html><meta charset="utf-8"><style>
 @font-face{font-family:C;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(root,'fonts/cormorant-cyrillic-wght-normal.woff2')).toString('base64')});unicode-range:U+0400-04FF;font-weight:300 700}
 body{margin:0;width:1200px;height:630px;background:#fbf6f3;display:flex;font-family:C,Georgia,serif;color:#2d2326;overflow:hidden}
 .t{flex:1;padding:70px 60px 70px 80px;display:flex;flex-direction:column;justify-content:center}
 .e{font:700 22px sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#a8405e;margin-bottom:22px}
 h1{font-size:104px;line-height:1;margin:0;font-weight:600} p{font-size:38px;margin:26px 0 0;color:#66565a;font-family:C,Georgia,serif}
 .p{width:470px;margin:50px 70px 50px 0;border-radius:235px 235px 24px 24px;background:url(data:image/webp;base64,${hero}) center/cover}
</style><div class="t"><div class="e">Мастер маникюра · Москва</div><h1>Мария Светлова</h1><p>Запись онлайн за минуту</p></div><div class="p"></div>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(root, 'img/og-image.jpg'), type: 'jpeg', quality: 86 });
await browser.close();
console.log('assets ready');
