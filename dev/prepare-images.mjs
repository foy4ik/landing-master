// Dev helper: downloads freely licensed photos from Wikimedia Commons,
// optimises them to webp into ../img and writes ../img/CREDITS.md.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const UA = { 'User-Agent': 'landing-master-dev/1.0 (dmitriyfilatov3@gmail.com)' };
const root = path.resolve(import.meta.dirname, '..');
const cache = path.join(import.meta.dirname, '.cache');
fs.mkdirSync(cache, { recursive: true });
fs.mkdirSync(path.join(root, 'img/works'), { recursive: true });

// slug -> Commons file name
const photos = {
  hero: 'Acrylic nail art with crystal.jpg',
  about: 'Nail art kit (1).jpg',
  w1: 'Dark violete nail polish and shimmer.jpg',
  w2: 'Pink nail colour.jpg',
  w3: 'Nail art - Glitter Diamond.jpg',
  w4: 'Green nail colour.jpg',
  w5: 'Red nail polish (4149676692).jpg',
  w6: 'Nail art with stripes.jpg',
  w7: 'Polished purple nails with nail art on.jpg',
  w8: 'Flower nail art.jpg',
};

async function meta(title) {
  const u = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', titles: 'File:' + title, prop: 'imageinfo',
    iiprop: 'url|extmetadata|size', origin: '*' });
  const r = await (await fetch(u, { headers: UA })).json();
  const i = Object.values(r.query.pages)[0].imageinfo[0];
  const m = i.extmetadata;
  const strip = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return {
    title, width: i.width, height: i.height,
    page: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(title.replace(/ /g, '_')),
    author: strip(m.Artist?.value), license: strip(m.LicenseShortName?.value),
    licenseUrl: m.LicenseUrl?.value || '',
  };
}

async function fetchOriginal(slug, title, width) {
  const f = path.join(cache, slug + '.jpg');
  if (fs.existsSync(f)) return fs.readFileSync(f);
  const url = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(title) + '?width=' + width;
  const r = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!r.ok) throw new Error(slug + ' ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(f, buf);
  return buf;
}

const credits = [];
for (const [slug, title] of Object.entries(photos)) {
  const info = await meta(title);
  credits.push({ slug, ...info });
  const buf = await fetchOriginal(slug, title, 1800);
  const out = (p) => path.join(root, 'img', p);
  if (slug === 'hero') {
    // portrait 4:5, three widths
    for (const w of [480, 800, 1100]) {
      await sharp(buf).resize(w, Math.round(w * 1.25), { fit: 'cover', position: 'attention' }).webp({ quality: 74 }).toFile(out(`hero-${w}.webp`));
    }
  } else if (slug === 'about') {
    for (const w of [480, 800]) {
      await sharp(buf).resize(w, Math.round(w * 0.8), { fit: 'cover', position: 'attention' }).webp({ quality: 74 }).toFile(out(`about-${w}.webp`));
    }
  } else {
    await sharp(buf).resize(1400, 1400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(out(`works/${slug}.webp`));
    await sharp(buf).resize(640, 640, { fit: 'cover', position: 'attention' }).webp({ quality: 72 }).toFile(out(`works/${slug}-thumb.webp`));
  }
  console.log('ok', slug, info.license, '-', info.author);
}
fs.writeFileSync(path.join(import.meta.dirname, '.cache/credits.json'), JSON.stringify(credits, null, 2));

const md = ['# Источники фото', '',
  'Фото в этой папке — демонстрационные, с Wikimedia Commons под свободными лицензиями.',
  '**Перед запуском своего сайта замените их на свои фотографии** (см. README, раздел «Как заменить фото»).',
  'Если оставляете чужие фото, обязательно сохраните указание авторства ниже.', '',
  '| Файл | Автор | Лицензия | Источник |', '| --- | --- | --- | --- |'];
const names = { hero: 'hero-*.webp', about: 'about-*.webp' };
for (const c of credits) {
  const f = names[c.slug] || `works/${c.slug}*.webp`;
  md.push(`| ${f} | ${c.author || '—'} | ${c.license} | [${c.title}](${c.page}) |`);
}
fs.writeFileSync(path.join(root, 'img/CREDITS.md'), md.join('\n') + '\n');
