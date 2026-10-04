// Shared behaviour suite for both form handlers (send.php and the Cloudflare Worker).
// `call(payload, opts)` -> { status, body, headers }; `fake` is the fake Telegram state.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let ipCounter = 0;
const freshIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;
const valid = (over = {}) => ({
  name: 'Анна', phone: '+7 (912) 345-67-89', service: 'Маникюр с гель-лаком',
  comment: 'После 18:00', consent: true, website: '', elapsed: 8000, ...over,
});

export function defineSuite(label, ctx) {
  const { fake, call, token, chatId, origin, skipRate } = ctx;
  describe(label, () => {
    beforeEach(() => fake.reset());

    it('accepts a valid lead and sends one Telegram message', async () => {
      const r = await call(valid(), { ip: freshIp() });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, { ok: true });
      assert.equal(fake.calls.length, 1);
      const { token: usedToken, params } = fake.calls[0];
      assert.equal(usedToken, token);
      assert.equal(String(params.chat_id), String(chatId));
      assert.equal(params.parse_mode, 'HTML');
      for (const part of ['Анна', '+7 (912) 345-67-89', 'Маникюр с гель-лаком', 'После 18:00']) {
        assert.ok(params.text.includes(part), `message should include ${part}`);
      }
    });

    it('never leaks the bot token to the client', async () => {
      const ok = await call(valid(), { ip: freshIp() });
      fake.mode = 'fail';
      const bad = await call(valid(), { ip: freshIp() });
      for (const r of [ok, bad]) {
        assert.ok(!JSON.stringify(r.body).includes(token));
        assert.ok(!JSON.stringify(r.headers).includes(token));
      }
    });

    it('escapes HTML and special characters from the form', async () => {
      const r = await call(valid({
        name: '<b>Хакер</b> & <script>alert(1)</script>',
        comment: 'a < b && c > d <a href="x">link</a>',
        service: '"><img src=x onerror=1>',
      }), { ip: freshIp() });
      // The fake API rejects unescaped markup exactly like Telegram would (400).
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const text = fake.calls[0].params.text;
      assert.ok(text.includes('&lt;script&gt;'));
      assert.ok(!text.includes('<script>'));
      assert.ok(!text.includes('<img'));
      assert.ok(text.includes('&amp;'));
    });

    it('strips control characters, keeps newlines in comment, trims length', async () => {
      const r = await call(valid({ comment: 'line1\nline2\u0000\u0007' + 'x'.repeat(2000), name: 'Ан\u0000на' }), { ip: freshIp() });
      assert.equal(r.status, 200);
      const text = fake.calls[0].params.text;
      assert.ok(text.includes('line1\nline2'));
      assert.ok(!/[\u0000\u0007]/.test(text));
      assert.ok(text.length < 1500);
    });

    it('silently drops honeypot submissions (fake success, no Telegram call)', async () => {
      const r = await call(valid({ website: 'http://spam.example' }), { ip: freshIp() });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, { ok: true });
      assert.equal(fake.calls.length, 0);
    });

    it('rejects forms filled faster than the minimum time', async () => {
      for (const elapsed of [0, 500, 2999, undefined, 'abc']) {
        const r = await call(valid({ elapsed }), { ip: freshIp() });
        assert.equal(r.status, 422, `elapsed=${elapsed}`);
        assert.equal(r.body.error, 'too_fast');
      }
      assert.equal(fake.calls.length, 0);
    });

    it('requires consent', async () => {
      for (const consent of [false, undefined, 'no', 0]) {
        const r = await call(valid({ consent }), { ip: freshIp() });
        assert.equal(r.status, 422);
        assert.equal(r.body.error, 'consent_required');
      }
      assert.equal(fake.calls.length, 0);
    });

    it('validates name and phone', async () => {
      assert.equal((await call(valid({ name: 'А' }), { ip: freshIp() })).body.error, 'invalid_name');
      assert.equal((await call(valid({ name: '   ' }), { ip: freshIp() })).body.error, 'invalid_name');
      assert.equal((await call(valid({ phone: '123' }), { ip: freshIp() })).body.error, 'invalid_phone');
      assert.equal((await call(valid({ phone: 'abcdefghijk' }), { ip: freshIp() })).body.error, 'invalid_phone');
      assert.equal((await call(valid({ phone: '1'.repeat(20) }), { ip: freshIp() })).body.error, 'invalid_phone');
      assert.equal(fake.calls.length, 0);
    });

    it('limits request rate per IP (4th request in a row gets 429)', { skip: skipRate }, async () => {
      const ip = freshIp();
      const statuses = [];
      for (let i = 0; i < 4; i++) statuses.push((await call(valid(), { ip })).status);
      assert.deepEqual(statuses, [200, 200, 200, 429]);
      assert.equal(fake.calls.length, 3);
      // Another visitor is not affected
      assert.equal((await call(valid(), { ip: freshIp() })).status, 200);
    });

    it('answers 502 when Telegram fails, without leaking details', async () => {
      fake.mode = 'fail';
      const r = await call(valid(), { ip: freshIp() });
      assert.equal(r.status, 502);
      assert.equal(r.body.error, 'telegram_failed');
      fake.mode = 'garbage';
      assert.equal((await call(valid(), { ip: freshIp() })).status, 502);
    });

    it('rejects GET and malformed bodies', async () => {
      assert.equal((await call(null, { method: 'GET', ip: freshIp() })).status, 405);
      assert.equal((await call('{not json', { raw: true, ip: freshIp() })).status, 400);
      assert.equal((await call('[1,2,3]', { raw: true, ip: freshIp() })).status, 400);
      assert.equal(fake.calls.length, 0);
    });

    it('rejects foreign origins', async () => {
      const r = await call(valid(), { ip: freshIp(), origin: 'https://evil.example' });
      assert.equal(r.status, 403);
      assert.equal(r.body.error, 'forbidden_origin');
      assert.equal(fake.calls.length, 0);
    });

    it('answers CORS preflight for the allowed origin only', async () => {
      const okPre = await call(null, { method: 'OPTIONS', ip: freshIp(), origin });
      assert.equal(okPre.status, 204);
      assert.equal(okPre.headers['access-control-allow-origin'], origin);
      assert.match(okPre.headers['access-control-allow-methods'], /POST/);
      const badPre = await call(null, { method: 'OPTIONS', ip: freshIp(), origin: 'https://evil.example' });
      assert.ok(badPre.headers['access-control-allow-origin'] === undefined);
    });

    it('adds CORS headers to the real response for the allowed origin', async () => {
      const r = await call(valid(), { ip: freshIp(), origin });
      assert.equal(r.status, 200);
      assert.equal(r.headers['access-control-allow-origin'], origin);
    });
  });
}
