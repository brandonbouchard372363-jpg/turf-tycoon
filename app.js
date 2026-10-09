// Turf Tycoon — client app: networking, screens, panels, modals and effects.
(function () {
  const { SPACES, GROUPS, TOKENS, COLORS, CONSTANTS } = window.BOARD;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + Number(n).toLocaleString('en-US');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  let socket = null;
  let session = store.get('tt_session');
  let me = session ? session.pid : null;
  let state = null;
  let board = null;
  const fxQueue = [];
  let fxBusy = false;
  const dispPos = {};
  const shownCash = {};
  const seenLogs = new Set();
  const seenTrades = new Set();
  let modalKind = null;
  let modalData = null;
  let auctionTimer = null;

  // ---------- small UI helpers ----------
  function tokHTML(p, cls = '') {
    return `<span class="tok ${cls}" style="background:${p.color}"><svg viewBox="0 0 24 24">${window.ICONS.TOKENS[p.tokenId] || ''}</svg></span>`;
  }
  function toast(msg, kind) {
    const t = document.createElement('div');
    t.className = 'toast' + (kind === 'err' ? ' err' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), kind === 'err' ? 3800 : 3000);
  }
  let bannerT = null;
  function banner(html, cls = '', ms = 1800) {
    const b = $('#banner');
    b.className = 'banner ' + cls;
    b.innerHTML = html;
    clearTimeout(bannerT);
    bannerT = setTimeout(() => b.classList.add('hidden'), ms);
  }
  function show(id) {
    ['home', 'lobby', 'game'].forEach((s) => $('#' + s).classList.toggle('hidden', s !== id));
  }
  const player = (id) => state && state.players.find((p) => p.id === id);
  const mePlayer = () => player(me);
  const curId = () => state && state.turn ? state.turn.playerId : null;
  const isMyTurn = () => state && state.phase === 'playing' && curId() === me;

  // ---------- networking ----------
  function setWaking(on, title, text) {
    const w = $('#waking');
    if (title) $('#wakingTitle').textContent = title;
    if (text) $('#wakingText').textContent = text;
    w.classList.toggle('show', !!on);
  }

  function connect() {
    setWaking(false);
    if (typeof io === 'undefined') {
      setWaking(true, 'Waking up the server…', "Free servers take a nap when nobody's playing. Retrying in a few seconds…");
      setTimeout(() => location.reload(), 5000);
      return;
    }
    socket = io({ reconnectionDelay: 700, reconnectionDelayMax: 4000, timeout: 20000 });
    const wakeT = setTimeout(() => { if (!socket.connected) setWaking(true); }, 700);
    let wasConnected = false;

    socket.on('connect', () => {
      clearTimeout(wakeT);
      setWaking(false);
      $('#netBanner').classList.remove('show');
      if (session) resume();
      else if (!wasConnected) showHome();
      wasConnected = true;
    });
    socket.on('disconnect', () => { $('#netBanner').classList.add('show'); });
    socket.io.on('reconnect_attempt', (n) => {
      if (n >= 3) setWaking(true, 'Reconnecting…', "Lost contact with the server. If it was napping, it's waking up now — this can take up to a minute.");
    });
    socket.on('connect_error', () => {
      if (!wasConnected) setWaking(true);
    });
    socket.on('state', onState);
  }

  function resume() {
    socket.emit('resume', session, (r) => {
      if (!r || r.error) {
        store.del('tt_session');
        session = null; me = null; state = null;
        showHome();
        toast("That game isn't around anymore (the server may have restarted).", 'err');
      } else me = r.pid;
    });
  }

  function act(type, payload = {}) {
    return new Promise((resolve) => {
      if (!socket || !socket.connected) { toast('Not connected — hang on…', 'err'); return resolve(null); }
      socket.emit('action', { type, ...payload }, (r) => {
        if (r && r.error) { toast(r.error, 'err'); SFX.play('error'); }
        resolve(r);
      });
    });
  }

  // ---------- home ----------
  function showHome() {
    show('home');
    closeModal();
    const params = new URLSearchParams(location.search);
    if (params.get('code')) $('#codeInput').value = params.get('code').toUpperCase().slice(0, 5);
    $('#nameInput').value = $('#nameInput').value || store.get('tt_name') || '';
  }

  function enter(kind) {
    SFX.unlock();
    const name = $('#nameInput').value.trim();
    const code = $('#codeInput').value.trim().toUpperCase();
    $('#homeError').textContent = '';
    if (!name) { $('#homeError').textContent = 'Type your name first.'; $('#nameInput').focus(); return; }
    if (kind === 'join' && code.length !== 5) { $('#homeError').textContent = 'Lobby codes are 5 letters.'; $('#codeInput').focus(); return; }
    if (!socket || !socket.connected) { $('#homeError').textContent = 'Still connecting to the server…'; return; }
    store.set('tt_name', name);
    const btn = kind === 'create' ? $('#createBtn') : $('#joinBtn');
    btn.disabled = true;
    socket.emit(kind, { name, code }, (r) => {
      btn.disabled = false;
      if (!r || r.error) { $('#homeError').textContent = (r && r.error) || 'Could not reach the server.'; return; }
      session = { code: r.code, pid: r.pid, secret: r.secret };
      me = r.pid;
      store.set('tt_session', session);
      history.replaceState(null, '', location.pathname);
    });
  }

  $('#createBtn').onclick = () => enter('create');
  $('#joinBtn').onclick = () => enter('join');
  $('#nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') ($('#codeInput').value.trim() ? enter('join') : enter('create')); });
  $('#codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') enter('join'); });
  $('#codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });

  // ---------- state ----------
  function onState({ state: s, fx }) {
    const prev = state;
    state = s;
    if (!player(me)) {
      // We were removed (e.g. lobby seat freed)
      store.del('tt_session'); session = null; me = null; state = null;
      showHome();
      return;
    }
    if (s.phase === 'lobby') {
      show('lobby');
      renderLobby();
      return;
    }
    const firstGameRender = !prev || prev.phase === 'lobby' || !board;
    show('game');
    if (!board) board = new window.BoardView($('#board'), (i) => openDeed(i));
    if (firstGameRender) {
      fxQueue.length = 0;
      s.players.forEach((p) => { dispPos[p.id] = { i: p.pos, jail: p.inJail }; shownCash[p.id] = p.cash; });
      s.log.forEach((l) => seenLogs.add(l.id));
      board.setPot(s.pot, false);
      syncBoard();
      if (prev && prev.phase === 'lobby') { banner('<small>Let\'s go</small>Game on!', 'blue', 1600); SFX.play('turn'); }
    } else {
      fxQueue.push(...(fx || []));
      if (prev && prev.turn && s.turn && prev.turn.playerId !== s.turn.playerId && s.turn.playerId === me && s.phase === 'playing') {
        fxQueue.push({ type: 'yourTurn' });
      }
    }
    $('#codeChip').textContent = s.code;
    renderSide();
    processQueue();
    refreshModal();
    checkIncomingTrades();
  }

  async function processQueue() {
    if (fxBusy) return;
    fxBusy = true;
    renderTurnCard();
    while (fxQueue.length) {
      const f = fxQueue.shift();
      try { await playFx(f); } catch (e) { console.error(e); }
    }
    fxBusy = false;
    syncBoard();
    renderTurnCard();
  }

  function syncBoard() {
    if (!state || !board) return;
    state.players.forEach((p) => { dispPos[p.id] = { i: p.pos, jail: p.inJail }; });
    board.update(state);
    board.showPot(state.settings.freeParking);
    if (board.potShown !== state.pot) board.setPot(state.pot, true);
    board.syncTokens(state.players, dispPos, curId());
  }

  async function playFx(f) {
    switch (f.type) {
      case 'dice':
        SFX.play('dice');
        await board.rollDice(f.d);
        await sleep(220);
        break;
      case 'move': {
        const fast = f.path.length > 12;
        for (const i of f.path) {
          dispPos[f.pid] = { i, jail: false };
          board.syncTokens(state.players, dispPos, curId());
          board.hop(f.pid);
          SFX.play('step');
          await sleep(fast ? 85 : 175);
        }
        await sleep(160);
        break;
      }
      case 'jail': {
        dispPos[f.pid] = { i: 10, jail: true };
        const t = board.tokenEls[f.pid];
        if (t) t.classList.add('jumping');
        board.syncTokens(state.players, dispPos, curId());
        SFX.play('jail');
        const p = player(f.pid);
        banner(`<small>${esc(p ? p.name : '')}</small>To The Slammer! 🚨`, 'red', 1500);
        await sleep(650);
        if (t) t.classList.remove('jumping');
        break;
      }
      case 'card':
        await showCard(f);
        break;
      case 'cash':
        floatCash(f.pid, f.delta);
        if (f.pid === me) SFX.play(f.delta > 0 ? 'coin' : 'pay');
        break;
      case 'pot':
        board.setPot(board.potShown + f.delta, true);
        break;
      case 'jackpot': {
        const p = player(f.pid);
        board.setPot(0, true);
        SFX.play('jackpot');
        banner(`<small>Free Parking jackpot</small>${esc(p ? p.name : '')} +${money(f.amount)} 💰`, '', 2400);
        confetti(1400);
        await sleep(900);
        break;
      }
      case 'buy':
        SFX.play('buy');
        board.update(state);
        await sleep(120);
        break;
      case 'build':
        SFX.play('build');
        board.update(state);
        break;
      case 'bankrupt': {
        const p = player(f.pid);
        SFX.play('bankrupt');
        banner(`<small>Game over for</small>${esc(p ? p.name : '')} 💥`, 'red', 2200);
        board.syncTokens(state.players, dispPos, curId());
        await sleep(900);
        break;
      }
      case 'win': {
        const p = player(f.pid);
        SFX.play('win');
        confetti(4500);
        openWin(p);
        break;
      }
      case 'trade':
        if (f.to === me) SFX.play('deal');
        break;
      case 'sound':
        SFX.play(f.name);
        break;
      case 'yourTurn':
        SFX.play('turn');
        banner('<small>Heads up</small>Your turn!', 'blue', 1300);
        break;
    }
  }

  function floatCash(pid, delta) {
    const card = document.querySelector(`.pcard[data-id="${pid}"]`);
    if (!card || !delta) return;
    const f = document.createElement('div');
    f.className = 'cash-float ' + (delta > 0 ? 'plus' : 'minus');
    f.textContent = (delta > 0 ? '+' : '−') + money(Math.abs(delta));
    card.appendChild(f);
    setTimeout(() => f.remove(), 1500);
  }

  // ---------- card reveal ----------
  function showCard(f) {
    return new Promise((resolve) => {
      SFX.play('card');
      const p = player(f.pid);
      const title = f.deck === 'luck' ? 'LUCKY BREAK' : 'BLOCK PARTY';
      const icon = window.ICONS.SPACE[f.deck];
      const wrap = $('#cardShow');
      wrap.innerHTML = `
        <div class="flip">
          <div class="face back ${f.deck}">${title}</div>
          <div class="face front">
            <div class="card-band ${f.deck}"><svg viewBox="0 0 24 24">${icon}</svg>${title}</div>
            <div class="card-text">${esc(f.text)}</div>
            <div class="card-who">${esc(p ? p.name : '')} drew this · tap to close</div>
          </div>
        </div>`;
      wrap.classList.remove('hidden');
      let done = false;
      const close = () => { if (done) return; done = true; wrap.classList.add('hidden'); wrap.innerHTML = ''; };
      wrap.onclick = close;
      setTimeout(close, 4200);
      setTimeout(resolve, 1500);
    });
  }

  // ---------- lobby ----------
  function renderLobby() {
    const s = state, mine = mePlayer();
    const isHost = s.hostId === me;
    $('#codeBig').textContent = s.code;
    $('#playerCount').textContent = `${s.players.length}/8`;
    const lis = s.players.map((p) => `
      <li>${tokHTML(p)}<span class="name">${esc(p.name)}${p.id === me ? ' <span class="muted small">(you)</span>' : ''}</span>
        ${p.id === s.hostId ? '<span class="chip host">Host</span>' : ''}
        ${!p.connected ? '<span class="chip off">Away</span>' : ''}
        <span class="chip ${p.ready ? 'ready' : ''}">${p.ready ? '✓ Ready' : 'Not ready'}</span></li>`);
    const empties = Math.max(0, Math.min(8, Math.max(4, s.players.length + 1)) - s.players.length);
    for (let k = 0; k < empties; k++) lis.push('<li class="empty-seat"><span class="tok" style="background:transparent;border-style:dashed;border-color:#4A5577"></span><span class="name muted">Waiting for a friend…</span></li>');
    $('#lobbyPlayers').innerHTML = lis.join('');

    $('#myPreview').innerHTML = tokHTML(mine);
    $('#tokenPicker').innerHTML = TOKENS.map((t) => `<button data-t="${t.id}" title="${t.name}" class="${t.id === mine.tokenId ? 'sel' : ''}"><svg viewBox="0 0 24 24">${window.ICONS.TOKENS[t.id]}</svg></button>`).join('');
    const takenCombo = (tid, c) => s.players.some((p) => p.id !== me && p.tokenId === tid && p.color === c);
    $('#colorPicker').innerHTML = COLORS.map((c) => {
      const taken = takenCombo(mine.tokenId, c);
      return `<button data-c="${c}" style="background:${c}" class="${c === mine.color ? 'sel' : ''} ${taken ? 'taken' : ''}" ${taken ? 'disabled title="Taken with this piece"' : ''}></button>`;
    }).join('');
    $('#tokenPicker').querySelectorAll('button').forEach((b) => b.onclick = () => {
      SFX.play('click');
      const tid = b.dataset.t;
      let color = mine.color;
      if (takenCombo(tid, color)) color = COLORS.find((c) => !takenCombo(tid, c));
      act('customize', { tokenId: tid, color });
    });
    $('#colorPicker').querySelectorAll('button').forEach((b) => b.onclick = () => { SFX.play('click'); act('customize', { color: b.dataset.c }); });

    const fp = $('#fpToggle');
    fp.checked = s.settings.freeParking;
    fp.disabled = !isHost;
    fp.onchange = () => act('settings', { freeParking: fp.checked });
    $('#rulesNote').textContent = isHost ? "You're the host — you set the house rules. Changing them un-readies everyone." : 'Only the host can change house rules.';

    const rb = $('#readyBtn');
    rb.textContent = mine.ready ? '✓ Ready! (tap to undo)' : "I'm ready";
    rb.className = 'btn btn-lg ' + (mine.ready ? 'btn-green' : 'btn-secondary');
    rb.onclick = () => { SFX.play('click'); act('ready', { ready: !mine.ready }); };

    const allReady = s.players.every((p) => p.ready);
    const sb = $('#startBtn');
    sb.classList.toggle('hidden', !isHost);
    sb.disabled = !(allReady && s.players.length >= 2);
    sb.onclick = () => act('start');
    const notReady = s.players.filter((p) => !p.ready).length;
    $('#lobbyStatus').textContent = s.players.length < 2 ? 'Share the code — you need at least 2 players.'
      : notReady ? `Waiting for ${notReady} player${notReady > 1 ? 's' : ''} to ready up.`
        : isHost ? "Everyone's ready — start when you like!" : "Everyone's ready — waiting for the host to start.";
  }

  $('#codeBig').onclick = async () => {
    const link = `${location.origin}/?code=${state.code}`;
    try { await navigator.clipboard.writeText(link); $('#copyHint').textContent = 'Invite link copied! Paste it to your friends.'; }
    catch (e) { $('#copyHint').textContent = link; }
  };
  $('#leaveLobby').onclick = () => {
    socket.emit('leave', {}, () => {});
    store.del('tt_session'); session = null; me = null; state = null;
    showHome();
  };

  // ---------- side panel ----------
  function renderSide() {
    renderTurnCard();
    renderPlayers();
    renderTrades();
    renderLog();
    $('#muteBtn').textContent = SFX.muted ? '🔇' : '🔊';
  }

  function renderTurnCard() {
    if (!state || state.phase === 'lobby') return;
    const s = state, mine = mePlayer(), cur = player(curId());
    const el = $('#turnCard');
    const busy = fxBusy;
    let html = '';
    const mineTurn = isMyTurn();
    el.classList.toggle('mine', mineTurn && !mine.bankrupt);

    if (s.phase === 'ended') {
      const w = player(s.winner);
      html = `<div class="turn-head">${w ? tokHTML(w) : ''}<div class="who"><small>Game over</small>${w ? esc(w.name) + ' wins! 🏆' : 'No winner'}</div></div>
        <div class="actions"><button class="btn btn-primary full" data-a="home">Back to home</button></div>`;
    } else {
      const head = `<div class="turn-head">${tokHTML(cur)}<div class="who"><small>${mineTurn ? 'Your turn' : 'Now playing'}</small>${esc(cur.name)}</div></div>`;
      let prompt = '', btns = '';
      if (mine.bankrupt) {
        prompt = "You're bankrupt — you can keep watching the game.";
      } else if (s.debt && s.debt.pid === me) {
        const short = Math.max(0, s.debt.amount - mine.cash);
        prompt = `You owe <b>${money(s.debt.amount)}</b> for ${esc(s.debt.what)}. ${short ? `You're <b>${money(short)}</b> short — sell buildings or mortgage lots to raise cash.` : 'You have enough now!'}`;
        btns = `<button class="btn btn-ghost" data-a="manage">🏠 My lots</button>
          <button class="btn btn-green" data-a="payDebt" ${short ? 'disabled' : ''}>Pay ${money(s.debt.amount)}</button>
          <button class="btn btn-red full" data-a="bankrupt">Declare bankruptcy</button>`;
      } else if (s.auction) {
        const sp = SPACES[s.auction.idx];
        prompt = `<b>${esc(sp.name)}</b> is up for auction!`;
        btns = `<button class="btn btn-secondary full" data-a="auction">Open auction</button>`;
      } else if (mineTurn) {
        const st = s.turn.stage;
        if (st === 'roll' && mine.inJail) {
          prompt = `You're in <b>The Slammer</b> (try ${mine.jailTurns + 1} of 3). Roll doubles to escape, pay ${money(CONSTANTS.jailFine)}, or use an Escape Hatch card.`;
          btns = `<button class="btn btn-primary full" data-a="roll" ${busy ? 'disabled' : ''}>🎲 Roll for doubles</button>
            <button class="btn btn-ghost" data-a="payJail" ${mine.cash < CONSTANTS.jailFine || busy ? 'disabled' : ''}>Pay ${money(CONSTANTS.jailFine)}</button>
            <button class="btn btn-ghost" data-a="useJailCard" ${!mine.jailCards || busy ? 'disabled' : ''}>Use card (${mine.jailCards})</button>`;
        } else if (st === 'roll') {
          prompt = s.turn.doubles ? 'Doubles! Roll again.' : 'Roll the dice to move.';
          btns = `<button class="btn btn-primary btn-lg full" data-a="roll" ${busy ? 'disabled' : ''}>🎲 Roll dice</button>`;
        } else if (st === 'buy') {
          const sp = SPACES[s.pendingBuy];
          const can = mine.cash >= sp.price;
          prompt = busy ? 'Moving…' : `You landed on <b>${esc(sp.name)}</b>. Buy it for <b>${money(sp.price)}</b>?${can ? '' : ` You need ${money(sp.price - mine.cash)} more — mortgage something first or auction it.`} <a href="#" data-a="deed" data-i="${sp.index}" style="color:var(--sky)">View deed</a>`;
          btns = `<button class="btn btn-green" data-a="buy" ${!can || busy ? 'disabled' : ''}>Buy ${money(sp.price)}</button>
            <button class="btn btn-ghost" data-a="decline" ${busy ? 'disabled' : ''}>Auction it</button>`;
        } else if (st === 'end') {
          prompt = 'Build, trade or manage your lots — then end your turn.';
          btns = `<button class="btn btn-primary full" data-a="endTurn" ${busy ? 'disabled' : ''}>End turn ➜</button>`;
        } else prompt = '<span class="waiting-dots">Working</span>';
      } else {
        const st = s.turn.stage;
        const what = s.debt ? `is raising cash to pay ${money(s.debt.amount)}`
          : st === 'buy' ? `is deciding whether to buy <b>${esc(SPACES[s.pendingBuy].name)}</b>`
            : st === 'end' ? 'is finishing their turn'
              : cur.inJail ? 'is trying to escape The Slammer' : 'is about to roll';
        prompt = `${esc(cur.name)} ${what}<span class="waiting-dots"></span>${!cur.connected ? ' <span class="chip off">Disconnected</span>' : ''}`;
      }
      html = head + `<p class="prompt">${prompt}</p>` + (btns ? `<div class="actions">${btns}</div>` : '');
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-a]').forEach((b) => b.onclick = (e) => { e.preventDefault(); turnAction(b.dataset.a, b.dataset.i); });
  }

  function turnAction(a, i) {
    SFX.unlock();
    switch (a) {
      case 'manage': return openManage();
      case 'auction': return openAuction();
      case 'deed': return openDeed(+i);
      case 'home':
        store.del('tt_session'); session = null; me = null; state = null; board = null;
        $('#board').innerHTML = '';
        closeModal();
        return showHome();
      case 'bankrupt':
        return confirmBox('Declare bankruptcy?', 'You will be out of the game and your stuff goes to whoever you owe.', 'Yes, I\'m out', () => act('bankrupt'));
      default: return act(a);
    }
  }

  function lotChips(p) {
    const owned = Object.entries(state.props).filter(([, pr]) => pr.owner === p.id).map(([i]) => +i);
    if (!owned.length) return '';
    const groups = {};
    owned.forEach((i) => {
      const s = SPACES[i];
      const key = s.group || s.type;
      (groups[key] = groups[key] || []).push(i);
    });
    const order = [...Object.keys(GROUPS), 'station', 'utility'];
    return '<div class="lots">' + order.filter((k) => groups[k]).map((k) => '<div class="lotgroup">' + groups[k].map((i) => {
      const s = SPACES[i], pr = state.props[i];
      const color = s.group ? GROUPS[s.group].color : s.type === 'station' ? '#3A4466' : '#8A93B3';
      const b = pr.houses ? `<span class="b">${pr.houses === 5 ? 'H' : pr.houses}</span>` : '';
      return `<button class="lot ${s.group ? '' : 'station'} ${pr.mortgaged ? 'm' : ''}" style="background:${color}" title="${esc(s.name)}" data-deed="${i}">${b}</button>`;
    }).join('') + '</div>').join('') + '</div>';
  }

  function renderPlayers() {
    const s = state;
    const isHost = s.hostId === me;
    $('#players').innerHTML = s.players.map((p) => {
      const chips = [];
      if (p.id === s.hostId) chips.push('<span class="chip host">Host</span>');
      if (p.inJail) chips.push('<span class="chip jail">In The Slammer</span>');
      if (p.jailCards) chips.push(`<span class="chip">Escape Hatch ×${p.jailCards}</span>`);
      if (!p.connected && !p.bankrupt) chips.push('<span class="chip off">Offline</span>' + (isHost && s.phase === 'playing' ? `<button class="kick" data-kick="${p.id}">Remove</button>` : ''));
      if (p.bankrupt) chips.push('<span class="chip off">Bankrupt</span>');
      if (s.winner === p.id) chips.push('<span class="chip ready">Winner 🏆</span>');
      return `<div class="pcard ${p.id === curId() && s.phase === 'playing' ? 'turn' : ''} ${p.bankrupt ? 'out' : ''}" data-id="${p.id}">
        <div class="row">${tokHTML(p, 'sm')}<span class="pname">${esc(p.name)}${p.id === me ? '<span class="you">YOU</span>' : ''}</span><span class="cash" data-cash="${p.id}">${money(shownCash[p.id] != null ? shownCash[p.id] : p.cash)}</span></div>
        ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
        ${lotChips(p)}
      </div>`;
    }).join('');
    $('#players').querySelectorAll('[data-deed]').forEach((b) => b.onclick = () => openDeed(+b.dataset.deed));
    $('#players').querySelectorAll('[data-kick]').forEach((b) => b.onclick = () => {
      const p = player(b.dataset.kick);
      confirmBox(`Remove ${p.name}?`, 'They are offline. Removing them makes them bankrupt and returns their lots to the bank.', 'Remove', () => act('kick', { target: p.id }));
    });
    s.players.forEach((p) => {
      const from = shownCash[p.id] != null ? shownCash[p.id] : p.cash;
      if (from !== p.cash) tweenCash(p.id, from, p.cash);
      shownCash[p.id] = p.cash;
    });
  }

  const cashTweens = {};
  function tweenCash(pid, from, to) {
    const t0 = performance.now(), dur = 650;
    const token = cashTweens[pid] = {};
    const step = (t) => {
      const el = document.querySelector(`[data-cash="${pid}"]`);
      if (!el || cashTweens[pid] !== token) return;
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = money(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderTrades() {
    const s = state;
    const items = s.trades.filter((t) => t.from === me || t.to === me).map((t) => {
      if (t.to === me) {
        const f = player(t.from);
        return `<div class="trade-item incoming">${tokHTML(f, 'sm')}<span><b>${esc(f.name)}</b> sent you a trade</span><button class="btn btn-secondary" data-review="${t.id}">Review</button></div>`;
      }
      const to = player(t.to);
      return `<div class="trade-item">${tokHTML(to, 'sm')}<span>Waiting on <b>${esc(to.name)}</b>…</span><button class="btn btn-ghost" data-cancel="${t.id}">Cancel</button></div>`;
    });
    $('#tradeList').innerHTML = items.join('');
    $('#tradeList').querySelectorAll('[data-review]').forEach((b) => b.onclick = () => openTradeReview(b.dataset.review));
    $('#tradeList').querySelectorAll('[data-cancel]').forEach((b) => b.onclick = () => act('cancelTrade', { tradeId: b.dataset.cancel }));
    const mine = mePlayer();
    const canTrade = s.phase === 'playing' && !mine.bankrupt;
    $('#tradeBtn').disabled = !canTrade;
    $('#manageBtn').disabled = !canTrade;
  }

  function checkIncomingTrades() {
    if (!state || state.phase !== 'playing') return;
    state.trades.forEach((t) => {
      if (t.to === me && !seenTrades.has(t.id)) {
        seenTrades.add(t.id);
        const f = player(t.from);
        toast(`${f.name} sent you a trade offer!`);
        if (!modalKind) openTradeReview(t.id);
      }
    });
  }

  function renderLog() {
    const items = state.log.slice(-70);
    $('#log').innerHTML = items.slice().reverse().map((l) => `<li class="${seenLogs.has(l.id) ? '' : 'new'}">${esc(l.msg)}</li>`).join('');
    items.forEach((l) => seenLogs.add(l.id));
  }

  // ---------- modals ----------
  function openModal(kind, html, opts = {}) {
    modalKind = kind;
    modalData = opts.data;
    const box = $('#modalBox');
    box.className = 'modal-box' + (opts.narrow ? ' narrow' : '');
    box.innerHTML = `<button class="icon-btn modal-x" data-close>✕</button>` + html;
    $('#modal').classList.remove('hidden');
    box.querySelectorAll('[data-close]').forEach((b) => b.onclick = closeModal);
  }
  function closeModal() {
    modalKind = null; modalData = null;
    $('#modal').classList.add('hidden');
    $('#modalBox').innerHTML = '';
    clearInterval(auctionTimer);
  }
  $('#modal .modal-backdrop').onclick = () => { if (modalKind !== 'win') closeModal(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalKind && modalKind !== 'win') closeModal(); });

  function refreshModal() {
    if (!state) return;
    if (state.auction && modalKind !== 'auction' && !mePlayer().bankrupt) {
      if (!state.auction.passed.includes(me) && (!modalKind || modalKind === 'deed' || modalKind === 'manage')) openAuction();
    }
    if (modalKind === 'auction') { if (!state.auction) closeModal(); else renderAuction(); }
    else if (modalKind === 'manage') renderManage();
    else if (modalKind === 'deed') openDeed(modalData);
    else if (modalKind === 'review') {
      if (!state.trades.some((t) => t.id === modalData)) closeModal();
    }
  }

  function confirmBox(title, text, okLabel, onOk) {
    openModal('confirm', `<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-red" id="okBtn">${esc(okLabel)}</button></div>`, { narrow: true });
    $('#okBtn').onclick = () => { closeModal(); onOk(); };
  }

  // ---------- deed ----------
  function deedHTML(i) {
    const s = SPACES[i];
    const pr = state && state.props[i];
    const owner = pr && pr.owner ? player(pr.owner) : null;
    const ownerLine = pr ? `<div class="owner">${owner ? `Owned by <b style="color:${owner.color}">${esc(owner.name)}</b>${pr.mortgaged ? ' · <b style="color:#C2410C">Mortgaged</b>' : ''}` : `For sale · <b>${money(s.price)}</b>`}</div>` : '';
    if (s.type === 'property') {
      const g = GROUPS[s.group];
      const full = owner && SPACES.filter((x) => x.group === s.group).every((x) => state.props[x.index].owner === owner.id);
      const level = pr && pr.owner ? (pr.houses ? pr.houses + 1 : full ? 1 : 0) : -1;
      const rows = [
        ['Rent', s.rent[0]], ['Rent with full set', s.rent[0] * 2],
        ['With 1 house', s.rent[1]], ['With 2 houses', s.rent[2]], ['With 3 houses', s.rent[3]], ['With 4 houses', s.rent[4]], ['With a HOTEL', s.rent[5]],
      ];
      const light = s.group === 'yellow' || s.group === 'sky';
      return `<div class="deed">
        <div class="deed-head ${light ? 'light' : ''}" style="background:${g.color}"><small>${esc(g.name)}</small><div class="t">${esc(s.name)}</div></div>
        <table>${rows.map((r, k) => `<tr class="${k === level ? 'hl' : ''}"><td>${r[0]}</td><td>${money(r[1])}</td></tr>`).join('')}
          <tr class="sep"><td>Houses cost</td><td>${money(g.house)} each</td></tr>
          <tr><td>Hotel cost</td><td>${money(g.house)} + 4 houses</td></tr>
          <tr><td>Mortgage value</td><td>${money(s.price / 2)}</td></tr>
          <tr><td>Unmortgage cost</td><td>${money(Math.ceil(s.price * 11 / 20))}</td></tr></table>
        <div class="note">Own every ${esc(g.name)} lot to double rent and start building.</div>${ownerLine}</div>`;
    }
    if (s.type === 'station') {
      const n = owner ? SPACES.filter((x) => x.type === 'station' && state.props[x.index].owner === owner.id).length : 0;
      return `<div class="deed"><div class="deed-head plain"><svg class="ico" viewBox="0 0 24 24">${window.ICONS.SPACE.station}</svg><small>Transit</small><div class="t">${esc(s.name)}</div></div>
        <table>${[1, 2, 3, 4].map((k) => `<tr class="${k === n ? 'hl' : ''}"><td>If ${k} station${k > 1 ? 's are' : ' is'} owned</td><td>${money(25 * Math.pow(2, k - 1))}</td></tr>`).join('')}
          <tr class="sep"><td>Mortgage value</td><td>${money(s.price / 2)}</td></tr></table>${ownerLine}</div>`;
    }
    if (s.type === 'utility') {
      const n = owner ? SPACES.filter((x) => x.type === 'utility' && state.props[x.index].owner === owner.id).length : 0;
      return `<div class="deed"><div class="deed-head plain"><svg class="ico" viewBox="0 0 24 24">${window.ICONS.SPACE[s.kind]}</svg><small>Utility</small><div class="t">${esc(s.name)}</div></div>
        <table><tr class="${n === 1 ? 'hl' : ''}"><td>One utility owned</td><td>4 × dice</td></tr><tr class="${n === 2 ? 'hl' : ''}"><td>Both utilities owned</td><td>10 × dice</td></tr>
        <tr class="sep"><td>Mortgage value</td><td>${money(s.price / 2)}</td></tr></table>${ownerLine}</div>`;
    }
    const info = {
      start: ['START', `Collect ${money(CONSTANTS.passStart)} every time you pass or land here.`],
      luck: ['Lucky Break', 'Draw a Lucky Break card. Could be great. Could be a llama-related fine.'],
      community: ['Block Party', 'Draw a Block Party card from the neighborhood deck.'],
      tax: [s.name, `Pay ${money(s.amount || 0)}${state && state.settings.freeParking ? ' — it goes into the Free Parking jackpot.' : ' to the bank.'}`],
      jail: ['The Slammer', `Just visiting is free. If you're locked up: roll doubles, pay ${money(CONSTANTS.jailFine)}, or use an Escape Hatch card. After 3 failed tries you must pay.`],
      parking: ['Free Parking', state && state.settings.freeParking ? `Land here to scoop the jackpot — currently ${money(state.pot)}!` : 'Take a breather. Nothing happens here.'],
      gotojail: ['Go To The Slammer', 'Go directly to The Slammer. Do not pass START.'],
    }[s.type];
    return `<div class="deed"><div class="deed-head plain"><div class="t">${esc(info[0])}</div></div><div class="note" style="font-size:14px;padding:12px">${esc(info[1])}</div></div>`;
  }

  function lotButtons(i) {
    const s = SPACES[i], pr = state.props[i];
    if (!pr || pr.owner !== me || state.phase !== 'playing') return '';
    const b = [];
    if (s.type === 'property') {
      const g = GROUPS[s.group];
      const gp = SPACES.filter((x) => x.group === s.group).map((x) => state.props[x.index]);
      const full = gp.every((x) => x.owner === me);
      const canBuild = full && !gp.some((x) => x.mortgaged) && pr.houses < 5 && pr.houses <= Math.min(...gp.map((x) => x.houses));
      const canSell = pr.houses > 0 && pr.houses >= Math.max(...gp.map((x) => x.houses));
      if (full) {
        b.push(`<button class="btn btn-green" data-lot="build" data-i="${i}" ${canBuild ? '' : 'disabled'}>Build ${pr.houses === 4 ? 'hotel' : 'house'} −${money(g.house)}</button>`);
        b.push(`<button class="btn btn-ghost" data-lot="sell" data-i="${i}" ${canSell ? '' : 'disabled'}>Sell +${money(g.house / 2)}</button>`);
      }
      if (!pr.mortgaged) b.push(`<button class="btn btn-ghost" data-lot="mortgage" data-i="${i}" ${gp.some((x) => x.houses) ? 'disabled' : ''}>Mortgage +${money(s.price / 2)}</button>`);
    } else if (!pr.mortgaged) b.push(`<button class="btn btn-ghost" data-lot="mortgage" data-i="${i}">Mortgage +${money(s.price / 2)}</button>`);
    if (pr.mortgaged) b.push(`<button class="btn btn-secondary" data-lot="unmortgage" data-i="${i}">Unmortgage −${money(Math.ceil(s.price * 11 / 20))}</button>`);
    return b.join('');
  }

  function bindLotButtons(root) {
    root.querySelectorAll('[data-lot]').forEach((b) => b.onclick = () => act(b.dataset.lot, { idx: +b.dataset.i }));
  }

  function openDeed(i) {
    if (!state) return;
    const btns = lotButtons(i);
    openModal('deed', `<div class="deed-wrap">${deedHTML(i)}${btns ? `<div class="modal-actions">${btns}</div>` : ''}</div>`, { narrow: true, data: i });
    bindLotButtons($('#modalBox'));
  }

  // ---------- manage ----------
  function openManage() { openModal('manage', '<h2>My lots</h2><div id="manageBody"></div>'); renderManage(); }
  function renderManage() {
    const body = $('#manageBody');
    if (!body) return;
    const mine = mePlayer();
    const owned = Object.entries(state.props).filter(([, pr]) => pr.owner === me).map(([i]) => +i);
    if (!owned.length) { body.innerHTML = '<p class="muted">You don\'t own any lots yet. Land on one and buy it!</p>'; return; }
    const order = [...Object.keys(GROUPS), 'station', 'utility'];
    const grouped = {};
    owned.forEach((i) => { const k = SPACES[i].group || SPACES[i].type; (grouped[k] = grouped[k] || []).push(i); });
    body.innerHTML = `<p class="muted small">Cash: <b style="color:var(--text)">${money(mine.cash)}</b> · Bank has ${state.housesLeft} houses, ${state.hotelsLeft} hotels left.${state.debt && state.debt.pid === me ? ` You owe <b style="color:#FF8A8F">${money(state.debt.amount)}</b>.` : ''}</p>` +
      order.filter((k) => grouped[k]).map((k) => {
        const title = GROUPS[k] ? GROUPS[k].name : k === 'station' ? 'Transit' : 'Utilities';
        const full = GROUPS[k] && SPACES.filter((x) => x.group === k).every((x) => state.props[x.index].owner === me);
        return `<div class="mgroup-title">${esc(title)}${GROUPS[k] ? (full ? ' · full set ✓' : ' · collect them all to build') : ''}</div><div class="manage-list">` +
          grouped[k].map((i) => {
            const s = SPACES[i], pr = state.props[i];
            const color = s.group ? GROUPS[s.group].color : '#5A6488';
            const status = pr.mortgaged ? 'Mortgaged' : pr.houses === 5 ? '🏨 Hotel' : pr.houses ? '🏠'.repeat(pr.houses) : 'No buildings';
            return `<div class="mrow"><span class="sw" style="background:${color}"></span><span class="mname">${esc(s.name)}<small>${status}</small></span><span class="mbtns">${lotButtons(i)}</span></div>`;
          }).join('') + '</div>';
      }).join('');
    bindLotButtons(body);
  }
  $('#manageBtn').onclick = () => { SFX.unlock(); openManage(); };

  // ---------- auction ----------
  function openAuction() {
    openModal('auction', '<div id="auctionBody"></div>', { narrow: true });
    renderAuction();
    clearInterval(auctionTimer);
    auctionTimer = setInterval(updateAuctionTimer, 200);
  }
  function renderAuction() {
    const a = state.auction, body = $('#auctionBody');
    if (!a || !body) return;
    a.localEnds = Date.now() + (a.endsAt - a.now);
    state.auction = a;
    const s = SPACES[a.idx];
    const color = s.group ? GROUPS[s.group].color : '#5A6488';
    const leader = a.bidder ? player(a.bidder) : null;
    const mine = mePlayer();
    const out = a.passed.includes(me) || mine.bankrupt;
    const incs = a.high ? [10, 50, 100] : [10, 50, 100].map((x) => x - 0);
    body.innerHTML = `
      <div class="auction-head"><span class="auction-swatch" style="background:${color}"></span>
        <div><div class="eyebrow">Auction</div><h2 style="margin:0">${esc(s.name)}</h2><div class="muted small">List price ${money(s.price)} · <a href="#" id="aDeed" style="color:var(--sky)">deed</a></div></div></div>
      <div class="eyebrow">Top bid</div>
      <div class="auction-bid">${money(a.high)}</div>
      <div class="muted small" style="margin-top:4px">${leader ? `${esc(leader.name)} is winning${leader.id === me ? ' — that\'s you!' : ''}` : 'No bids yet'}</div>
      <div class="timer"><span id="aTimer"></span></div>
      ${out ? '<p class="muted center">You\'re out of this auction. Watching…</p>' : `
      <div class="bid-btns">${incs.map((x) => `<button class="btn btn-secondary" data-bid="${a.high + x}" ${a.high + x > mine.cash ? 'disabled' : ''}>${money(a.high + x)}</button>`).join('')}</div>
      <div class="bid-custom"><input id="bidInput" type="number" inputmode="numeric" min="${a.high + 1}" max="${mine.cash}" placeholder="Custom bid"><button class="btn btn-primary" id="bidGo">Bid</button></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="aPass" ${a.bidder === me ? 'disabled' : ''}>Drop out</button></div>
      <p class="muted small center">You have ${money(mine.cash)}. Highest bid when the timer runs out wins.</p>`}`;
    body.querySelectorAll('[data-bid]').forEach((b) => b.onclick = () => act('bid', { amount: +b.dataset.bid }));
    const go = $('#bidGo');
    if (go) {
      go.onclick = () => { const v = +$('#bidInput').value; if (v) act('bid', { amount: v }); };
      $('#bidInput').onkeydown = (e) => { if (e.key === 'Enter') go.click(); };
    }
    const pass = $('#aPass');
    if (pass) pass.onclick = () => act('passAuction');
    $('#aDeed').onclick = (e) => { e.preventDefault(); toast(`${s.name}: base rent ${s.rent ? money(s.rent[0]) : 'varies'}, list ${money(s.price)}`); };
    updateAuctionTimer();
  }
  function updateAuctionTimer() {
    const a = state && state.auction, t = $('#aTimer');
    if (!a || !t) return;
    const left = Math.max(0, a.localEnds - Date.now());
    t.style.width = Math.min(100, (left / 15000) * 100) + '%';
  }

  // ---------- trading ----------
  function tradeableLots(pid) {
    return Object.entries(state.props).filter(([, pr]) => pr.owner === pid).map(([i]) => {
      const s = SPACES[+i];
      const blocked = s.group && SPACES.filter((x) => x.group === s.group).some((x) => state.props[x.index].houses);
      return { i: +i, s, blocked, mortgaged: state.props[i].mortgaged };
    }).sort((a, b) => a.i - b.i);
  }

  function lotColor(s) { return s.group ? GROUPS[s.group].color : '#5A6488'; }

  function openTradeEditor(preset = {}) {
    const others = state.players.filter((p) => p.id !== me && !p.bankrupt);
    if (!others.length) return toast('Nobody to trade with.');
    const draft = {
      to: preset.to || others[0].id,
      give: { cash: 0, props: [], jailCards: 0, ...(preset.give || {}) },
      get: { cash: 0, props: [], jailCards: 0, ...(preset.get || {}) },
    };
    draft.give.props = [...draft.give.props]; draft.get.props = [...draft.get.props];
    openModal('trade', '<div id="tradeBody"></div>');
    const render = () => {
      const mine = mePlayer(), them = player(draft.to);
      const col = (who, side, p) => {
        const lots = tradeableLots(p.id);
        return `<div class="trade-col"><h4>${tokHTML(p, 'sm')} ${who}</h4>
          <div class="tlots">${lots.length ? lots.map((l) => `<button class="tlot ${draft[side].props.includes(l.i) ? 'sel' : ''}" data-side="${side}" data-i="${l.i}" ${l.blocked ? 'disabled' : ''}><i style="background:${lotColor(l.s)}"></i>${esc(l.s.name)}<small>${l.blocked ? 'has buildings' : l.mortgaged ? 'mortgaged' : money(l.s.price)}</small></button>`).join('') : '<span class="muted small">No lots</span>'}</div>
          <label>Cash (has ${money(p.cash)})</label><input type="number" min="0" max="${p.cash}" inputmode="numeric" data-cash="${side}" value="${draft[side].cash || ''}" placeholder="0">
          ${p.jailCards ? `<label>Escape Hatch cards (has ${p.jailCards})</label><input type="number" min="0" max="${p.jailCards}" data-cards="${side}" value="${draft[side].jailCards || ''}" placeholder="0">` : ''}</div>`;
      };
      $('#tradeBody').innerHTML = `<h2>${preset.counter ? 'Counter-offer' : 'Propose a trade'}</h2>
        ${preset.counter ? '' : `<div class="sel-partner">${others.map((p) => `<button data-partner="${p.id}" class="${p.id === draft.to ? 'sel' : ''}">${tokHTML(p, 'sm')}${esc(p.name)}</button>`).join('')}</div>`}
        <div class="trade-grid">${col('You give', 'give', mine)}${col(`${esc(them.name)} gives`, 'get', them)}</div>
        <p class="muted small">Mortgaged lots carry a 10% interest fee for whoever receives them. Lots in a set with buildings can't be traded.</p>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="sendTrade">Send offer</button></div>`;
      const body = $('#tradeBody');
      body.querySelectorAll('[data-close]').forEach((b) => b.onclick = closeModal);
      body.querySelectorAll('[data-partner]').forEach((b) => b.onclick = () => { draft.to = b.dataset.partner; draft.get = { cash: 0, props: [], jailCards: 0 }; render(); });
      body.querySelectorAll('.tlot').forEach((b) => b.onclick = () => {
        const arr = draft[b.dataset.side].props, i = +b.dataset.i;
        const k = arr.indexOf(i);
        if (k >= 0) arr.splice(k, 1); else arr.push(i);
        b.classList.toggle('sel');
      });
      body.querySelectorAll('[data-cash]').forEach((inp) => inp.oninput = () => { draft[inp.dataset.cash].cash = Math.max(0, Math.floor(+inp.value || 0)); });
      body.querySelectorAll('[data-cards]').forEach((inp) => inp.oninput = () => { draft[inp.dataset.cards].jailCards = Math.max(0, Math.floor(+inp.value || 0)); });
      $('#sendTrade').onclick = async () => {
        const r = await act('proposeTrade', { offer: draft });
        if (r && r.ok) { closeModal(); toast(`Offer sent to ${them.name}.`); }
      };
    };
    render();
  }
  $('#tradeBtn').onclick = () => { SFX.unlock(); openTradeEditor(); };

  function sideList(side) {
    const items = [];
    if (side.cash) items.push(`<li>💵 <b>${money(side.cash)}</b></li>`);
    side.props.forEach((i) => { const s = SPACES[i]; items.push(`<li><i style="background:${lotColor(s)}"></i>${esc(s.name)}${state.props[i].mortgaged ? ' <span class="muted small">(mortgaged)</span>' : ''}</li>`); });
    if (side.jailCards) items.push(`<li>🗝️ Escape Hatch ×${side.jailCards}</li>`);
    return items.length ? items.join('') : '<li class="muted">Nothing</li>';
  }

  function openTradeReview(id) {
    const t = state.trades.find((x) => x.id === id);
    if (!t) return;
    const f = player(t.from);
    openModal('review', `<h2>${tokHTML(f, 'sm')} ${esc(f.name)} wants to trade</h2>
      <div class="offer-summary">
        <div class="offer-side"><h5>You get</h5><ul>${sideList(t.give)}</ul></div>
        <div class="arrow">⇄</div>
        <div class="offer-side"><h5>You give</h5><ul>${sideList(t.get)}</ul></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="tDecline">Decline</button>
        <button class="btn btn-secondary" id="tCounter">Counter</button>
        <button class="btn btn-green" id="tAccept">Accept</button>
      </div>`, { data: id });
    $('#tAccept').onclick = async () => { const r = await act('respondTrade', { tradeId: id, accept: true }); if (r && r.ok) closeModal(); };
    $('#tDecline').onclick = async () => { await act('respondTrade', { tradeId: id, accept: false }); closeModal(); };
    $('#tCounter').onclick = () => openTradeEditor({ to: t.from, give: t.get, get: t.give, counter: true });
  }

  // ---------- win ----------
  function openWin(p) {
    openModal('win', `<div class="center">
      <div style="display:inline-block;transform:scale(1.6);margin:16px 0 18px">${p ? tokHTML(p) : ''}</div>
      <h2 style="font-size:34px">${p ? esc(p.name) : 'Nobody'} wins! 🏆</h2>
      <p class="muted">${p && p.id === me ? 'Absolute tycoon behavior. Congrats!' : 'GG — better luck next time.'}</p>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>View board</button><button class="btn btn-primary" id="winHome">Back to home</button></div></div>`, { narrow: true });
    $('#winHome').onclick = () => turnAction('home');
  }

  // ---------- rules ----------
  $('#rulesBtn').onclick = () => {
    openModal('rules', `<div class="rules"><h2>How to play</h2>
      <p>Roll, move around the board and buy the lots you land on. When someone lands on your lot, they pay you rent. Last player with money left wins.</p>
      <h3>Building</h3><ul><li>Own every lot in a color set to double its rent and unlock building.</li><li>Build evenly: each lot needs the same number of houses before adding more. Four houses become a hotel.</li><li>The bank only has 32 houses and 12 hotels.</li></ul>
      <h3>Doubles & The Slammer</h3><ul><li>Doubles let you roll again. Three in a row sends you to The Slammer.</li><li>To get out: roll doubles, pay $50, or use an Escape Hatch card. After 3 failed tries you pay and move.</li></ul>
      <h3>Auctions & trades</h3><ul><li>Skip buying a lot and everyone bids on it.</li><li>Trade lots, cash and Escape Hatch cards with anyone, any time.</li></ul>
      <h3>Money trouble</h3><ul><li>If you can't pay, sell buildings (half price) or mortgage lots (half the price). Still can't? You're bankrupt.</li></ul>
      ${state && state.settings.freeParking ? '<h3>House rule: Free Parking jackpot</h3><p>Taxes and card fees go into the pot in the middle of the board. Land on Free Parking to take it all.</p>' : ''}
      ${state && state.phase === 'playing' && !mePlayer().bankrupt ? '<div class="modal-actions"><button class="btn btn-red" id="quitBtn">Quit game</button><button class="btn btn-ghost" data-close>Got it</button></div>' : '<div class="modal-actions"><button class="btn btn-primary" data-close>Got it</button></div>'}</div>`);
    const q = $('#quitBtn');
    if (q) q.onclick = () => confirmBox('Quit the game?', "You'll go bankrupt and your lots return to the bank.", 'Quit', async () => {
      await act('bankrupt');
      turnAction('home');
    });
  };

  $('#muteBtn').onclick = () => { const m = SFX.toggle(); $('#muteBtn').textContent = m ? '🔇' : '🔊'; };

  // ---------- confetti ----------
  function confetti(ms) {
    const cv = $('#confetti'), ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#FFC53D', '#E5484D', '#30A46C', '#62C3EA', '#E2619F', '#F28C28', '#fff'];
    const parts = Array.from({ length: 160 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    const frame = (t) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const alive = t - t0 < ms;
      parts.forEach((p) => {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        if (alive && p.y > innerHeight + 20) { p.y = -10; p.vy = Math.random() * 3; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (alive || parts.some((p) => p.y < innerHeight + 20)) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    requestAnimationFrame(frame);
  }

  document.addEventListener('pointerdown', () => SFX.unlock(), { once: true });
  // Expose for debugging/tests
  window.TT = { get state() { return state; }, get me() { return me; }, get busy() { return fxBusy || fxQueue.length > 0; }, debug: (d) => new Promise((r) => socket.emit('debug', d, r)) };
  connect();
})();
