// Dev: Lighthouse (mobile, default throttling) against the real site and the demo build.
// Usage: node lighthouse.mjs [url-path] ...   Scores must be >= 90 in all four categories.
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(import.meta.dirname, '.lighthouse');
fs.mkdirSync(out, { recursive: true });
execFileSync('bash', ['scripts/build-demo.sh'], { cwd: root, stdio: 'ignore' });
const s1 = await serve(root, 8201);
const s2 = await serve(path.join(root, '_site'), 8202);
const targets = [['site', 'http://127.0.0.1:8201/index.html'], ['demo', 'http://127.0.0.1:8202/index.html'], ['policy', 'http://127.0.0.1:8201/policy.html']];
const chrome = await chromium.launch({ args: ['--remote-debugging-port=9333'] });
let failed = false;
for (const [name, url] of targets) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const r = await lighthouse(url, { port: 9333, output: 'json', logLevel: 'error' });
    runs.push(r.lhr);
  }
  const scores = runs.map((l) => Object.fromEntries(Object.entries(l.categories).map(([k, v]) => [k, Math.round(v.score * 100)])));
  const worst = {};
  for (const k of Object.keys(scores[0])) worst[k] = Math.min(...scores.map((s) => s[k]));
  const m = runs[1].audits;
  console.log(name, 'worst-of-3', JSON.stringify(worst),
    `FCP ${m['first-contentful-paint'].displayValue} LCP ${m['largest-contentful-paint'].displayValue} TBT ${m['total-blocking-time'].displayValue} CLS ${m['cumulative-layout-shift'].displayValue}`);
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(runs[1], null, 1));
  if (Object.values(worst).some((v) => v < 90)) {
    failed = true;
    for (const l of runs.slice(0, 1)) for (const a of Object.values(l.audits)) {
      if (a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable') console.log('  audit', a.id, a.score, a.displayValue || '');
    }
  }
}
await chrome.close(); s1.close(); s2.close();
process.exit(failed ? 1 : 0);
