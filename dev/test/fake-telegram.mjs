// Fake Telegram Bot API for tests. Mimics POST /bot<token>/sendMessage and
// rejects HTML that real Telegram would reject (unsupported tags / unescaped "<").
import http from 'node:http';

const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'a', 'tg-spoiler', 'span', 'tg-emoji', 'blockquote']);

export function validateTelegramHtml(text) {
  // Every "<" must start an allowed tag; every "&" must be a valid entity.
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)?>/g;
  const stripped = text.replace(tagRe, (m, tag) => {
    if (!ALLOWED_TAGS.has(tag.toLowerCase())) throw new Error(`Unsupported start tag "${tag}"`);
    return '';
  });
  if (/[<>]/.test(stripped)) throw new Error("Can't parse entities: unescaped < or >");
  if (/&(?!(amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/i.test(stripped)) throw new Error("Can't parse entities: unescaped &");
}

export async function startFakeTelegram({ token = '123456:FAKE-TOKEN' } = {}) {
  const state = { calls: [], mode: 'ok', token };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      const m = req.url.match(/^\/bot([^/]+)\/sendMessage$/);
      if (!m) return send(404, { ok: false, error_code: 404, description: 'Not Found' });
      let params;
      try {
        params = (req.headers['content-type'] || '').includes('json') ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body));
      } catch { return send(400, { ok: false, error_code: 400, description: 'Bad Request' }); }
      state.calls.push({ token: m[1], params });
      if (m[1] !== state.token) return send(401, { ok: false, error_code: 401, description: 'Unauthorized' });
      if (state.mode === 'fail') return send(500, { ok: false, error_code: 500, description: 'Internal Server Error' });
      if (state.mode === 'garbage') { res.writeHead(200); return res.end('<html>not json</html>'); }
      if (!params.chat_id || !params.text) return send(400, { ok: false, error_code: 400, description: 'Bad Request: chat_id/text is empty' });
      if (String(params.text).length > 4096) return send(400, { ok: false, error_code: 400, description: 'Bad Request: message is too long' });
      if (params.parse_mode === 'HTML') {
        try { validateTelegramHtml(String(params.text)); }
        catch (e) { return send(400, { ok: false, error_code: 400, description: `Bad Request: can't parse entities: ${e.message}` }); }
      }
      send(200, { ok: true, result: { message_id: state.calls.length, chat: { id: params.chat_id }, text: params.text } });
    });
  });
  await new Promise((r) => server.listen(0, '0.0.0.0', r));
  state.port = server.address().port;
  state.close = () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
  state.reset = () => { state.calls.length = 0; state.mode = 'ok'; };
  return state;
}
