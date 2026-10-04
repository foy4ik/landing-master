// Worker run by `wrangler dev` (real workerd runtime) and called over HTTP, against the fake Telegram API.
import { after, before, describe } from 'node:test';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { startFakeTelegram } from './fake-telegram.mjs';
import { defineSuite } from './suite.mjs';
import { httpCaller, waitFor } from './http-caller.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const ORIGIN = 'https://master.example';
const TOKEN = '123456:FAKE-TOKEN';
const PORT = 8799;
const fake = await startFakeTelegram({ token: TOKEN });
let child;

describe('wrangler dev', () => {
  before(async () => {
    const wrangler = path.join(root, 'dev/node_modules/wrangler/bin/wrangler.js');
    child = spawn(process.execPath, [wrangler, 'dev', '--local', '--port', String(PORT),
      '--var', `BOT_TOKEN:${TOKEN}`, '--var', 'CHAT_ID:555001', '--var', `ALLOWED_ORIGINS:${ORIGIN}`,
      '--var', `TELEGRAM_API:http://127.0.0.1:${fake.port}`,
      // wrangler dev does not forward the CF-Connecting-IP we send, so lift the per-IP limit here;
      // the limit itself is covered by the in-process and PHP suites.
      '--var', 'RATE_LIMIT_MAX:100000'],
    { cwd: path.join(root, 'worker'), env: { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', CI: '1', WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    await waitFor(`http://127.0.0.1:${PORT}/`, 120);
  });
  after(async () => {
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { child?.kill(); }
    await fake.close();
  });

  defineSuite('Cloudflare Worker (wrangler dev)', {
    fake, token: TOKEN, chatId: '555001', origin: ORIGIN, skipRate: true,
    call: (payload, opts) => httpCaller(`http://127.0.0.1:${PORT}/`, 'CF-Connecting-IP', payload, opts, ORIGIN),
  });
});
