<?php
declare(strict_types=1);
/**
 * Lopes · Atualizações — API.
 *  Pública:  GET ?action=releases&app=<slug>
 *  Do painel (precisa de login): state, login, logout, setup, chunk, finish, delete, app_save, password
 */
require __DIR__ . '/lib.php';

$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Strict']);
session_name('lopes_admin');
session_start();

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$config = load('config', []);
$body = [];
if ($method === 'POST' && str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
  $body = json_decode((string) file_get_contents('php://input'), true) ?: [];
}

/* ── público ─────────────────────────────────────────────────────────────── */
if ($action === 'releases') {
  $app = (string) ($_GET['app'] ?? '');
  $list = array_values(array_filter(releases(), fn($r) => $r['app'] === $app && $r['channel'] === 'stable'));
  usort($list, fn($a, $b) => vcmp($b['version'], $a['version']));
  header('Access-Control-Allow-Origin: *');
  out(['app' => $app, 'releases' => array_map(fn($r) => ['version' => $r['version'], 'date' => $r['date'], 'notes' => $r['notes'], 'items' => parse_notes($r['notes'])], $list)]);
}

/* ── painel ──────────────────────────────────────────────────────────────── */
function logged(): bool { return !empty($_SESSION['ok']); }
function need_login(): void { if (!logged()) fail(401, 'Entre com a senha do painel.'); }
function need_csrf(): void {
  $t = $_SERVER['HTTP_X_CSRF'] ?? '';
  if (empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $t)) fail(403, 'Sessão expirada. Recarregue a página.');
}
function start_session_login(): void { session_regenerate_id(true); $_SESSION['ok'] = true; $_SESSION['csrf'] = bin2hex(random_bytes(16)); }

if ($action === 'state') {
  $needsSetup = empty($config['hash']);
  if (!logged()) out(['logged' => false, 'needsSetup' => $needsSetup]);
  if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
  $rs = releases();
  usort($rs, fn($a, $b) => strcmp($a['app'], $b['app']) ?: vcmp($b['version'], $a['version']));
  out(['logged' => true, 'csrf' => $_SESSION['csrf'], 'apps' => apps(), 'releases' => $rs]);
}

if ($method !== 'POST') fail(405, 'Método não permitido.');

if ($action === 'setup') {
  if (!empty($config['hash'])) fail(409, 'O painel já tem senha.');
  $pw = (string) ($body['password'] ?? '');
  if (strlen($pw) < 10) fail(422, 'Use uma senha de pelo menos 10 caracteres.');
  save('config', ['hash' => password_hash($pw, PASSWORD_DEFAULT)]);
  start_session_login();
  out(['ok' => true]);
}

if ($action === 'login') {
  /* freio simples contra tentativa em massa: 8 erros por IP a cada 15 minutos */
  $ip = preg_replace('/[^0-9a-f:.]/i', '', $_SERVER['REMOTE_ADDR'] ?? 'x');
  $tries = load('tries', []);
  $now = time();
  $tries = array_filter($tries, fn($l) => array_filter($l, fn($t) => $t > $now - 900));
  $mine = array_values(array_filter($tries[$ip] ?? [], fn($t) => $t > $now - 900));
  if (count($mine) >= 8) fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
  if (empty($config['hash']) || !password_verify((string) ($body['password'] ?? ''), $config['hash'])) {
    $mine[] = $now; $tries[$ip] = $mine; save('tries', $tries);
    usleep(400000);
    fail(401, 'Senha incorreta.');
  }
  unset($tries[$ip]); save('tries', $tries);
  start_session_login();
  out(['ok' => true]);
}

need_login();
need_csrf();

if ($action === 'logout') { $_SESSION = []; session_destroy(); out(['ok' => true]); }

if ($action === 'password') {
  if (!password_verify((string) ($body['current'] ?? ''), $config['hash'] ?? '')) fail(401, 'A senha atual não confere.');
  $pw = (string) ($body['password'] ?? '');
  if (strlen($pw) < 10) fail(422, 'Use uma senha de pelo menos 10 caracteres.');
  save('config', ['hash' => password_hash($pw, PASSWORD_DEFAULT)]);
  out(['ok' => true]);
}

if ($action === 'app_save') {
  $slug = (string) ($body['slug'] ?? '');
  $name = trim((string) ($body['name'] ?? ''));
  if (!valid_slug($slug)) fail(422, 'O identificador usa letras minúsculas, números e hífen (2 a 39 caracteres).');
  if ($name === '' || mb_strlen($name) > 60) fail(422, 'Dê um nome ao aplicativo.');
  $list = apps();
  $found = false;
  foreach ($list as &$a) if ($a['slug'] === $slug) { $a['name'] = $name; $a['description'] = mb_substr(trim((string) ($body['description'] ?? '')), 0, 160); $found = true; }
  unset($a);
  if (!$found) $list[] = ['slug' => $slug, 'name' => $name, 'description' => mb_substr(trim((string) ($body['description'] ?? '')), 0, 160)];
  save('apps', $list);
  out(['ok' => true]);
}

/* envio em pedaços (o limite de upload da hospedagem não importa): chunk grava, finish confere e publica */
if ($action === 'chunk') {
  $id = (string) ($_GET['id'] ?? '');
  $index = (int) ($_GET['index'] ?? -1);
  if (!preg_match('/^[a-f0-9]{16,32}$/', $id) || $index < 0) fail(422, 'Pedido inválido.');
  $dir = DATA . '/tmp';
  if (!is_dir($dir)) mkdir($dir, 0755, true);
  $part = "$dir/$id.part";
  $have = is_file($part) ? filesize($part) : 0;
  $expected = (int) ($_GET['offset'] ?? 0);
  if ($have !== $expected) fail(409, "Pedaço fora de ordem (esperado $have).");
  $in = fopen('php://input', 'rb');
  $outf = fopen($part, 'ab');
  $n = stream_copy_to_stream($in, $outf);
  fclose($in); fclose($outf);
  if ($n === false || $n === 0) fail(422, 'Pedaço vazio.');
  out(['received' => $have + $n]);
}

if ($action === 'finish') {
  $id = (string) ($body['id'] ?? '');
  $app = (string) ($body['app'] ?? '');
  $version = trim((string) ($body['version'] ?? ''));
  $channel = ($body['channel'] ?? 'stable') === 'beta' ? 'beta' : 'stable';
  $notes = trim((string) ($body['notes'] ?? ''));
  $orig = (string) ($body['filename'] ?? '');
  if (!preg_match('/^[a-f0-9]{16,32}$/', $id)) fail(422, 'Pedido inválido.');
  $part = DATA . "/tmp/$id.part";
  if (!is_file($part)) fail(404, 'O arquivo enviado não foi encontrado.');
  $fail = function (int $c, string $m) use ($part): never { @unlink($part); fail($c, $m); };
  if (!valid_slug($app) || !array_filter(apps(), fn($a) => $a['slug'] === $app)) $fail(422, 'Aplicativo desconhecido.');
  if (!valid_version($version)) $fail(422, 'A versão usa o formato 1.2.3.');
  if (mb_strlen($notes) > 6000) $fail(422, 'As notas são longas demais.');
  $size = filesize($part);
  if ($size !== (int) ($body['size'] ?? -1)) $fail(422, 'O tamanho recebido não bate com o do arquivo. Envie de novo.');
  $fh = fopen($part, 'rb'); $magic = fread($fh, 2); fclose($fh);
  if ($magic !== 'MZ') $fail(422, 'Isso não parece um instalador .exe do Windows.');
  $safe = preg_replace('/[^A-Za-z0-9._-]+/', '-', pathinfo($orig, PATHINFO_FILENAME));
  $safe = trim((string) $safe, '.-') ?: $app;
  if (!str_contains($safe, $version)) $safe .= "-$version";
  if ($channel === 'beta' && !str_ends_with($safe, '-beta')) $safe .= '-beta';
  $file = $safe . '.exe';
  $dir = app_dir($app);
  if (!is_dir($dir)) mkdir($dir, 0755, true);
  $rs = releases();
  /* republicar a mesma versão no mesmo canal substitui a anterior */
  foreach ($rs as $k => $old) if ($old['app'] === $app && $old['version'] === $version && $old['channel'] === $channel) { if ($old['file'] !== $file) @unlink("$dir/{$old['file']}"); unset($rs[$k]); }
  $sha512 = base64_encode(hash_file('sha512', $part, true));
  if (!rename($part, "$dir/$file")) { copy($part, "$dir/$file"); unlink($part); }
  $rs[] = ['id' => bin2hex(random_bytes(6)), 'app' => $app, 'version' => $version, 'channel' => $channel, 'file' => $file, 'size' => $size, 'sha512' => $sha512, 'notes' => $notes, 'date' => gmdate('Y-m-d\TH:i:s.000\Z')];
  save('releases', array_values($rs));
  rewrite_feeds($app);
  out(['ok' => true, 'file' => $file, 'sha512' => $sha512]);
}

if ($action === 'delete') {
  $rid = (string) ($body['id'] ?? '');
  $rs = releases();
  foreach ($rs as $k => $r) if ($r['id'] === $rid) {
    @unlink(app_dir($r['app']) . '/' . $r['file']);
    unset($rs[$k]);
    save('releases', array_values($rs));
    rewrite_feeds($r['app']);
    out(['ok' => true]);
  }
  fail(404, 'Versão não encontrada.');
}

fail(404, 'Ação desconhecida.');
