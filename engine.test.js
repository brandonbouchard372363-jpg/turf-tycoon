// Engine tests: drive the rules with fixed dice and stacked card decks.
const assert = require('assert');
const { Game } = require('./game');
const { SPACES, LUCK, COMMUNITY } = require('./board');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.stack); process.exitCode = 1; }
}

function setup(n = 2, opts = {}) {
  const g = new Game('TEST', () => {});
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(g.addPlayer(['Barn', 'Bode', 'Jer', 'Taylor'][i]));
  if (opts.freeParking === false) g.setSettings(ps[0].id, { freeParking: false });
  ps.forEach((p) => g.setReady(p.id, true));
  g.start(g.hostId);
  // fix turn order for predictability
  g.players = ps;
  g.turn.idx = 0;
  const dice = [];
  g.rollDie = () => { if (!dice.length) throw new Error('out of test dice'); return dice.shift(); };
  g.setDice = (...d) => { dice.push(...d); };
  g.stack = (deck, action, extra = {}) => {
    const list = deck === 'luck' ? LUCK : COMMUNITY;
    const i = list.findIndex((c) => c.action === action && Object.entries(extra).every(([k, v]) => c[k] === v));
    g.decks[deck] = [i, ...g.decks[deck].filter((x) => x !== i)];
  };
  return { g, a: ps[0], b: ps[1], c: ps[2] };
}
const idx = (name) => SPACES.find((s) => s.name === name).index;

console.log('Engine tests');

test('lobby: start requires everyone ready and unique pieces', () => {
  const g = new Game('X', () => {});
  const a = g.addPlayer('Barn'); const b = g.addPlayer('Bode');
  assert.notStrictEqual(a.tokenId + a.color, b.tokenId + b.color);
  g.setReady(a.id, true);
  assert.throws(() => g.start(a.id), /ready/);
  assert.throws(() => g.customize(b.id, { tokenId: a.tokenId, color: a.color }), /already has/);
  g.setReady(b.id, true);
  assert.throws(() => g.start(b.id), /host/);
  g.start(a.id);
  assert.strictEqual(g.phase, 'playing');
  assert.strictEqual(a.cash, 1500);
  assert.throws(() => g.addPlayer('Late'), /started/);
});

test('roll, move, buy property, end turn', () => {
  const { g, a, b } = setup();
  g.setDice(1, 2); // to 3 Dustbowl Drive
  g.roll(a.id);
  assert.strictEqual(a.pos, 3);
  assert.strictEqual(g.turn.stage, 'buy');
  g.buy(a.id);
  assert.strictEqual(g.props[3].owner, a.id);
  assert.strictEqual(a.cash, 1440);
  assert.strictEqual(g.turn.stage, 'end');
  assert.throws(() => g.roll(a.id), /can't roll/);
  g.endTurn(a.id);
  assert.strictEqual(g.current().id, b.id);
});

test('rent is paid, doubles for full set, houses raise rent', () => {
  const { g, a, b } = setup();
  g.props[1].owner = a.id; g.props[3].owner = a.id;
  b.pos = 0; g.turn.idx = 1;
  g.setDice(1, 2);
  g.roll(b.id);
  assert.strictEqual(b.cash, 1500 - 8); // 4 * 2 for full set
  assert.strictEqual(a.cash, 1508);
  // build evenly
  g.build(a.id, 1);
  assert.throws(() => g.build(a.id, 1), /evenly/);
  g.build(a.id, 3);
  g.build(a.id, 3); g.build(a.id, 1);
  assert.strictEqual(g.props[3].houses, 2);
  assert.strictEqual(g.housesLeft, 28);
  assert.strictEqual(g.rentFor(3), 60);
  // build to hotel
  for (let k = 0; k < 3; k++) { g.build(a.id, 1); g.build(a.id, 3); }
  assert.strictEqual(g.props[1].houses, 5);
  assert.strictEqual(g.hotelsLeft, 10);
  assert.strictEqual(g.housesLeft, 32);
  assert.strictEqual(g.rentFor(3), 450);
  assert.throws(() => g.mortgage(a.id, 1), /Sell all buildings/);
  g.sellBuilding(a.id, 1);
  assert.strictEqual(g.props[1].houses, 4);
  assert.strictEqual(g.housesLeft, 28);
});

test('stations and utilities scale', () => {
  const { g, a, b } = setup();
  [5, 15, 25].forEach((i) => { g.props[i].owner = a.id; });
  assert.strictEqual(g.rentFor(5), 100);
  g.props[12].owner = a.id;
  g.turn.dice = [3, 4];
  assert.strictEqual(g.rentFor(12), 28);
  g.props[28].owner = a.id;
  assert.strictEqual(g.rentFor(12), 70);
});

test('decline triggers auction; highest bidder wins', () => {
  const { g, a, b, c } = setup(3);
  g.setDice(3, 3); // pos 6 Seashell Shoals, doubles
  g.roll(a.id);
  assert.strictEqual(g.turn.stage, 'buy');
  g.decline(a.id);
  assert.ok(g.auction);
  g.bid(b.id, 50);
  assert.throws(() => g.bid(c.id, 40), /more than/);
  g.bid(c.id, 70);
  g.passAuction(a.id);
  g.passAuction(b.id);
  assert.strictEqual(g.auction, null);
  assert.strictEqual(g.props[6].owner, c.id);
  assert.strictEqual(c.cash, 1430);
  assert.strictEqual(g.turn.stage, 'roll', 'doubles = roll again after auction');
  g.destroy();
});

test('three doubles sends you to jail; jail rules', () => {
  const { g, a, b } = setup();
  g.setDice(1, 1);
  g.roll(a.id); // pos 2 community chest... stack a harmless card
  // card drawn may move; force simple path instead:
  const { g: g2, a: a2, b: b2 } = setup();
  g2.stack('community', 'money', { amount: 20 });
  g2.stack('luck', 'money', { amount: 50 });
  a2.pos = 10;
  g2.setDice(2, 2); g2.roll(a2.id); // 14 Taffy -> buy
  g2.decline(a2.id); g2.passAuction(a2.id); g2.passAuction(b2.id);
  g2.setDice(1, 1); g2.roll(a2.id); // 16 Marmalade
  g2.decline(a2.id); g2.passAuction(a2.id); g2.passAuction(b2.id);
  g2.setDice(3, 3); g2.roll(a2.id); // third doubles -> jail
  assert.strictEqual(a2.inJail, true);
  assert.strictEqual(a2.pos, 10);
  assert.strictEqual(g2.turn.stage, 'end');
  g2.endTurn(a2.id);
  g2.setDice(1, 2); g2.roll(b2.id); // b to 3
  if (g2.turn.stage === 'buy') { g2.decline(b2.id); g2.passAuction(a2.id); g2.passAuction(b2.id); }
  g2.endTurn(b2.id);
  // a in jail: fail doubles twice then forced to pay
  g2.setDice(1, 2); g2.roll(a2.id);
  assert.strictEqual(a2.inJail, true); assert.strictEqual(a2.jailTurns, 1);
  g2.endTurn(a2.id);
  g2.setDice(1, 3); g2.roll(b2.id); if (g2.turn.stage === 'buy') { g2.decline(b2.id); g2.passAuction(a2.id); g2.passAuction(b2.id); } g2.endTurn(b2.id);
  // pay to leave
  const before = a2.cash;
  g2.payJail(a2.id);
  assert.strictEqual(a2.inJail, false);
  assert.strictEqual(a2.cash, before - 50);
  g2.setDice(1, 2); g2.roll(a2.id);
  assert.strictEqual(a2.pos, 13);
  g.destroy(); g2.destroy();
});

test('jail: doubles break out, third failure forces fine and move', () => {
  const { g, a, b } = setup();
  g.sendToJail(a);
  g.setDice(2, 2); g.roll(a.id);
  assert.strictEqual(a.inJail, false);
  assert.strictEqual(a.pos, 14);
  assert.strictEqual(g.turn.stage, 'buy');
  const { g: h, a: x } = setup();
  h.sendToJail(x); x.jailTurns = 2;
  h.setDice(1, 2); h.roll(x.id);
  assert.strictEqual(x.inJail, false);
  assert.strictEqual(x.pos, 13);
  assert.strictEqual(x.cash, 1450);
});

test('escape hatch card is kept and used', () => {
  const { g, a } = setup();
  g.stack('luck', 'jailFree');
  g.setDice(3, 4); g.roll(a.id); // pos 7 luck
  assert.strictEqual(a.jailCards.length, 1);
  assert.ok(!g.decks.luck.includes(LUCK.findIndex((c) => c.action === 'jailFree')));
  g.sendToJail(a);
  g.turn.stage = 'roll';
  g.useJailCard(a.id);
  assert.strictEqual(a.inJail, false);
  assert.strictEqual(a.jailCards.length, 0);
  assert.ok(g.decks.luck.includes(LUCK.findIndex((c) => c.action === 'jailFree')));
});

test('cards: move, nearest station double rent, birthday, pay each', () => {
  const { g, a, b, c } = setup(3);
  g.props[15].owner = b.id;
  g.stack('luck', 'nearest', { kind: 'station' });
  g.setDice(3, 4); g.roll(a.id); // 7 -> nearest station 15
  assert.strictEqual(a.pos, 15);
  assert.strictEqual(a.cash, 1450);
  assert.strictEqual(b.cash, 1550);
  g.endTurn(a.id);
  g.stack('community', 'collectEach');
  b.pos = 0;
  g.setDice(1, 1); g.roll(b.id); // 2 community birthday
  assert.strictEqual(b.cash, 1570);
  assert.strictEqual(c.cash, 1490);
  // pass START via card
  g.stack('luck', 'move', { to: 0 });
  const { g: h, a: x } = setup();
  h.stack('luck', 'move', { to: 0 });
  h.setDice(3, 4); h.roll(x.id);
  assert.strictEqual(x.pos, 0); assert.strictEqual(x.cash, 1700);
});

test('free parking jackpot collects taxes and card fees', () => {
  const { g, a, b } = setup();
  g.setDice(1, 3); g.roll(a.id); // 4 property tax 200
  assert.strictEqual(g.pot, 200);
  assert.strictEqual(a.cash, 1300);
  g.endTurn(a.id);
  g.stack('community', 'money', { amount: -50 });
  g.setDice(1, 1); g.roll(b.id); // 2 community -50 -> pot
  assert.strictEqual(g.pot, 250);
  // a lands on free parking from 4: needs 16 -> force position
  g.setDice(1, 2); g.roll(b.id); if (g.turn.stage === 'buy') { g.decline(b.id); g.passAuction(a.id); g.passAuction(b.id); }
  g.endTurn(b.id);
  a.pos = 10;
  g.setDice(4, 6); g.roll(a.id);
  assert.strictEqual(a.pos, 20);
  assert.strictEqual(g.pot, 0);
  assert.strictEqual(a.cash, 1550);
  g.destroy();
});

test('free parking OFF sends taxes to the bank', () => {
  const { g, a } = setup(2, { freeParking: false });
  g.setDice(1, 3); g.roll(a.id);
  assert.strictEqual(g.pot, 0);
  assert.strictEqual(a.cash, 1300);
});

test('trade: propose, counter, accept with cash, lots and cards', () => {
  const { g, a, b } = setup();
  g.props[1].owner = a.id; g.props[39].owner = b.id; g.props[37].owner = b.id; g.props[37].mortgaged = true;
  a.jailCards.push('luck');
  const t = g.proposeTrade(a.id, { to: b.id, give: { cash: 300, props: [1], jailCards: 1 }, get: { props: [39] } });
  assert.throws(() => g.respondTrade(a.id, t.id, true), /not addressed/);
  // counter by b replaces a's offer
  const t2 = g.proposeTrade(b.id, { to: a.id, give: { props: [39, 37] }, get: { cash: 500, props: [1], jailCards: 1 } });
  assert.strictEqual(g.trades.find((x) => x.id === t.id).status, 'replaced');
  g.respondTrade(a.id, t2.id, true);
  assert.strictEqual(g.props[39].owner, a.id);
  assert.strictEqual(g.props[37].owner, a.id);
  assert.strictEqual(g.props[1].owner, b.id);
  assert.strictEqual(b.jailCards.length, 1);
  // a paid 500 + 10% interest on mortgaged 37 (175*0.1 -> 18)
  assert.strictEqual(a.cash, 1500 - 500 - 18);
  assert.strictEqual(b.cash, 2000);
  assert.ok(g.ownsGroup(a.id, 'navy'));
});

test('cannot trade lots in a set with buildings', () => {
  const { g, a, b } = setup();
  g.props[1].owner = a.id; g.props[3].owner = a.id;
  g.build(a.id, 1);
  assert.throws(() => g.proposeTrade(a.id, { to: b.id, give: { props: [3] }, get: { cash: 10 } }), /Sell the buildings/);
});

test('mortgage and unmortgage', () => {
  const { g, a } = setup();
  g.props[39].owner = a.id;
  g.mortgage(a.id, 39);
  assert.strictEqual(a.cash, 1700);
  g.unmortgage(a.id, 39);
  assert.strictEqual(a.cash, 1700 - 220);
});

test('bankruptcy to a player transfers everything and ends 2p game', () => {
  const { g, a, b } = setup();
  g.props[39].owner = b.id; g.props[37].owner = b.id;
  b.cash = 5000; for (let k = 0; k < 5; k++) { g.build(b.id, 37); g.build(b.id, 39); }
  a.cash = 100; g.props[1].owner = a.id;
  a.pos = 35;
  g.setDice(2, 2); g.roll(a.id);
  assert.strictEqual(a.bankrupt, true);
  assert.strictEqual(g.phase, 'ended');
  assert.strictEqual(g.winner, b.id);
  assert.strictEqual(g.props[1].owner, b.id);
});

test('debt flow with enough assets', () => {
  const { g, a, b, c } = setup(3);
  g.props[1].owner = b.id; g.props[3].owner = b.id;
  for (let k = 0; k < 5; k++) { g.build(b.id, 1); g.build(b.id, 3); }
  a.cash = 100; g.props[39].owner = a.id; g.props[37].owner = a.id;
  g.setDice(1, 2); g.roll(a.id); // 3 hotel rent 450
  assert.strictEqual(g.turn.stage, 'debt');
  g.mortgage(a.id, 39); // +200 = 300
  g.mortgage(a.id, 37); // +175 = 475
  const bBefore = b.cash;
  g.payDebt(a.id);
  assert.strictEqual(a.cash, 25);
  assert.strictEqual(b.cash, bBefore + 450);
  assert.strictEqual(g.turn.stage, 'end');
  g.endTurn(a.id);
  assert.strictEqual(g.current().id, b.id);
});

test('3-player bankruptcy mid-turn moves to next player in roll stage', () => {
  const { g, a, b, c } = setup(3);
  g.props[39].owner = c.id; g.props[37].owner = c.id;
  c.cash = 5000; for (let k = 0; k < 5; k++) { g.build(c.id, 37); g.build(c.id, 39); }
  a.cash = 10; a.pos = 35;
  g.setDice(2, 2); g.roll(a.id);
  assert.strictEqual(a.bankrupt, true);
  assert.strictEqual(g.phase, 'playing');
  assert.strictEqual(g.current().id, b.id);
  assert.strictEqual(g.turn.stage, 'roll');
});

console.log(`\n${passed} engine tests passed${process.exitCode ? ' (with failures)' : ''}`);
