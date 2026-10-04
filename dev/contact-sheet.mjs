import sharp from 'sharp';
import fs from 'node:fs';
const names = fs.readFileSync(process.argv[2], 'utf8').split('\n').map(s=>s.trim()).filter(Boolean);
const out = process.argv[3];
const tiles = [];
let idx = 0;
for (const n of names) {
  const url = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(n.replace(/^File:/,'')) + '?width=360';
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'landing-master-dev/1.0 (dmitriyfilatov3@gmail.com)' }, redirect: 'follow' });
    if (!r.ok) { console.log('fail', n, r.status); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    const t = await sharp(buf).resize(300, 300, { fit: 'cover' }).jpeg().toBuffer();
    tiles.push({ input: t, left: (idx % 6) * 300, top: Math.floor(idx / 6) * 300 });
    console.log(idx, n); idx++;
  } catch (e) { console.log('err', n, e.message); }
}
const rows = Math.ceil(idx / 6);
await sharp({ create: { width: 1800, height: rows * 300, channels: 3, background: '#fff' } }).composite(tiles).jpeg({quality:80}).toFile(out);
