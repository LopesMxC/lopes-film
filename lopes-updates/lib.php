<?php
declare(strict_types=1);
/**
 * Lopes · Atualizações — funções comuns. Sem banco de dados: tudo em arquivos JSON na pasta data/ (protegida).
 */
const DATA = __DIR__ . '/data';
const FEED = __DIR__ . '/feed';

function fail(int $code, string $msg): never {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
  exit;
}
function out($data): never {
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
/** Lê um JSON de data/ (ou o padrão). */
function load(string $name, $default) {
  $f = DATA . "/$name.json";
  if (!is_file($f)) return $default;
  $j = json_decode((string) file_get_contents($f), true);
  return $j === null ? $default : $j;
}
/** Grava um JSON de data/ de forma atômica. */
function save(string $name, $value): void {
  if (!is_dir(DATA)) mkdir(DATA, 0755, true);
  $f = DATA . "/$name.json";
  $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
  file_put_contents($tmp, json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX);
  rename($tmp, $f);
}
function valid_slug(string $s): bool { return (bool) preg_match('/^[a-z0-9][a-z0-9-]{1,38}$/', $s); }
function valid_version(string $v): bool { return (bool) preg_match('/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/', $v); }
/** 1 se $a > $b, -1 se menor, 0 se igual (x.y.z, ignorando o sufixo de pré-lançamento). */
function vcmp(string $a, string $b): int {
  $pa = array_map('intval', explode('.', explode('-', $a)[0]));
  $pb = array_map('intval', explode('.', explode('-', $b)[0]));
  for ($i = 0; $i < 3; $i++) { $d = ($pa[$i] ?? 0) <=> ($pb[$i] ?? 0); if ($d) return $d; }
  return 0;
}
function apps(): array {
  $defaults = [
    ['slug' => 'lopes-film', 'name' => 'Lopes.Film', 'description' => 'Editor de vídeo com IA que roda no seu PC'],
    ['slug' => 'verkz-film', 'name' => 'VerkzFilm', 'description' => 'O editor de vídeo com IA na versão Verkz'],
    ['slug' => 'global-film', 'name' => 'GlobalFilm', 'description' => 'O editor de vídeo com IA na versão Global'],
  ];
  $apps = load('apps', null);
  if ($apps === null) { $apps = $defaults; save('apps', $apps); return $apps; }
  /* servidor antigo: completa com os apps de fábrica que ainda faltam (sem mexer nos que já existem) */
  $have = array_column($apps, 'slug');
  $missing = array_values(array_filter($defaults, fn($d) => !in_array($d['slug'], $have, true)));
  if ($missing) { $apps = array_merge($apps, $missing); save('apps', $apps); }
  return $apps;
}
function releases(): array { return load('releases', []); }
function app_dir(string $slug): string { return FEED . '/' . $slug; }

/** O arquivo de feed do electron-updater de um canal: latest.yml (estável) ou beta.yml. */
function yml_name(string $channel): string { return $channel === 'beta' ? 'beta.yml' : 'latest.yml'; }

/** Texto do latest.yml (JSON entre aspas é YAML válido, então nenhuma nota quebra o arquivo). */
function build_yml(array $r): string {
  $q = fn($s) => json_encode((string) $s, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  return "version: {$r['version']}\n"
    . "files:\n  - url: " . $q($r['file']) . "\n    sha512: {$r['sha512']}\n    size: {$r['size']}\n"
    . "path: " . $q($r['file']) . "\n"
    . "sha512: {$r['sha512']}\n"
    . "releaseDate: " . $q($r['date']) . "\n"
    . "releaseNotes: " . $q($r['notes'] ?? '') . "\n";
}
/** Regrava os feeds de um app: a versão mais nova de cada canal; sem versão no canal, o arquivo some. */
function rewrite_feeds(string $slug): void {
  $dir = app_dir($slug);
  if (!is_dir($dir)) mkdir($dir, 0755, true);
  foreach (['stable', 'beta'] as $channel) {
    $best = null;
    foreach (releases() as $r) {
      if ($r['app'] !== $slug || $r['channel'] !== $channel) continue;
      if ($best === null || vcmp($r['version'], $best['version']) > 0) $best = $r;
    }
    $f = $dir . '/' . yml_name($channel);
    if ($best) file_put_contents($f, build_yml($best), LOCK_EX); elseif (is_file($f)) unlink($f);
  }
}
/** Notas: linhas com + (novo), ~ (melhorado) e ! (corrigido); as outras são texto simples. */
function parse_notes(string $notes): array {
  $items = [];
  foreach (preg_split('/\R/', $notes) as $line) {
    $line = trim($line);
    if ($line === '') continue;
    $k = $line[0];
    if ($k === '+' || $k === '~' || $k === '!') $items[] = ['kind' => $k === '+' ? 'new' : ($k === '~' ? 'better' : 'fix'), 'text' => trim(substr($line, 1))];
    else $items[] = ['kind' => 'note', 'text' => $line];
  }
  return $items;
}
function human_size(int $b): string {
  return $b >= 1048576 ? round($b / 1048576) . ' MB' : max(1, round($b / 1024)) . ' KB';
}
