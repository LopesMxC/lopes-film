(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches, fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const root = document.documentElement;

  /* cursor: holofote e brilho dos blocos */
  if (fine && !calm) {
    addEventListener('pointermove', (e) => { root.style.setProperty('--mx', e.clientX + 'px'); root.style.setProperty('--my', e.clientY + 'px'); }, { passive: true });
    $$('.bt').forEach((b) => b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); b.style.setProperty('--bx', e.clientX - r.left + 'px'); b.style.setProperty('--by', e.clientY - r.top + 'px'); }));
  }

  /* revelar ao rolar */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15, rootMargin: '0px 0px -6% 0px' });
  $$('.rv,.ver').forEach((el) => io.observe(el));

  /* título do hero, palavra por palavra */
  const h1 = $('h1[data-split]');
  if (h1) {
    let i = 0;
    const walk = (node) => [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((t) => {
          if (!t) return;
          if (/^\s+$/.test(t)) { frag.append(' '); return; }
          const w = document.createElement('span'), inner = document.createElement('span');
          w.className = 'w'; inner.textContent = t; inner.style.setProperty('--i', i++); w.append(inner); frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
    walk(h1);
  }

  /* tilt 3D com brilho */
  function tilt(el, max, scale) {
    if (!fine || calm) return;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.transform = `perspective(900px) rotateY(${(x - .5) * max}deg) rotateX(${(.5 - y) * max}deg) scale(${scale})`;
      el.style.setProperty('--gx', x * 100 + '%'); el.style.setProperty('--gy', y * 100 + '%');
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }
  $$('.card:not(.soon)').forEach((c) => tilt(c, 14, 1.03));
  const win = $('.win');
  if (win && fine && !calm) {
    const stage = win.parentElement;
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      win.style.transform = `rotateY(${-14 + x * 16}deg) rotateX(${6 - y * 12}deg)`;
      win.style.setProperty('--gx', (x + .5) * 100 + '%'); win.style.setProperty('--gy', (y + .5) * 100 + '%');
    });
    stage.addEventListener('pointerleave', () => { win.style.transform = ''; });
  }

  /* botões magnéticos */
  if (fine && !calm) $$('.btn.red,.btn.mag').forEach((b) => {
    b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px,${(e.clientY - r.top - r.height / 2) * .3}px)`; });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });

  /* editor de verdade: o cursor arrasta, corta, solta efeito, mexe no inspetor, busca som e digita a legenda.
     Tudo é função do progresso p (0→1): rolar para trás desfaz cada ação. */
  const ed = $('.ed'), cl01 = (x) => Math.min(1, Math.max(0, x)), seg = (p, a, b) => cl01((p - a) / (b - a)), sm = (x) => x * x * (3 - 2 * x);
  /* [quando, elemento-alvo, x, y]  (x,y = fração do alvo onde o cursor fica) */
  const KF = [[0, '.ed-pv', 1, .95], [.04, '[data-m=m1]', .5, .5], [.06, '[data-m=m1]', .5, .5], [.13, '.ed-tv .cl', .2, .5], [.15, '.ed-tv .cl', .2, .5], [.17, '.ed-tv .cl', .38, .5], [.19, '.ed-cut', .5, .5],
    [.22, '.ed-tab[data-t="1"]', .5, .5], [.225, '.ed-tab[data-t="1"]', .5, .5], [.25, '[data-fx=zoom]', .5, .5], [.26, '[data-fx=zoom]', .5, .5], [.32, '.ed-tv .cl', .51, .5], [.35, '.ed-c2', .5, .5], [.36, '.ed-c2', .5, .5],
    [.38, '.ed-sl-br .kn', .5, .5], [.43, '.ed-sl-br .kn', .5, .5], [.46, '.ed-tab[data-t="2"]', .5, .5], [.47, '.ed-tab[data-t="2"]', .5, .5], [.50, '[data-s=music]', .5, .5], [.51, '[data-s=music]', .5, .5], [.57, '.ed-ta .cl', .3, .5],
    [.58, '.ed-volh', .5, .5], [.62, '.ed-volh', .5, .5], [.65, '.ed-q', .35, .5], [.66, '.ed-q', .35, .5], [.71, '.ed-q', .35, .5], [.74, '[data-s=w1]', .5, .5], [.745, '[data-s=w1]', .5, .5], [.80, '.ed-tb2 .cl', .42, .5], [.82, '.ed-tb2 .cl', .42, .5],
    [.84, '.ed-tab[data-t="3"]', .5, .5], [.845, '.ed-tab[data-t="3"]', .5, .5], [.86, '.ed-q', .35, .5], [.89, '.ed-q', .35, .5], [.915, '[data-tp=neon]', .5, .5], [.925, '[data-tp=neon]', .5, .5], [.94, '.ed-cap', .5, .5], [1, '.ed-cap', .5, .5]];
  const GH = [[.06, .13, 'praia.mp4'], [.26, .32, 'Zoom pulse'], [.51, .57, 'Trilha lo-fi'], [.745, .80, 'Whoosh 03']];
  const CK = [.06, .13, .19, .225, .26, .32, .36, .47, .51, .57, .66, .745, .80, .845, .86, .925, .94];
  const typed = (p, a, b, t) => t.slice(0, p < a ? 0 : p >= b ? t.length : Math.floor(seg(p, a, b) * t.length));
  function edAt(sel, fx, fy) { const el = $(sel, ed); if (!el) return null; const r = el.getBoundingClientRect(), R = ed.getBoundingClientRect(), k = (R.width / ed.offsetWidth) || 1; return [(r.left - R.left + r.width * fx) / k, (r.top - R.top + r.height * fy) / k]; }
  function edRender(p) {
    if (!ed) return; p = cl01(p);
    [['clip', .13], ['cut', .19], ['fx', .32], ['sel', .36], ['mus', .57], ['sfx', .80], ['cc', .925]].forEach(([k, t]) => ed.classList.toggle('s-' + k, p >= t));
    const tab = p < .225 ? 0 : p < .47 ? 1 : p < .845 ? 2 : 3; ed.dataset.tab = tab;
    ed.style.setProperty('--br', (.3 + .5 * sm(seg(p, .38, .43))).toFixed(3));
    ed.style.setProperty('--vol', (.12 + .5 * sm(seg(p, .58, .62))).toFixed(3));
    ed.style.setProperty('--z', p >= .32 ? 1.14 : 1);
    const ph = .38 * sm(seg(p, .15, .17)) + (p > .19 ? (p - .19) * .4 : 0); ed.style.setProperty('--ph', ph.toFixed(3));
    /* busca digitada, com filtro de verdade */
    const q = tab === 2 ? typed(p, .66, .71, 'whoosh') : tab === 3 ? typed(p, .86, .89, 'neon') : '';
    $('.ed-qt', ed).textContent = q; $('.ed-qt', ed).dataset.ph = ['Buscar mídia…', 'Buscar efeito…', 'Buscar som…', 'Buscar template…'][tab];
    $$('.ed-pane', ed).forEach((pn) => $$('.ed-it', pn).forEach((it) => it.classList.toggle('hid', !!q && !it.textContent.toLowerCase().includes(q))));
    $('.ed-q', ed).classList.toggle('f', (tab === 2 && p >= .65 && p < .745) || (tab === 3 && p >= .855 && p < .925));
    const cap = $('.ed-cap', ed); $('.ed-ct', ed).textContent = typed(p, .95, 1, 'Bora editar!'); cap.classList.toggle('f', p >= .94);
    /* o vídeo anda junto com a agulha */
    const v = $('.ed-v', ed); if (v) { const d = v.duration || 24, t = Math.min(.98, ph / .62) * d; if (!v.paused) v.pause(); if (p >= .13 && Math.abs(v.currentTime - t) > .04 && !v.seeking) v.currentTime = t; $('.ed-tcd', ed).textContent = '00:00:' + String(Math.floor(p >= .13 ? t : 0)).padStart(2, '0'); }
    /* cursor: interpola entre as posições medidas dos alvos (vale com a janela inclinada) */
    let i = 0; while (i < KF.length - 1 && p >= KF[i + 1][0]) i++;
    const a = KF[i], b = KF[Math.min(i + 1, KF.length - 1)], f = a === b ? 0 : sm(seg(p, a[0], b[0])), A = edAt(a[1], a[2], a[3]), B = edAt(b[1], b[2], b[3]);
    if (A && B) {
      const x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f, cur = $('.ed-cur', ed), gh = $('.ed-gh', ed), g = GH.find((h) => p >= h[0] && p < h[1]);
      cur.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      cur.classList.toggle('dn', !!g || CK.some((c) => Math.abs(p - c) < .007) || (p >= .38 && p < .43) || (p >= .58 && p < .62));
      gh.classList.toggle('on', !!g); if (g) { $('b', gh).textContent = g[2]; gh.style.transform = `translate(${(x + 14).toFixed(1)}px,${(y + 10).toFixed(1)}px)`; }
    }
  }
  /* celular e movimento reduzido: o passo roda sozinho quando aparece na tela */
  if (ed && innerWidth <= 1000) {
    if (calm) edRender(1);
    else { let on = false, t0 = 0; const loop = (t) => { if (!on) return; t0 = t0 || t; edRender(Math.min(1, ((t - t0) / 1000 % 26) / 22)); requestAnimationFrame(loop); };
      new IntersectionObserver((e) => { on = e[0].isIntersecting; if (on) { t0 = 0; requestAnimationFrame(loop); } }, { threshold: .4 }).observe(ed); }
  }

  /* barra de progresso, nav que some ao descer e volta ao subir, seção ativa */
  const bar = $('.progress'), nav = $('.nav'); let lastY = 0, ticking = false;
  const links = $$('.nav a.l'), secs = links.map((a) => $(a.getAttribute('href')));
  const story = $('.story'), steps = $$('.step'), shows = $$('.show>.scr'), fill = $('.line'), BND = [0, .16, .66, .83, 1], NS = BND.length - 1;
  let active = -1, upT = 0;
  function setStep(n) {
    if (n === active) return; active = n;
    steps.forEach((s, i) => s.classList.toggle('on', i === n)); shows.forEach((s, i) => s.classList.toggle('on', i === n));
    if (n === 3) runUpdate(); else resetUpdate();
  }
  function frame() {
    ticking = false;
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    nav.classList.toggle('hide', y > lastY && y > 400 && !nav.matches(':hover')); lastY = y;
    secs.forEach((s, i) => { if (!s) return; const r = s.getBoundingClientRect(); links[i].classList.toggle('on', r.top < innerHeight * .4 && r.bottom > innerHeight * .4); });
    if (story && innerWidth > 1000) {
      const r = story.getBoundingClientRect(), p = Math.min(.999, Math.max(0, -r.top / (r.height - innerHeight)));
      let n = 0; while (n < NS - 1 && p >= BND[n + 1]) n++;
      const lp = (p - BND[n]) / (BND[n + 1] - BND[n]);
      setStep(n);
      /* o scroll inteiro (--p) e o de cada passo (--lp) guiam o brilho, a inclinação, o cursor e as prévias */
      story.style.setProperty('--p', p.toFixed(3)); story.style.setProperty('--lp', lp.toFixed(3)); story.style.setProperty('--n', n);
      const s1 = $('.s1'), s2 = $('.s2');
      if (s1 && n === 0) s1.dataset.k = Math.min(3, Math.floor(lp * 4.4));
      if (s1 && n !== 0) s1.dataset.k = n > 0 ? 3 : 0;
      if (s2 && n === 2) { s2.dataset.t = Math.min(4, Math.floor(lp * 5)); const sw = $$('.sw i', s2), k = Math.min(7, Math.floor(lp * 8)); sw.forEach((d, i) => d.classList.toggle('on', i === k)); const sk = $$('.skins span', s2); sk.forEach((d, i) => d.classList.toggle('on', i === Math.min(4, Math.floor(lp * 5)))); s2.style.setProperty('--ac', sw[k]?.style.getPropertyValue('--c') || '#e0384e'); }
      /* o passo do editor: o cursor monta o vídeo com o scroll (lp 0→1; os últimos 4% ficam parados) */
      edRender(n === 1 ? lp / .96 : n < 1 ? 0 : 1);
      /* o vídeo evolui junto com a agulha da timeline: cada passo varre o filme inteiro */
      $$('.show>.scr').forEach((sc, i) => { const v = $('video.mv', sc); if (!v) return; const d = v.duration || 24, k = i === n ? lp : i < n ? 1 : 0, t = Math.min(d - .05, k * d);
        if (!v.paused) v.pause(); if (Math.abs(v.currentTime - t) > .03 && !v.seeking) v.currentTime = t;
        const tc = $('.tc', sc); if (tc) tc.textContent = '00:00:' + String(Math.floor(t)).padStart(2, '0') + ' / 00:00:' + String(Math.floor(d)).padStart(2, '0'); });
    }
    else if (story) { shows.forEach((s) => s.classList.add('on')); }
    if (fill) { const r = fill.getBoundingClientRect(); fill.style.setProperty('--p', Math.min(1, Math.max(0, (innerHeight * .6 - r.top) / r.height)).toFixed(3)); }
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
  addEventListener('resize', frame); frame();
  steps.forEach((s, i) => s.addEventListener('click', () => { if (innerWidth > 1000 && story) { const top = story.offsetTop + (story.offsetHeight - innerHeight) * ((BND[i] + BND[i + 1]) / 2); scrollTo({ top, behavior: calm ? 'auto' : 'smooth' }); } }));

  /* atualização simulada */
  function resetUpdate() { clearInterval(upT); const d = $('.dlg'); if (!d) return; d.classList.remove('done'); $('.bar i', d).style.width = '0'; $('.st b', d).textContent = '0%'; $('.dlg h4').textContent = 'Baixando a versão nova…'; }
  function runUpdate() {
    resetUpdate(); const d = $('.dlg'); if (!d) return; let p = 0;
    upT = setInterval(() => { p += 1 + Math.random() * 3; if (p >= 100) { p = 100; clearInterval(upT); d.classList.add('done'); $('.dlg h4').textContent = 'Versão nova pronta'; }
      $('.bar i', d).style.width = p + '%'; $('.st b', d).textContent = Math.round(p) + '%'; }, 70);
  }
  if (story && innerWidth <= 1000) { const u = $('.upd'); if (u) new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { runUpdate(); o.disconnect(); } }, { threshold: .5 }).observe(u); }

  /* galeria: arrastar, setas, detalhe */
  const rail = $('.rail');
  if (rail) {
    let down = false, sx = 0, sl = 0, moved = 0;
    rail.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; down = true; moved = 0; sx = e.clientX; sl = rail.scrollLeft; });
    addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx)); if (moved > 5) rail.classList.add('drag'); rail.scrollLeft = sl - dx; });
    addEventListener('pointerup', () => { down = false; setTimeout(() => rail.classList.remove('drag'), 0); });
    rail.addEventListener('click', (e) => { if (moved > 5) { e.stopPropagation(); e.preventDefault(); moved = 0; } }, true);
    $$('.arrows button').forEach((b) => b.addEventListener('click', () => rail.scrollBy({ left: (b.dataset.d === 'n' ? 1 : -1) * 352, behavior: 'smooth' })));
  }
  const dlg = $('dialog'), DATA = JSON.parse($('#data')?.textContent || '{}'), esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  $$('.card[data-app]').forEach((c) => c.addEventListener('click', () => {
    const a = DATA[c.dataset.app]; if (!a || !dlg) return;
    const K = { new: ['Novo', 'new'], better: ['Melhor', 'better'], fix: ['Correção', 'fix'] };
    $('.md', dlg).style.setProperty('--h', a.hue);
    const art = $('.md .art', dlg), sh = a.shots || [];
    $('.md', dlg).classList.toggle('shots', !!sh.length);
    art.innerHTML = sh.length ? `<div class="stage">${sh.map((u, i) => `<img src="${esc(u)}" alt="${esc(a.name)}" class="${i ? '' : 'on'}">`).join('')}</div>${sh.length > 1 ? `<div class="dots">${sh.map((u, i) => `<button class="${i ? '' : 'on'}" aria-label="Imagem ${i + 1}"></button>`).join('')}</div>` : ''}` : $('.mark-src').innerHTML;
    $$('.dots button', art).forEach((d, i) => d.addEventListener('click', () => { $$('.stage img', art).forEach((m, j) => m.classList.toggle('on', i === j)); $$('.dots button', art).forEach((m, j) => m.classList.toggle('on', i === j)); }));
    const meta = a.version ? `<span class="tag r">v${esc(a.version)}</span><span class="tag">${esc(a.size)}</span><span class="tag">${esc(a.date)}</span>` : `<span class="tag r">Em breve</span>`;
    $('.md .info', dlg).innerHTML = `<div class="meta">${meta}<span class="tag">Windows 10 · 11</span></div>
      <h3>${esc(a.name)}</h3><p class="lead" style="margin:0">${esc(a.description || 'Aplicativo Lopes.')}</p>
      ${a.url ? `<a class="btn red" href="${esc(a.url)}" download>Baixar para Windows <small>${esc(a.size)}</small></a>` : `<span class="btn red off">Download disponível em breve</span>`}
      ${a.history.length ? `<div class="eyebrow" style="margin-top:8px">Últimas versões</div>
      <ul>${a.history.map((h) => `<li><b>v${esc(h.version)}</b><span>${h.items.length ? esc(h.items[0].text) : 'Sem notas nesta versão.'}</span></li>`).join('')}</ul>` : ''}`;
    dlg.showModal();
  }));
  if (dlg) { dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('.x')) dlg.close(); }); }

  /* menu do celular */
  const sheet = $('.sheet'), burger = $('.burger');
  if (burger) { burger.addEventListener('click', () => { const o = sheet.classList.toggle('open'); document.body.style.overflow = o ? 'hidden' : ''; });
    $$('.sheet a').forEach((a) => a.addEventListener('click', () => { sheet.classList.remove('open'); document.body.style.overflow = ''; })); }

  /* partículas do chamado final */
  const cv = $('.cta-box canvas');
  if (cv && !calm) {
    const x = cv.getContext('2d'); let w, h, P = [], run = false;
    const size = () => { const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); w = cv.width = r.width * d; h = cv.height = r.height * d; P = Array.from({ length: Math.round(r.width / 14) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: (Math.random() * 1.6 + .4) * d, v: (Math.random() * .4 + .1) * d, a: Math.random() })); };
    const tick = () => { if (!run) return; x.clearRect(0, 0, w, h); for (const p of P) { p.y -= p.v; p.a += .01; if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; } x.globalAlpha = .25 + .5 * Math.abs(Math.sin(p.a)); x.fillStyle = '#ff6a80'; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill(); } requestAnimationFrame(tick); };
    size(); addEventListener('resize', size);
    new IntersectionObserver((e) => { run = e[0].isIntersecting; if (run) tick(); }).observe(cv);
  }

  /* card final: o brilho segue o mouse */
  { const cb = $('.cta-box'); if (cb) cb.addEventListener('pointermove', (e) => { const r = cb.getBoundingClientRect(); cb.style.setProperty('--cx', (e.clientX - r.left) + 'px'); cb.style.setProperty('--cy', (e.clientY - r.top) + 'px'); }); }

  /* Feito com o Lopes.Film: toca com som ao clicar, pausa ao sair da tela */
  { const v = $('#madeV'), fr = v && v.closest('.mframe'), pl = fr && $('.mplay', fr);
    if (v && pl) {
      pl.addEventListener('click', () => { v.controls = true; fr.classList.add('on'); v.play().catch(() => {}); });
      v.addEventListener('ended', () => { fr.classList.remove('on'); v.controls = false; v.currentTime = 0; });
      new IntersectionObserver((e) => { if (!e[0].isIntersecting && !v.paused) v.pause(); }, { threshold: .1 }).observe(v);
    }
    /* os vídeos mudos da janela só rodam quando aparecem */
    $$('video.mv').forEach((m) => new IntersectionObserver((e) => { if (innerWidth > 1000 && m.closest('.story')) return; e[0].isIntersecting ? m.play().catch(() => {}) : m.pause(); }).observe(m));
  }
})();
