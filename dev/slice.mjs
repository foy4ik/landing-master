import sharp from 'sharp';
const [,, file, chunkH, outPrefix] = process.argv;
const m = await sharp(file).metadata();
const h = Number(chunkH); let i = 0;
for (let y = 0; y < m.height; y += h, i++) {
  await sharp(file).extract({ left: 0, top: y, width: m.width, height: Math.min(h, m.height - y) }).toFile(`${outPrefix}-${i}.png`);
}
console.log(m.width, m.height, i, 'chunks');
