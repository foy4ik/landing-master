// Static checks: secrets never reach the frontend, palette contrast, local links/images, SEO basics.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (['node_modules', '.git', 'dev', '_site', 'dist', '.wrangler'].includes(e.name)) continue;
    if (e.isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
};

describe('secrets stay out of the frontend', () => {
  const frontend = ['index.html', 'policy.html', ...walk('css'), ...walk('js'), ...walk('demo')];
  it('has no Telegram bot token or API host in browser files', () => {
    for (const f of frontend) {
      const text = read(f);
      assert.ok(!/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/.test(text), `token-like string in ${f}`);
      assert.ok(!/api\.telegram\.org/.test(text), `Telegram API host in ${f}`);
      assert.ok(!/bot_token|BOT_TOKEN/.test(text), `token variable in ${f}`);
    }
  });
  it('keeps the real config out of git and ships only an example', () => {
    const ignore = read('.gitignore');
    assert.match(ignore, /^\/config\.php$/m);
    assert.match(ignore, /^\.env$/m);
    assert.match(ignore, /^\.dev\.vars$/m);
    assert.ok(!fs.existsSync(path.join(root, 'config.php')), 'config.php must not exist in the repo folder');
    assert.match(read('config.example.php'), /ВСТАВЬТЕ_ТОКЕН_БОТА/);
    assert.ok(!/\d{6,12}:[A-Za-z0-9_-]{30,}/.test(read('config.example.php')));
    assert.ok(!/\d{6,12}:[A-Za-z0-9_-]{30,}/.test(read('worker/wrangler.toml')));
    assert.match(read('.htaccess'), /config/);
  });
  it('does not track secrets in git', async () => {
    const { execFileSync } = await import('node:child_process');
    const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
    for (const f of files) {
      assert.ok(!/(^|\/)(config\.php|\.env|\.dev\.vars)$/.test(f), `tracked secret file: ${f}`);
      assert.ok(!/\.(sqlite3?|db|session)$/.test(f), `tracked database: ${f}`);
    }
  });
});

describe('palette contrast (WCAG AA 4.5:1 for text)', () => {
  const css = read('css/style.css');
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = (h) => {
    const [r, g, b] = hex(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const pairs = [
    ['text', 'bg'], ['text', 'bg-alt'], ['text', 'surface'], ['text', 'accent-soft'],
    ['muted', 'bg'], ['muted', 'bg-alt'], ['muted', 'surface'], ['muted', 'accent-soft'],
    ['accent', 'bg'], ['accent', 'bg-alt'], ['accent', 'surface'], ['accent', 'accent-soft'],
    ['on-accent', 'accent'],
  ];
  for (const palette of ['soft', 'strict', 'bright']) {
    const block = css.match(new RegExp(`:root\\[data-palette="${palette}"\\]\\s*\\{([^}]*)\\}`))[1];
    const vars = {};
    for (const m of block.matchAll(/--([\w-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi)) vars[m[1]] = [m[2], m[3]];
    for (const [i, theme] of ['light', 'dark'].entries()) {
      it(`${palette} / ${theme}`, () => {
        for (const [fg, bg] of pairs) {
          const r = ratio(vars[fg][i], vars[bg][i]);
          assert.ok(r >= 4.5, `${fg} on ${bg}: ${r.toFixed(2)} (${vars[fg][i]} / ${vars[bg][i]})`);
        }
      });
    }
  }
});

describe('markup hygiene', () => {
  const raw = read('index.html');
  const html = raw.replace(/<!--[\s\S]*?-->/g, ''); // examples inside comments do not count
  it('every local href/src exists', () => {
    for (const m of html.matchAll(/(?:href|src|data-src)="([^"#]+)"/g)) {
      const url = m[1];
      if (/^(https?:|tel:|mailto:|data:)/.test(url)) continue;
      assert.ok(fs.existsSync(path.join(root, url.split('?')[0])), `missing file: ${url}`);
    }
    for (const m of html.matchAll(/(?:imagesrcset|srcset)="([^"]+)"/g)) {
      for (const part of m[1].split(',')) {
        const url = part.trim().split(/\s+/)[0];
        assert.ok(fs.existsSync(path.join(root, url)), `missing srcset file: ${url}`);
      }
    }
  });
  it('every image has alt text and dimensions', () => {
    for (const m of html.matchAll(/<img\b[^>]*>/g)) {
      assert.match(m[0], /\balt="[^"]+"/, m[0]);
      assert.match(m[0], /\bwidth="\d+"/, m[0]);
      assert.match(m[0], /\bheight="\d+"/, m[0]);
    }
  });
  it('has SEO essentials', () => {
    for (const re of [/<title>[^<]{10,}/, /<meta name="description" content="[^"]{50,}/, /og:title/, /og:description/, /og:image"/, /twitter:card/, /rel="canonical"/, /rel="icon"/, /application\/ld\+json/, /<html lang="ru"/]) {
      assert.match(html, re);
    }
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(ld['@context'], 'https://schema.org');
    assert.ok(['BeautySalon', 'LocalBusiness', 'Person'].includes(ld['@type']));
  });
  it('marks editable places with РЕДАКТИРОВАТЬ comments and the palette attribute', () => {
    assert.ok((raw.match(/РЕДАКТИРОВАТЬ:/g) || []).length >= 15);
    assert.match(raw, /<html lang="ru" data-palette="soft">/);
  });
  it('page has one h1 and unique ids', () => {
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length);
  });
  it('has no external scripts, fonts or CDN dependencies', () => {
    assert.ok(!/<script[^>]+src="https?:/.test(html));
    assert.ok(!/<link[^>]+href="https?:\/\/(fonts|cdn)/.test(html));
    assert.ok(!/@import|url\(https?:/.test(read('css/style.css')));
  });
  it('policy.html has fill-in fields', () => {
    const p = read('policy.html');
    assert.ok((p.match(/class="fill"/g) || []).length >= 8);

  });
  it('config.js exposes the endpoint, metrika id and demo flag', () => {
    const cfg = read('js/config.js');
    assert.match(cfg, /formEndpoint: "send\.php"/);
    assert.match(cfg, /metrikaId: 0/);
    assert.match(cfg, /demo: false/);
  });
});
