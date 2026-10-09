// Turf Tycoon — SVG board renderer and board-level animations.
(function () {
  const { SPACES, GROUPS } = window.BOARD;
  const { TOKENS: TOKEN_ICONS, SPACE: SPACE_ICONS, INK, PAPER } = window.ICONS;
  const NS = 'http://www.w3.org/2000/svg';
  const SIZE = 1000, C = 136, W = (SIZE - 2 * C) / 9, BAND = 26;
  const LANDMARKS = new Set(['Lawrence Landing', 'Bodecity', 'Jerburgerville', 'Barnstein Island', 'Tilted Taylor']);

  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function wrap(text, max) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // Transform that places a W×C local space (band at local top) on its board side.
  function spaceTransform(i) {
    if (i > 0 && i < 10) return `translate(${SIZE - C - i * W},${SIZE - C})`;
    if (i > 10 && i < 20) { const k = i - 10; return `translate(${C},${SIZE - C - k * W}) rotate(90)`; }
    if (i > 20 && i < 30) { const k = i - 20; return `translate(${C + k * W},${C}) rotate(180)`; }
    if (i > 30 && i < 40) { const k = i - 30; return `translate(${SIZE - C},${C + k * W}) rotate(-90)`; }
    return '';
  }

  function side(i) { return i < 10 ? 'bottom' : i < 20 ? 'left' : i < 30 ? 'top' : 'right'; }

  // Centre point for tokens on a space
  function spaceCenter(i, inJail) {
    const d = C * 0.6;
    if (i === 0) return [SIZE - C / 2, SIZE - C / 2];
    if (i === 10) return inJail ? [C * 0.6, SIZE - C * 0.6] : [C * 0.5, SIZE - C * 0.5];
    if (i === 20) return [C / 2, C / 2 + 8];
    if (i === 30) return [SIZE - C / 2, C / 2 + 8];
    if (i < 10) return [SIZE - C - (i - 0.5) * W, SIZE - C + d];
    if (i < 20) return [C - d, SIZE - C - (i - 10 - 0.5) * W];
    if (i < 30) return [C + (i - 20 - 0.5) * W, C - d];
    return [SIZE - C + d, C + (i - 30 - 0.5) * W];
  }

  function tokenSpot(i, inJail, slot, count) {
    let [x, y] = spaceCenter(i, inJail);
    if (count <= 1) return [x, y];
    if (i === 10 && !inJail) {
      // Just visiting: spread along the L-shaped strip
      const spots = [[18, SIZE - 22], [18, SIZE - 58], [18, SIZE - 94], [54, SIZE - 18], [90, SIZE - 18], [18, SIZE - 128], [124, SIZE - 18], [52, SIZE - 52]];
      return spots[slot % spots.length];
    }
    const cols = 2;
    const r = Math.floor(slot / cols), c = slot % cols;
    const rows = Math.ceil(count / cols);
    const gap = 22;
    let dx = (c - (Math.min(count, cols) - 1) / 2) * gap;
    let dy = (r - (rows - 1) / 2) * gap * 0.82;
    const s = side(i);
    if (i % 10 && (s === 'left' || s === 'right')) [dx, dy] = [dy, dx];
    return [x + dx, y + dy];
  }

  function iconGroup(svgInner, x, y, size, parent, extra = {}) {
    const g = el('g', { transform: `translate(${x - size / 2},${y - size / 2}) scale(${size / 24})`, ...extra }, parent);
    g.innerHTML = svgInner;
    return g;
  }

  function textLines(parent, lines, x, y, opts = {}) {
    const lh = opts.lh || 12.5;
    const t = el('text', {
      x, y, 'text-anchor': 'middle', 'font-family': opts.family || 'Fredoka, sans-serif',
      'font-weight': opts.weight || 600, 'font-size': opts.size || 11, fill: opts.fill || INK,
      'letter-spacing': opts.ls || 0,
    }, parent);
    lines.forEach((ln, k) => {
      const ts = el('tspan', { x, dy: k === 0 ? 0 : lh }, t);
      ts.textContent = ln;
    });
    return t;
  }

  class BoardView {
    constructor(svg, onSpaceClick) {
      this.svg = svg;
      this.onSpaceClick = onSpaceClick;
      this.spaceEls = {};
      this.tokenEls = {};
      this.build();
    }

    build() {
      const svg = this.svg;
      svg.setAttribute('viewBox', `-12 -12 ${SIZE + 24} ${SIZE + 24}`);
      svg.innerHTML = '';
      const defs = el('defs', {}, svg);
      defs.innerHTML = `
        <filter id="tokShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="2.4" flood-color="#000" flood-opacity=".35"/></filter>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#0b1020" flood-opacity=".28"/></filter>
        <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#9ccfb6" opacity=".55"/></pattern>
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="rgba(34,38,58,.06)"/><rect width="3" height="8" fill="rgba(34,38,58,.22)"/></pattern>
        <linearGradient id="luckGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB547"/><stop offset="1" stop-color="#FF6A3D"/></linearGradient>
        <linearGradient id="commGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3CC7B4"/><stop offset="1" stop-color="#2D7FD3"/></linearGradient>
        <linearGradient id="potGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE48A"/><stop offset="1" stop-color="#F6B935"/></linearGradient>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E3558"/><stop offset="1" stop-color="#1B2036"/></linearGradient>`;

      // board base
      el('rect', { x: -12, y: -12, width: SIZE + 24, height: SIZE + 24, rx: 26, fill: '#1B2036' }, svg);
      el('rect', { x: 0, y: 0, width: SIZE, height: SIZE, rx: 10, fill: PAPER }, svg);
      el('rect', { x: C, y: C, width: SIZE - 2 * C, height: SIZE - 2 * C, fill: '#CFEADB' }, svg);
      el('rect', { x: C, y: C, width: SIZE - 2 * C, height: SIZE - 2 * C, fill: 'url(#dots)' }, svg);

      this.center = el('g', { class: 'board-center' }, svg);
      this.drawCenter();

      const spacesG = el('g', { class: 'spaces' }, svg);
      SPACES.forEach((s) => this.drawSpace(s, spacesG));

      // grid lines on top for crispness
      el('rect', { x: C, y: C, width: SIZE - 2 * C, height: SIZE - 2 * C, fill: 'none', stroke: INK, 'stroke-width': 2.4 }, svg);
      el('rect', { x: 0, y: 0, width: SIZE, height: SIZE, rx: 10, fill: 'none', stroke: INK, 'stroke-width': 3 }, svg);

      this.tokenLayer = el('g', { class: 'tokens' }, svg);
    }

    drawCenter() {
      const g = this.center;
      // Logo banner
      const logo = el('g', { transform: 'translate(500,455) rotate(-8)', filter: 'url(#softShadow)' }, g);
      el('rect', { x: -250, y: -64, width: 500, height: 128, rx: 22, fill: 'url(#logoGrad)' }, logo);
      el('rect', { x: -240, y: -54, width: 480, height: 108, rx: 16, fill: 'none', stroke: '#FFC53D', 'stroke-width': 2.5, 'stroke-dasharray': '2 8', 'stroke-linecap': 'round' }, logo);
      const t1 = el('text', { x: 0, y: 14, 'text-anchor': 'middle', 'font-family': 'Fredoka, sans-serif', 'font-weight': 700, 'font-size': 78, fill: '#FFF8EA', 'letter-spacing': 3, textLength: 430, lengthAdjust: 'spacingAndGlyphs' }, logo);
      t1.innerHTML = 'TURF <tspan fill="#FFC53D">TYCOON</tspan>';
      const t2 = el('text', { x: 0, y: 46, 'text-anchor': 'middle', 'font-family': 'Nunito, sans-serif', 'font-weight': 800, 'font-size': 15, fill: '#9AD8F2', 'letter-spacing': 6 }, logo);
      t2.textContent = 'BUY · BUILD · BRAG';
      // house roofs on logo
      [-200, 200].forEach((x) => {
        iconGroup(`<path d="M3 11L12 3l9 8v10H3z" fill="#FFC53D"/><rect x="9.5" y="14" width="5" height="7" fill="#1B2036"/>`, x, -64, 34, logo);
      });

      // Decks
      this.deck(g, 'luck', 300, 268, -18, 'LUCKY BREAK');
      this.deck(g, 'community', 700, 730, -18, 'BLOCK PARTY');

      // Jackpot
      this.potG = el('g', { transform: 'translate(500,600)', class: 'pot' }, g);
      const pg = el('g', { class: 'pot-inner' }, this.potG);
      el('rect', { x: -118, y: -36, width: 236, height: 72, rx: 36, fill: 'url(#potGrad)', stroke: INK, 'stroke-width': 3, filter: 'url(#softShadow)' }, pg);
      iconGroup(`<circle cx="12" cy="12" r="10" fill="#FFF3C4" stroke="${INK}" stroke-width="1.6"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#E0A11B" stroke-width="1.4"/><text x="12" y="16" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="10" fill="${INK}">$</text>`, -78, 0, 46, pg);
      const lab = el('text', { x: 18, y: -9, 'text-anchor': 'middle', 'font-family': 'Nunito, sans-serif', 'font-weight': 900, 'font-size': 12, fill: '#7A4B00', 'letter-spacing': 2, textLength: 148, lengthAdjust: 'spacingAndGlyphs' }, pg);
      lab.textContent = 'FREE PARKING JACKPOT';
      this.potText = el('text', { x: 18, y: 22, 'text-anchor': 'middle', 'font-family': 'Fredoka, sans-serif', 'font-weight': 700, 'font-size': 32, fill: INK }, pg);
      this.potText.textContent = '$0';
      this.potShown = 0;

      // Dice
      this.diceG = el('g', { transform: 'translate(500,345)', class: 'dice' }, g);
      this.dieEls = [-38, 38].map((dx) => {
        const d = el('g', { transform: `translate(${dx},0)` }, this.diceG);
        const inner = el('g', { class: 'die' }, d);
        el('rect', { x: -28, y: -28, width: 56, height: 56, rx: 12, fill: '#fff', stroke: INK, 'stroke-width': 3, filter: 'url(#softShadow)' }, inner);
        const pips = el('g', {}, inner);
        return { inner, pips };
      });
      this.setDice([5, 3]);
      this.diceG.style.opacity = 0.0;
    }

    deck(g, kind, x, y, rot, label) {
      const d = el('g', { transform: `translate(${x},${y}) rotate(${rot})`, class: 'deck deck-' + kind }, g);
      el('rect', { x: -92, y: -58, width: 184, height: 116, rx: 14, fill: 'none', stroke: INK, 'stroke-width': 2, 'stroke-dasharray': '6 6', opacity: 0.35, transform: 'translate(-6,-6)' }, d);
      for (let k = 2; k >= 0; k--) {
        const c = el('g', { transform: `translate(${k * 3},${k * 3})` }, d);
        this.cardBack(c, kind, label, k === 0);
      }
    }

    cardBack(c, kind, label, top) {
      el('rect', { x: -92, y: -58, width: 184, height: 116, rx: 14, fill: `url(#${kind === 'luck' ? 'luckGrad' : 'commGrad'})`, stroke: INK, 'stroke-width': 2.4 }, c);
      if (!top) return;
      el('rect', { x: -82, y: -48, width: 164, height: 96, rx: 9, fill: 'none', stroke: 'rgba(255,255,255,.65)', 'stroke-width': 2, 'stroke-dasharray': '1 6', 'stroke-linecap': 'round' }, c);
      iconGroup(SPACE_ICONS[kind], 0, -12, 44, c);
      const t = el('text', { x: 0, y: 34, 'text-anchor': 'middle', 'font-family': 'Fredoka, sans-serif', 'font-weight': 700, 'font-size': 19, fill: '#fff', 'letter-spacing': 2 }, c);
      t.textContent = label;
    }

    drawSpace(s, parent) {
      const i = s.index;
      const g = el('g', { class: 'space', 'data-i': i }, parent);
      g.addEventListener('click', () => this.onSpaceClick && this.onSpaceClick(i));
      this.spaceEls[i] = g;
      if (i % 10 === 0) return this.drawCorner(s, g);
      g.setAttribute('transform', spaceTransform(i));
      el('rect', { x: 0, y: 0, width: W, height: C, fill: PAPER, stroke: INK, 'stroke-width': 1.6, class: 'space-bg' }, g);
      const cx = W / 2;
      const ownerBar = el('rect', { x: 3, y: C - 9, width: W - 6, height: 6, rx: 3, fill: 'transparent', class: 'owner-bar' }, g);
      const mort = el('g', { class: 'mortgage', style: 'display:none' }, g);
      el('rect', { x: 0, y: 0, width: W, height: C, fill: 'url(#hatch)' }, mort);
      const mt = el('g', { transform: `translate(${cx},${C / 2 + 14}) rotate(-60)` }, mort);
      el('rect', { x: -40, y: -9, width: 80, height: 18, rx: 4, fill: '#fff', stroke: '#C2410C', 'stroke-width': 1.5 }, mt);
      const mtt = el('text', { x: 0, y: 4.5, 'text-anchor': 'middle', 'font-family': 'Nunito, sans-serif', 'font-weight': 900, 'font-size': 10, fill: '#C2410C', 'letter-spacing': 1 }, mt);
      mtt.textContent = 'MORTGAGED';

      if (s.type === 'property') {
        el('rect', { x: 0, y: 0, width: W, height: BAND, fill: GROUPS[s.group].color, stroke: INK, 'stroke-width': 1.6 }, g);
        const lines = wrap(s.name, 11);
        textLines(g, lines, cx, BAND + 20, { size: lines.some((l) => l.length > 10) ? 10.5 : 11.5 });
        if (LANDMARKS.has(s.name)) {
          iconGroup(`<path d="M12 2.5l2.8 5.8 6.4.8-4.7 4.4 1.2 6.3L12 16.7l-5.7 3.1 1.2-6.3L2.8 9.1l6.4-.8z" fill="#FFC53D" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`, cx, BAND + 24 + lines.length * 12.5 + 6, 16, g);
        }
        this.houseG = this.houseG || {};
        this.houseG[i] = el('g', { class: 'houses' }, g);
      } else {
        const lines = wrap(s.name, 11);
        textLines(g, lines, cx, 20, { size: 10.5, weight: 700 });
        const iconKey = s.type === 'utility' ? s.kind : s.type;
        iconGroup(SPACE_ICONS[iconKey], cx, 20 + lines.length * 12 + 26, 40, g);
      }
      let priceLabel = s.price ? `$${s.price}` : s.type === 'tax' ? `PAY $${s.amount}` : '';
      if (priceLabel) textLines(g, [priceLabel], cx, C - 15, { family: 'Nunito, sans-serif', weight: 800, size: 11.5, class: 'price' });
      this.spaceEls[i]._owner = ownerBar;
      this.spaceEls[i]._mort = mort;
    }

    drawCorner(s, g) {
      const i = s.index;
      const pos = { 0: [SIZE - C, SIZE - C], 10: [0, SIZE - C], 20: [0, 0], 30: [SIZE - C, 0] }[i];
      g.setAttribute('transform', `translate(${pos[0]},${pos[1]})`);
      el('rect', { x: 0, y: 0, width: C, height: C, fill: PAPER, stroke: INK, 'stroke-width': 1.6 }, g);
      if (i === 0) {
        el('rect', { x: 6, y: 6, width: C - 12, height: C - 12, rx: 10, fill: '#FFE7A8' }, g);
        const t = textLines(g, ['START'], C / 2, 56, { size: 34, weight: 700 });
        t.setAttribute('letter-spacing', '2');
        textLines(g, ['COLLECT $200', 'AS YOU PASS'], C / 2, 78, { size: 10.5, weight: 900, family: 'Nunito, sans-serif', lh: 13 });
        el('path', { d: `M${C - 22} 112 H40 l12 -12 M40 112 l12 12`, stroke: '#E5484D', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
      } else if (i === 10) {
        // Jail cell in upper-right; "just visiting" strip on left + bottom
        const cell = el('g', { transform: 'translate(36,0)' }, g);
        el('rect', { x: 0, y: 0, width: C - 36, height: C - 36, fill: '#F28C28', stroke: INK, 'stroke-width': 1.6 }, cell);
        el('rect', { x: 10, y: 10, width: C - 56, height: C - 56, rx: 6, fill: '#FFF0D9', stroke: INK, 'stroke-width': 1.6 }, cell);
        for (let b = 0; b < 5; b++) el('rect', { x: 18 + b * 15, y: 10, width: 4, height: C - 56, fill: INK, opacity: 0.85 }, cell);
        const lbl = textLines(cell, ['THE', 'SLAMMER'], (C - 36) / 2, (C - 36) / 2 - 2, { size: 13, weight: 700, lh: 14 });
        lbl.setAttribute('stroke', '#FFF0D9'); lbl.setAttribute('stroke-width', '4'); lbl.setAttribute('paint-order', 'stroke');
        const jv = el('text', { x: 0, y: 0, 'text-anchor': 'middle', 'font-family': 'Nunito, sans-serif', 'font-weight': 900, 'font-size': 11, fill: INK, 'letter-spacing': 2, transform: `translate(26,${(C - 36) / 2}) rotate(90)` }, g);
        jv.textContent = 'JUST';
        const jv2 = el('text', { x: C / 2 + 18, y: C - 13, 'text-anchor': 'middle', 'font-family': 'Nunito, sans-serif', 'font-weight': 900, 'font-size': 11, fill: INK, 'letter-spacing': 2 }, g);
        jv2.textContent = 'VISITING';
      } else if (i === 20) {
        el('rect', { x: 6, y: 6, width: C - 12, height: C - 12, rx: 10, fill: '#FFF0B8' }, g);
        textLines(g, ['FREE'], C / 2, 32, { size: 18, weight: 700 });
        iconGroup(SPACE_ICONS.car, C / 2, C / 2 + 6, 58, g);
        textLines(g, ['PARKING'], C / 2, C - 16, { size: 18, weight: 700 });
      } else if (i === 30) {
        el('rect', { x: 6, y: 6, width: C - 12, height: C - 12, rx: 10, fill: '#FFE1DE' }, g);
        textLines(g, ['GO TO THE'], C / 2, 28, { size: 13, weight: 700 });
        iconGroup(SPACE_ICONS.siren, C / 2, C / 2 + 2, 56, g);
        textLines(g, ['SLAMMER'], C / 2, C - 16, { size: 19, weight: 700 });
      }
    }

    // ---------- dynamic state ----------
    update(state) {
      const byId = {};
      state.players.forEach((p) => { byId[p.id] = p; });
      for (const [i, pr] of Object.entries(state.props)) {
        const g = this.spaceEls[i];
        g._owner.setAttribute('fill', pr.owner && byId[pr.owner] ? byId[pr.owner].color : 'transparent');
        g._mort.style.display = pr.mortgaged ? '' : 'none';
        if (this.houseG && this.houseG[i]) this.drawHouses(+i, pr.houses);
      }
      this.highlightPending(state.pendingBuy, state.auction && state.auction.idx);
    }

    drawHouses(i, n) {
      const g = this.houseG[i];
      if (+g.dataset.n === n) return;
      const prev = +g.dataset.n || 0;
      g.dataset.n = n;
      g.innerHTML = '';
      if (n === 5) {
        const h = el('g', { transform: `translate(${W / 2 - 17},4)`, class: prev !== 5 ? 'pop' : '' }, g);
        el('path', { d: 'M0 9 L17 1 L34 9 V18 H0 Z', fill: '#E5484D', stroke: INK, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, h);
        el('rect', { x: 14, y: 11, width: 6, height: 7, fill: '#FFE7A8' }, h);
        return;
      }
      const sp = 18.5, start = W / 2 - ((n - 1) * sp) / 2;
      for (let k = 0; k < n; k++) {
        const h = el('g', { transform: `translate(${start + k * sp - 7.5},5)`, class: k >= prev ? 'pop' : '' }, g);
        el('path', { d: 'M0 7 L7.5 0 L15 7 V16 H0 Z', fill: '#30A46C', stroke: INK, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, h);
      }
    }

    highlightPending(i, j) {
      Object.values(this.spaceEls).forEach((g) => g.classList.remove('pending'));
      if (i !== null && i !== undefined && this.spaceEls[i]) this.spaceEls[i].classList.add('pending');
      if (j !== null && j !== undefined && this.spaceEls[j]) this.spaceEls[j].classList.add('pending');
    }

    // ---------- tokens ----------
    syncTokens(players, posMap, currentId) {
      const alive = players.filter((p) => !p.bankrupt);
      const groups = {};
      alive.forEach((p) => {
        const pos = posMap[p.id];
        const key = pos.i + (pos.jail ? 'j' : '');
        (groups[key] = groups[key] || []).push(p);
      });
      for (const id in this.tokenEls) if (!alive.some((p) => p.id === id)) { this.tokenEls[id].remove(); delete this.tokenEls[id]; }
      alive.forEach((p) => {
        let t = this.tokenEls[p.id];
        if (!t) t = this.tokenEls[p.id] = this.makeToken(p);
        const pos = posMap[p.id];
        const grp = groups[pos.i + (pos.jail ? 'j' : '')];
        const [x, y] = tokenSpot(pos.i, pos.jail, grp.indexOf(p), grp.length);
        t.style.transform = `translate(${x}px,${y}px)`;
        t.classList.toggle('current', p.id === currentId);
        if (t.dataset.look !== p.tokenId + p.color) this.paintToken(t, p);
      });
      // keep current token on top
      const cur = this.tokenEls[currentId];
      if (cur) this.tokenLayer.appendChild(cur);
    }

    makeToken(p) {
      const t = el('g', { class: 'token' }, this.tokenLayer);
      t.style.transform = `translate(${SIZE - C / 2}px,${SIZE - C / 2}px)`;
      const hop = el('g', { class: 'hop' }, t);
      el('circle', { r: 24, class: 'ring', fill: 'none', stroke: '#FFC53D', 'stroke-width': 4 }, hop);
      el('circle', { r: 18, class: 'disc', stroke: '#fff', 'stroke-width': 3.2, filter: 'url(#tokShadow)' }, hop);
      el('g', { class: 'glyph' }, hop);
      this.paintToken(t, p);
      return t;
    }

    paintToken(t, p) {
      t.dataset.look = p.tokenId + p.color;
      t.querySelector('.disc').setAttribute('fill', p.color);
      const g = t.querySelector('.glyph');
      g.innerHTML = '';
      iconGroup(TOKEN_ICONS[p.tokenId] || TOKEN_ICONS.star, 0, 0, 22, g, { fill: '#fff' });
    }

    hop(pid) {
      const t = this.tokenEls[pid];
      if (!t) return;
      const h = t.querySelector('.hop');
      h.classList.remove('hopping'); void h.getBBox(); h.classList.add('hopping');
    }

    // ---------- dice ----------
    setDice(d) {
      const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
      this.dieEls.forEach((die, k) => {
        die.pips.innerHTML = '';
        P[d[k]].forEach(([x, y]) => el('circle', { cx: x * 13, cy: y * 13, r: 5.2, fill: d[0] === d[1] ? '#E5484D' : INK }, die.pips));
      });
    }

    rollDice(d) {
      return new Promise((res) => {
        this.diceG.style.opacity = 1;
        this.dieEls.forEach((die) => { die.inner.classList.remove('rolling'); void die.inner.getBBox(); die.inner.classList.add('rolling'); });
        let n = 0;
        const iv = setInterval(() => {
          this.setDice([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
          if (++n >= 8) { clearInterval(iv); this.setDice(d); res(); }
        }, 70);
      });
    }

    // ---------- jackpot ----------
    setPot(n, animate) {
      if (!animate) { this.potShown = n; this.potText.textContent = '$' + n.toLocaleString(); return; }
      const from = this.potShown, to = n, t0 = performance.now(), dur = 700;
      this.potShown = n;
      const inner = this.potG.querySelector('.pot-inner');
      inner.classList.remove('bump'); void inner.getBBox(); inner.classList.add('bump');
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        const v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
        this.potText.textContent = '$' + v.toLocaleString();
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    showPot(on) { this.potG.style.display = on ? '' : 'none'; }
  }

  BoardView.spaceCenter = spaceCenter;
  window.BoardView = BoardView;
})();
