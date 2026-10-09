// End-to-end multiplayer test: real server + real socket clients playing a scripted game.
// Covers: create, join, ready, start, buying, rent, card draw, jail, a trade, building,
// Free Parking jackpot, and reconnecting after a dropped connection.
process.env.TT_TEST = '1';
process.env.PORT = process.env.PORT || '3999';
const assert = require('assert');
const { io } = require('socket.io-client');
const { server } = require('./server');

const URL = `http://localhost:${process.env.PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.latest = null;
  s.on('state', (m) => { s.latest = m.state; });
  s.call = (ev, data) => new Promise((res) => s.emit(ev, data, res));
  s.act = async (type, payload = {}) => {
    const r = await s.call('action', { type, ...payload });
    if (r.error) throw new Error(`${type}: ${r.error}`);
    await wait(40);
    return r;
  };
  return s;
}

(async () => {
  console.log('Socket end-to-end test');
  const A = client(), B = client();
  await wait(200);

  const ra = await A.call('create', { name: 'Barn' });
  assert.ok(ra.code && ra.code.length === 5, 'lobby code is 5 letters');
  const bad = await B.call('join', { code: 'ZZZZZ', name: 'Bode' });
  assert.ok(bad.error, 'bad code rejected');
  const rb = await B.call('join', { code: ra.code.toLowerCase(), name: 'Bode' });
  assert.ok(rb.ok, 'join with lowercase code works');
  await wait(60);
  assert.strictEqual(A.latest.players.length, 2);
  console.log('  ✓ create + join by code');

  await B.act('customize', { tokenId: 'taco', color: '#30A46C' });
  await assert.rejects(A.act('start'), /ready/);
  await A.act('ready', { ready: true });
  await B.act('ready', { ready: true });
  await assert.rejects(B.act('settings', { freeParking: false }), /host/);
  await assert.rejects(B.act('start'), /host/);
  await A.act('start');
  assert.strictEqual(A.latest.phase, 'playing');
  assert.strictEqual(A.latest.settings.freeParking, true);
  console.log('  ✓ ready up + host starts');

  const byId = { [ra.pid]: A, [rb.pid]: B };
  const P = byId[A.latest.turn.playerId];
  const Q = P === A ? B : A;
  const pid = (c) => (c === A ? ra.pid : rb.pid);
  const pl = (c) => A.latest.players.find((x) => x.id === pid(c));

  // 1. P buys Dustbowl Drive
  await P.call('debug', { dice: [1, 2] });
  await P.act('roll');
  assert.strictEqual(pl(P).pos, 3);
  assert.strictEqual(A.latest.turn.stage, 'buy');
  await P.act('buy');
  assert.strictEqual(A.latest.props[3].owner, pid(P));
  await P.act('endTurn');
  console.log('  ✓ buy a lot');

  // 2. Q pays tax into the jackpot
  await Q.call('debug', { dice: [1, 3] });
  await Q.act('roll');
  assert.strictEqual(A.latest.pot, 200);
  await Q.act('endTurn');
  console.log('  ✓ tax goes into Free Parking jackpot');

  // 3. P completes the brown set, builds, then draws a card that sends them to jail
  await P.call('debug', { giveProp: { pid: pid(P), idx: 1 } });
  await P.act('build', { idx: 1 });
  await assert.rejects(P.act('build', { idx: 1 }), /evenly/);
  await P.act('build', { idx: 3 });
  assert.strictEqual(A.latest.props[3].houses, 1);
  assert.strictEqual(A.latest.housesLeft, 30);
  await P.call('debug', { dice: [2, 2], stack: { deck: 'luck', action: 'jail' } });
  await P.act('roll'); // 3 -> 7 Lucky Break -> jail
  assert.strictEqual(pl(P).inJail, true);
  assert.strictEqual(pl(P).pos, 10);
  assert.strictEqual(A.latest.turn.stage, 'end', 'no extra roll after going to jail on doubles');
  await P.act('endTurn');
  console.log('  ✓ building + card draw + jail');

  // 4. Q lands on P's built lot and pays rent
  await Q.call('debug', { setPos: { pid: pid(Q), pos: 0 }, dice: [1, 2] });
  const qCash = pl(Q).cash, pCash = pl(P).cash;
  await Q.act('roll');
  assert.strictEqual(pl(Q).cash, qCash - 20);
  assert.strictEqual(pl(P).cash, pCash + 20);
  await Q.act('endTurn');
  console.log('  ✓ rent with a house');

  // 5. P in jail fails to roll doubles; trade happens off-turn
  await P.call('debug', { dice: [1, 2] });
  await P.act('roll');
  assert.strictEqual(pl(P).inJail, true);
  await P.call('debug', { giveProp: { pid: pid(P), idx: 39 } });
  await assert.rejects(P.act('proposeTrade', { offer: { to: pid(Q), give: { props: [3] }, get: { cash: 10 } } }), /buildings/);
  await Q.act('proposeTrade', { offer: { to: pid(P), give: { cash: 250 }, get: { props: [39] } } });
  const t = A.latest.trades[0];
  assert.ok(t);
  // counter-offer
  await P.act('proposeTrade', { offer: { to: pid(Q), give: { props: [39] }, get: { cash: 300 } } });
  const t2 = A.latest.trades.find((x) => x.from === pid(P));
  assert.strictEqual(A.latest.trades.length, 1, 'counter replaces the original offer');
  const before = pl(P).cash;
  await Q.act('respondTrade', { tradeId: t2.id, accept: true });
  assert.strictEqual(A.latest.props[39].owner, pid(Q));
  assert.strictEqual(pl(P).cash, before + 300);
  await P.act('endTurn');
  console.log('  ✓ trade with counter-offer');

  // 6. Q lands on Free Parking and collects the jackpot
  await Q.call('debug', { setPos: { pid: pid(Q), pos: 10 }, dice: [4, 6] });
  const q2 = pl(Q).cash;
  await Q.act('roll');
  assert.strictEqual(pl(Q).pos, 20);
  assert.strictEqual(A.latest.pot, 0);
  assert.strictEqual(pl(Q).cash, q2 + 200);
  await Q.act('endTurn');
  console.log('  ✓ Free Parking jackpot collected');

  // 7. Reconnect: P drops and resumes their seat
  const secret = P === A ? ra.secret : rb.secret;
  P.disconnect();
  await wait(150);
  assert.strictEqual(Q.latest.players.find((x) => x.id === pid(P)).connected, false);
  const P2 = client();
  await wait(150);
  const rr = await P2.call('resume', { code: ra.code, pid: pid(P), secret });
  assert.ok(rr.ok);
  await wait(80);
  assert.strictEqual(Q.latest.players.find((x) => x.id === pid(P)).connected, true);
  const wrong = await P2.call('resume', { code: ra.code, pid: pid(P), secret: 'nope' });
  assert.strictEqual(wrong.error, 'gone');
  console.log('  ✓ disconnect + rejoin keeps the seat');

  // 8. Auction through sockets with bids
  await P2.call('debug', { setPos: { pid: pid(P), pos: 10 }, dice: [3, 3] }); // still in jail — use doubles to escape to 16
  await P2.act('roll');
  assert.strictEqual(A.latest ? true : true, true);
  const s8 = Q.latest;
  assert.strictEqual(s8.players.find((x) => x.id === pid(P)).pos, 16);
  await P2.act('decline');
  assert.ok(Q.latest.auction);
  await Q.act('bid', { amount: 30 });
  await P2.act('bid', { amount: 40 });
  await Q.act('passAuction');
  assert.strictEqual(Q.latest.auction, null);
  assert.strictEqual(Q.latest.props[16].owner, pid(P));
  console.log('  ✓ auction with live bids');

  A.disconnect(); B.disconnect(); P2.disconnect();
  server.close();
  console.log('\nAll socket tests passed');
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
