// menu-save.js \u2014 MENU inicial + edicao do SAVE + opcoes (No coin, tutorial, WASD) + botao nas Configuracoes do jogo.
// Precisa do cronometro.js (window.CR) carregado antes.
(function () {
  'use strict';
  var CR = window.CR;
  if (!CR) return;
  var lsGet = CR.lsGet, lsSet = CR.lsSet, log = CR.log;
  
  // ---------- save do jogo: moedas, chaves, HeadStart e personagens ----------
  // O jogo guarda o progresso no IndexedDB ("/idbfs") em arquivos BSON com um selo SHA-1.
  // Antes de o jogo carregar, este trecho edita esses arquivos e refaz o selo.
  // S\u00f3 mexe se o arquivo for reconhecido e o selo atual estiver correto; sen\u00e3o n\u00e3o toca em nada.
  var PERSONAGENS = ['slick', 'tricky', 'spike', 'yutani', 'frank', 'frizzy', 'king', 'lucy',
    'ninja', 'tasha', 'zoe', 'brody', 'princek', 'tony', 'seoulCharacter01', 'amsterdamCharacter01'];
  // Marcas de "tutorial ja feito". Nao mexe em idade nem em consentimento de anuncios (sao escolhas suas).
  var TUTORIAL_FLAGS = ['isTutorialCompleted', 'hasSeenFrontScreenFirstTime', 'hasShownMissionIntroPopup',
    'hasShownEndGameMissionPopup', 'hasShownCollectPopup', 'hasShownFacebookPopup', 'hasShownHoverboardPopup'];
  var CFG_PADRAO = { coins: 99999999, keys: 999, headstart: 99, hoverboard: 99,
    characters: true, tutorial: true, wasd: true, timer: true, noCoin: false, fps: false };
  function carregarCfg() {
    var c = {}, k, j = null;
    try { j = JSON.parse(lsGet('cfg') || 'null'); } catch (e) { j = null; }
    for (k in CFG_PADRAO) c[k] = (j && typeof j[k] === typeof CFG_PADRAO[k]) ? j[k] : CFG_PADRAO[k];
    c.tutorial = true; c.wasd = true;                  // sempre ativos
    return c;
  }
  var cfg = carregarCfg();
  var cheatOn = lsGet('cheats') !== 'off';
  var te = new TextEncoder(), td = new TextDecoder();

  function bsonDecode(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), pos = 0;
    function cstr() {
      var st = pos; while (u8[pos] !== 0) pos++;
      var r = td.decode(u8.subarray(st, pos)); pos++; return r;
    }
    function doc() {
      var start = pos, len = dv.getInt32(pos, true), els = [];
      pos += 4;
      while (pos < start + len - 1) {
        var t = u8[pos++], k = cstr(), v;
        if (t === 0x10) { v = dv.getInt32(pos, true); pos += 4; }
        else if (t === 0x12 || t === 0x09) { v = dv.getBigInt64(pos, true); pos += 8; }
        else if (t === 0x01) { v = dv.getFloat64(pos, true); pos += 8; }
        else if (t === 0x08) { v = u8[pos++] !== 0; }
        else if (t === 0x0A) { v = null; }
        else if (t === 0x02) { var n = dv.getInt32(pos, true); v = td.decode(u8.subarray(pos + 4, pos + 3 + n)); pos += 4 + n; }
        else if (t === 0x03 || t === 0x04) { v = doc(); }
        else if (t === 0x05) { var bn = dv.getInt32(pos, true); v = { sub: u8[pos + 4], bytes: u8.slice(pos + 5, pos + 5 + bn) }; pos += 5 + bn; }
        else throw new Error('tipo BSON desconhecido ' + t);
        els.push({ t: t, k: k, v: v });
      }
      pos = start + len;
      return els;
    }
    return doc();
  }

  function bsonEncode(els) {
    var parts = [], size = 4;
    els.forEach(function (el) {
      var name = te.encode(el.k), head = new Uint8Array(name.length + 2), t = el.t, v = el.v, b;
      head[0] = t; head.set(name, 1);
      if (t === 0x10) { b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); }
      else if (t === 0x12 || t === 0x09) { b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, v, true); }
      else if (t === 0x01) { b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); }
      else if (t === 0x08) { b = Uint8Array.of(v ? 1 : 0); }
      else if (t === 0x0A) { b = new Uint8Array(0); }
      else if (t === 0x02) { var sb = te.encode(v); b = new Uint8Array(5 + sb.length); new DataView(b.buffer).setInt32(0, sb.length + 1, true); b.set(sb, 4); }
      else if (t === 0x03 || t === 0x04) { b = bsonEncode(v); }
      else { b = new Uint8Array(5 + v.bytes.length); new DataView(b.buffer).setInt32(0, v.bytes.length, true); b[4] = v.sub; b.set(v.bytes, 5); }
      parts.push(head, b); size += head.length + b.length;
    });
    var out = new Uint8Array(size + 1), o = 4;
    new DataView(out.buffer).setInt32(0, size + 1, true);
    parts.forEach(function (pt) { out.set(pt, o); o += pt.length; });
    return out;
  }

  function sameBytes(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function sha1(u8) { return crypto.subtle.digest('SHA-1', u8).then(function (d) { return new Uint8Array(d); }); }
  function find(els, k) { for (var i = 0; i < els.length; i++) if (els[i].k === k) return els[i]; return null; }
  function ligar(els, k) { var e = find(els, k); if (e && e.t === 0x08 && e.v === false) { e.v = true; return 1; } return 0; }
  function forcar(els, k, val) { var e = find(els, k); if (e && e.t === 0x10 && e.v !== val) { e.v = val; return 1; } return 0; }
  function atLeast(els, k, val) { var e = find(els, k); if (e && e.t === 0x10 && e.v < val) { e.v = val; return 1; } return 0; }

  // devolve os bytes novos do arquivo, ou null se n\u00e3o for reconhecido / nada a mudar
  var why = '';
  function patchSave(u8) {
    if (u8.length < 40 || new DataView(u8.buffer, u8.byteOffset).getUint32(0, true) !== 20) { why = 'cabecalho'; return Promise.resolve(null); }
    var body = u8.slice(28);
    return sha1(body).then(function (sel) {
      if (!sameBytes(sel, u8.subarray(4, 24))) { why = 'selo'; return null; }   // selo atual n\u00e3o confere
      var els = bsonDecode(body);
      if (!sameBytes(bsonEncode(els), body)) { why = 'formato'; return null; }  // n\u00e3o reproduz o arquivo igual
      var changed = 0;
      if (cfg.noCoin) changed += forcar(els, 'obfuscatedCoins', 0);   // sem moedas, nao da para comprar chave/prancha no meio da partida
      else if (cfg.coins > 0) changed += atLeast(els, 'obfuscatedCoins', cfg.coins);
      if (cfg.noCoin) changed += forcar(els, 'obfuscatedKeys', 0);
      else if (cfg.keys > 0) changed += atLeast(els, 'obfuscatedKeys', cfg.keys);
      var pw = find(els, 'powerups');
      if (pw && pw.t === 0x03) {
        if (cfg.headstart > 0) changed += atLeast(pw.v, 'headstart2000', cfg.headstart);
        if (cfg.noCoin) changed += forcar(pw.v, 'hoverboard', 0);
        else if (cfg.hoverboard > 0) changed += atLeast(pw.v, 'hoverboard', cfg.hoverboard);
      }
      if (cfg.tutorial) TUTORIAL_FLAGS.forEach(function (k) { changed += ligar(els, k); });
      var uc = cfg.characters ? find(els, 'unlockedCharacters') : null;
      if (uc && uc.t === 0x04) {
        var have = uc.v.map(function (e) { return e.v; });
        PERSONAGENS.forEach(function (id) {
          if (have.indexOf(id) < 0) { uc.v.push({ t: 0x02, k: String(uc.v.length), v: id }); changed++; }
        });
      }
      if (!changed) { why = 'ja esta no maximo'; return null; }
      var nb = bsonEncode(els), out = new Uint8Array(28 + nb.length);
      out.set(u8.subarray(0, 28)); out.set(nb, 28);
      new DataView(out.buffer).setUint32(24, nb.length, true);
      return sha1(nb).then(function (ns) { out.set(ns, 4); return out; });
    });
  }

  function paraB64(u8) { var t = ''; for (var i = 0; i < u8.length; i++) t += String.fromCharCode(u8[i]); return btoa(t); }
  function deB64(b) { var t = atob(b), u = new Uint8Array(t.length); for (var i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; }
  function guardarBackup(nome, bytes) { if (!lsGet('bk.' + nome)) lsSet('bk.' + nome, paraB64(new Uint8Array(bytes))); }
  function lerBackup(nome) { var b = lsGet('bk.' + nome); return b ? deB64(b) : null; }

  function aplicarSave() {
    return new Promise(function (resolve) {
      var restaurar = lsGet('restore') === '1';
      if ((!cheatOn && !restaurar) || !window.indexedDB || !window.crypto || !crypto.subtle) return resolve(0);
      var req;
      try { req = indexedDB.open('/idbfs'); } catch (e) { return resolve(0); }
      req.onupgradeneeded = function (e) { try { e.target.transaction.abort(); } catch (x) { /* banco ainda n\u00e3o existe: n\u00e3o cria */ } };
      req.onerror = function () { resolve(0); };
      req.onsuccess = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('FILE_DATA')) { db.close(); return resolve(0); }
        var items = [], cur = db.transaction('FILE_DATA', 'readonly').objectStore('FILE_DATA').openCursor();
        cur.onerror = function () { db.close(); resolve(0); };
        cur.onsuccess = function (e) {
          var c = e.target.result;
          if (c) {
            if (/\/Save\/cloud(_old)?$/.test(String(c.key)) && c.value && c.value.contents) items.push({ key: c.key, val: c.value });
            return c.continue();
          }
          var feitos = 0;
          log('arquivos de save vistos: ' + items.length);
          items.reduce(function (chain, it) {
            return chain.then(function () {
              var nome = String(it.key).split('/').pop();
              var novo = restaurar ? Promise.resolve(lerBackup(nome))
                : patchSave(new Uint8Array(it.val.contents)).then(function (nu) {
                  if (nu) guardarBackup(nome, it.val.contents);   // guarda o original antes da 1a edicao
                  return nu;
                });
              return novo.then(function (nu) {
                if (!nu) return;
                it.val.contents = nu; it.val.timestamp = new Date();
                return new Promise(function (ok) {
                  var tx = db.transaction('FILE_DATA', 'readwrite');
                  tx.objectStore('FILE_DATA').put(it.val, it.key);
                  tx.oncomplete = function () { feitos++; ok(); };
                  tx.onerror = tx.onabort = function () { ok(); };
                });
              });
            }).catch(function (err) { log('erro no save: ' + (err && err.message)); });
          }, Promise.resolve()).then(function () { if (restaurar) lsSet('restore', '0'); db.close(); resolve(feitos); });
        };
      };
    });
  }

  window.cronometroSaveAplicado = aplicarSave().then(function (n) {
    log(lsGet('restore') === '0' && n ? 'save original restaurado' : cheatOn ? (n ? 'save editado (' + n + ' arq.)' : 'save: nada a mudar (' + why + ')') : 'trapa\u00e7a desligada');
    return n;
  });

  // ---------- menu inicial ----------
  // Aparece por cima do jogo ao abrir a pagina. O jogo carrega por tras.
  // Se voce mudar algo que afeta o save, a pagina recarrega uma vez para o jogo ler o save novo.
  var menuEl = null;
  function chaveSave(c, mestre) { return JSON.stringify([mestre, c.coins, c.keys, c.headstart, c.hoverboard, c.characters, c.tutorial, c.noCoin]); }
  var snapshot = chaveSave(cfg, cheatOn);          // o que ja foi aplicado ao save nesta carga

  function aplicarVisual() { ligaFps(cfg.fps); }
  function $m(id) { return menuEl.querySelector('#' + id); }
  function num(id) { return Math.max(0, Math.min(2000000000, parseInt($m(id).value, 10) || 0)); }

  function restaurarOriginal() {
    if (!lsGet('bk.cloud')) { log('sem backup do save'); if (menuEl) $m('cm-nota').textContent = 'Ainda n\u00e3o h\u00e1 backup: o save nunca foi editado.'; return; }
    lsSet('restore', '1'); lsSet('cheats', 'off');
    location.reload();
  }

  function criarMenu() {
    var circ = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='360' height='360' fill='none' stroke='%2335c8e6' stroke-opacity='.16' stroke-width='1.5'><path d='M0 60h90l30 30h80M40 360V250l40-40h60M360 120h-70l-30 30v90M200 360v-60l50-50h110M120 0v40l30 30'/><circle cx='90' cy='60' r='4' fill='%2335c8e6'/><circle cx='200' cy='90' r='4' fill='%2335c8e6'/><circle cx='140' cy='210' r='4' fill='%2335c8e6'/><circle cx='260' cy='150' r='4' fill='%2335c8e6'/><circle cx='360' cy='300' r='4' fill='%2335c8e6'/></svg>\")";
    var css = '#cr-menu{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483646;display:flex;flex-direction:column;' +
      'background:' + CR.wall + ' center/cover no-repeat,#06090c;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#eee;}' +
      'body:has(#cr-menu[style*="flex"]) #cr-root{visibility:hidden !important;}' +
      '#cr-menu .lh-foot{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin-top:22px;font-size:12px;color:#6f828c;}' +
      '#cr-menu .lh-soc{display:flex;gap:10px;justify-content:center;margin-top:12px;}' +
      '#cr-menu .lh-soc i{width:30px;height:30px;border-radius:50%;background:#ffffff10;display:flex;align-items:center;justify-content:center;font:700 12px Arial;color:#9fb2bb;font-style:normal;}' +
      '#cr-menu .lh-top{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;}' +
      '#cr-menu .lh-logo{font:800 22px Arial,sans-serif;letter-spacing:.5px;background:linear-gradient(90deg,#ffffff,#7fe3f5);-webkit-background-clip:text;background-clip:text;color:transparent;}' +
      '#cr-menu .lh-logo small{font:700 10px Arial;color:#7fe3f5;-webkit-text-fill-color:#7fe3f5;border:1px solid #7fe3f566;border-radius:6px;padding:1px 5px;margin-left:6px;vertical-align:middle;}' +
      '#cr-menu .lh-right{display:flex;gap:8px;align-items:center;}' +
      '#cr-menu .lh-chip{font:600 12px Arial;padding:7px 12px;border-radius:999px;background:#ffffff12;border:1px solid #ffffff1f;color:#cfeff7;}' +
      '#cr-menu .lh-gear{flex:none;width:36px;height:36px;padding:0;border-radius:50%;font-size:17px;background:#ffffff12;border:1px solid #ffffff1f;color:#cfeff7;}' +
      '#cr-menu .lh-main{flex:1;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:10px 16px 110px;}' +
      '#cr-menu .lh-tab{display:none;width:460px;max-width:100%;margin:auto;}' +
      '#cr-menu .lh-tab.on{display:block;}' +
      '#cr-menu .lh-hero{text-align:center;padding:26px 0 8px;}' +
      '#cr-menu h1{margin:0 0 6px;font:800 28px Arial,sans-serif;}' +
      '#cr-menu .cm-sub{margin:0 0 18px;color:#8fa3ad;font-size:14px;}' +
      '#cr-menu .lh-card{background:#ffffff0d;border:1px solid #ffffff1a;border-radius:16px;padding:6px 16px;backdrop-filter:blur(6px);}' +
      '#cr-menu label.cm-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid #ffffff12;font-size:14px;cursor:pointer;}' +
      '#cr-menu label.cm-row:first-child{border-top:0;}' +
      '#cr-menu input[type=number]{width:130px;background:#070a10;color:#fff;border:1px solid #1f3a47;border-radius:8px;padding:7px 9px;font-size:14px;text-align:right;}' +
      '#cr-menu input[type=checkbox]{width:19px;height:19px;accent-color:#22c7e0;}' +
      '#cr-menu button{font:700 15px Arial,sans-serif;padding:13px;border:0;border-radius:12px;cursor:pointer;background:#ffffff14;color:#fff;}' +
      '#cr-menu button.cm-play{width:100%;font-size:18px;padding:16px;background:linear-gradient(90deg,#22c7e0,#1a7fa8);color:#fff;box-shadow:0 8px 28px #22c7e055;}' +
      '#cr-menu .lh-sec{width:100%;margin-top:12px;}' +
      '#cr-menu .lh-stat{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:14px 0 4px;}' +
      '#cr-menu .lh-tx{color:#9fb2bb;font-size:14px;line-height:1.5;margin:14px 4px;}' +
      '#cr-menu .cm-nota{margin:12px 4px 0;font-size:12px;color:#7d909a;min-height:16px;}' +
      '#cr-menu .lh-nav{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:4px;padding:6px;border-radius:999px;background:#0c1119;border:1px solid #ffffff22;box-shadow:0 10px 34px #000a;}' +
      '#cr-menu .lh-nav button{flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:68px;padding:8px 12px;border-radius:999px;background:transparent;font:600 11px Arial;color:#8394a0;}' +
      '#cr-menu .lh-nav button span{font-size:18px;line-height:1;}' +
      '#cr-menu .lh-nav button.on{background:linear-gradient(90deg,#22c7e055,#1a7fa844);color:#fff;}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    menuEl = document.createElement('div');
    menuEl.id = 'cr-menu';
    menuEl.style.display = 'none';
    menuEl.innerHTML =
      '<div class="lh-top"><div class="lh-logo">Dav7 Hub<small>BETA</small></div>' +
      '<div class="lh-right"><span id="lh-chip" style="display:none"></span><button type="button" class="lh-gear" id="lh-gear" title="Personalizar">\u2699</button></div></div>' +
      '<div class="lh-main">' +
      '<div class="lh-tab on" data-t="home"><div class="lh-hero"><h1>Seja bem-vindo ao Dav7 Hub</h1><p class="cm-sub">Subway Surfers \u00b7 San Francisco</p></div>' +
      '<button type="button" class="cm-play" id="cm-play">Jogar</button>' +
      '<span id="lh-s1" style="display:none"></span><span id="lh-s2" style="display:none"></span>' +
      '<button type="button" class="lh-sec" id="cm-rest">Restaurar save original</button>' +
      '<div class="cm-nota" style="text-align:center">@dav7.zn</div></div>' +
      '<div class="lh-tab" data-t="save"><div class="lh-hero"><h1>Save</h1><p class="cm-sub">Edite o seu progresso antes de jogar.</p></div><div class="lh-card">' +
      '<label class="cm-row"><span>Editar o meu save (liga tudo abaixo)</span><input type="checkbox" id="cm-mestre"></label>' +
      '<label class="cm-row"><span>Moedas</span><input type="number" id="cm-coins" min="0"></label>' +
      '<label class="cm-row"><span>Chaves</span><input type="number" id="cm-keys" min="0"></label>' +
      '<label class="cm-row"><span>HeadStarts</span><input type="number" id="cm-hs" min="0"></label>' +
      '<label class="cm-row"><span>Hoverboards</span><input type="number" id="cm-hb" min="0"></label>' +
      '<label class="cm-row"><span>Liberar todos os personagens</span><input type="checkbox" id="cm-chars"></label>' +
      '<label class="cm-row"><span>No coin <small style="color:#7d909a">(sem moedas, chaves e hoverboard)</small></span><input type="checkbox" id="cm-nocoin"></label></div>' +
      '<div class="cm-nota" id="cm-nota">Em moedas, chaves, HeadStarts e hoverboards, 0 = n\u00e3o mexer.</div></div>' +
      '<div class="lh-tab" data-t="online"><div class="lh-hero"><h1>Online</h1><p class="cm-sub">Dispute com um amigo com c\u00f3digo de 3 d\u00edgitos.</p></div>' +
      '<div class="lh-card"><p class="lh-tx">Quem pega moeda, morre ou fica parado perde a rodada. O No coin \u00e9 ligado automaticamente.</p></div>' +
      '<button type="button" class="cm-play lh-sec" id="cm-online">Abrir modo online</button></div>' +
      '<div class="lh-tab" data-t="pers"><div class="lh-hero"><h1>Personalizar</h1><p class="cm-sub">Cores, fundo, teclas, FPS e mais.</p></div>' +
      '<div class="lh-card"><p class="lh-tx">Mude o visual do cron\u00f4metro, as teclas na tela, as cores RGB e ative o contador de FPS.</p></div>' +
      '<button type="button" class="cm-play lh-sec" id="cm-pers">Abrir personaliza\u00e7\u00e3o</button></div>' +
      '</div>' +
      '<div class="lh-nav"><button type="button" class="on" data-t="home"><span>\u2302</span>In\u00edcio</button>' +
      '<button type="button" data-t="save"><span>\u2630</span>Save</button>' +
      '<button type="button" data-t="online"><span>\u21c4</span>Online</button>' +
      '<button type="button" data-t="pers"><span>\u2726</span>Personalizar</button></div>';
    document.body.appendChild(menuEl);
    function aba(t) {
      [].forEach.call(menuEl.querySelectorAll('.lh-tab'), function (x) { x.classList.toggle('on', x.getAttribute('data-t') === t); });
      [].forEach.call(menuEl.querySelectorAll('.lh-nav button'), function (x) { x.classList.toggle('on', x.getAttribute('data-t') === t); });
    }
    [].forEach.call(menuEl.querySelectorAll('.lh-nav button'), function (b) { b.addEventListener('click', function () { aba(b.getAttribute('data-t')); }); });
    var abrirPers = function () { if (CR.personalizarAbrir) { menuEl.style.display = 'none'; if (CR.mudo) CR.mudo(false); CR.personalizarAbrir(); } else $m('cm-nota').textContent = 'personalizar.js n\u00e3o carregou.'; };
    $m('lh-gear').addEventListener('click', abrirPers);
    $m('cm-play').addEventListener('click', aoJogar);
    $m('cm-nocoin').addEventListener('change', atualizarCamposNoCoin);
    $m('cm-rest').addEventListener('click', restaurarOriginal);
    $m('cm-pers').addEventListener('click', abrirPers);
    $m('cm-online').addEventListener('click', function () { if (CR.onlineAbrir) { if (!CR.exigirNoCoin()) { $m('cm-nota').textContent = 'Ativando No coin para o modo online...'; return; } menuEl.style.display = 'none'; if (CR.mudo) CR.mudo(false); CR.onlineAbrir(); } else $m('cm-nota').textContent = 'online.js n\u00e3o carregou.'; });
    // teclas digitadas no menu nao vao para o jogo nem para o WASD
    ['keydown', 'keyup', 'keypress'].forEach(function (t) { menuEl.addEventListener(t, function (e) { if (menuEl.style.display === 'flex') e.stopPropagation(); }); });
  }

  // com "No coin" ligado, os campos de chaves e hoverboards nao valem (ficam em 0)
  function atualizarCamposNoCoin() {
    var on = $m('cm-nocoin').checked;
    $m('cm-coins').disabled = on; $m('cm-keys').disabled = on; $m('cm-hb').disabled = on;
    $m('cm-nota').textContent = on ? 'No coin zera suas moedas, chaves e hoverboards (sen\u00e3o d\u00e1 para comprar na hora). "Restaurar save original" devolve.' : 'Em moedas, chaves, HeadStarts e hoverboards, 0 = n\u00e3o mexer.';
  }

  function abrirMenu() {
    if (!menuEl) criarMenu();
    $m('cm-mestre').checked = cheatOn;
    $m('cm-coins').value = cfg.coins; $m('cm-keys').value = cfg.keys;
    $m('cm-hs').value = cfg.headstart; $m('cm-hb').value = cfg.hoverboard;
    $m('cm-chars').checked = cfg.characters; $m('cm-nocoin').checked = cfg.noCoin;
    atualizarCamposNoCoin();
    $m('lh-s1').textContent = cheatOn ? 'Save editado' : 'Save original';
    $m('lh-s2').textContent = cfg.noCoin ? 'No coin: ligado' : 'No coin: desligado';
    $m('lh-chip').textContent = 'Player: ' + (cheatOn ? 'Save editado' : 'Original');
    menuEl.style.display = 'flex';
    if (CR.mudo) CR.mudo(true);
  }

  function aoJogar() {
    var novo = { coins: num('cm-coins'), keys: num('cm-keys'), headstart: num('cm-hs'), hoverboard: num('cm-hb'),
      characters: $m('cm-chars').checked, tutorial: true, noCoin: $m('cm-nocoin').checked, wasd: true, timer: true, fps: cfg.fps };
    var mestre = $m('cm-mestre').checked;
    var mudou = chaveSave(novo, mestre) !== snapshot;
    cfg = novo; cheatOn = mestre;
    lsSet('cfg', JSON.stringify(novo)); lsSet('cheats', mestre ? 'on' : 'off');
    aplicarVisual();
    if (mudou) {
      try { sessionStorage.setItem('cr.skip', '1'); } catch (e) { /* ok */ }
      $m('cm-nota').textContent = 'Aplicando no save...';
      location.reload();
      return;
    }
    menuEl.style.display = 'none';
    if (CR.mudo) CR.mudo(false);
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* ok */ }
    var cv = document.querySelector('canvas'); if (cv && cv.focus) cv.focus();
  }

  function menuNoInicio() {
    var pular = false;
    try { pular = sessionStorage.getItem('cr.skip') === '1'; sessionStorage.removeItem('cr.skip'); } catch (e) { /* ok */ }
    var reabreOnline = false;
    try { reabreOnline = sessionStorage.getItem('cr.online') === '1'; sessionStorage.removeItem('cr.online'); } catch (e) { /* ok */ }
    if (reabreOnline) setTimeout(function () { if (CR.onlineAbrir) CR.onlineAbrir(); }, 600);
    if (!pular && !reabreOnline) abrirMenu();
  }


  // ---------- No coin: sem aviso de compra de prancha ----------
  // O aviso aparece ao apertar Espaco (prancha) sem ter prancha. Com No coin, Espaco fica bloqueado durante a corrida.
  window.addEventListener('keydown', function (e) {
    if (!cfg.noCoin || CR.estado() === 'idle') return;
    if (e.code === 'Space' || e.key === ' ') { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  window.addEventListener('keyup', function (e) {
    if (!cfg.noCoin || CR.estado() === 'idle') return;
    if (e.code === 'Space' || e.key === ' ') e.stopImmediatePropagation();
  }, true);


  // duplo clique/toque tambem ativa a prancha: bloqueia o 2o toque rapido durante a corrida
  var ultToque = 0, engolir = false;
  function bloqueiaPrancha() { return (cfg.noCoin || (CR.partidaOnline && CR.partidaOnline())) && CR.estado() !== 'idle'; }
  ['mousedown', 'touchstart', 'pointerdown'].forEach(function (t) {
    window.addEventListener(t, function (e) {
      if (!e.isTrusted || !bloqueiaPrancha()) return;
      var now = performance.now();
      if (t === 'mousedown' || t === 'touchstart') { engolir = now - ultToque < 600; ultToque = now; }
      if (engolir) { e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
  });
  ['mouseup', 'click', 'dblclick', 'touchend', 'pointerup'].forEach(function (t) {
    window.addEventListener(t, function (e) {
      if (e.isTrusted && engolir && bloqueiaPrancha()) { e.stopImmediatePropagation(); e.preventDefault(); if (t === 'mouseup' || t === 'touchend') engolir = false; }
    }, true);
  });

  // ---------- botao "Entrar no menu" dentro das Configuracoes do jogo ----------
  // As Configuracoes sao desenhadas dentro do jogo (nao da para colocar um item nativo la). Entao: ao tocar na engrenagem
  // aparece um botao nosso por cima do espaco vazio do painel; ao fechar o painel (X ou fora dele) o botao some.
  // As posicoes foram medidas na tela de celular (em pe); no PC/deitado podem ficar um pouco fora do lugar.
  var cfgBtn = null, cfgAberto = false;
  function geomConfig(cv) {
    var r = cv.getBoundingClientRect(), pe = r.height >= r.width;
    return pe
      ? { r: r, engr: [0, 0.095, 0, 0.09], x: [0.04, 0.17, 0.12, 0.19], painel: [0.064, 0.933, 0.137, 0.9], btn: [0.2, 0.8, 0.78, 0.84] }
      : { r: r, engr: [0, 0.1, 0, 0.17], x: [0.27, 0.34, 0.02, 0.12], painel: [0.32, 0.68, 0.03, 0.97], btn: [0.36, 0.64, 0.82, 0.9] };
  }
  function dentro(g, f, e) { var x = (e.clientX - g.r.left) / g.r.width, y = (e.clientY - g.r.top) / g.r.height; return x >= f[0] && x <= f[1] && y >= f[2] && y <= f[3]; }
  function posicionaCfgBtn() {
    var cv = document.querySelector('canvas'); if (!cv || !cfgBtn) return;
    var g = geomConfig(cv), b = g.btn, r = g.r;
    cfgBtn.style.left = (r.left + b[0] * r.width) + 'px'; cfgBtn.style.top = (r.top + b[2] * r.height) + 'px';
    cfgBtn.style.width = ((b[1] - b[0]) * r.width) + 'px'; cfgBtn.style.height = ((b[3] - b[2]) * r.height) + 'px';
    cfgBtn.style.fontSize = Math.max(12, Math.min(26, (b[3] - b[2]) * r.height * 0.42)) + 'px';
  }
  function mostraCfgBtn(v) {
    cfgAberto = v;
    if (v && !cfgBtn) {
      cfgBtn = document.createElement('button'); cfgBtn.type = 'button'; cfgBtn.textContent = 'Entrar no menu';
      cfgBtn.style.cssText = 'position:fixed;z-index:2147483645;border:0;border-radius:12px;background:linear-gradient(180deg,#5bb8ff,#2f86cf);color:#fff;font-family:Arial,sans-serif;font-weight:900;box-shadow:0 3px 0 #1d5e96;cursor:pointer;display:none;';
      cfgBtn.addEventListener('click', function () { mostraCfgBtn(false); abrirMenu(); });
      document.body.appendChild(cfgBtn);
    }
    if (cfgBtn) { if (v) posicionaCfgBtn(); cfgBtn.style.display = v ? 'block' : 'none'; }
  }
  window.addEventListener('pointerdown', function (e) {
    if (!e.isTrusted) return;
    var cv = document.querySelector('canvas'); if (!cv || e.target === cfgBtn) return;
    var g = geomConfig(cv);
    if (!cfgAberto) { if (e.target === cv && dentro(g, g.engr, e)) setTimeout(function () { mostraCfgBtn(true); }, 250); return; }
    if (dentro(g, g.x, e) || !dentro(g, g.painel, e)) mostraCfgBtn(false);
  }, true);
  window.addEventListener('keydown', function (e) { if (cfgAberto && e.key === 'Escape') mostraCfgBtn(false); }, true);
  window.addEventListener('resize', function () { if (cfgAberto) posicionaCfgBtn(); });

  // ---------- controles: HeadStart no Ctrl, WASD, anuncio no No coin ----------
  // Ctrl esquerdo ou direito = usa o HeadStart (botao do foguete, canto inferior esquerdo da corrida).
  // O jogo e uma imagem (canvas), entao o atalho "clica" na posicao do botao.
  // Posicao medida numa tela de 540 px de altura: 55 px da esquerda e 68 px de baixo; escala com a altura.
  var HS_X = 55, HS_Y = 68;
  function usarHeadstart() {
    var cv = document.querySelector('canvas');
    if (!cv) return;
    var r = cv.getBoundingClientRect(), k = r.height / 540;
    var x = r.left + HS_X * k, y = r.bottom - HS_Y * k;
    function ev(tipo, botoes) {
      return new MouseEvent(tipo, { bubbles: true, cancelable: true, view: window, button: 0, buttons: botoes,
        detail: tipo === 'mousemove' ? 0 : 1, clientX: x, clientY: y, screenX: x, screenY: y });
    }
    // Receita que o jogo aceita (testada): foca o jogo, move o mouse ate o botao e segura o clique 300 ms.
    // Um clique mais curto, ou so mousedown+mouseup, o jogo ignora.
    try { cv.focus(); } catch (err) { /* ok */ }
    for (var i = 0; i < 3; i++) cv.dispatchEvent(ev('mousemove', 0));
    cv.dispatchEvent(ev('mousedown', 1));
    setTimeout(function () { cv.dispatchEvent(ev('mouseup', 0)); cv.dispatchEvent(ev('click', 0)); }, 300);
  }
  document.addEventListener('keydown', function (e) {
    if (!e.isTrusted || e.repeat || e.shiftKey || e.altKey || e.metaKey) return;
    if (e.code !== 'ControlLeft' && e.code !== 'ControlRight') return;
    if (CR.overlayAberto()) return;      // com o menu aberto nao faz nada
    usarHeadstart();
  });

  // W A S D viram as setas. Usa a posicao fisica da tecla (e.code), entao funciona em qualquer layout.
  var WASD = { KeyW: ['ArrowUp', 38], KeyA: ['ArrowLeft', 37], KeyS: ['ArrowDown', 40], KeyD: ['ArrowRight', 39] };
  function enviarSeta(tipo, info, orig) {
    var alvo = document.querySelector('canvas') || document, ev;
    try {
      ev = new KeyboardEvent(tipo, {
        key: info[0], code: info[0], keyCode: info[1], which: info[1],
        bubbles: true, cancelable: true, composed: true, repeat: !!orig.repeat
      });
    } catch (err) { return; }
    alvo.dispatchEvent(ev);
  }
  function aoTeclarWasd(e) {
    if (!e.isTrusted || e.ctrlKey || e.metaKey || e.altKey) return;
    var info = WASD[e.code];
    if (!info) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    enviarSeta(e.type, info, e);
  }
  window.addEventListener('keydown', aoTeclarWasd, true);
  window.addEventListener('keyup', aoTeclarWasd, true);

  // No coin: o anuncio para continuar nunca "completa"
  setInterval(function () {
    var sdk = window.PokiSDK;
    if (sdk && cfg.noCoin && !sdk.__cronometroRB) { sdk.rewardedBreak = function () { return Promise.resolve(false); }; sdk.__cronometroRB = true; }
  }, 300);

  // ---------- FPS: so o numero, flutuante, sem fundo (cor em Personalizar) ----------
  var fpsEl = null, fpsOn = false, fpsFrames = 0, fpsT0 = 0;
  function fpsLoop(t) {
    if (!fpsOn) return;
    fpsFrames++;
    if (!fpsT0) fpsT0 = t;
    if (t - fpsT0 >= 500) { fpsEl.textContent = String(Math.round(fpsFrames * 1000 / (t - fpsT0))); fpsFrames = 0; fpsT0 = t; }
    requestAnimationFrame(fpsLoop);
  }
  function ligaFps(v) {
    if (v && !fpsEl) {
      fpsEl = document.createElement('div'); fpsEl.id = 'cr-fps'; fpsEl.textContent = '--';
      fpsEl.style.cssText = 'position:fixed;right:76px;top:14px;z-index:2147483643;font:700 24px Arial,sans-serif;color:var(--fpscor,#fff);' +
        'text-shadow:0 0 4px rgba(0,0,0,.9),0 1px 3px rgba(0,0,0,.9);cursor:move;touch-action:none;user-select:none;-webkit-user-select:none;';
      try { var pos = JSON.parse(lsGet('fps.pos') || 'null'); if (pos) { fpsEl.style.left = pos.x + 'px'; fpsEl.style.top = pos.y + 'px'; fpsEl.style.right = 'auto'; } } catch (e) { /* ok */ }
      var d0 = null;
      fpsEl.addEventListener('pointerdown', function (e) { var r = fpsEl.getBoundingClientRect(); d0 = { dx: e.clientX - r.left, dy: e.clientY - r.top }; try { fpsEl.setPointerCapture(e.pointerId); } catch (er) { /* ok */ } e.stopPropagation(); });
      fpsEl.addEventListener('pointermove', function (e) {
        if (!d0) return;
        fpsEl.style.left = Math.max(0, Math.min(window.innerWidth - 30, e.clientX - d0.dx)) + 'px';
        fpsEl.style.top = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - d0.dy)) + 'px'; fpsEl.style.right = 'auto';
      });
      fpsEl.addEventListener('pointerup', function () { if (!d0) return; d0 = null; var r = fpsEl.getBoundingClientRect(); lsSet('fps.pos', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); });
      document.body.appendChild(fpsEl);
    }
    if (fpsEl) fpsEl.style.display = v ? 'block' : 'none';
    if (v && !fpsOn) { fpsOn = true; fpsFrames = 0; fpsT0 = 0; requestAnimationFrame(fpsLoop); }
    if (!v) fpsOn = false;
  }

  // Usado por Personalizar: liga/desliga o FPS na hora e guarda a escolha
  CR.fpsAtivo = function () { return !!cfg.fps; };
  CR.definirFps = function (v) { cfg.fps = !!v; lsSet('cfg', JSON.stringify(cfg)); ligaFps(cfg.fps); };

  // ---------- botao de tela cheia (celular) ----------
  // Bolinha translucida que alterna tela cheia. Arraste para mudar de lugar (a posicao fica salva).
  var elFs = document.documentElement;
  var pedeFs = elFs.requestFullscreen || elFs.webkitRequestFullscreen || elFs.msRequestFullscreen;
  function emFs() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function alternaFs() {
    try {
      if (emFs()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
      else {
        var r = pedeFs.call(elFs);
        if (r && r.catch) r.catch(function () { /* o navegador pode recusar */ });
        try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () { /* ok */ }); } catch (e) { /* ok */ }
      }
    } catch (e) { /* ok */ }
  }
  function criaBotaoFs() {
    if (!pedeFs) return;
    var b = document.createElement('div'); b.id = 'cr-fs';
    b.style.cssText = 'position:fixed;right:12px;top:12px;width:52px;height:52px;border-radius:50%;background:rgba(20,20,20,.62);z-index:2147483643;' +
      'display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;border:1px solid rgba(255,255,255,.12);';
    var ic = function (fs) {
      var d = fs ? 'M9 3v4H5M15 3v4h4M9 21v-4H5M15 21v-4h4' : 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6';
      b.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
    };
    ic(false);
    try { var pos = JSON.parse(lsGet('fs.pos') || 'null'); if (pos) { b.style.left = pos.x + 'px'; b.style.top = pos.y + 'px'; b.style.right = 'auto'; } } catch (e) { /* ok */ }
    var d0 = null, moveu = false;
    b.addEventListener('pointerdown', function (e) {
      var r = b.getBoundingClientRect(); d0 = { x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top }; moveu = false;
      try { b.setPointerCapture(e.pointerId); } catch (er) { /* ok */ } e.stopPropagation();
    });
    b.addEventListener('pointermove', function (e) {
      if (!d0) return;
      if (Math.abs(e.clientX - d0.x) + Math.abs(e.clientY - d0.y) > 8) moveu = true;
      if (!moveu) return;
      b.style.left = Math.max(0, Math.min(window.innerWidth - 52, e.clientX - d0.dx)) + 'px';
      b.style.top = Math.max(0, Math.min(window.innerHeight - 52, e.clientY - d0.dy)) + 'px'; b.style.right = 'auto';
    });
    function solta() {
      if (!d0) return;
      if (moveu) { var r = b.getBoundingClientRect(); lsSet('fs.pos', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); }
      else alternaFs();
      d0 = null;
    }
    b.addEventListener('pointerup', solta); b.addEventListener('pointercancel', function () { d0 = null; });
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) { document.addEventListener(ev, function () { ic(!!emFs()); b.style.display = emFs() ? 'none' : 'flex'; }); });
    document.body.appendChild(b);
  }

  // ---------- montagem ----------
  function montar() {
    CR.noCoin = function () { return !!cfg.noCoin; };
    // O modo online exige No coin (sem moedas, chaves e pranchas). Se ainda nao esta ligado, liga, aplica no save (recarrega a pagina)
    // e reabre o painel online. Retorna true se ja estava tudo certo.
    CR.exigirNoCoin = function () {
      if ((cfg.noCoin && cheatOn) || lsGet('net') === 'local') return true;
      cfg.noCoin = true; cheatOn = true;
      lsSet('cfg', JSON.stringify(cfg)); lsSet('cheats', 'on');
      try { sessionStorage.setItem('cr.skip', '1'); sessionStorage.setItem('cr.online', '1'); } catch (e) { /* ok */ }
      location.reload();
      return false;
    };
    CR.addButton('Menu', abrirMenu);
    criaBotaoFs();
    CR.overlayIds.push('cr-menu');
    CR.abrirMenu = abrirMenu;
    aplicarVisual();
    menuNoInicio();
  }
  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
