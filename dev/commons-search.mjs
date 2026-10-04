// Dev helper: search Wikimedia Commons for freely licensed images.
const q = process.argv[2];
const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
  action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '30',
  gsrsearch: q + ' filetype:bitmap', prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '400', origin: '*'
});
const r = await (await fetch(url, { headers: { 'User-Agent': 'landing-master-dev/1.0 (dmitriyfilatov3@gmail.com)' } })).json();
for (const p of Object.values(r.query?.pages || {})) {
  const i = p.imageinfo?.[0]; if (!i) continue;
  const m = i.extmetadata || {};
  console.log([p.title, `${i.width}x${i.height}`, m.LicenseShortName?.value, (m.Artist?.value||'').replace(/<[^>]+>/g,'').slice(0,40)].join(' | '));
}
