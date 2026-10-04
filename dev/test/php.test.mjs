// send.php tested in Docker (php:<version>-cli built-in server) against the fake Telegram API.
// Docker is needed only for this local check; buyers do not need it.
import { after, before, describe } from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startFakeTelegram } from './fake-telegram.mjs';
import { defineSuite } from './suite.mjs';
import { httpCaller, waitFor } from './http-caller.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const tmp = path.resolve(import.meta.dirname, '../.tmp');
fs.mkdirSync(tmp, { recursive: true });
const ORIGIN = 'https://master.example';
const TOKEN = '123456:FAKE-TOKEN';
const versions = (process.env.PHP_VERSIONS || '7.4,8.3').split(',');

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const fake = await startFakeTelegram({ token: TOKEN });
after(() => fake.close());

let n = 0;
for (const version of versions) {
  const port = 18080 + n++;
  const name = `landing-master-php-test-${version.replace('.', '')}`;
  const cfgFile = path.join(tmp, `config-${version}.php`);
  fs.writeFileSync(cfgFile, `<?php return [
    'bot_token' => '${TOKEN}', 'chat_id' => '555001',
    'allowed_origins' => ['${ORIGIN}'],
    'min_fill_seconds' => 3, 'rate_limit_max' => 3, 'rate_limit_window' => 600,
    'telegram_api' => 'http://host.docker.internal:${fake.port}',
    'storage_dir' => '/tmp/rl-test', 'ip_header' => 'HTTP_X_TEST_IP',
  ];\n`);

  describe(`send.php on PHP ${version}`, () => {
    before(async () => {
      try { docker('rm', '-f', name); } catch { /* not running */ }
      docker('run', '-d', '--name', name, '-p', `127.0.0.1:${port}:8000`,
        '--add-host', 'host.docker.internal:host-gateway',
        '-v', `${root}:/app:ro`, '-v', `${cfgFile}:/cfg/config.php:ro`,
        '-e', 'LANDING_CONFIG=/cfg/config.php',
        `php:${version}-cli`, 'php', '-S', '0.0.0.0:8000', '-t', '/app');
      await waitFor(`http://127.0.0.1:${port}/index.html`);
    });
    after(() => { try { docker('rm', '-f', name); } catch { /* ignore */ } });

    defineSuite(`PHP ${version}`, {
      fake, token: TOKEN, chatId: '555001', origin: ORIGIN,
      call: (payload, opts) => httpCaller(`http://127.0.0.1:${port}/send.php`, 'X-Test-IP', payload, opts, ORIGIN),
    });
  });
}

// Without config.php the handler must answer with a clear JSON error, not a stack trace.
describe('send.php without config.php', () => {
  const name = 'landing-master-php-test-noconfig';
  const port = 18099;
  before(async () => {
    try { docker('rm', '-f', name); } catch { /* not running */ }
    docker('run', '-d', '--name', name, '-p', `127.0.0.1:${port}:8000`, '-v', `${root}:/app:ro`,
      `php:${versions[versions.length - 1]}-cli`, 'php', '-S', '0.0.0.0:8000', '-t', '/app');
    await waitFor(`http://127.0.0.1:${port}/index.html`);
  });
  after(() => { try { docker('rm', '-f', name); } catch { /* ignore */ } });
  it('returns 500 not_configured as JSON', async () => {
    const assert = (await import('node:assert/strict')).default;
    const r = await httpCaller(`http://127.0.0.1:${port}/send.php`, 'X-Test-IP', { name: 'Анна' }, {}, ORIGIN);
    assert.equal(r.status, 500);
    assert.equal(r.body.error, 'not_configured');
    assert.ok(!r.text.includes('Fatal') && !r.text.includes('Stack trace'));
  });
});
