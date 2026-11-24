<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
require __DIR__ . '/partials.php';
header('Content-Type: text/html; charset=utf-8');
$h = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
/* o site público mostra só o Lopes.Film; os outros apps existem no painel (admin) para receber atualizações */
$all = array_values(array_filter(releases(), fn($r) => $r['app'] === 'lopes-film'));
$stable = array_values(array_filter($all, fn($r) => $r['channel'] === 'stable'));
usort($stable, fn($a, $b) => vcmp($b['version'], $a['version']) ?: strcmp($b['date'], $a['date']));
$latest = [];
foreach ($stable as $r) $latest[$r['app']] ??= $r;
$names = [];
foreach (apps() as $a) $names[$a['slug']] = $a;
$months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
$dt = function (string $iso) use ($months): string { $t = strtotime($iso) ?: time(); return date('j', $t) . ' ' . $months[(int) date('n', $t) - 1] . ' ' . date('Y', $t); };
$top = $stable[0]['version'] ?? null;

$fileUrl = fn(array $r) => 'feed/' . rawurlencode((string) $r['app']) . '/' . rawurlencode((string) $r['file']);
$data = [];
$shots = ['lopes-film' => ['assets/studio.jpg', 'assets/studio-settings.jpg']];
foreach ($names as $slug => $a) {
  if (!isset($latest[$slug]) && $slug !== 'lopes-film') continue;
  $r = $latest[$slug] ?? null;
  $hist = [];
  if ($r) foreach (array_slice(array_values(array_filter($stable, fn($x) => $x['app'] === $slug)), 0, 4) as $x) $hist[] = ['version' => $x['version'], 'items' => parse_notes((string) $x['notes'])];
  $data[$slug] = ['name' => $a['name'], 'description' => $a['description'] ?? '', 'version' => $r['version'] ?? '', 'size' => $r ? human_size((int) $r['size']) : '', 'date' => $r ? $dt($r['date']) : '', 'url' => $r ? $fileUrl($r) : '', 'hue' => $slug === 'lopes-film' ? 350 : crc32($slug) % 360, 'history' => $hist, 'shots' => $shots[$slug] ?? []];
}
$first = $latest ? reset($latest) : null;
$dl = $first ? $fileUrl($first) : '#apps';
$M = mark();
$arrow = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 2v9M4 8l4 4 4-4M3 14h10"/></svg>';
?><!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Lopes.Film — editor de vídeo com IA para Windows</title>
<meta name="description" content="Lopes.Film é um editor de vídeo para Windows com um chat ao lado: peça um corte, uma legenda ou um ajuste e veja no preview. Baixe a versão mais recente.">
<meta name="theme-color" content="#07070a">
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<link rel="apple-touch-icon" href="assets/favicon.svg">
<link rel="preload" href="assets/fonts/syne-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/site.css?v=<?= (int) @filemtime(__DIR__ . "/assets/site.css") ?>">
</head><body>
<div class="progress"></div><div class="grain"></div><div class="spot"></div>
<header class="nav">
  <a class="logo" href="#top"><?= $M ?>LOPES</a>
  <a class="l" href="#apps">Aplicativos</a><a class="l" href="#destaque">Destaque</a><a class="l" href="#feito">Feito com</a><a class="l" href="#novidades">Novidades</a>
  <a class="btn red sm go" href="<?= $h($dl) ?>"<?= $first ? ' download' : '' ?>>Baixar</a>
  <button class="burger" aria-label="Menu"><i></i></button>
</header>
<div class="sheet"><a href="#apps">Aplicativos</a><a href="#destaque">Destaque</a><a href="#feito">Feito com</a><a href="#novidades">Novidades</a><a href="<?= $h($dl) ?>" style="color:var(--red)">Baixar</a></div>
<div hidden class="mark-src"><?= $M ?></div>

<main id="top">
<section class="hero">
  <div class="aur"><i></i><i></i><i></i></div><div class="floor"></div>
  <div class="wrap">
    <div>
      <span class="chip rv"><i></i><?= $top ? 'Versão estável v' . $h($top) : 'Em breve' ?></span>
      <h1 data-split>Você pede, a IA <em>edita a linha do tempo.</em></h1>
      <p class="lead rv" style="--d:5">O Lopes.Film é um editor de vídeo para Windows com um chat ao lado. Peça um corte, uma legenda ou um ajuste de cor e confira o resultado no preview. Os projetos ficam salvos no seu PC.</p>
      <div class="ctas rv" style="--d:6">
        <a class="btn red" href="<?= $h($dl) ?>"<?= $first ? ' download' : '' ?>><?= $arrow ?>Baixar para Windows<?php if ($first): ?> <small>v<?= $h($first['version']) ?></small><?php endif; ?></a>
        <a class="btn mag" href="#apps">Conhecer o app</a>
      </div>
      <div class="facts rv" style="--d:7"><span>Projetos salvos no seu PC</span><span>Usa o seu Claude Code ou Codex</span><span>Atualiza em segundo plano</span></div>
    </div>
    <div class="stage rv" style="--d:3">
      <svg class="big-ls" viewBox="0 0 300 88" aria-hidden="true"><path pathLength="1" d="M0 87.4461L93.0846 0H134.578L65.3839 65.9199H179.553V87.4461H0Z"/><path pathLength="1" d="M300 32.9905V87.4461H188.181V65.9199H278.535V54.5167H208.285L140.414 32.9294V0H300V21.5262H175.539L211.579 32.9905H300Z"/></svg>
      <div class="win"><div class="dots"><i></i><i></i><i></i></div><div class="shot"><img src="assets/studio.jpg" width="1600" height="1000" alt="Lopes.Film Studio com um filme de duas cenas aberto"><video class="mv shotv" src="assets/media/feito-scrub.mp4" muted loop playsinline preload="auto" tabindex="-1" aria-hidden="true"></video></div><div class="glare"></div></div>
      <div class="float a"><b>●</b> Peça, e a IA edita</div>
      <div class="float b"><b>↻</b> Sempre na versão nova</div>
      <div class="float c"><b>▣</b> Roda no seu PC</div>
    </div>
  </div>
  <div class="scroll" aria-hidden="true"></div>
</section>

<div class="marq" aria-hidden="true"><div>
<?php for ($k = 0; $k < 2; $k++) foreach (['Edite com IA', 'Roda no seu PC', 'Exporta em MP4', 'Sempre atualizado', 'Feito por Lopes'] as $t): ?><span><?= $t ?></span><?php endforeach; ?>
</div></div>

<section class="gal" id="apps">
  <div class="wrap gal-h">
    <div><span class="eyebrow rv">Aplicativos</span><h2 class="rv" style="--d:1">Os apps da <em>Lopes</em></h2><p class="lead rv" style="--d:2;margin-top:18px">Por enquanto só o Lopes.Film está no ar. Os próximos aparecem aqui.</p></div>
    <div class="arrows rv"><button data-d="p" aria-label="Anterior"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 3L5 9l6 6"/></svg></button><button data-d="n" aria-label="Próximo"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 3l6 6-6 6"/></svg></button></div>
  </div>
  <div class="rail">
    <?php foreach ($data as $slug => $a): ?>
    <button class="card" data-app="<?= $h($slug) ?>" style="--h:<?= (int) $a['hue'] ?>">
      <div class="art"><?php if ($a['shots']): ?><?php if ($a['shots'][0] === 'assets/studio.jpg'): ?><div class="shot"><img src="<?= $h($a['shots'][0]) ?>" alt="" loading="lazy"><video class="mv shotv" src="assets/media/feito-scrub.mp4" muted loop playsinline preload="auto" tabindex="-1" aria-hidden="true"></video></div><?php else: ?><img src="<?= $h($a['shots'][0]) ?>" alt="" loading="lazy"><?php endif; ?><?php else: ?><?= $M ?><?php endif; ?><em><?= $a['version'] ? 'v' . $h($a['version']) : 'em breve' ?></em></div>
      <div class="body"><h3><?= $h($a['name']) ?></h3><p><?= $h($a['description'] ?: 'Aplicativo Lopes para Windows.') ?></p>
        <div class="foot"><span><?= $a['version'] ? $h($a['size']) . ' · ' . $h($a['date']) : 'Veja como é por dentro' ?></span><b>Abrir <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 7h8M7 3l4 4-4 4"/></svg></b></div></div>
      <div class="glare"></div>
    </button>
    <?php endforeach; ?>
    <?php for ($i = 0; $i < 2; $i++): ?>
    <div class="card soon"><div class="art"><?= $M ?></div><div class="body"><h3>Em breve</h3><div class="foot"><span>—</span></div></div></div>
    <?php endfor; ?>
  </div>
</section>

<?php
/* a janela do app desenhada em HTML (não é uma captura): $v = 1 editor, 2 configurações, 3 atualização */
$mock = function (int $v): string {
  $clips = [[0, 14, 'a'], [15, 11, 'b'], [27, 16, 'a'], [44, 10, 'c'], [55, 13, 'b'], [69, 12, 'a'], [82, 14, 'c']];
  ob_start(); ?>
  <div class="mk">
    <div class="tb"><i></i><i></i><i></i><span>Meu vídeo · Lopes.Film</span><b class="mode"><u class="on">Editar</u><u>Canvas</u></b></div>
    <div class="bd">
      <div class="vw"><div class="sc"><video class="mv" src="assets/media/feito-scrub.mp4" poster="assets/media/feito.jpg" muted loop playsinline preload="auto" tabindex="-1"></video><?php if (false): ?><svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sky<?= $v ?>" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1230"/><stop offset=".55" stop-color="#7a2147"/><stop offset="1" stop-color="#e0384e"/></linearGradient></defs><rect width="320" height="180" fill="url(#sky<?= $v ?>)"/><circle cx="214" cy="100" r="26" fill="#ffb199" opacity=".9"/><path d="M0 130l50-34 36 24 46-44 54 52 40-30 94 40v42H0z" fill="#150c1e"/><path d="M0 150l70-24 60 18 70-22 120 30v28H0z" fill="#0c0713"/></svg><?php endif; ?></div><div class="tc">00:00:12 / 00:00:48</div></div>
      <div class="ch"><div class="m u">Corte os silêncios e legende em português</div><div class="m a a1"><i></i>Procurando os silêncios…</div><div class="m a a2"><i></i>12 trechos cortados</div><div class="m a a3"><i></i>Legenda PT-BR pronta</div><div class="inp">Peça algo ao agente…</div></div>
    </div>
    <div class="tlm"><div class="rl"><?php for ($i = 0; $i < 9; $i++): ?><span>0:<?= sprintf('%02d', $i * 6) ?></span><?php endfor; ?></div>
      <div class="tr v"><label>V1</label><div class="cl"><?php foreach ($clips as $n => $c): ?><u class="c<?= $c[2] ?>" style="left:<?= $c[0] ?>%;width:<?= $c[1] ?>%" data-n="<?= $n ?>"></u><?php endforeach; ?></div></div>
      <div class="tr au"><label>A1</label><div class="cl"><u class="wv"></u></div></div>
      <div class="tr cc"><label>CC</label><div class="cl"><?php for ($i = 0; $i < 8; $i++): ?><u style="left:<?= 2 + $i * 12 ?>%;width:9%"></u><?php endfor; ?></div></div>
      <div class="ph"></div></div>
  </div>
<?php return ob_get_clean(); };
?>
<?php
/* editor-demo: o cursor realmente monta o vídeo (arrasta, corta, solta efeito, busca som, digita a legenda) — roteado pelo scroll em assets/site.js */
$edit = function (): string { ob_start(); ?>
  <div class="ed" data-tab="0">
    <div class="tb"><i></i><i></i><i></i><span>Meu vídeo · Lopes.Film</span><b class="mode"><u class="on">Editar</u><u>Canvas</u></b></div>
    <div class="ed-bd">
      <div class="ed-lib">
        <div class="ed-tabs"><b class="ed-tab on" data-t="0">Mídia</b><b class="ed-tab" data-t="1">Efeitos</b><b class="ed-tab" data-t="2">Sons</b><b class="ed-tab" data-t="3">Legendas</b></div>
        <div class="ed-q"><svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg><span class="ed-qt" data-ph="Buscar mídia…"></span><i class="ed-caret"></i></div>
        <div class="ed-pane" data-p="0">
          <div class="ed-it ed-m" data-m="m1"><i style="--g:linear-gradient(135deg,#7a2147,#e0384e)"></i><span>praia.mp4</span></div>
          <div class="ed-it ed-m"><i style="--g:linear-gradient(135deg,#1f3a8b,#35c8e8)"></i><span>cidade.mp4</span></div>
          <div class="ed-it ed-m"><i style="--g:linear-gradient(135deg,#2c5f4a,#8fe0a8)"></i><span>drone.mp4</span></div>
          <div class="ed-it ed-m"><i style="--g:linear-gradient(135deg,#4d3a8f,#a56bff)"></i><span>entrevista.mp4</span></div>
        </div>
        <div class="ed-pane" data-p="1">
          <div class="ed-it ed-fx" data-fx="zoom"><i>⤢</i><span>Zoom pulse</span></div>
          <div class="ed-it ed-fx"><i>≋</i><span>Glitch</span></div>
          <div class="ed-it ed-fx"><i>◐</i><span>Fade suave</span></div>
          <div class="ed-it ed-fx"><i>✦</i><span>Brilho cinema</span></div>
        </div>
        <div class="ed-pane" data-p="2">
          <div class="ed-it ed-so" data-s="music"><i>♪</i><span>Trilha lo-fi</span><em>2:10</em></div>
          <div class="ed-it ed-so" data-s="w1"><i>∿</i><span>Whoosh 03</span><em>0:01</em></div>
          <div class="ed-it ed-so"><i>∿</i><span>Whoosh 07</span><em>0:02</em></div>
          <div class="ed-it ed-so"><i>∿</i><span>Clique de interface</span><em>0:01</em></div>
          <div class="ed-it ed-so"><i>∿</i><span>Impacto grave</span><em>0:03</em></div>
        </div>
        <div class="ed-pane" data-p="3">
          <div class="ed-it ed-tp" data-tp="classica"><b>Clássica</b><span>Aa</span></div>
          <div class="ed-it ed-tp" data-tp="neon"><b>Neon</b><span>Aa</span></div>
          <div class="ed-it ed-tp" data-tp="karaoke"><b>Karaokê</b><span>Aa</span></div>
          <div class="ed-it ed-tp" data-tp="bold"><b>Bold</b><span>Aa</span></div>
        </div>
      </div>
      <div class="ed-pv"><div class="sc ed-scr"><div class="ed-vw"><video class="ed-v" src="assets/media/feito-scrub.mp4" poster="assets/media/feito.jpg" muted playsinline preload="auto" tabindex="-1"></video></div><div class="ed-empty">Arraste um vídeo para a linha do tempo</div><div class="ed-cap"><span class="ed-ct" data-ph="Digite sua legenda"></span><i class="ed-caret"></i></div></div><div class="tc ed-tcd">00:00:00</div></div>
      <div class="ed-in">
        <h6>Inspetor <em>· Clipe 2</em></h6>
        <div class="ed-bx">
          <div class="ed-sl ed-sl-br"><label>Brilho</label><div class="tk"><i></i><b class="kn"></b></div></div>
          <div class="ed-sl" style="--v:.5"><label>Escala</label><div class="tk"><i></i><b class="kn"></b></div></div>
          <div class="ed-sl" style="--v:.75"><label>Volume</label><div class="tk"><i></i><b class="kn"></b></div></div>
          <div class="ed-chip">Zoom pulse aplicado</div>
        </div>
        <p class="ed-nosel">Selecione um clipe para ajustar</p>
      </div>
    </div>
    <div class="ed-tl">
      <div class="ed-tbar"><span class="ed-cut"><svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><path d="M5.2 10.4L12 2M10.8 10.4L4 2"/></svg>Dividir</span><span class="ed-tnote">Linha do tempo</span></div>
      <div class="ed-tks">
        <div class="ed-rl"><?php for ($i = 0; $i < 9; $i++): ?><span>0:<?= sprintf('%02d', $i * 6) ?></span><?php endfor; ?></div>
        <div class="ed-t ed-tv"><label>V1</label><div class="cl"><u class="ed-c1"></u><u class="ed-c2"></u></div></div>
        <div class="ed-t ed-tf"><label>FX</label><div class="cl"><u class="ed-fxc">Zoom pulse</u></div></div>
        <div class="ed-t ed-ta"><label>A1</label><div class="cl"><u class="ed-mus"><s class="ed-vl"></s><b class="ed-volh"></b></u></div></div>
        <div class="ed-t ed-tb2"><label>A2</label><div class="cl"><u class="ed-sfx">whoosh</u></div></div>
        <div class="ed-t ed-tc"><label>CC</label><div class="cl"><u class="ed-ccc">Legenda · Neon</u></div></div>
        <div class="ed-ph"></div>
      </div>
    </div>
    <div class="ed-gh"><b></b></div>
    <div class="ed-cur"><svg viewBox="0 0 20 24" width="20" height="24"><path d="M2 1.5v18l4.6-4.3 3.1 7 3-1.4-3-6.8H17z" fill="#fff" stroke="#0a0a0c" stroke-width="1.5" stroke-linejoin="round"/></svg></div>
  </div>
<?php return ob_get_clean(); };
?>
<section class="story" id="destaque">
  <div class="sticky"><div class="wrap">
    <div>
      <span class="eyebrow rv">Em destaque</span><h2 class="rv" style="--d:1">Lopes.<em>Film</em></h2>
      <div class="steps">
        <div class="step on"><b>01</b><h3>Peça em português</h3><p>Escreva o que precisa: cortar um trecho, legendar, trocar a música. O agente mexe na linha do tempo e você acompanha pelo preview.</p></div>
        <div class="step"><b>02</b><h3>Ou edite com as próprias mãos</h3><p>Arraste o vídeo para a linha do tempo, corte, solte um efeito, ajuste no inspetor, busque o som na biblioteca e escreva a legenda. Tudo no mesmo lugar.</p></div>
        <div class="step"><b>03</b><h3>Do jeito que você trabalha</h3><p>Tema claro, escuro, Coffee, Night ou OLED, mais oito cores de destaque. A escolha vale em todas as janelas do app.</p></div>
        <div class="step"><b>04</b><h3>Atualiza sem atrapalhar</h3><p>A versão nova baixa enquanto você edita. Quando terminar, você instala na hora ou deixa para quando fechar o app.</p></div>
      </div>
    </div>
    <div class="show">
      <div class="scr s1" data-k="0"><?= $mock(1) ?></div>
      <div class="scr s4"><?= $edit() ?></div>
      <div class="scr s2" data-t="0"><?= $mock(2) ?>
        <div class="modal"><h5>Aparência</h5>
          <div class="skins"><span><i style="--a:#0f1014;--b:#1d1e25"></i>Escuro</span><span><i style="--a:#1a1410;--b:#2c211a"></i>Coffee</span><span><i style="--a:#0b1020;--b:#16203a"></i>Night</span><span><i style="--a:#000;--b:#0d0d0d"></i>OLED</span><span><i style="--a:#f3f1ee;--b:#fff"></i>Claro</span></div>
          <h5>Cor de destaque</h5>
          <div class="sw"><i style="--c:#e0384e"></i><i style="--c:#ff8a3d"></i><i style="--c:#ffd34d"></i><i style="--c:#5be08d"></i><i style="--c:#35c8e8"></i><i style="--c:#5c8cff"></i><i style="--c:#a56bff"></i><i style="--c:#f58bd0"></i></div>
        </div>
      </div>
      <div class="scr s3 upd"><?= $mock(3) ?>
        <div class="dim"></div>
        <div class="dlg"><h4>Baixando a versão nova…</h4><p>Você continua editando. Quando terminar, é só escolher.</p><div class="bar"><i></i></div><div class="st"><span>Arquivo original confirmado</span><b>0%</b></div><div class="row"><span class="btn sm">Depois</span><span class="btn red sm">Atualizar agora</span></div></div>
        <div class="toast"><i></i>Atualizado · veja o que mudou</div>
      </div>
    </div>
  </div></div>
</section>

<section class="made" id="feito">
  <div class="wrap">
    <span class="eyebrow rv">Feito com o Lopes.Film</span><h2 class="rv" style="--d:1">Veja o que sai <em>da timeline</em></h2>
    <div class="mgrid">
      <figure class="mcard rv" style="--d:2">
        <div class="mframe">
          <video id="madeV" src="assets/media/feito.mp4" poster="assets/media/feito.jpg" preload="none" playsinline controlslist="nodownload"></video>
          <button class="mplay" type="button" aria-label="Reproduzir vídeo"><span><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg></span><em>Assistir · 0:24</em></button>
        </div>
        <figcaption><b>Abertura Lopes.Film</b><span>Feita e exportada no próprio Lopes.Film.</span></figcaption>
      </figure>
    </div>
  </div>
</section>

<section class="bento">
  <div class="wrap">
    <span class="eyebrow rv">Atualizações</span><h2 class="rv" style="--d:1">Como o app se <em>atualiza</em></h2>
    <div class="grid">
      <div class="bt w4 rv"><div class="ic"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M11 2l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V5z"/><path d="M8 11l2 2 4-4"/></svg></div><h3>Confere o arquivo</h3><p>Antes de instalar, o app compara o que baixou com o original. Se não bater, não instala.</p><div class="hash">✓ arquivo original confirmado</div></div>
      <div class="bt rv" style="--d:1"><div class="ic"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 11a7 7 0 0 1 12-5l2 2M18 11a7 7 0 0 1-12 5l-2-2M18 4v4h-4M4 18v-4h4"/></svg></div><h3>Baixa em segundo plano</h3><p>O download não trava o app. Você segue editando.</p></div>
      <div class="bt rv"><div class="ic"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M11 6v5l3 2"/></svg></div><h3>Você escolhe a hora</h3><p>Instale agora ou ao fechar o app.</p></div>
      <div class="bt rv" style="--d:1"><div class="ic"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 4h12v14H5zM8 8h6M8 11h6M8 14h3"/></svg></div><h3>Notas de cada versão</h3><p>Depois de atualizar, uma janela lista o que mudou.</p></div>
      <div class="bt rv" style="--d:2"><div class="ic"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3h6M9 3v6l-5 9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1l-5-9V3"/></svg></div><h3>Canal beta</h3><p>Quer testar antes? Ligue o beta em Configurações → Atualizações. O estável só recebe o que já foi testado.</p></div>
    </div>
  </div>
</section>

<section class="tl" id="novidades">
  <div class="wrap">
    <span class="eyebrow rv">Novidades</span><h2 class="rv" style="--d:1">O que há de <em>novo</em></h2>
    <?php if (!$stable): ?><div class="empty">O histórico aparece aqui na primeira publicação.</div><?php else: ?>
    <div class="line"><i class="fill"></i>
      <?php foreach (array_slice($stable, 0, 12) as $r): $items = parse_notes((string) $r['notes']); $an = $names[$r['app']]['name'] ?? $r['app']; ?>
      <div class="ver"><div><span class="v">v<?= $h($r['version']) ?></span><span class="d"><?= $h($an) ?> · <?= $h($dt($r['date'])) ?></span></div>
        <ul><?php if (!$items): ?><li>Sem notas nesta versão.</li><?php endif; ?>
        <?php foreach ($items as $it): $K = ['new' => ['Novo', 'new'], 'better' => ['Melhor', 'better'], 'fix' => ['Correção', 'fix'], 'note' => ['', '']][$it['kind']]; ?>
          <li><?php if ($K[0]): ?><span class="k <?= $K[1] ?>"><?= $K[0] ?></span><?php endif; ?><span><?= $h($it['text']) ?></span></li><?php endforeach; ?></ul></div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>
</section>

<section class="cta"><div class="wrap"><div class="cta-box rv"><i class="spot2"></i><canvas></canvas>
  <span class="eyebrow">Baixar</span><h2>Instale e abra o <em>primeiro projeto.</em></h2>
  <div class="ctas" style="margin-top:40px"><a class="btn red" href="<?= $h($dl) ?>"<?= $first ? ' download' : '' ?>><?= $arrow ?>Baixar para Windows</a></div>
</div></div></section>
</main>

<footer><div class="wrap"><span>© <?= date('Y') ?> Lopes</span><a href="admin/">Acesso restrito</a></div></footer>

<dialog><div class="md" style="position:relative"><button class="x" aria-label="Fechar">✕</button><div class="art"></div><div class="info"></div></div></dialog>
<script type="application/json" id="data"><?= json_encode($data, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
<script src="assets/site.js?v=<?= (int) @filemtime(__DIR__ . "/assets/site.js") ?>" defer></script>
</body></html>