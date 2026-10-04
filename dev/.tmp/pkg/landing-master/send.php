<?php
/**
 * Обработчик формы заявки: принимает данные с сайта и отправляет их в Telegram.
 *
 * Токен бота лежит в config.php (на сервере) и никогда не попадает в браузер.
 * Менять в этом файле ничего не нужно: все настройки — в config.php.
 * Подробности — в README.md, раздел «Хостинг с PHP».
 *
 * Требуется PHP 7.4 или новее с расширением curl (или allow_url_fopen).
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

/** Отправляет JSON-ответ и завершает работу. */
function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Пишет в журнал ошибок сервера, предварительно вычистив токен. */
function log_error(string $message, array $config): void
{
    $token = (string)($config['bot_token'] ?? '');
    if ($token !== '') {
        $message = str_replace($token, '***', $message);
    }
    error_log('[landing-master] ' . $message);
}

/** Ищет config.php: путь из переменной окружения, рядом с файлом или на уровень выше (вне публичной папки). */
function load_config(): ?array
{
    $candidates = [];
    $env = getenv('LANDING_CONFIG');
    if (is_string($env) && $env !== '') {
        $candidates[] = $env;
    }
    $candidates[] = __DIR__ . '/config.php';
    $candidates[] = dirname(__DIR__) . '/config.php';
    foreach ($candidates as $path) {
        if (is_file($path)) {
            $config = require $path;
            return is_array($config) ? $config : null;
        }
    }
    return null;
}

/** Убирает управляющие символы; переводы строк оставляет только если разрешено. */
function clean(string $value, int $maxLength, bool $multiline = false): string
{
    $pattern = $multiline ? '/[^\P{C}\n]+/u' : '/\p{C}+/u';
    $value = preg_replace($pattern, ' ', $value) ?? '';
    $value = trim($value);
    return mb_substr($value, 0, $maxLength);
}

/** Ограничение частоты: не больше $max заявок с одного IP за $window секунд. */
function rate_limited(string $dir, string $ip, int $max, int $window): bool
{
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return false; // нет места для файлов — не блокируем, но и не падаем
    }
    $file = $dir . '/rl_' . hash('sha256', $ip) . '.json';
    $handle = @fopen($file, 'c+');
    if ($handle === false) {
        return false;
    }
    flock($handle, LOCK_EX);
    $raw = stream_get_contents($handle);
    $times = json_decode($raw === false || $raw === '' ? '[]' : $raw, true);
    $now = time();
    $times = array_values(array_filter(is_array($times) ? $times : [], static function ($t) use ($now, $window) {
        return is_int($t) && $t > $now - $window;
    }));
    $limited = count($times) >= $max;
    if (!$limited) {
        $times[] = $now;
    }
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($times));
    flock($handle, LOCK_UN);
    fclose($handle);
    return $limited;
}

/** Вызывает метод Telegram Bot API. Возвращает true, если Telegram ответил ok. */
function telegram_send(array $config, array $params): bool
{
    $url = rtrim((string)$config['telegram_api'], '/') . '/bot' . $config['bot_token'] . '/sendMessage';
    $body = http_build_query($params);
    $response = false;
    $status = 0;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
        ]);
        $response = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if ($response === false) {
            log_error('curl error: ' . curl_error($ch), $config);
        }
        curl_close($ch);
    } else {
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $body,
            'timeout' => 10,
            'ignore_errors' => true,
        ]]);
        $response = @file_get_contents($url, false, $context);
        if (isset($http_response_header[0]) && preg_match('~\s(\d{3})\s~', $http_response_header[0], $m)) {
            $status = (int)$m[1];
        }
    }

    if (!is_string($response)) {
        return false;
    }
    $data = json_decode($response, true);
    if ($status === 200 && is_array($data) && ($data['ok'] ?? false) === true) {
        return true;
    }
    log_error('telegram answered ' . $status . ': ' . substr($response, 0, 300), $config);
    return false;
}

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

// ---------------------------------------------------------------- запрос ----

$config = load_config();
if ($config === null || empty($config['bot_token']) || empty($config['chat_id'])
    || strpos((string)$config['bot_token'], 'ВСТАВЬТЕ') !== false) {
    error_log('[landing-master] config.php not found or bot_token/chat_id are empty');
    respond(500, ['ok' => false, 'error' => 'not_configured']);
}
$config += [
    'allowed_origins' => [],
    'min_fill_seconds' => 3,
    'rate_limit_max' => 3,
    'rate_limit_window' => 600,
    'telegram_api' => 'https://api.telegram.org',
    'storage_dir' => sys_get_temp_dir() . '/landing-master-ratelimit',
    'ip_header' => 'REMOTE_ADDR',
    'timezone' => 'Europe/Moscow',
];

// CORS: нужен только если сайт и send.php на разных адресах
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $originHost = (string)parse_url($origin, PHP_URL_HOST);
    $originPort = parse_url($origin, PHP_URL_PORT);
    $originHostPort = $originPort ? $originHost . ':' . $originPort : $originHost;
    $sameSite = strcasecmp($originHostPort, (string)($_SERVER['HTTP_HOST'] ?? '')) === 0;
    $allowed = in_array($origin, (array)$config['allowed_origins'], true);
    if (!$sameSite && !$allowed) {
        respond(403, ['ok' => false, 'error' => 'forbidden_origin']);
    }
    if ($allowed) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method !== 'POST') {
    header('Allow: POST, OPTIONS');
    respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

$raw = file_get_contents('php://input', false, null, 0, 20000);
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
if (stripos($contentType, 'application/json') !== false) {
    $input = json_decode($raw === false ? '' : $raw, true);
} else {
    $input = $_POST;
}
// Нужен объект вида {"name": ...}; обычный список [1,2,3] — не заявка
if (!is_array($input) || ($input !== [] && array_keys($input) === range(0, count($input) - 1))) {
    respond(400, ['ok' => false, 'error' => 'bad_request']);
}

// Поле-ловушка: бот заполнил скрытое поле — делаем вид, что всё хорошо, но ничего не отправляем
if (trim((string)($input['website'] ?? '')) !== '') {
    respond(200, ['ok' => true]);
}

// Минимальное время заполнения формы
$elapsed = $input['elapsed'] ?? null;
if (!is_numeric($elapsed) || (float)$elapsed < (float)$config['min_fill_seconds'] * 1000) {
    respond(422, ['ok' => false, 'error' => 'too_fast']);
}

// Проверка полей
$name = clean((string)($input['name'] ?? ''), 80);
$phoneRaw = clean((string)($input['phone'] ?? ''), 30);
$phoneDigits = preg_replace('/\D+/', '', $phoneRaw) ?? '';
$service = clean((string)($input['service'] ?? ''), 100);
$comment = clean((string)($input['comment'] ?? ''), 1000, true);
$consent = $input['consent'] ?? false;
$consentOk = $consent === true || $consent === 'true' || $consent === 'on' || $consent === '1' || $consent === 1;

if (mb_strlen($name) < 2) {
    respond(422, ['ok' => false, 'error' => 'invalid_name']);
}
if (strlen($phoneDigits) < 10 || strlen($phoneDigits) > 15) {
    respond(422, ['ok' => false, 'error' => 'invalid_phone']);
}
if (!$consentOk) {
    respond(422, ['ok' => false, 'error' => 'consent_required']);
}

// Ограничение частоты
$ip = (string)($_SERVER[$config['ip_header']] ?? ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
if (rate_limited((string)$config['storage_dir'], $ip, (int)$config['rate_limit_max'], (int)$config['rate_limit_window'])) {
    respond(429, ['ok' => false, 'error' => 'rate_limited']);
}

// Сообщение в Telegram. Всё, что ввёл посетитель, экранируется: иначе разметка Telegram сломается.
try {
    $date = (new DateTime('now', new DateTimeZone((string)$config['timezone'])))->format('d.m.Y H:i');
} catch (Exception $ex) {
    $date = date('d.m.Y H:i');
}
$lines = [
    '🆕 <b>Новая заявка с сайта</b>',
    '',
    '👤 <b>Имя:</b> ' . e($name),
    '📞 <b>Телефон:</b> ' . e($phoneRaw),
    '💅 <b>Услуга:</b> ' . e($service !== '' ? $service : '—'),
];
if ($comment !== '') {
    $lines[] = '💬 <b>Комментарий:</b> ' . e($comment);
}
$lines[] = '🕒 ' . $date;

$sent = telegram_send($config, [
    'chat_id' => $config['chat_id'],
    'text' => implode("\n", $lines),
    'parse_mode' => 'HTML',
    'link_preview_options' => json_encode(['is_disabled' => true]),
]);

if (!$sent) {
    respond(502, ['ok' => false, 'error' => 'telegram_failed']);
}
respond(200, ['ok' => true]);
