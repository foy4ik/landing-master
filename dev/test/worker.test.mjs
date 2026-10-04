// Worker handler tested in-process against the fake Telegram API.
import { after, before } from 'node:test';
import { startFakeTelegram } from './fake-telegram.mjs';
import { defineSuite } from './suite.mjs';
import { handleRequest } from '../../worker/index.js';

const ORIGIN = 'https://master.example';
const TOKEN = '123456:FAKE-TOKEN';
const fake = await startFakeTelegram({ token: TOKEN });
const env = {
  BOT_TOKEN: TOKEN, CHAT_ID: '555001', ALLOWED_ORIGINS: `${ORIGIN},https://www.master.example`,
  TELEGRAM_API: `http://127.0.0.1:${fake.port}`, MIN_FILL_SECONDS: '3', RATE_LIMIT_MAX: '3', RATE_LIMIT_WINDOW: '600',
};
after(() => fake.close());

async function call(payload, { method = 'POST', ip = '1.1.1.1', origin = ORIGIN, raw = false } = {}) {
  const headers = { 'CF-Connecting-IP': ip, Origin: origin };
  const init = { method, headers };
  if (method === 'POST') { headers['Content-Type'] = 'application/json'; init.body = raw ? payload : JSON.stringify(payload); }
  const res = await handleRequest(new Request('https://landing-form.example.workers.dev/', init), env);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* empty body */ }
  return { status: res.status, body, headers: Object.fromEntries(res.headers) };
}

defineSuite('Cloudflare Worker (in-process)', { fake, call, token: TOKEN, chatId: env.CHAT_ID, origin: ORIGIN });

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
describe('Worker configuration', () => {
  it('answers 500 not_configured without token/chat/origins', async () => {
    const res = await handleRequest(new Request('https://x.example/', { method: 'POST', headers: { Origin: ORIGIN }, body: '{}' }), { ALLOWED_ORIGINS: ORIGIN });
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, 'not_configured');
  });
  it('uses the RATE_LIMITER binding when present', async () => {
    const seen = [];
    const env2 = { ...env, RATE_LIMITER: { limit: async ({ key }) => { seen.push(key); return { success: false }; } } };
    const res = await handleRequest(new Request('https://x.example/', {
      method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': '9.9.9.9', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Анна', phone: '+79123456789', consent: true, elapsed: 9000 }),
    }), env2);
    assert.equal(res.status, 429);
    assert.deepEqual(seen, ['9.9.9.9']);
  });
});
