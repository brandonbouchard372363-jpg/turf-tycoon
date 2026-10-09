// Turf Tycoon — web + realtime server.
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { Game, GameError } = require('./game');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 20000, pingTimeout: 25000 });

app.get('/health', (req, res) => res.json({ ok: true, games: games.size }));
// Everything lives in one folder, so only these files are served to browsers.
const PUBLIC = new Set(['index.html', 'style.css', 'app.js', 'board.js', 'boardview.js', 'icons.js', 'sound.js']);
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/:file', (req, res, next) => {
  const f = req.params.file;
  if (!PUBLIC.has(f) && !/^(fredoka|nunito)-latin-\d+-normal\.woff2$/.test(f)) return next();
  res.sendFile(path.join(__dirname, f), { maxAge: f === 'index.html' ? 0 : '1h' });
});

const games = new Map();
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += LETTERS[crypto.randomInt(LETTERS.length)];
    if (!games.has(c)) return c;
  }
}

function broadcast(game) {
  const fx = game.fx;
  game.fx = [];
  game.lastActive = Date.now();
  io.to(game.code).emit('state', { state: game.publicState(), fx });
}

function createGame() {
  const code = newCode();
  const game = new Game(code, () => broadcast(game));
  games.set(code, game);
  return game;
}

function attach(socket, game, player) {
  socket.data.code = game.code;
  socket.data.pid = player.id;
  socket.join(game.code);
  player.connected = true;
}

// Action name -> handler. Each receives (game, pid, payload).
const ACTIONS = {
  customize: (g, pid, a) => g.customize(pid, a),
  ready: (g, pid, a) => g.setReady(pid, a.ready),
  settings: (g, pid, a) => g.setSettings(pid, a),
  start: (g, pid) => g.start(pid),
  roll: (g, pid) => g.roll(pid),
  payJail: (g, pid) => g.payJail(pid),
  useJailCard: (g, pid) => g.useJailCard(pid),
  buy: (g, pid) => g.buy(pid),
  decline: (g, pid) => g.decline(pid),
  bid: (g, pid, a) => g.bid(pid, a.amount),
  passAuction: (g, pid) => g.passAuction(pid),
  endTurn: (g, pid) => g.endTurn(pid),
  build: (g, pid, a) => g.build(pid, a.idx),
  sell: (g, pid, a) => g.sellBuilding(pid, a.idx),
  mortgage: (g, pid, a) => g.mortgage(pid, a.idx),
  unmortgage: (g, pid, a) => g.unmortgage(pid, a.idx),
  payDebt: (g, pid) => g.payDebt(pid),
  bankrupt: (g, pid) => g.declareBankruptcy(pid),
  proposeTrade: (g, pid, a) => g.proposeTrade(pid, a.offer),
  respondTrade: (g, pid, a) => g.respondTrade(pid, a.tradeId, !!a.accept),
  cancelTrade: (g, pid, a) => g.cancelTrade(pid, a.tradeId),
  kick: (g, pid, a) => g.kick(pid, a.target),
};

io.on('connection', (socket) => {
  const reply = (cb, data) => { if (typeof cb === 'function') cb(data); };
  const guard = (cb, fn) => {
    try { fn(); } catch (e) {
      if (!(e instanceof GameError)) console.error(e);
      reply(cb, { error: e instanceof GameError ? e.message : 'Something went wrong on the server.' });
    }
  };

  socket.on('create', ({ name } = {}, cb) => guard(cb, () => {
    leaveCurrent(socket);
    const game = createGame();
    let p;
    try { p = game.addPlayer(name); } catch (e) { games.delete(game.code); throw e; }
    attach(socket, game, p);
    reply(cb, { ok: true, code: game.code, pid: p.id, secret: p.secret });
    broadcast(game);
  }));

  socket.on('join', ({ code, name } = {}, cb) => guard(cb, () => {
    code = String(code || '').trim().toUpperCase();
    const game = games.get(code);
    if (!game) throw new GameError(`No game found with code ${code || '—'}. Double-check the letters.`);
    leaveCurrent(socket);
    const p = game.addPlayer(name);
    attach(socket, game, p);
    reply(cb, { ok: true, code, pid: p.id, secret: p.secret });
    broadcast(game);
  }));

  socket.on('resume', ({ code, pid, secret } = {}, cb) => guard(cb, () => {
    const game = games.get(String(code || '').toUpperCase());
    const p = game && game.player(pid);
    if (!game || !p || p.secret !== secret) {
      return reply(cb, { error: 'gone' });
    }
    attach(socket, game, p);
    reply(cb, { ok: true, code: game.code, pid: p.id });
    broadcast(game);
  }));

  socket.on('leave', (_, cb) => guard(cb, () => {
    const game = games.get(socket.data.code);
    if (game && game.phase === 'lobby') {
      game.removePlayer(socket.data.pid);
      if (!game.players.length) { game.destroy(); games.delete(game.code); }
      else broadcast(game);
    }
    leaveCurrent(socket);
    reply(cb, { ok: true });
  }));

  socket.on('action', (a = {}, cb) => guard(cb, () => {
    const game = games.get(socket.data.code);
    if (!game) throw new GameError('You are not in a game.');
    const fn = ACTIONS[a.type];
    if (!fn) throw new GameError('Unknown action.');
    fn(game, socket.data.pid, a);
    reply(cb, { ok: true });
    broadcast(game);
  }));

  // Test-only hooks (never enabled in production): force dice, positions, cards.
  if (process.env.TT_TEST === '1') {
    socket.on('debug', (d = {}, cb) => guard(cb, () => {
      const game = games.get(socket.data.code);
      if (d.dice) { const q = d.dice.slice(); game.rollDie = () => q.length ? q.shift() : 1 + crypto.randomInt(6); }
      if (d.setPos) game.player(d.setPos.pid).pos = d.setPos.pos;
      if (d.giveProp) game.props[d.giveProp.idx].owner = d.giveProp.pid;
      if (d.setCash) game.player(d.setCash.pid).cash = d.setCash.cash;
      if (d.jail) game.sendToJail(game.player(d.jail));
      if (d.stack) {
        const { LUCK, COMMUNITY } = require('./board');
        const list = d.stack.deck === 'luck' ? LUCK : COMMUNITY;
        const i = list.findIndex((c) => c.action === d.stack.action);
        game.decks[d.stack.deck] = [i, ...game.decks[d.stack.deck].filter((x) => x !== i)];
      }
      reply(cb, { ok: true });
      broadcast(game);
    }));
  }

  socket.on('disconnect', () => {
    const game = games.get(socket.data.code);
    if (!game) return;
    const pid = socket.data.pid;
    const p = game.player(pid);
    if (!p) return;
    // Another tab/socket may already have taken over this seat
    const stillHere = [...(io.sockets.adapter.rooms.get(game.code) || [])]
      .some((sid) => { const s = io.sockets.sockets.get(sid); return s && s.data.pid === pid; });
    if (stillHere) return;
    p.connected = false;
    broadcast(game);
    if (game.phase === 'lobby') {
      // Give them a minute to come back after a refresh before freeing the seat
      setTimeout(() => {
        const g = games.get(game.code);
        const q = g && g.player(pid);
        if (g && q && !q.connected && g.phase === 'lobby') {
          g.removePlayer(pid);
          if (!g.players.length) { g.destroy(); games.delete(g.code); } else broadcast(g);
        }
      }, 60000);
    }
  });
});

function leaveCurrent(socket) {
  if (socket.data.code) socket.leave(socket.data.code);
  socket.data.code = null;
  socket.data.pid = null;
}

// Clean up abandoned games every few minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, g] of games) {
    const anyone = g.players.some((p) => p.connected);
    const idle = now - g.lastActive;
    if ((!anyone && idle > 30 * 60 * 1000) || idle > 6 * 60 * 60 * 1000) { g.destroy(); games.delete(code); }
  }
}, 5 * 60 * 1000).unref();

server.listen(PORT, () => console.log(`Turf Tycoon running on http://localhost:${PORT}`));

module.exports = { server, games };
