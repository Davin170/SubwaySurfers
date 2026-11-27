// online.js \u2014 MODO ONLINE (2 jogadores, sala por codigo).
// Regra: quem PEGAR MOEDA primeiro ou MORRER primeiro PERDE; o outro ve a mensagem e vence.
// Precisa do cronometro.js (window.CR) carregado antes.
(function () {
  'use strict';
  var CR = window.CR;
  if (!CR) return;
  var lsGet = CR.lsGet;

  // ---------- modo online (2 jogadores, sala por codigo) ----------
  // Regra: quem pega moeda primeiro PERDE. O dono da sala decide quem foi primeiro.
  var ONLINE_V = 4;                           // as duas pontas precisam ter a mesma versao do modo online
  var on = { net: null, conn: null, host: false, code: '', fase: 'off', roundOver: false, el: null, hud: null, bc: null };

  function onUi() {
    if (on.el) return;
    var st = document.createElement('style');
    st.textContent = '#cr-on{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;display:none;align-items:center;justify-content:center;background:rgba(5,8,14,.9);font-family:Arial,sans-serif;color:#eee;}' +
      '#cr-on .cm-card{width:380px;max-width:92vw;background:#101216;border:1px solid #2a2d33;border-radius:14px;padding:22px;text-align:center;}' +
      '#cr-on input{width:140px;text-align:center;font:700 20px Arial;letter-spacing:3px;background:#181b21;color:#fff;border:1px solid #2f333b;border-radius:8px;padding:8px;text-transform:uppercase;}' +
      '#cr-on button{font:700 15px Arial;padding:11px 16px;margin:6px 4px 0;border:0;border-radius:9px;cursor:pointer;background:#262a31;color:#fff;}' +
      '#cr-on button.g{background:linear-gradient(180deg,#a6ffbf,#2ecc71);color:#06280f;}' +
      '#cr-on-msg{margin:12px 0 4px;min-height:20px;font-size:14px;color:#c8ccd4;}' +
      '#cr-hud{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483645;display:none;padding:8px 18px;border-radius:10px;background:rgba(10,12,16,.85);color:#fff;font:700 18px Arial;text-align:center;pointer-events:none;}';
    document.head.appendChild(st);
    on.el = document.createElement('div'); on.el.id = 'cr-on';
    on.el.innerHTML = '<div class="cm-card"><h1 style="margin:0 0 6px;font-size:20px">Modo online</h1>' +
      '<div style="font-size:13px;color:#9aa0aa">2 jogadores. Quem pegar moeda primeiro perde.</div>' +
      '<div style="margin-top:14px"><button type="button" class="g" id="on-criar">Criar sala</button></div>' +
      '<div style="margin-top:10px"><input id="on-cod" maxlength="3" inputmode="numeric" pattern="[0-9]*" placeholder="000"><button type="button" id="on-entrar">Entrar</button></div>' +
      '<div id="cr-on-msg"></div>' +
      '<div><button type="button" class="g" id="on-novo" style="display:none">Nova rodada</button><button type="button" id="on-fechar">Fechar</button><button type="button" id="on-sair">Sair da sala</button></div></div>';
    document.body.appendChild(on.el);
    on.hud = document.createElement('div'); on.hud.id = 'cr-hud'; document.body.appendChild(on.hud);
    ['keydown', 'keyup', 'keypress'].forEach(function (t) { on.el.addEventListener(t, function (e) { if (on.el.style.display === 'flex') e.stopPropagation(); }); });
    on.el.querySelector('#on-criar').onclick = function () { onCriar(); };
    on.el.querySelector('#on-entrar').onclick = function () { onEntrar(on.el.querySelector('#on-cod').value.replace(/\D/g, '').slice(0, 3)); };
    on.el.querySelector('#on-fechar').onclick = function () { on.el.style.display = 'none'; var cv = document.querySelector('canvas'); if (cv && cv.focus) cv.focus(); };
    on.el.querySelector('#on-sair').onclick = function () { onSair(); };
    on.el.querySelector('#on-novo').onclick = function () { if (on.host) onRodada(); };
  }
  function onMsg(t) { var m = on.el.querySelector('#cr-on-msg'); if (m) m.textContent = t; }
  function onHud(t, cor) { on.hud.textContent = t; on.hud.style.display = t ? 'block' : 'none'; on.hud.style.color = cor || '#fff'; }
  function onAbrir() { onUi(); on.el.style.display = 'flex'; }

  // transporte: PeerJS (internet) ou BroadcastChannel (teste local, com localStorage cronometro.net = "local")
  function netSend(o) { try { if (on.bc) on.bc.postMessage(o); else if (on.conn && on.conn.open) on.conn.send(o); } catch (e) { /* ok */ } }
  function carregarPeer(cb) {
    if (window.Peer) return cb();
    var sc = document.createElement('script'); sc.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    sc.onload = cb; sc.onerror = function () { onMsg('N\u00e3o consegui carregar o servi\u00e7o online.'); };
    document.head.appendChild(sc);
  }
  function geraCodigo() { return ('00' + Math.floor(Math.random() * 1000)).slice(-3); }      // 3 digitos (000 a 999)
  function ligado() {
    on.vOk = false; netSend({ t: 'ola', v: ONLINE_V });
    setTimeout(function () { if (on.fase !== 'off' && !on.vOk) { avisoVersao('O outro jogador est\u00e1 com uma vers\u00e3o antiga. Os dois precisam apertar Ctrl+F5 no site.'); } }, 4000);
    onMsg(on.host ? 'Jogador conectado! Clique em "Nova rodada".' : 'Conectado. Aguarde o dono iniciar a rodada.'); on.fase = 'sala'; on.el.querySelector('#on-novo').style.display = on.host ? '' : 'none'; }
  function avisoVersao(t) { onMsg(t); on.versaoRuim = true; }
  function onPronto(conn) {
    on.conn = conn;
    conn.on('data', onRecebe);
    conn.on('close', function () { onMsg('O outro jogador saiu.'); onHud(''); on.fase = 'off'; });
    if (conn.open) ligado(); else conn.on('open', ligado);
  }
  function onCriar() {
    onUi(); if (CR.exigirNoCoin && !CR.exigirNoCoin()) return; on.host = true; on.code = geraCodigo();
    if (lsGet('net') === 'local') {
      on.bc = new BroadcastChannel('cr-' + on.code); on.bc.onmessage = function (e) { onRecebe(e.data); };
      onMsg('Sala ' + on.code + ' (local). Aguardando...'); return;
    }
    onMsg('Criando sala...');
    carregarPeer(function () {
      var tentativa = 0;
      (function abre() {                         // com so 3 digitos o codigo pode estar em uso: tenta outro
        var peer = on.net = new window.Peer('cronosurf-' + on.code);
        peer.on('open', function () { onMsg('Sala: ' + on.code + '  \u2014 passe o c\u00f3digo ao amigo.'); });
        peer.on('connection', function (c) { if (on.conn && on.conn.open) { c.close(); return; } onPronto(c); });
        peer.on('error', function (er) {
          if (er && er.type === 'unavailable-id' && tentativa++ < 15) { try { peer.destroy(); } catch (e) { /* ok */ } on.code = geraCodigo(); abre(); return; }
          onMsg('Erro: ' + (er && er.type || er));
        });
      })();
    });
  }
  function onEntrar(cod) {
    onUi(); if (CR.exigirNoCoin && !CR.exigirNoCoin()) return; if (!cod) { onMsg('Digite o c\u00f3digo da sala.'); return; }
    on.host = false; on.code = cod;
    if (lsGet('net') === 'local') {
      on.bc = new BroadcastChannel('cr-' + cod); on.bc.onmessage = function (e) { onRecebe(e.data); };
      netSend({ t: 'oi' }); ligado(); return;
    }
    onMsg('Entrando...');
    carregarPeer(function () {
      var peer = on.net = new window.Peer();
      peer.on('open', function () { onPronto(peer.connect('cronosurf-' + cod, { reliable: true })); });
      peer.on('error', function (er) { onMsg('Erro: ' + (er && er.type || er)); });
    });
  }
  function onSair() {
    try { if (on.conn) on.conn.close(); if (on.net) on.net.destroy(); if (on.bc) on.bc.close(); } catch (e) { /* ok */ }
    on.conn = on.net = on.bc = null; on.fase = 'off'; on.host = false; onHud(''); onMsg('Fora da sala.');
    on.el.querySelector('#on-novo').style.display = 'none';
  }
  function onRodada() {                        // so o dono
    if (!on.vOk || on.versaoRuim) { onMsg(on.versaoRuim ? 'Vers\u00f5es diferentes: os dois precisam apertar Ctrl+F5.' : 'Ainda confirmando a vers\u00e3o do outro jogador...'); return; }
    onFaz({ t: 'rodada' }); netSend({ t: 'rodada' });
  }
  function onFaz(m) {                           // executa localmente
    if (m.t === 'oi') { if (on.host) { ligado(); } return; }
    if (m.t === 'rodada') {
      on.roundOver = false; on.fase = 'contagem'; on.el.style.display = 'none';
      var n = 3; onHud('Prepare-se... ' + n, '#fff');
      var iv = setInterval(function () {
        n--;
        if (n > 0) onHud('Prepare-se... ' + n, '#fff');
        else { clearInterval(iv); on.fase = 'jogo'; on.entrou = false; on.prazo = performance.now() + 3000; onHud('VAI! Entre na partida!', '#2ecc71'); var cv = document.querySelector('canvas'); if (cv && cv.focus) cv.focus(); }
      }, 1000);
    } else if (m.t === 'fim') {
      on.roundOver = true; on.fase = 'sala';
      var euPerdi = m.loser === (on.host ? 'host' : 'guest');
      var porMorte = m.motivo === 'morte', porParado = m.motivo === 'parado';
      onHud(euPerdi
        ? (porMorte ? 'Voc\u00ea morreu: PERDEU' : porParado ? 'Voc\u00ea n\u00e3o entrou na partida: PERDEU' : 'Voc\u00ea pegou moeda primeiro: PERDEU')
        : (porMorte ? 'O outro jogador morreu: VOC\u00ca VENCEU!' : porParado ? 'O outro n\u00e3o entrou na partida: VOC\u00ca VENCEU!' : 'O outro pegou moeda: VOC\u00ca VENCEU!'),
        euPerdi ? '#ff5a4d' : '#2ecc71');
      onMsg(euPerdi ? 'Voc\u00ea perdeu.' : 'Voc\u00ea venceu!');
      on.el.querySelector('#on-novo').style.display = on.host ? '' : 'none';
      setTimeout(function () { if (on.host) onAbrir(); }, 1500);
    }
  }
  function onRecebe(m) {
    if (!m || !m.t) return;
    if (m.t === 'ola') {
      on.vOk = true;
      if (m.v !== ONLINE_V) avisoVersao('Vers\u00f5es diferentes do modo online (' + ONLINE_V + ' x ' + m.v + '). Os dois precisam apertar Ctrl+F5 no site.');
      else { on.versaoRuim = false; if (on.fase === 'sala') onMsg(on.host ? 'Jogador conectado! Clique em "Nova rodada".' : 'Conectado. Aguarde o dono iniciar a rodada.'); }
      return;
    }
    if (m.t === 'perdi') {                      // chegou no dono: o primeiro decide
      if (on.host && on.fase === 'jogo' && !on.roundOver) { var f = { t: 'fim', loser: 'guest', motivo: m.motivo }; netSend(f); onFaz(f); }
      return;
    }
    if (m.t === 'rodada' && on.host && on.bc) return;   // eco do canal local
    if (m.t === 'fim' && on.bc && on.roundOver) return;
    onFaz(m);
  }
  // o jogador local perdeu (motivo: 'moeda', 'morte' ou 'parado')
  function perdi(motivo) {
    if (on.fase !== 'jogo' || on.roundOver) return;
    if (on.host) { var f = { t: 'fim', loser: 'host', motivo: motivo }; netSend(f); onFaz(f); }
    else netSend({ t: 'perdi', motivo: motivo });
  }
  CR.online = window.cronometroOnline = { estado: function () { return { fase: on.fase, host: on.host, code: on.code, over: on.roundOver, hud: on.hud && on.hud.textContent }; } };

  // anti-enrolacao no online: 3 s (com contagem na tela) para entrar na partida; depois, parado mais de 10 s = perde
  var parado = 0;
  setInterval(function () {
    if (on.fase !== 'jogo' || on.roundOver) { parado = 0; return; }
    if (CR.estado() === 'running') {
      parado = 0;
      if (!on.entrou) { on.entrou = true; onHud('Quem pegar moeda perde', '#fff'); }
      return;
    }
    if (!on.entrou) {                                   // janela de entrada: 3 s
      var resta = Math.ceil((on.prazo - performance.now()) / 1000);
      if (resta > 0) { onHud('Entre na partida: ' + resta, resta === 1 ? '#ff5a4d' : '#ffd54a'); return; }
      on.entrou = true; perdi('parado'); return;   // nao entrou a tempo: perde
    }
    parado += 100;
    if (parado >= 10000) { parado = 0; perdi('parado'); }
  }, 100);

  // ---------- ligacao com o cronometro ----------
  CR.partidaOnline = function () { return on.fase === 'jogo'; };
  CR.onlineAbrir = onAbrir;
  CR.on('start', function () { if (on.fase === 'jogo' && !on.entrou && !on.roundOver) { on.entrou = true; onHud('Quem pegar moeda perde', '#fff'); } });
  CR.on('coin', function () { perdi('moeda'); });
  CR.on('death', function () { if (on.entrou) perdi('morte'); });   // so conta se ja tinha entrado na corrida
})();
