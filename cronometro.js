// cronometro.js \u2014 so o CRONOMETRO (speedrun, flutuante) + deteccao por som + teclas 1/2/3.
//
// Cores:   cinza = lobby / morreu (tempo congelado) / zerado | verde = correndo | laranja = parou na moeda
// Mover:   arraste o cronometro. Tamanho: arraste o cantinho inferior direito.
// Teclas:  1 = iniciar | 2 = parar | 3 = zerar
// Som:     o jogo e detectado pelos sons (inicio 70ms, moeda 580ms, morte 882ms).
//
// Outros arquivos (carregar DEPOIS deste, nesta ordem): menu-save.js, online.js.
// Eles conversam com este por window.CR (eventos 'start', 'coin', 'death').
(function () {
  'use strict';

  // Digitar nos campos do menu: o jogo captura todo o teclado (e o mouse) da pagina; aqui ele nao recebe nada vindo dos nossos paineis.
  function ehNosso(e) { var t = e.target; return !!(t && t.closest && t.closest('#cr-menu,#cr-on,#cr-pz')); }
  ['keydown', 'keyup', 'keypress', 'beforeinput', 'paste'].forEach(function (tp) {
    window.addEventListener(tp, function (e) { if (ehNosso(e)) e.stopImmediatePropagation(); }, true);
  });

  // ---------- armazenamento (opcional, nunca pode quebrar o jogo) ----------
  // Ponte entre os arquivos: menu-save.js e online.js usam window.CR
  var ganchos = {};
  var WALL = 'url("data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 860' preserveAspectRatio='xMidYMid slice'><defs><radialGradient id='g' cx='0' cy='0' r='1'><stop offset='0' stop-color='#0d4a52'/><stop offset='.45' stop-color='#08141a'/><stop offset='1' stop-color='#05090c'/></radialGradient></defs><rect width='400' height='860' fill='url(#g)'/><g fill='none' stroke='#3b8ea0' stroke-opacity='.55' stroke-width='1.2'><path d='M400 120h-35l-25 25v30l-30 30h-40M400 135h-30l-20 20v30l-30 30h-30M400 150h-25l-15 15v30l-30 30h-20M400 105h-45l-30 30h-30'/><circle cx='318' cy='170' r='7'/><circle cx='305' cy='200' r='4'/><circle cx='296' cy='218' r='4'/><circle cx='282' cy='233' r='3.5' fill='#3b8ea0'/><path d='M0 210l25 25v60l30 30v50l-25 25M0 230l18 18v60l30 30v40M0 255l12 12v70l30 30M30 400h30l15 15h25'/><circle cx='45' cy='340' r='8'/><circle cx='86' cy='415' r='6' fill='#3b8ea0'/><circle cx='68' cy='395' r='3'/><circle cx='60' cy='385' r='3'/></g></svg>`) + '")';
  var CR = window.CR = {
    wall: WALL,
    lsGet: function (k) { return lsGet(k); }, lsSet: function (k, v) { lsSet(k, v); },
    log: function (t) { log(t); },
    estado: function () { return state; },
    iniciar: function () { iniciar(); }, parar: function () { parar(); }, zerar: function () { zerar(); },
    addButton: function (l, f) { addButton(l, f); },
    mostrarTimer: function (v) { root.style.display = v ? '' : 'none'; },
    noCoin: function () { return false; },              // menu-save.js troca esta funcao
    overlayIds: ['cr-menu', 'cr-on'],
    overlayAberto: function () { return CR.overlayIds.some(function (i) { var el = document.getElementById(i); return !!el && el.style.display === 'flex'; }); },
    on: function (ev, fn) { (ganchos[ev] = ganchos[ev] || []).push(fn); },
    emit: function (ev) { (ganchos[ev] || []).forEach(function (f) { try { f(); } catch (e) { /* ok */ } }); }
  };

  function lsGet(k) { try { return localStorage.getItem('cronometro.' + k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem('cronometro.' + k, v); } catch (e) { /* ok */ } }

  // ---------- estado ----------
  var state = 'idle';          // 'idle' (cinza) | 'running' (verde) | 'coin' (laranja)
  var startTs = 0;
  var elapsed = 0;
  var fs = 64;                 // tamanho da fonte principal, em px
  var lastAction = '';

  // ---------- estilo ----------
  var css =
    '#cr-root{position:fixed;left:20px;top:20px;z-index:2147483647;box-sizing:border-box;' +
    'min-width:2.5em;padding:.14em .4em .1em;border-radius:.14em;' +
    'text-align:right;white-space:nowrap;line-height:1.05;cursor:move;' +
    'user-select:none;-webkit-user-select:none;touch-action:none;' +
    'font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-weight:700;' +
    'font-variant-numeric:tabular-nums;--c1:#f4f4f4;--c2:#8c8c8c;}' +
    '#cr-root[data-state=running]{--c1:#a6ffbf;--c2:#2ecc71;}' +
    '#cr-root[data-state=coin]{--c1:#ffc56e;--c2:#ff8a1c;}' +
    '#cr-root .cr-t{background:linear-gradient(180deg,var(--c1) 10%,var(--c2) 95%);' +
    '-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;}' +
    '#cr-root:before{content:"";position:absolute;left:0;top:0;right:0;bottom:0;z-index:-1;border-radius:inherit;pointer-events:none;' +
    'background-color:var(--bgc,#000);background-image:var(--bgi,none);background-size:cover;background-position:center;opacity:var(--bgo,.88);}' +
    '#cr-root .cr-main{font-size:1em;}' +
    '#cr-root .cr-dec{font-size:.5em;}' +
    '#cr-grip{position:absolute;right:0;bottom:0;width:30px;height:30px;cursor:nwse-resize;opacity:.45;}' +
    '#cr-grip:after{display:none;content:"";position:absolute;right:4px;bottom:4px;width:12px;height:12px;' +
    'border-right:3px solid rgba(255,255,255,.8);border-bottom:3px solid rgba(255,255,255,.8);}' +
    '#cr-root:hover #cr-grip{opacity:1;}' +
    '#cr-panel{position:absolute;left:0;display:none;width:340px;max-width:92vw;' +
    'font:12px/1.3 Arial,sans-serif;font-weight:400;text-align:left;cursor:default;white-space:normal;}' +
    '#cr-panel.below{top:100%;padding-top:6px;}' +
    '#cr-panel.above{bottom:100%;padding-bottom:6px;}' +
    '#cr-root:hover #cr-panel{display:block;}' +
    '#cr-panel .cr-box{background:rgba(0,0,0,.88);border-radius:8px;padding:6px;color:#ddd;}' +
    '#cr-panel button{font:700 12px Arial,sans-serif;margin:2px;padding:6px 9px;border:0;border-radius:6px;' +
    'background:#2b2b2b;color:#fff;cursor:pointer;}' +
    '#cr-panel button:hover{background:#444;}' +
    '#cr-dbg{margin-top:6px;opacity:.7;font-size:12px;text-align:center;letter-spacing:.3px;}';
  var styleEl = document.createElement('style');
  styleEl.textContent = css;

  // ---------- interface ----------
  var root = document.createElement('div');
  root.id = 'cr-root';
  root.setAttribute('data-state', state);

  var mainEl = document.createElement('span');
  mainEl.className = 'cr-t cr-main';
  var decEl = document.createElement('span');
  decEl.className = 'cr-t cr-dec';
  root.appendChild(mainEl);
  root.appendChild(decEl);

  var grip = document.createElement('div');
  grip.id = 'cr-grip';
  root.appendChild(grip);

  var panel = document.createElement('div');
  panel.id = 'cr-panel';
  var box = document.createElement('div');
  box.className = 'cr-box';
  panel.appendChild(box);
  root.appendChild(panel);

  var dbgEl = document.createElement('div');           // mensagens internas: nao aparecem na tela
  var creditEl = document.createElement('div');
  creditEl.id = 'cr-dbg';
  creditEl.textContent = '@dav7.zn';

  function addButton(label, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      fn();
      b.blur();
    });
    box.insertBefore(b, creditEl.parentNode === box ? creditEl : null);
  }

  // ---------- l\u00f3gica ----------
  function fmt(ms) {
    var cs = Math.floor(ms / 10);
    var c = cs % 100;
    var s = Math.floor(cs / 100);
    var m = Math.floor(s / 60);
    s = s % 60;
    return {
      main: m > 0 ? m + ':' + (s < 10 ? '0' : '') + s : String(s),
      dec: '.' + (c < 10 ? '0' : '') + c
    };
  }

  var shownMain = '', shownDec = '';
  function render() {
    var ms = state === 'running' ? performance.now() - startTs : elapsed;
    var f = fmt(ms);
    if (f.main !== shownMain) { mainEl.textContent = shownMain = f.main; }
    if (f.dec !== shownDec) { decEl.textContent = shownDec = f.dec; }
  }

  function setState(s) {
    state = s;
    root.setAttribute('data-state', s);
    render();
  }

  function log(txt) { lastAction = txt; atualizarDebug(); }

  function iniciar() {                       // verde, a partir de zero
    startTs = performance.now();
    elapsed = 0;
    setState('running');
  }

  function parar() {                         // laranja, s\u00f3 se estiver correndo
    if (state !== 'running') return;
    elapsed = performance.now() - startTs;
    setState('coin');
  }

  function pausar() {                       // morreu: congela o tempo e fica cinza (o proximo inicio zera)
    if (state === 'running') elapsed = performance.now() - startTs;
    setState('idle');
  }

  function zerar() {                         // cinza, 0.00
    elapsed = 0;
    setState('idle');
  }

  window.cronometroIniciar = iniciar;
  window.cronometroParar = parar;
  window.cronometroZerar = zerar;

  function loop() {
    if (state === 'running') render();
    requestAnimationFrame(loop);
  }

  // ---------- posi\u00e7\u00e3o e tamanho ----------
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function applySize() {
    fs = clamp(fs, 16, 400);
    root.style.fontSize = fs + 'px';
  }

  function keepInside() {
    var r = root.getBoundingClientRect();
    var x = clamp(r.left, 0, Math.max(0, window.innerWidth - r.width));
    var y = clamp(r.top, 0, Math.max(0, window.innerHeight - r.height));
    root.style.left = x + 'px';
    root.style.top = y + 'px';
  }

  function savePos() {
    var r = root.getBoundingClientRect();
    lsSet('pos', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), fs: Math.round(fs) }));
  }

  function loadPos() {
    try {
      var p = JSON.parse(lsGet('pos') || 'null');
      if (p && typeof p.fs === 'number') fs = p.fs;
      applySize();
      if (p && typeof p.x === 'number') {
        root.style.left = p.x + 'px';
        root.style.top = p.y + 'px';
      }
    } catch (e) { applySize(); }
  }

  var drag = null;
  function noCanto(e, r) {
    return e.clientX >= r.right - 32 && e.clientY >= r.bottom - 32;
  }
  root.addEventListener('pointerdown', function (e) {
    if (e.button) return;                          // s\u00f3 bot\u00e3o esquerdo / toque
    if (e.target.closest && e.target.closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    var r = root.getBoundingClientRect();
    if (noCanto(e, r)) {
      drag = { mode: 'size', x: e.clientX, y: e.clientY, w: r.width, h: r.height, fs: fs };
    } else {
      drag = { mode: 'move', dx: e.clientX - r.left, dy: e.clientY - r.top };
    }
    try { root.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
  });

  root.addEventListener('pointermove', function (e) {
    if (!drag) {
      root.style.cursor = noCanto(e, root.getBoundingClientRect()) ? 'nwse-resize' : 'move';
      return;
    }
    if (drag.mode === 'move') {
      var r = root.getBoundingClientRect();
      root.style.left = clamp(e.clientX - drag.dx, 0, Math.max(0, window.innerWidth - r.width)) + 'px';
      root.style.top = clamp(e.clientY - drag.dy, 0, Math.max(0, window.innerHeight - r.height)) + 'px';
    } else {
      var kx = (drag.w + (e.clientX - drag.x)) / drag.w;
      var ky = (drag.h + (e.clientY - drag.y)) / drag.h;
      fs = drag.fs * Math.max(0.1, (kx + ky) / 2);
      applySize();
    }
  });

  function endDrag() {
    if (!drag) return;
    drag = null;
    keepInside();
    savePos();
  }
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', keepInside);

  // painel aparece embaixo, ou em cima se o cron\u00f4metro estiver perto do rodap\u00e9
  root.addEventListener('mouseenter', function () {
    var r = root.getBoundingClientRect();
    var below = r.bottom < window.innerHeight * 0.7;
    panel.className = below ? 'below' : 'above';
    var pw = Math.min(340, window.innerWidth * 0.92);
    panel.style.left = Math.min(0, window.innerWidth - 8 - r.left - pw) + 'px';
  });

  // ---------- detec\u00e7\u00e3o por som ----------
  // Cada som curto do jogo vira uma "assinatura" (dura\u00e7\u00e3o em ms).
  var recent = [];             // {key, t} dos \u00faltimos 3 s
  var counts = {};
  // Sons medidos neste jogo e confirmados funcionando. "Ler ..." no painel sobrescreve.
  var DEFAULTS = { coin: '580ms', start: '70ms', death: '882ms' };
  var keys = {
    coin: lsGet('coin') || DEFAULTS.coin,
    start: lsGet('start') || DEFAULTS.start,
    death: lsGet('death') || DEFAULTS.death
  };
  var audioInfo = { buffer: 0, processor: 0 };

  var ultimaBatida = 0, contagem = [];
  function onSound(buf) {
    if (!buf || buf.duration > 1.5) return;          // ignora m\u00fasica e ambiente
    var key = Math.round(buf.duration * 1000) + 'ms';
    var t = performance.now();
    recent.push({ key: key, t: t });
    while (recent.length && t - recent[0].t > 3000) recent.shift();
    counts[key] = (counts[key] || 0) + 1;
    audioInfo.buffer++;
    // Batida de lado (ex.: no trem): nem sempre toca o som de morte. Guardamos a hora do som da batida (464/929 ms) e,
    // se depois vier a contagem da pontuacao (varios sons de 743 ms seguidos) com o cronometro ainda correndo, pausamos na hora da batida.
    if (state === 'running') {
      if (key === '464ms' || key === '929ms') ultimaBatida = t;
      if (key === '743ms') {
        contagem.push(t); while (contagem.length && t - contagem[0] > 1000) contagem.shift();
        if (contagem.length >= 3) {
          var quando = (ultimaBatida && t - ultimaBatida < 12000 && ultimaBatida > startTs) ? ultimaBatida : t;
          elapsed = quando - startTs; setState('idle'); contagem = []; CR.emit('death'); atualizarDebug(); return;
        }
      }
    }
    // O som de 70 ms tambem toca em qualquer botao do lobby. Se o jogo avisa o inicio da corrida pelo SDK (gameplayStart),
    // esse aviso e o certo e o som deixa de iniciar o cronometro (so serve de reserva quando o SDK nunca avisou).
    if (key === keys.start) { if (!sdkOk) { iniciar(); CR.emit('start'); } }
    else if (key === keys.coin) { parar(); CR.emit('coin'); }
    else if (key === keys.death) { pausar(); CR.emit('death'); }
    atualizarDebug();
  }

  function aprender(qual, nome) {
    var t = performance.now(), tally = {}, best = null;
    recent.forEach(function (r) { if (t - r.t <= 3000) tally[r.key] = (tally[r.key] || 0) + 1; });
    if (qual === 'coin') {                                    // moeda: o que mais repete na janela
      Object.keys(tally).forEach(function (k) { if (!best || tally[k] > tally[best]) best = k; });
    } else {                                                  // in\u00edcio/morte: o mais raro no jogo todo
      recent.forEach(function (r) {                           // empate: vale o mais recente
        if (t - r.t <= 3000 && (!best || counts[r.key] <= counts[best])) best = r.key;
      });
    }
    if (!best) { lastAction = 'nenhum som nos \u00faltimos 3s'; atualizarDebug(); return; }
    keys[qual] = best;
    lsSet(qual, best);
    log(nome + ' = ' + best);
  }

  function esquecer() {
    keys = { coin: DEFAULTS.coin, start: DEFAULTS.start, death: DEFAULTS.death };
    ['coin', 'start', 'death'].forEach(function (k) { try { localStorage.removeItem('cronometro.' + k); } catch (e) { /* ok */ } });
    log('sons esquecidos');
  }

  function atualizarDebug() {
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
      .slice(0, 3).map(function (k) { return k + 'x' + counts[k]; }).join(' ');
    dbgEl.textContent = 'sons:' + audioInfo.buffer + ' proc:' + audioInfo.processor +
      ' [' + top + '] in\u00edcio=' + (keys.start || '-') + ' moeda=' + (keys.coin || '-') +
      ' morte=' + (keys.death || '-') + (lastAction ? ' | ' + lastAction : '');
  }

  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC && AC.prototype) {
      var cbs = AC.prototype.createBufferSource;
      if (cbs) {
        AC.prototype.createBufferSource = function () {
          var node = cbs.apply(this, arguments);
          var st = node.start;
          node.start = function () {
            try { onSound(node.buffer); } catch (e) { /* nunca quebra o jogo */ }
            return st.apply(node, arguments);
          };
          return node;
        };
      }
      var csp = AC.prototype.createScriptProcessor;
      if (csp) {
        AC.prototype.createScriptProcessor = function () {
          audioInfo.processor++;
          return csp.apply(this, arguments);
        };
      }
    }
  } catch (e) { /* sem \u00e1udio: segue no modo manual */ }

  // ---------- liga\u00e7\u00e3o com o SDK do jogo ----------
  function wrap(sdk, name, action) {
    var original = sdk[name];
    sdk[name] = function () {
      log(name);
      try { action(); } catch (e) { /* ok */ }
      return typeof original === 'function' ? original.apply(this, arguments) : undefined;
    };
  }

  var sdkOk = lsGet('sdkstart') === '1';
  function aoInicioSdk() {
    if (!sdkOk) { sdkOk = true; lsSet('sdkstart', '1'); }
    iniciar(); CR.emit('start');
  }
  function hookSdk() {
    var sdk = window.PokiSDK;
    if (!sdk || sdk.__cronometro) return;
    ['gameplayStart', 'roundStart'].forEach(function (n) { wrap(sdk, n, aoInicioSdk); });
    ['gameplayStop', 'roundEnd'].forEach(function (n) { wrap(sdk, n, pausar); });
    sdk.__cronometro = true;
    sdkOk = true;                    // o jogo tem o SDK: o aviso de inicio de corrida e quem manda; o som de botao nao inicia mais
  }
  setInterval(hookSdk, 300);

  // ---------- teclado ----------
  // Atalhos manuais do cronometro: 1 = iniciar, 2 = parar, 3 = zerar.
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !e.isTrusted) return;
    var k = e.key;
    if (k === '1') iniciar();
    else if (k === '2') parar();
    else if (k === '3') zerar();
  });

  // ---------- montagem ----------
  function montar() {
    document.head.appendChild(styleEl);
    box.appendChild(creditEl);
    document.body.appendChild(root);
    loadPos();
    keepInside();
    atualizarDebug();
    render();
    loop();
  }

  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
