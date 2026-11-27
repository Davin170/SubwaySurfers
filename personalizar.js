// personalizar.js \u2014 PERSONALIZAR o cronometro: cor/imagem/opacidade do fundo, cor do texto (correndo, morte, moeda)
// e o visualizador de TECLAS (W A S D / setas) com cores proprias. Abre pelo botao "Personalizar" do menu.
// Precisa do cronometro.js (window.CR) carregado antes. Carregue ANTES do menu-save.js (para ver as teclas W A S D).
(function () {
  'use strict';
  var CR = window.CR;
  if (!CR) return;
  var lsGet = CR.lsGet, lsSet = CR.lsSet;

  var PADRAO = {
    bgCor: '#000000', bgOp: 88, textoCorrendo: '#2ecc71', textoMorte: '#8c8c8c', textoMoeda: '#ff8a1c',
    ocultarTimer: false, ocultaTeclas: false, setas: false, tamTeclas: 44, tcFundo: '#1b1d22', tcTexto: '#e8e8e8', tcFundoOn: '#2ecc71', tcTextoOn: '#06280f', fpsCor: '#ffffff'
  };
  ['bgCor', 'textoCorrendo', 'textoMorte', 'textoMoeda', 'tcFundo', 'tcTexto', 'tcFundoOn', 'tcTextoOn', 'fpsCor'].forEach(function (c) { PADRAO['rgb_' + c] = false; });
  var P = {}, k;
  function carregar() {
    var j = null; try { j = JSON.parse(lsGet('pers') || 'null'); } catch (e) { j = null; }
    for (k in PADRAO) P[k] = (j && typeof j[k] === typeof PADRAO[k]) ? j[k] : PADRAO[k];
  }
  function salvar() { lsSet('pers', JSON.stringify(P)); }
  function imagem() { return lsGet('pers.img') || ''; }
  carregar();

  function mistura(hex, t) {                       // clareia a cor em direcao ao branco (para o degrade do texto)
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function m(c) { return Math.round(c + (255 - c) * t); }
    return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')';
  }

  // RGB: com a caixinha "RGB" a cor vira arco-iris animado (o matiz --rgbh gira no <html>).
  // luz: 0 = cor cheia, 1 = clareada (para o degrade do texto)
  function cc(chave, luz) {
    if (P['rgb_' + chave]) return 'hsl(var(--rgbh),100%,' + (luz ? 75 : 50) + '%)';
    return luz ? mistura(P[chave], .55) : P[chave];
  }
  var hue = 0, rgbTimer = 0;
  function giraRgb() {
    var algum = Object.keys(P).some(function (x) { return x.indexOf('rgb_') === 0 && P[x]; });
    if (algum && !rgbTimer) {
      rgbTimer = setInterval(function () { hue = (hue + 4) % 360; document.documentElement.style.setProperty('--rgbh', String(hue)); }, 50);
    } else if (!algum && rgbTimer) { clearInterval(rgbTimer); rgbTimer = 0; }
  }
  document.documentElement.style.setProperty('--rgbh', '0');

  // ---------- aplica no cronometro ----------
  var estilo = document.createElement('style');
  function aplicar() {
    var root = document.getElementById('cr-root');
    if (root) {
      root.style.setProperty('--bgc', P.rgb_bgCor ? 'hsl(var(--rgbh),100%,38%)' : P.bgCor);
      root.style.setProperty('--bgo', String(P.bgOp / 100));
      var img = imagem();
      root.style.setProperty('--bgi', img ? 'url("' + img + '")' : 'none');
    }
    estilo.textContent =
      '#cr-root#cr-root[data-state=running]{--c1:' + cc('textoCorrendo', 1) + ';--c2:' + cc('textoCorrendo') + ';}' +
      '#cr-root#cr-root[data-state=idle]{--c1:' + cc('textoMorte', 1) + ';--c2:' + cc('textoMorte') + ';}' +
      '#cr-root#cr-root[data-state=coin]{--c1:' + cc('textoMoeda', 1) + ';--c2:' + cc('textoMoeda') + ';}' +
      '#cr-keys{--tk:' + P.tamTeclas + 'px;}' +
      '#cr-keys .kc{background:' + cc('tcFundo') + ';color:' + cc('tcTexto') + ';}' +
      '#cr-keys .kc.on{background:' + cc('tcFundoOn') + ';color:' + cc('tcTextoOn') + ';}';
    document.documentElement.style.setProperty('--fpscor', cc('fpsCor'));
    giraRgb();
    if (teclasEl) teclasEl.style.display = P.ocultaTeclas ? 'none' : 'grid';
    etiquetas();
    if (root) root.style.visibility = P.ocultarTimer ? 'hidden' : '';
    mostraBotaoMenu(!!P.ocultarTimer);
  }

  // ---------- botao "Menu" no lugar do cronometro oculto ----------
  var menuBtn = null, ultimoRect = null;
  function mostraBotaoMenu(v) {
    var root = document.getElementById('cr-root');
    if (v && !menuBtn) {
      menuBtn = document.createElement('div'); menuBtn.id = 'cr-menubtn'; menuBtn.textContent = 'Menu';
      menuBtn.style.cssText = 'position:fixed;z-index:2147483643;padding:10px 18px;border-radius:12px;background:rgba(20,20,20,.7);color:#fff;font:700 16px Arial,sans-serif;' +
        'border:1px solid rgba(255,255,255,.15);cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;';
      var r = root ? root.getBoundingClientRect() : { left: 20, top: 20 };
      var salvo = null; try { salvo = JSON.parse(lsGet('pers.menubtn') || 'null'); } catch (e) { /* ok */ }
      menuBtn.style.left = (salvo ? salvo.x : r.left) + 'px'; menuBtn.style.top = (salvo ? salvo.y : r.top) + 'px';
      var d = null, moveu = false;
      menuBtn.addEventListener('pointerdown', function (e) {
        var b = menuBtn.getBoundingClientRect(); d = { x: e.clientX, y: e.clientY, dx: e.clientX - b.left, dy: e.clientY - b.top }; moveu = false;
        try { menuBtn.setPointerCapture(e.pointerId); } catch (er) { /* ok */ } e.stopPropagation();
      });
      menuBtn.addEventListener('pointermove', function (e) {
        if (!d) return;
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 8) moveu = true;
        if (!moveu) return;
        menuBtn.style.left = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - d.dx)) + 'px';
        menuBtn.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - d.dy)) + 'px';
      });
      menuBtn.addEventListener('pointerup', function () {
        if (!d) return;
        if (moveu) { var b = menuBtn.getBoundingClientRect(); lsSet('pers.menubtn', JSON.stringify({ x: Math.round(b.left), y: Math.round(b.top) })); }
        else if (CR.abrirMenu) CR.abrirMenu();
        d = null;
      });
      menuBtn.addEventListener('pointercancel', function () { d = null; });
      document.body.appendChild(menuBtn);
    }
    if (menuBtn) menuBtn.style.display = v ? 'block' : 'none';
  }

  // letras das teclas: W A S D ou setas
  var ETQ = { W: ['W', '\u2191'], A: ['A', '\u2190'], S: ['S', '\u2193'], D: ['D', '\u2192'] };
  function etiquetas() { Object.keys(caps).forEach(function (l) { caps[l].textContent = ETQ[l][P.setas ? 1 : 0]; }); }

  // ---------- visualizador de teclas ----------
  var teclasEl = null, mapa = { KeyW: 'W', ArrowUp: 'W', KeyA: 'A', ArrowLeft: 'A', KeyS: 'S', ArrowDown: 'S', KeyD: 'D', ArrowRight: 'D' };
  var caps = {}, segurando = {};
  function criaTeclas() {
    var st = document.createElement('style');
    st.textContent = '#cr-keys{position:fixed;left:20px;bottom:110px;z-index:2147483644;display:grid;grid-template-columns:repeat(3,var(--tk));' +
      'grid-template-rows:repeat(2,var(--tk));gap:calc(var(--tk)*.1);cursor:move;touch-action:none;user-select:none;-webkit-user-select:none;}' +
      '#cr-keys .kc{display:flex;align-items:center;justify-content:center;border-radius:calc(var(--tk)*.18);font:700 calc(var(--tk)*.42) Arial,sans-serif;' +
      'border:2px solid rgba(255,255,255,.18);box-sizing:border-box;transition:background .05s;}' +
      '#cr-keys .vazio{visibility:hidden;}';
    document.head.appendChild(st);
    teclasEl = document.createElement('div'); teclasEl.id = 'cr-keys';
    ['', 'W', '', 'A', 'S', 'D'].forEach(function (l) {
      var d = document.createElement('div');
      if (!l) { d.className = 'kc vazio'; } else { d.className = 'kc'; d.textContent = l; caps[l] = d; }
      teclasEl.appendChild(d);
    });
    document.body.appendChild(teclasEl);
    carregaPos(); arrastaTeclas();
  }
  function pintaTeclas() { Object.keys(caps).forEach(function (l) { caps[l].classList.toggle('on', !!segurando[l]); }); }
  function aoTecla(e) {
    var l = mapa[e.code]; if (!l || !e.isTrusted) return;
    var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    segurando[l] = e.type === 'keydown'; pintaTeclas();
  }
  window.addEventListener('keydown', aoTecla, true);
  window.addEventListener('keyup', aoTecla, true);
  window.addEventListener('blur', function () { segurando = {}; pintaTeclas(); });

  function carregaPos() {
    try { var p = JSON.parse(lsGet('pers.pos') || 'null'); if (p) { teclasEl.style.left = p.x + 'px'; teclasEl.style.top = p.y + 'px'; teclasEl.style.bottom = 'auto'; } } catch (e) { /* ok */ }
  }
  function arrastaTeclas() {
    var d = null;
    teclasEl.addEventListener('pointerdown', function (e) {
      var r = teclasEl.getBoundingClientRect(); d = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      try { teclasEl.setPointerCapture(e.pointerId); } catch (er) { /* ok */ } e.preventDefault(); e.stopPropagation();
    });
    teclasEl.addEventListener('pointermove', function (e) {
      if (!d) return;
      var x = Math.max(0, Math.min(window.innerWidth - 20, e.clientX - d.dx)), y = Math.max(0, Math.min(window.innerHeight - 20, e.clientY - d.dy));
      teclasEl.style.left = x + 'px'; teclasEl.style.top = y + 'px'; teclasEl.style.bottom = 'auto';
    });
    function fim() { if (!d) return; d = null; var r = teclasEl.getBoundingClientRect(); lsSet('pers.pos', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); }
    teclasEl.addEventListener('pointerup', fim); teclasEl.addEventListener('pointercancel', fim);
  }

  // ---------- painel de personalizacao ----------
  var pz = null;
  function criaPainel() {
    var st = document.createElement('style');
    st.textContent = '#cr-pz{position:fixed;top:10px;right:10px;bottom:10px;z-index:2147483647;display:none;flex-direction:column;width:330px;max-width:94vw;' +
      'box-sizing:border-box;background:#101216;color:#eee;border:1px solid #2a2d33;border-radius:14px;padding:16px;font-family:Arial,sans-serif;font-size:14px;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.6);}' +
      '#cr-pz h1{margin:0 0 2px;font-size:19px;} #cr-pz h2{margin:14px 0 4px;font-size:12px;color:#8a909a;text-transform:uppercase;letter-spacing:.8px;}' +
      '#cr-pz .pr,#cr-pz label.pr{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid #1d2026;cursor:pointer;}' +
      '#cr-pz input[type=color]{width:46px;height:28px;padding:0;border:1px solid #2f333b;border-radius:6px;background:none;cursor:pointer;}' +
      '#cr-pz input[type=range]{width:150px;} #cr-pz input[type=checkbox]{width:18px;height:18px;accent-color:#2ecc71;}' +
      '#cr-pz button.sw{width:56px;height:30px;margin:0;padding:0;border:1px solid #3a3f48;border-radius:7px;}' +
      '#cr-pz button{font:700 13px Arial;padding:9px 12px;margin:6px 4px 0 0;border:0;border-radius:8px;cursor:pointer;background:#262a31;color:#fff;}' +
      '#cr-pz button.g{background:linear-gradient(180deg,#a6ffbf,#2ecc71);color:#06280f;}';
    document.head.appendChild(st);
    pz = document.createElement('div'); pz.id = 'cr-pz';
    function cor(id, t) { return '<div class="pr"><span>' + t + '</span><button type="button" class="sw" id="' + id + '" data-cor="' + id.slice(3) + '"></button></div>'; }
    pz.innerHTML = '<h1>Personalizar</h1><div style="color:#9aa0aa;font-size:12px">Mudan\u00e7as aparecem na hora e ficam salvas.</div>' +
      '<h2>Cron\u00f4metro</h2><label class="pr"><span>Ocultar cron\u00f4metro</span><input type="checkbox" id="pz-ocultarTimer"></label>' +
      '<h2>Fundo do cron\u00f4metro</h2>' + cor('pz-bgCor', 'Cor do fundo') +
      '<label class="pr"><span>Opacidade do fundo</span><input type="range" id="pz-bgOp" min="0" max="100"></label>' +
      '<div><button type="button" id="pz-img">Imagem do computador...</button><button type="button" id="pz-semimg">Tirar imagem</button>' +
      '<input type="file" id="pz-file" accept="image/*" style="display:none"></div>' +
      '<h2>Cor do texto</h2>' + cor('pz-textoCorrendo', 'Correndo') + cor('pz-textoMorte', 'Morte / parado') + cor('pz-textoMoeda', 'Pegou moeda') +
      '<h2>FPS</h2><label class="pr"><span>Exibir FPS</span><input type="checkbox" id="pz-fpsOn"></label>' + cor('pz-fpsCor', 'Cor do FPS') +
      '<h2>Teclas (W A S D e setas)</h2>' +
      '<label class="pr"><span>Ocultar teclas</span><input type="checkbox" id="pz-ocultaTeclas"></label>' +
      '<label class="pr"><span>Usar setas \u2190 \u2191 \u2193 \u2192 em vez de WASD</span><input type="checkbox" id="pz-setas"></label>' +
      '<label class="pr"><span>Tamanho</span><input type="range" id="pz-tamTeclas" min="24" max="90"></label>' +
      cor('pz-tcFundo', 'Tecla: fundo') + cor('pz-tcTexto', 'Tecla: letra') + cor('pz-tcFundoOn', 'Apertada: fundo') + cor('pz-tcTextoOn', 'Apertada: letra') +
      '<div style="margin-top:12px"><button type="button" class="g" id="pz-fechar">Fechar</button><button type="button" id="pz-padrao">Restaurar padr\u00e3o</button></div>' +
      '<div id="pz-msg" style="margin-top:8px;font-size:12px;color:#8a909a;min-height:16px"></div>';
    document.body.appendChild(pz);
    var q = function (id) { return pz.querySelector('#pz-' + id); };
    Object.keys(PADRAO).forEach(function (key) {
      var el = q(key); if (!el) return;
      var evt = el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(evt, function () {
        P[key] = el.type === 'checkbox' ? el.checked : (el.type === 'range' ? parseInt(el.value, 10) : el.value);
        salvar(); aplicar();
      });
    });
    q('img').addEventListener('click', function () { q('file').click(); });
    q('file').addEventListener('change', function () {
      var f = q('file').files && q('file').files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var im = new Image();
        im.onload = function () {                       // reduz para caber no armazenamento do navegador
          var s = Math.min(1, 520 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.width * s)); c.height = Math.max(1, Math.round(im.height * s));
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          var url = c.toDataURL(f.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
          try { localStorage.setItem('cronometro.pers.img', url); q('file').value = ''; q('msg').textContent = 'Imagem aplicada.'; aplicar(); }
          catch (e) { q('msg').textContent = 'Imagem grande demais para guardar. Tente uma menor.'; }
        };
        im.onerror = function () { q('msg').textContent = 'N\u00e3o consegui abrir essa imagem.'; };
        im.src = rd.result;
      };
      rd.readAsDataURL(f);
    });
    q('semimg').addEventListener('click', function () { try { localStorage.removeItem('cronometro.pers.img'); } catch (e) { /* ok */ } q('msg').textContent = 'Imagem removida.'; aplicar(); });
    q('fechar').addEventListener('click', function () { pz.style.display = 'none'; var cv = document.querySelector('canvas'); if (cv && cv.focus) cv.focus(); });
    q('padrao').addEventListener('click', function () { for (k in PADRAO) P[k] = PADRAO[k]; try { localStorage.removeItem('cronometro.pers.img'); } catch (e) { /* ok */ } salvar(); preenche(); aplicar(); q('msg').textContent = 'Padr\u00e3o restaurado.'; });
    q('fpsOn').addEventListener('change', function () { if (CR.definirFps) CR.definirFps(q('fpsOn').checked); });
    Array.prototype.forEach.call(pz.querySelectorAll('button.sw'), function (b) { b.addEventListener('click', function () { abreCp(b.getAttribute('data-cor')); }); });
    CR.overlayIds.push('cr-pz');
  }
  function preenche() {
    Object.keys(PADRAO).forEach(function (key) {
      var el = pz.querySelector('#pz-' + key); if (!el) return;
      if (el.type === 'checkbox') el.checked = !!P[key]; else if (el.className !== 'sw') el.value = P[key];
    });
    var fo = pz.querySelector('#pz-fpsOn'); if (fo) fo.checked = !!(CR.fpsAtivo && CR.fpsAtivo());
    pintaSw();
  }
  // ---------- seletor de cor proprio (com RGB arco-iris) ----------
  var ARCO = 'linear-gradient(90deg,#ff3b3b,#ffd23b,#3bff6b,#3bd2ff,#7a3bff,#ff3bd2)';
  var PRESETS = ['#ff0000', '#00ffff', '#0000ff', '#00ff00', '#ff00ff', '#ffff00', '#000000', '#ffffff'];
  function pintaSw() {
    if (!pz) return;
    Array.prototype.forEach.call(pz.querySelectorAll('button.sw'), function (b) {
      var c = b.getAttribute('data-cor');
      b.style.background = P['rgb_' + c] ? ARCO : P[c];
    });
  }
  var cp = null, cpSel = null, cpChave = '';
  function hex2(n) { return ('0' + n.toString(16)).slice(-2); }
  function criaCp() {
    var st = document.createElement('style');
    st.textContent = '#cr-cp{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font-family:Arial,sans-serif;}' +
      '#cr-cp .cc{width:340px;max-width:94vw;box-sizing:border-box;background:#252a2e;color:#e8eaed;border-radius:22px;padding:20px 18px 14px;}' +
      '#cr-cp h3{margin:0 0 14px;font-size:22px;font-weight:400;}' +
      '#cr-cp .gr{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;justify-items:center;}' +
      '#cr-cp .it{width:52px;height:52px;border-radius:10px;border:3px solid #141414;box-shadow:0 0 0 1px #6b7075;cursor:pointer;box-sizing:border-box;padding:0;}' +
      '#cr-cp .it.sel{box-shadow:0 0 0 3px #7fd1e0;}' +
      '#cr-cp .lk{background:none;border:0;color:#7fd1e0;font:700 16px Arial;cursor:pointer;padding:10px 6px;}' +
      '#cr-cp .lin{display:flex;align-items:center;justify-content:space-between;margin-top:12px;}' +
      '#cr-cp .pv{width:52px;height:52px;border-radius:10px;border:3px solid #141414;box-shadow:0 0 0 1px #6b7075;box-sizing:border-box;}' +
      '#cr-cp .sl{display:none;margin-top:10px;} #cr-cp .sl label{display:flex;align-items:center;gap:8px;margin:4px 0;font-size:14px;}' +
      '#cr-cp .sl input{flex:1;}' +
      '#cr-cp .ft{display:flex;justify-content:flex-end;gap:18px;margin-top:8px;}';
    document.head.appendChild(st);
    cp = document.createElement('div'); cp.id = 'cr-cp';
    cp.innerHTML = '<div class="cc"><h3>Selecionar cor</h3><div class="gr" id="cp-gr"></div>' +
      '<div class="sl" id="cp-sl"><label>R <input type="range" min="0" max="255" id="cp-r"></label><label>G <input type="range" min="0" max="255" id="cp-g"></label><label>B <input type="range" min="0" max="255" id="cp-b"></label></div>' +
      '<div class="lin"><button type="button" class="lk" id="cp-pers" style="padding-left:0">Personalizado</button><span style="display:flex;align-items:center;gap:10px"><span style="font-size:15px">Cor escolhida</span><div class="pv" id="cp-pv"></div></span></div>' +
      '<div class="ft"><button type="button" class="lk" id="cp-no">Cancelar</button><button type="button" class="lk" id="cp-ok">Definir</button></div></div>';
    document.body.appendChild(cp);
    var gr = cp.querySelector('#cp-gr');
    PRESETS.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'it'; b.style.background = c; b.setAttribute('data-c', c);
      b.onclick = function () { cpSel = { rgb: false, hex: c }; cpDesenha(); }; gr.appendChild(b);
    });
    var rb = document.createElement('button'); rb.type = 'button'; rb.className = 'it'; rb.id = 'cp-rgb'; rb.style.background = ARCO; rb.title = 'RGB (arco-\u00edris animado)';
    rb.onclick = function () { cpSel = { rgb: true, hex: cpSel ? cpSel.hex : '#ffffff' }; cpDesenha(); }; gr.appendChild(rb);
    cp.querySelector('#cp-pers').onclick = function () { var sl = cp.querySelector('#cp-sl'); sl.style.display = sl.style.display === 'block' ? 'none' : 'block'; };
    ['r', 'g', 'b'].forEach(function (x) {
      cp.querySelector('#cp-' + x).addEventListener('input', function () {
        var v = ['r', 'g', 'b'].map(function (y) { return hex2(parseInt(cp.querySelector('#cp-' + y).value, 10)); }).join('');
        cpSel = { rgb: false, hex: '#' + v }; cpDesenha(true);
      });
    });
    cp.querySelector('#cp-no').onclick = function () { cp.style.display = 'none'; };
    cp.querySelector('#cp-ok').onclick = function () {
      P['rgb_' + cpChave] = !!cpSel.rgb; if (!cpSel.rgb) P[cpChave] = cpSel.hex;
      salvar(); aplicar(); pintaSw(); cp.style.display = 'none';
    };
  }
  function cpDesenha(deSlider) {
    cp.querySelector('#cp-pv').style.background = cpSel.rgb ? ARCO : cpSel.hex;
    Array.prototype.forEach.call(cp.querySelectorAll('.it'), function (b) {
      b.classList.toggle('sel', cpSel.rgb ? b.id === 'cp-rgb' : b.getAttribute('data-c') === cpSel.hex);
    });
    if (!deSlider) {
      var n = parseInt(cpSel.hex.slice(1), 16);
      cp.querySelector('#cp-r').value = n >> 16; cp.querySelector('#cp-g').value = (n >> 8) & 255; cp.querySelector('#cp-b').value = n & 255;
    }
  }
  function abreCp(chave) {
    if (!cp) criaCp();
    cpChave = chave; cpSel = { rgb: !!P['rgb_' + chave], hex: P[chave] };
    cp.querySelector('#cp-sl').style.display = 'none';
    cpDesenha(); cp.style.display = 'flex';
  }

  function abrir() { if (!pz) criaPainel(); preenche(); pz.style.display = 'flex'; }

  CR.personalizarAbrir = abrir;
  function montar() { document.head.appendChild(estilo); criaTeclas(); aplicar(); }
  if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar);
})();
