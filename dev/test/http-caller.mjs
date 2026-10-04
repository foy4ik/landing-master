// HTTP caller shared by the PHP (docker) and wrangler dev suites.
export async function httpCaller(url, ipHeader, payload, { method = 'POST', ip = '1.1.1.1', origin, raw = false } = {}, defaultOrigin) {
  const headers = { [ipHeader]: ip, Origin: origin ?? defaultOrigin };
  const init = { method, headers };
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    init.body = raw ? payload : JSON.stringify(payload);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* empty body */ }
  return { status: res.status, body, headers: Object.fromEntries(res.headers), text };
}

export async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); await r.arrayBuffer(); if (r.status < 500) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start: ' + url);
}
