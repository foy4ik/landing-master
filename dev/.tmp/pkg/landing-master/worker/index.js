/**
 * Cloudflare Worker: принимает заявку с сайта и отправляет её в Telegram.
 *
 * Для статического хостинга (GitHub Pages и подобных), где нет PHP.
 * Токен бота хранится в секретах Cloudflare (BOT_TOKEN) и не попадает в браузер.
 * Настройки — в wrangler.toml, инструкция — в README.md, раздел «GitHub Pages + Cloudflare Worker».
 *
 * Правила проверки совпадают с send.php.
 */

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

// Запасное ограничение частоты в памяти. Работает в пределах одного экземпляра Worker:
// это «лучше чем ничего»; надёжный лимит даёт привязка RATE_LIMITER (см. wrangler.toml).
const memoryHits = new Map();

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Убирает управляющие символы и обрезает по длине (по символам, не по байтам). */
export function clean(value, maxLength, multiline = false) {
  // Управляющие символы заменяем пробелом; переводы строк оставляем, если разрешено
  const pattern = multiline ? /[^\P{C}\n]+/gu : /\p{C}+/gu;
  const s = String(value ?? "").replace(pattern, " ").trim();
  return Array.from(s).slice(0, maxLength).join("");
}

function parseList(value) {
  return String(value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function corsHeaders(origin, allowed) {
  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
  }
  return { Vary: "Origin" };
}

async function isRateLimited(env, ip, max, windowSec) {
  if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === "function") {
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    return !success;
  }
  const now = Date.now();
  const hits = (memoryHits.get(ip) || []).filter((t) => t > now - windowSec * 1000);
  const limited = hits.length >= max;
  if (!limited) hits.push(now);
  memoryHits.set(ip, hits);
  if (memoryHits.size > 5000) memoryHits.clear(); // не даём памяти расти бесконечно
  return limited;
}

function buildMessage({ name, phone, service, comment }, timezone) {
  let date;
  try {
    date = new Intl.DateTimeFormat("ru-RU", {
      timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date()).replace(",", "");
  } catch {
    date = new Date().toISOString();
  }
  const lines = [
    "🆕 <b>Новая заявка с сайта</b>",
    "",
    `👤 <b>Имя:</b> ${escapeHtml(name)}`,
    `📞 <b>Телефон:</b> ${escapeHtml(phone)}`,
    `💅 <b>Услуга:</b> ${escapeHtml(service || "—")}`,
  ];
  if (comment) lines.push(`💬 <b>Комментарий:</b> ${escapeHtml(comment)}`);
  lines.push(`🕒 ${date}`);
  return lines.join("\n");
}

async function sendToTelegram(env, text) {
  const base = String(env.TELEGRAM_API || "https://api.telegram.org").replace(/\/+$/, "");
  const url = `${base}/bot${env.BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.CHAT_ID,
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 200 && data.ok === true) return true;
    console.error(`telegram answered ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  } catch (err) {
    console.error(`telegram request failed: ${String(err && err.message).replace(env.BOT_TOKEN, "***")}`);
  }
  return false;
}

export async function handleRequest(request, env) {
  const allowed = parseList(env.ALLOWED_ORIGINS);
  const origin = request.headers.get("Origin") || "";
  const cors = corsHeaders(origin, allowed);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: allowed.includes(origin) ? 204 : 403, headers: cors });
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" }, { ...cors, Allow: "POST, OPTIONS" });
  }
  if (!env.BOT_TOKEN || !env.CHAT_ID || allowed.length === 0) {
    console.error("Worker is not configured: BOT_TOKEN, CHAT_ID and ALLOWED_ORIGINS are required");
    return json(500, { ok: false, error: "not_configured" }, cors);
  }
  if (!allowed.includes(origin)) {
    return json(403, { ok: false, error: "forbidden_origin" }, cors);
  }

  let input;
  try {
    const raw = await request.text();
    if (raw.length > 20000) return json(413, { ok: false, error: "too_large" }, cors);
    input = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: "bad_request" }, cors);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return json(400, { ok: false, error: "bad_request" }, cors);
  }

  // Поле-ловушка: робот заполнил скрытое поле — отвечаем «успех», но ничего не отправляем
  if (String(input.website ?? "").trim() !== "") return json(200, { ok: true }, cors);

  // Минимальное время заполнения
  const minFill = Number(env.MIN_FILL_SECONDS ?? 3);
  const elapsed = Number(input.elapsed);
  if (!Number.isFinite(elapsed) || elapsed < minFill * 1000) {
    return json(422, { ok: false, error: "too_fast" }, cors);
  }

  const name = clean(input.name, 80);
  const phone = clean(input.phone, 30);
  const digits = phone.replace(/\D+/g, "");
  const service = clean(input.service, 100);
  const comment = clean(input.comment, 1000, true);
  const c = input.consent;
  const consentOk = c === true || c === "true" || c === "on" || c === "1" || c === 1;

  if (Array.from(name).length < 2) return json(422, { ok: false, error: "invalid_name" }, cors);
  if (digits.length < 10 || digits.length > 15) return json(422, { ok: false, error: "invalid_phone" }, cors);
  if (!consentOk) return json(422, { ok: false, error: "consent_required" }, cors);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const max = Number(env.RATE_LIMIT_MAX ?? 3);
  const windowSec = Number(env.RATE_LIMIT_WINDOW ?? 600);
  if (await isRateLimited(env, ip, max, windowSec)) {
    return json(429, { ok: false, error: "rate_limited" }, cors);
  }

  const text = buildMessage({ name, phone, service, comment }, env.TIMEZONE || "Europe/Moscow");
  const sent = await sendToTelegram(env, text);
  return sent ? json(200, { ok: true }, cors) : json(502, { ok: false, error: "telegram_failed" }, cors);
}

export default {
  fetch: handleRequest,
};
