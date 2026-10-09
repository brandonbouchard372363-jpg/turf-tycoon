// Turf Tycoon — server-authoritative game engine.
// All rules live here. The client only sends intents; every action is validated.
const { GROUPS, SPACES, LUCK, COMMUNITY, TOKENS, COLORS, CONSTANTS: C } = require('./board');
const crypto = require('crypto');

const uid = (n = 8) => crypto.randomBytes(n).toString('hex');
const money = (n) => '$' + n.toLocaleString('en-US');

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };

class Game {
  constructor(code, onChange) {
    this.code = code;
    this.onChange = onChange || (() => {});
    this.phase = 'lobby';
    this.hostId = null;
    this.players = [];
    this.settings = { freeParking: true };
    this.props = {};
    SPACES.forEach((s) => {
      if (s.price) this.props[s.index] = { owner: null, houses: 0, mortgaged: false };
    });
    this.housesLeft = C.houses;
    this.hotelsLeft = C.hotels;
    this.pot = 0;
    this.turn = null;
    this.pendingBuy = null;
    this.auction = null;
    this.debt = null;
    this.trades = [];
    this.logs = [];
    this.fx = [];
    this.winner = null;
    this.lastActive = Date.now();
    this.decks = { luck: shuffle(LUCK.map((_, i) => i)), community: shuffle(COMMUNITY.map((_, i) => i)) };
    this.rollDie = () => 1 + crypto.randomInt(6);
    this.timers = new Set();
  }

  // ---------- helpers ----------
  log(msg) {
    this.logs.push({ id: uid(4), t: Date.now(), msg });
    if (this.logs.length > 200) this.logs.shift();
  }
  addFx(fx) { this.fx.push(fx); }
  player(id) { return this.players.find((p) => p.id === id); }
  mustPlayer(id) { return this.player(id) || fail('You are not in this game.'); }
  active() { return this.players.filter((p) => !p.bankrupt); }
  current() { return this.turn ? this.players[this.turn.idx] : null; }
  isTurn(p) { return this.phase === 'playing' && this.current() && this.current().id === p.id; }
  feeTarget() { return this.settings.freeParking ? 'pot' : 'bank'; }
  later(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
    return t;
  }
  destroy() { this.timers.forEach(clearTimeout); this.timers.clear(); }

  // ---------- lobby ----------
  addPlayer(name) {
    if (this.phase !== 'lobby') fail('That game has already started.');
    if (this.players.length >= C.maxPlayers) fail('That lobby is full (8 players max).');
    name = String(name || '').trim().slice(0, 16);
    if (!name) fail('Please enter a name.');
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) fail('Someone in this lobby already has that name.');
    // pick a free token/color combo
    let tokenId = TOKENS[0].id, color = COLORS[0];
    outer: for (const c of COLORS) for (const t of TOKENS) {
      const usedT = this.players.some((p) => p.tokenId === t.id);
      const usedC = this.players.some((p) => p.color === c);
      if (!usedT && !usedC) { tokenId = t.id; color = c; break outer; }
    }
    const p = {
      id: uid(6), secret: uid(16), name, tokenId, color, ready: false, connected: true,
      cash: 0, pos: 0, inJail: false, jailTurns: 0, jailCards: [], bankrupt: false,
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.log(`${name} joined the lobby.`);
    return p;
  }

  removePlayer(id) {
    if (this.phase !== 'lobby') return;
    const p = this.player(id);
    if (!p) return;
    this.players = this.players.filter((x) => x.id !== id);
    this.log(`${p.name} left the lobby.`);
    if (this.hostId === id) this.hostId = this.players[0] ? this.players[0].id : null;
  }

  customize(id, { tokenId, color }) {
    if (this.phase !== 'lobby') fail('The game has started.');
    const p = this.mustPlayer(id);
    if (tokenId && !TOKENS.some((t) => t.id === tokenId)) fail('Unknown game piece.');
    if (color && !COLORS.includes(color)) fail('Unknown color.');
    const nt = tokenId || p.tokenId, nc = color || p.color;
    if (this.players.some((o) => o.id !== id && o.tokenId === nt && o.color === nc)) fail('Someone already has that piece in that color.');
    p.tokenId = nt; p.color = nc; p.ready = false;
  }

  setReady(id, ready) {
    if (this.phase !== 'lobby') return;
    this.mustPlayer(id).ready = !!ready;
  }

  setSettings(id, settings) {
    if (this.phase !== 'lobby') fail('Settings are locked once the game starts.');
    if (id !== this.hostId) fail('Only the host can change house rules.');
    if (typeof settings.freeParking === 'boolean') this.settings.freeParking = settings.freeParking;
    this.players.forEach((p) => { if (p.id !== id) p.ready = false; });
  }

  start(id) {
    if (this.phase !== 'lobby') fail('Already started.');
    if (id !== this.hostId) fail('Only the host can start the game.');
    if (this.players.length < C.minPlayers) fail('You need at least 2 players.');
    if (!this.players.every((p) => p.ready)) fail('Everyone needs to be ready first.');
    this.phase = 'playing';
    this.players = shuffle(this.players);
    this.players.forEach((p) => { p.cash = C.startCash; p.pos = 0; });
    this.log(`The game is on! Turn order: ${this.players.map((p) => p.name).join(', ')}.`);
    if (this.settings.freeParking) this.log('House rule: Free Parking jackpot is ON.');
    this.turn = { idx: 0, stage: 'roll', again: false, doubles: 0, dice: null, startedAt: Date.now() };
    this.log(`${this.current().name}'s turn.`);
  }

  // ---------- money ----------
  give(p, amount, reason) {
    p.cash += amount;
    this.addFx({ type: 'cash', pid: p.id, delta: amount });
    if (reason) this.log(reason);
  }

  takeFrom(p, amount) {
    p.cash -= amount;
    this.addFx({ type: 'cash', pid: p.id, delta: -amount });
  }

  creditTo(to, amount) {
    if (to === 'bank') return;
    if (to === 'pot') { this.pot += amount; this.addFx({ type: 'pot', delta: amount }); return; }
    if (to && to.each) {
      to.each.forEach((id) => { const q = this.player(id); if (q && !q.bankrupt) this.give(q, to.amount); });
      return;
    }
    const q = typeof to === 'string' ? this.player(to) : to;
    if (q && !q.bankrupt) this.give(q, amount);
  }

  // Value the player could raise by selling all buildings and mortgaging everything.
  liquidValue(p) {
    let v = p.cash;
    for (const [i, pr] of Object.entries(this.props)) {
      if (pr.owner !== p.id) continue;
      const s = SPACES[i];
      if (pr.houses) v += Math.floor(pr.houses * GROUPS[s.group].house / 2);
      if (!pr.mortgaged) v += s.price / 2;
    }
    return v;
  }

  // Charge the current player. Opens a debt if they must raise money; bankrupts if hopeless.
  charge(p, amount, to, what) {
    if (amount <= 0) return true;
    if (p.cash >= amount) {
      this.takeFrom(p, amount);
      this.creditTo(to, amount);
      return true;
    }
    if (this.liquidValue(p) >= amount) {
      this.debt = { pid: p.id, amount, to: this.serializeTarget(to), what };
      this.turn.stage = 'debt';
      this.log(`${p.name} owes ${money(amount)} for ${what} and must raise cash (sell buildings or mortgage).`);
      return false;
    }
    this.log(`${p.name} can't cover ${money(amount)} for ${what}.`);
    this.bankrupt(p, to);
    return false;
  }

  serializeTarget(to) {
    if (to && typeof to === 'object' && to.id) return to.id;
    return to;
  }

  // Charge someone who is not taking their turn — liquidate automatically if needed.
  chargeOffTurn(q, amount, to, what) {
    if (q.cash < amount) this.autoLiquidate(q, amount);
    if (q.cash >= amount) { this.takeFrom(q, amount); this.creditTo(to, amount); return; }
    this.log(`${q.name} can't cover ${money(amount)} for ${what}.`);
    this.bankrupt(q, to);
  }

  autoLiquidate(p, need) {
    const owned = () => Object.entries(this.props).filter(([, pr]) => pr.owner === p.id).map(([i]) => +i);
    let guard = 200;
    while (p.cash < need && guard-- > 0) {
      const built = owned().filter((i) => this.props[i].houses > 0)
        .sort((a, b) => this.props[b].houses - this.props[a].houses);
      if (built.length) {
        try { this.sellBuilding(p.id, built[0], true); continue; } catch (e) { /* hotel w/o houses */ }
        const pr = this.props[built[0]];
        const g = GROUPS[SPACES[built[0]].group];
        this.give(p, Math.floor(pr.houses * g.house / 2));
        if (pr.houses === 5) this.hotelsLeft++; else this.housesLeft += pr.houses;
        pr.houses = 0;
        continue;
      }
      const m = owned().find((i) => !this.props[i].mortgaged);
      if (m === undefined) break;
      this.mortgage(p.id, m, true);
    }
  }

  // ---------- turn flow ----------
  roll(id) {
    const p = this.mustPlayer(id);
    if (!this.isTurn(p)) fail("It's not your turn.");
    if (this.turn.stage !== 'roll') fail("You can't roll right now.");
    const turnRef = this.turn;
    this.rollInner(p);
    if (this.turn === turnRef) this.afterResolve();
  }

  rollInner(p) {
    const d = [this.rollDie(), this.rollDie()];
    const dbl = d[0] === d[1];
    this.turn.dice = d;
    this.addFx({ type: 'dice', pid: p.id, d });
    const total = d[0] + d[1];

    if (p.inJail) {
      if (dbl) {
        p.inJail = false; p.jailTurns = 0;
        this.log(`${p.name} rolled doubles (${d[0]}+${d[1]}) and busted out of The Slammer!`);
        this.turn.again = false;
        this.moveBy(p, total);
      } else {
        p.jailTurns++;
        if (p.jailTurns >= 3) {
          this.log(`${p.name} rolled ${d[0]}+${d[1]} — third try. Pays the ${money(C.jailFine)} fine and leaves.`);
          p.inJail = false; p.jailTurns = 0;
          this.turn.again = false;
          if (!this.charge(p, C.jailFine, 'bank', 'the Slammer fine')) {
            if (this.debt) this.turn.pendingMove = total;
            return;
          }
          this.moveBy(p, total);
        } else {
          this.log(`${p.name} rolled ${d[0]}+${d[1]} — no doubles. Still in The Slammer (try ${p.jailTurns}/3).`);
          this.turn.again = false;
          this.turn.stage = 'end';
          return;
        }
      }
    } else {
      if (dbl) {
        this.turn.doubles++;
        if (this.turn.doubles >= 3) {
          this.log(`${p.name} rolled doubles three times in a row — straight to The Slammer!`);
          this.sendToJail(p);
          this.turn.again = false;
          this.turn.stage = 'end';
          return;
        }
        this.turn.again = true;
        this.log(`${p.name} rolled ${d[0]}+${d[1]} — doubles!`);
      } else {
        this.turn.again = false;
        this.log(`${p.name} rolled ${d[0]}+${d[1]}.`);
      }
      this.moveBy(p, total);
    }
  }

  payJail(id) {
    const p = this.mustPlayer(id);
    if (!this.isTurn(p) || this.turn.stage !== 'roll' || !p.inJail) fail("You can't do that right now.");
    if (p.cash < C.jailFine) fail(`You need ${money(C.jailFine)} to pay the fine.`);
    this.takeFrom(p, C.jailFine);
    p.inJail = false; p.jailTurns = 0;
    this.log(`${p.name} paid ${money(C.jailFine)} to leave The Slammer.`);
    this.addFx({ type: 'sound', name: 'coin' });
  }

  useJailCard(id) {
    const p = this.mustPlayer(id);
    if (!this.isTurn(p) || this.turn.stage !== 'roll' || !p.inJail) fail("You can't do that right now.");
    if (!p.jailCards.length) fail("You don't have an Escape Hatch card.");
    const deck = p.jailCards.shift();
    this.decks[deck].push(this.jailCardIndex(deck));
    p.inJail = false; p.jailTurns = 0;
    this.log(`${p.name} used an Escape Hatch card to leave The Slammer.`);
  }

  jailCardIndex(deck) {
    return (deck === 'luck' ? LUCK : COMMUNITY).findIndex((c) => c.action === 'jailFree');
  }

  endTurn(id) {
    const p = this.mustPlayer(id);
    if (!this.isTurn(p)) fail("It's not your turn.");
    if (this.turn.stage !== 'end') fail("You can't end your turn yet.");
    this.nextTurn();
  }

  nextTurn() {
    if (this.phase !== 'playing') return;
    const n = this.players.length;
    let idx = this.turn.idx;
    for (let k = 0; k < n; k++) {
      idx = (idx + 1) % n;
      if (!this.players[idx].bankrupt) break;
    }
    this.turn = { idx, stage: 'roll', again: false, doubles: 0, dice: null, startedAt: Date.now() };
    this.pendingBuy = null;
    this.debt = null;
    const p = this.current();
    this.log(`${p.name}'s turn.${p.inJail ? ' (In The Slammer)' : ''}`);
  }

  // Decide what happens after something resolves (landing, buying, debt paid...)
  afterResolve() {
    if (this.phase !== 'playing') return;
    if (this.pendingBuy !== null || this.auction || this.debt) return;
    const p = this.current();
    if (!p || p.bankrupt) return;
    this.turn.stage = this.turn.again && !p.inJail ? 'roll' : 'end';
  }

  // ---------- movement ----------
  moveBy(p, steps) {
    const path = [];
    let pos = p.pos;
    const dir = steps >= 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(steps); i++) {
      pos = (pos + dir + 40) % 40;
      path.push(pos);
      if (dir > 0 && pos === 0) this.give(p, C.passStart, `${p.name} passed START and collected ${money(C.passStart)}.`);
    }
    p.pos = pos;
    this.addFx({ type: 'move', pid: p.id, path });
    this.land(p, {});
  }

  moveTo(p, target, opts = {}) {
    const steps = (target - p.pos + 40) % 40;
    const path = [];
    let pos = p.pos;
    for (let i = 0; i < steps; i++) {
      pos = (pos + 1) % 40;
      path.push(pos);
      if (pos === 0 && target !== 0) this.give(p, C.passStart, `${p.name} passed START and collected ${money(C.passStart)}.`);
    }
    if (target === 0 && steps > 0) this.give(p, C.passStart, `${p.name} landed on START and collected ${money(C.passStart)}.`);
    p.pos = target;
    this.addFx({ type: 'move', pid: p.id, path });
    this.land(p, opts);
  }

  sendToJail(p) {
    p.pos = C.jailIndex;
    p.inJail = true;
    p.jailTurns = 0;
    this.addFx({ type: 'jail', pid: p.id });
  }

  land(p, opts) {
    const s = SPACES[p.pos];
    switch (s.type) {
      case 'property': case 'station': case 'utility': {
        const pr = this.props[s.index];
        if (!pr.owner) {
          this.pendingBuy = s.index;
          this.turn.stage = 'buy';
          return;
        }
        if (pr.owner === p.id) return;
        const owner = this.player(pr.owner);
        if (pr.mortgaged) { this.log(`${s.name} is mortgaged — no rent due.`); return; }
        const rent = this.rentFor(s.index, opts);
        this.log(`${p.name} owes ${owner.name} ${money(rent)} rent for ${s.name}.`);
        this.addFx({ type: 'sound', name: 'rent' });
        this.charge(p, rent, owner, `rent on ${s.name}`);
        return;
      }
      case 'tax': {
        const to = this.feeTarget();
        this.log(`${p.name} pays ${money(s.amount)} ${s.name}${to === 'pot' ? ' into the jackpot' : ''}.`);
        this.charge(p, s.amount, to, s.name);
        return;
      }
      case 'luck': case 'community': return this.drawCard(p, s.type);
      case 'gotojail':
        this.log(`${p.name} landed on Go To The Slammer!`);
        this.sendToJail(p);
        this.turn.again = false;
        return;
      case 'parking':
        if (this.settings.freeParking && this.pot > 0) {
          const amt = this.pot;
          this.pot = 0;
          this.addFx({ type: 'jackpot', pid: p.id, amount: amt });
          this.give(p, amt, `JACKPOT! ${p.name} scooped ${money(amt)} from Free Parking!`);
        } else this.log(`${p.name} is chilling at Free Parking.`);
        return;
      default: return;
    }
  }

  rentFor(idx, opts = {}) {
    const s = SPACES[idx];
    const pr = this.props[idx];
    if (s.type === 'property') {
      if (pr.houses > 0) return s.rent[pr.houses];
      return s.rent[0] * (this.ownsGroup(pr.owner, s.group) ? 2 : 1);
    }
    if (s.type === 'station') {
      const n = SPACES.filter((x) => x.type === 'station' && this.props[x.index].owner === pr.owner).length;
      return 25 * Math.pow(2, n - 1) * (opts.mult || 1);
    }
    if (s.type === 'utility') {
      const n = SPACES.filter((x) => x.type === 'utility' && this.props[x.index].owner === pr.owner).length;
      let dice = this.turn && this.turn.dice ? this.turn.dice[0] + this.turn.dice[1] : 7;
      if (opts.utilityTen) {
        const d = [this.rollDie(), this.rollDie()];
        this.addFx({ type: 'dice', pid: this.current().id, d });
        dice = d[0] + d[1];
        this.log(`Rolled ${d[0]}+${d[1]} for the utility bill.`);
        return dice * 10;
      }
      return dice * (n === 2 ? 10 : 4);
    }
    return 0;
  }

  ownsGroup(pid, group) {
    return SPACES.filter((s) => s.group === group).every((s) => this.props[s.index].owner === pid);
  }

  // ---------- cards ----------
  drawCard(p, deckName) {
    const deck = this.decks[deckName];
    const list = deckName === 'luck' ? LUCK : COMMUNITY;
    const ci = deck.shift();
    const card = list[ci];
    if (card.action !== 'jailFree') deck.push(ci);
    this.addFx({ type: 'card', deck: deckName, text: card.text, pid: p.id });
    this.log(`${p.name} drew ${deckName === 'luck' ? 'Lucky Break' : 'Block Party'}: "${card.text}"`);
    switch (card.action) {
      case 'move': return this.moveTo(p, card.to);
      case 'moveRel': return this.moveBy(p, card.n);
      case 'nearest': {
        let i = p.pos;
        do { i = (i + 1) % 40; } while (SPACES[i].type !== card.kind);
        return this.moveTo(p, i, card.kind === 'station' ? { mult: 2 } : { utilityTen: true });
      }
      case 'money':
        if (card.amount > 0) return this.give(p, card.amount);
        return this.charge(p, -card.amount, this.feeTarget(), 'a card');
      case 'jail':
        this.sendToJail(p);
        this.turn.again = false;
        return;
      case 'jailFree':
        p.jailCards.push(deckName);
        return;
      case 'repairs': {
        let total = 0;
        for (const pr of Object.values(this.props)) {
          if (pr.owner !== p.id) continue;
          total += pr.houses === 5 ? card.hotel : pr.houses * card.house;
        }
        if (!total) { this.log(`${p.name} has no buildings — nothing to pay.`); return; }
        this.log(`${p.name} owes ${money(total)} in repairs.`);
        return this.charge(p, total, this.feeTarget(), 'repairs');
      }
      case 'payEach': {
        const others = this.active().filter((q) => q.id !== p.id);
        const total = card.amount * others.length;
        return this.charge(p, total, { each: others.map((q) => q.id), amount: card.amount }, 'Block Captain duties');
      }
      case 'collectEach': {
        this.active().filter((q) => q.id !== p.id).forEach((q) => this.chargeOffTurn(q, card.amount, p, 'a birthday gift'));
        return;
      }
    }
  }

  // ---------- buying & auctions ----------
  buy(id) {
    const p = this.mustPlayer(id);
    if (!this.isTurn(p) || this.turn.stage !== 'buy') fail("You can't buy right now.");
    const s = SPACES[this.pendingBuy];
    if (p.cash < s.price) fail(`You need ${money(s.price)} to buy ${s.name}. Mortgage something or send it to auction.`);
    this.takeFrom(p, s.price);
    this.props[s.index].owner = p.id;
    this.pendingBuy = null;
    this.addFx({ type: 'buy', pid: p.id, idx: s.index });
    this.log(`${p.name} bought ${s.name} for ${money(s.price)}.`);
    this.afterResolve();
  }

  decline(id) {
    const p = this.mustPlayer(id);
    if (!this.isTurn(p) || this.turn.stage !== 'buy') fail("You can't do that right now.");
    const idx = this.pendingBuy;
    this.pendingBuy = null;
    this.log(`${p.name} passed on ${SPACES[idx].name}. It goes to auction!`);
    this.startAuction(idx);
  }

  startAuction(idx) {
    this.auction = { idx, high: 0, bidder: null, passed: [], endsAt: Date.now() + 15000, id: uid(4) };
    this.turn.stage = 'auction';
    this.scheduleAuctionEnd();
  }

  scheduleAuctionEnd() {
    const a = this.auction;
    if (!a) return;
    const id = a.id, endsAt = a.endsAt;
    this.later(Math.max(0, endsAt - Date.now()) + 50, () => {
      if (this.auction && this.auction.id === id && this.auction.endsAt === endsAt) {
        this.endAuction();
        this.onChange();
      }
    });
  }

  bid(id, amount) {
    const p = this.mustPlayer(id);
    const a = this.auction || fail('There is no auction.');
    if (p.bankrupt) fail('You are out of the game.');
    if (a.passed.includes(p.id)) fail('You already dropped out of this auction.');
    amount = Math.floor(Number(amount));
    if (!(amount > a.high)) fail(`Bid more than ${money(a.high)}.`);
    if (amount > p.cash) fail("You don't have that much cash.");
    a.high = amount; a.bidder = p.id;
    a.endsAt = Math.max(a.endsAt, Date.now() + 6000);
    this.log(`${p.name} bids ${money(amount)}.`);
    this.addFx({ type: 'sound', name: 'bid' });
    this.scheduleAuctionEnd();
    this.checkAuctionDone();
  }

  passAuction(id) {
    const p = this.mustPlayer(id);
    const a = this.auction || fail('There is no auction.');
    if (a.passed.includes(p.id)) return;
    if (a.bidder === p.id) fail("You're the top bidder — you can't drop out.");
    a.passed.push(p.id);
    this.log(`${p.name} drops out of the auction.`);
    this.checkAuctionDone();
  }

  checkAuctionDone() {
    const a = this.auction;
    const remaining = this.active().filter((q) => !a.passed.includes(q.id));
    if (remaining.length === 0 || (remaining.length === 1 && remaining[0].id === a.bidder)) this.endAuction();
  }

  endAuction() {
    const a = this.auction;
    if (!a) return;
    this.auction = null;
    const s = SPACES[a.idx];
    const w = a.bidder && this.player(a.bidder);
    if (w && !w.bankrupt && w.cash >= a.high) {
      this.takeFrom(w, a.high);
      this.props[a.idx].owner = w.id;
      this.addFx({ type: 'buy', pid: w.id, idx: a.idx });
      this.log(`${w.name} won the auction for ${s.name} at ${money(a.high)}.`);
    } else {
      this.log(`Nobody bid on ${s.name}. It stays with the bank.`);
    }
    if (this.turn) { this.turn.stage = 'end'; this.afterResolve(); }
  }

  // ---------- buildings & mortgages ----------
  checkOwnedProperty(p, idx) {
    const s = SPACES[idx];
    if (!s || !this.props[idx]) fail('Not a property.');
    if (this.props[idx].owner !== p.id) fail("You don't own that.");
    if (p.bankrupt) fail('You are out of the game.');
    if (this.phase !== 'playing') fail('The game is not running.');
    return s;
  }

  groupProps(group) { return SPACES.filter((s) => s.group === group).map((s) => this.props[s.index]); }

  build(id, idx) {
    const p = this.mustPlayer(id);
    const s = this.checkOwnedProperty(p, idx);
    if (s.type !== 'property') fail('You can only build on neighborhood lots.');
    if (!this.ownsGroup(p.id, s.group)) fail(`You need every ${GROUPS[s.group].name} lot to build.`);
    const gp = this.groupProps(s.group);
    if (gp.some((x) => x.mortgaged)) fail('Unmortgage the whole set before building.');
    const pr = this.props[idx];
    if (pr.houses >= 5) fail('That lot already has a hotel.');
    if (pr.houses > Math.min(...gp.map((x) => x.houses))) fail('Build evenly — add to the other lots in this set first.');
    const cost = GROUPS[s.group].house;
    if (p.cash < cost) fail(`Building costs ${money(cost)}.`);
    if (pr.houses === 4) {
      if (this.hotelsLeft <= 0) fail('The bank is out of hotels.');
      this.hotelsLeft--; this.housesLeft += 4;
    } else {
      if (this.housesLeft <= 0) fail('The bank is out of houses.');
      this.housesLeft--;
    }
    this.takeFrom(p, cost);
    pr.houses++;
    this.addFx({ type: 'build', idx });
    this.log(`${p.name} built a ${pr.houses === 5 ? 'hotel' : 'house'} on ${s.name} for ${money(cost)}.`);
  }

  sellBuilding(id, idx, quiet) {
    const p = this.mustPlayer(id);
    const s = this.checkOwnedProperty(p, idx);
    const pr = this.props[idx];
    if (!pr.houses) fail('No buildings to sell there.');
    const gp = this.groupProps(s.group);
    if (pr.houses < Math.max(...gp.map((x) => x.houses))) fail('Sell evenly — sell from the most built-up lot first.');
    if (pr.houses === 5) {
      if (this.housesLeft < 4) fail('The bank needs 4 houses to break a hotel down, and it is short.');
      this.housesLeft -= 4; this.hotelsLeft++;
    } else this.housesLeft++;
    pr.houses--;
    const refund = Math.floor(GROUPS[s.group].house / 2);
    this.give(p, refund, `${p.name} sold a building on ${s.name} for ${money(refund)}.`);
    this.addFx({ type: 'build', idx });
  }

  mortgage(id, idx) {
    const p = this.mustPlayer(id);
    const s = this.checkOwnedProperty(p, idx);
    const pr = this.props[idx];
    if (pr.mortgaged) fail('Already mortgaged.');
    if (s.group && this.groupProps(s.group).some((x) => x.houses)) fail('Sell all buildings in this set first.');
    pr.mortgaged = true;
    this.give(p, s.price / 2, `${p.name} mortgaged ${s.name} for ${money(s.price / 2)}.`);
  }

  unmortgage(id, idx) {
    const p = this.mustPlayer(id);
    const s = this.checkOwnedProperty(p, idx);
    const pr = this.props[idx];
    if (!pr.mortgaged) fail('Not mortgaged.');
    const cost = Math.ceil(s.price * 11 / 20);
    if (p.cash < cost) fail(`Unmortgaging costs ${money(cost)}.`);
    this.takeFrom(p, cost);
    pr.mortgaged = false;
    this.log(`${p.name} paid off the mortgage on ${s.name} (${money(cost)}).`);
  }

  // ---------- debt & bankruptcy ----------
  payDebt(id) {
    const p = this.mustPlayer(id);
    const d = this.debt;
    if (!d || d.pid !== p.id) fail("You don't owe anything.");
    if (p.cash < d.amount) fail(`You still need ${money(d.amount - p.cash)} more.`);
    this.takeFrom(p, d.amount);
    this.creditTo(d.to, d.amount);
    this.log(`${p.name} paid the ${money(d.amount)} owed.`);
    this.debt = null;
    const turnRef = this.turn;
    if (this.turn && this.turn.pendingMove) {
      const n = this.turn.pendingMove;
      delete this.turn.pendingMove;
      this.moveBy(p, n);
    }
    if (this.turn === turnRef) this.afterResolve();
  }

  declareBankruptcy(id) {
    const p = this.mustPlayer(id);
    if (p.bankrupt || this.phase !== 'playing') fail("You can't do that.");
    const to = this.debt && this.debt.pid === p.id ? this.debt.to : 'bank';
    this.bankrupt(p, to);
  }

  bankrupt(p, to) {
    if (p.bankrupt) return;
    const creditor = typeof to === 'string' && to !== 'bank' && to !== 'pot' ? this.player(to) : (to && to.id ? to : null);
    // Buildings go back to the bank for half value
    for (const [i, pr] of Object.entries(this.props)) {
      if (pr.owner !== p.id || !pr.houses) continue;
      const g = GROUPS[SPACES[i].group];
      p.cash += Math.floor(pr.houses * g.house / 2);
      if (pr.houses === 5) this.hotelsLeft++; else this.housesLeft += pr.houses;
      pr.houses = 0;
    }
    if (creditor && !creditor.bankrupt) {
      if (p.cash > 0) this.give(creditor, p.cash);
      for (const pr of Object.values(this.props)) if (pr.owner === p.id) pr.owner = creditor.id;
      creditor.jailCards.push(...p.jailCards);
      this.log(`💥 ${p.name} is BANKRUPT! Everything goes to ${creditor.name}.`);
    } else {
      if (to === 'pot' && p.cash > 0) { this.pot += p.cash; this.addFx({ type: 'pot', delta: p.cash }); }
      for (const pr of Object.values(this.props)) if (pr.owner === p.id) { pr.owner = null; pr.mortgaged = false; }
      p.jailCards.forEach((deck) => this.decks[deck].push(this.jailCardIndex(deck)));
      this.log(`💥 ${p.name} is BANKRUPT! Their lots return to the bank.`);
    }
    p.cash = 0; p.jailCards = []; p.bankrupt = true; p.inJail = false;
    this.addFx({ type: 'bankrupt', pid: p.id });
    this.trades.forEach((t) => { if (t.status === 'pending' && (t.from === p.id || t.to === p.id)) t.status = 'cancelled'; });
    if (this.debt && this.debt.pid === p.id) this.debt = null;
    if (this.auction) {
      if (this.auction.bidder === p.id) { this.auction.bidder = null; this.auction.high = 0; }
      if (!this.auction.passed.includes(p.id)) this.auction.passed.push(p.id);
    }

    const alive = this.active();
    if (alive.length <= 1) {
      this.phase = 'ended';
      this.winner = alive[0] ? alive[0].id : null;
      if (this.auction) this.auction = null;
      if (alive[0]) this.log(`🏆 ${alive[0].name} wins Turf Tycoon!`);
      this.addFx({ type: 'win', pid: this.winner });
      return;
    }
    if (this.auction) this.checkAuctionDone();
    if (this.current() && this.current().id === p.id) {
      if (this.auction) { this.auction = null; }
      this.nextTurn();
    }
  }

  kick(hostId, targetId) {
    if (hostId !== this.hostId) fail('Only the host can remove players.');
    const t = this.mustPlayer(targetId);
    if (t.connected) fail('You can only remove players who have disconnected.');
    if (this.phase === 'lobby') { this.removePlayer(targetId); return; }
    if (t.bankrupt) return;
    this.log(`The host removed ${t.name} from the game.`);
    this.bankrupt(t, 'bank');
  }

  // ---------- trades ----------
  normalizeSide(side) {
    side = side || {};
    return {
      cash: Math.max(0, Math.floor(Number(side.cash) || 0)),
      props: Array.isArray(side.props) ? [...new Set(side.props.map(Number))] : [],
      jailCards: Math.max(0, Math.floor(Number(side.jailCards) || 0)),
    };
  }

  validateSide(p, side) {
    if (side.cash > p.cash) fail(`${p.name} doesn't have ${money(side.cash)}.`);
    if (side.jailCards > p.jailCards.length) fail(`${p.name} doesn't have that many Escape Hatch cards.`);
    for (const idx of side.props) {
      const pr = this.props[idx];
      if (!pr || pr.owner !== p.id) fail(`${p.name} doesn't own ${SPACES[idx] ? SPACES[idx].name : 'that'}.`);
      const s = SPACES[idx];
      if (s.group && this.groupProps(s.group).some((x) => x.houses)) fail(`Sell the buildings in ${GROUPS[s.group].name} before trading ${s.name}.`);
    }
  }

  proposeTrade(id, offer) {
    if (this.phase !== 'playing') fail('The game is not running.');
    const p = this.mustPlayer(id);
    const q = this.mustPlayer(offer && offer.to);
    if (p.id === q.id) fail("You can't trade with yourself.");
    if (p.bankrupt || q.bankrupt) fail('That player is out of the game.');
    const give = this.normalizeSide(offer.give), get = this.normalizeSide(offer.get);
    if (!give.cash && !give.props.length && !give.jailCards && !get.cash && !get.props.length && !get.jailCards) fail('Add something to the trade.');
    this.validateSide(p, give);
    this.validateSide(q, get);
    // one live trade per pair
    this.trades.forEach((t) => {
      if (t.status === 'pending' && ((t.from === p.id && t.to === q.id) || (t.from === q.id && t.to === p.id))) t.status = 'replaced';
    });
    const t = { id: uid(4), from: p.id, to: q.id, give, get, status: 'pending', t: Date.now() };
    this.trades.push(t);
    if (this.trades.length > 40) this.trades = this.trades.filter((x) => x.status === 'pending').concat(this.trades.filter((x) => x.status !== 'pending').slice(-10));
    this.log(`${p.name} offered ${q.name} a trade.`);
    this.addFx({ type: 'trade', to: q.id });
    return t;
  }

  respondTrade(id, tradeId, accept) {
    const t = this.trades.find((x) => x.id === tradeId && x.status === 'pending') || fail('That trade is no longer available.');
    const p = this.mustPlayer(id);
    if (t.to !== p.id) fail('That trade is not addressed to you.');
    const from = this.mustPlayer(t.from);
    if (!accept) {
      t.status = 'declined';
      this.log(`${p.name} declined ${from.name}'s trade.`);
      return;
    }
    this.validateSide(from, t.give);
    this.validateSide(p, t.get);
    // mortgage interest (10%) owed by receiver of a mortgaged lot
    const interest = (props) => props.reduce((n, i) => n + (this.props[i].mortgaged ? Math.ceil(SPACES[i].price / 20) : 0), 0);
    const pFee = interest(t.give.props), fFee = interest(t.get.props);
    if (p.cash - t.get.cash + t.give.cash < pFee) fail(`You'd need ${money(pFee)} for mortgage interest on the lots you receive.`);
    if (from.cash - t.give.cash + t.get.cash < fFee) fail(`${from.name} can't cover the mortgage interest.`);
    // swap
    if (t.give.cash) { this.takeFrom(from, t.give.cash); this.give(p, t.give.cash); }
    if (t.get.cash) { this.takeFrom(p, t.get.cash); this.give(from, t.get.cash); }
    t.give.props.forEach((i) => { this.props[i].owner = p.id; });
    t.get.props.forEach((i) => { this.props[i].owner = from.id; });
    for (let k = 0; k < t.give.jailCards; k++) p.jailCards.push(from.jailCards.shift());
    for (let k = 0; k < t.get.jailCards; k++) from.jailCards.push(p.jailCards.shift());
    if (pFee) this.takeFrom(p, pFee);
    if (fFee) this.takeFrom(from, fFee);
    t.status = 'accepted';
    this.log(`🤝 ${p.name} accepted ${from.name}'s trade.`);
    this.addFx({ type: 'sound', name: 'deal' });
    // trading never breaks a pending debt, but it might satisfy one
  }

  cancelTrade(id, tradeId) {
    const t = this.trades.find((x) => x.id === tradeId && x.status === 'pending');
    if (!t || t.from !== id) fail('Nothing to cancel.');
    t.status = 'cancelled';
  }

  // ---------- serialization ----------
  publicState() {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      settings: this.settings,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, tokenId: p.tokenId, color: p.color, ready: p.ready, connected: p.connected,
        cash: p.cash, pos: p.pos, inJail: p.inJail, jailTurns: p.jailTurns, jailCards: p.jailCards.length, bankrupt: p.bankrupt,
      })),
      props: this.props,
      housesLeft: this.housesLeft,
      hotelsLeft: this.hotelsLeft,
      pot: this.pot,
      turn: this.turn && { ...this.turn, playerId: this.current() && this.current().id },
      pendingBuy: this.pendingBuy,
      auction: this.auction && { ...this.auction, now: Date.now() },
      debt: this.debt,
      trades: this.trades.filter((t) => t.status === 'pending'),
      log: this.logs.slice(-80),
      winner: this.winner,
    };
  }
}

module.exports = { Game, GameError };
