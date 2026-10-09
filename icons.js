// Original SVG icon set for Turf Tycoon (24×24 grid, fill = currentColor).
(function () {
  const SH = 'rgba(0,0,0,.28)';
  const TOKENS = {
    rocket: `<path d="M12 2.2c3 2 4.9 5.7 4.9 9.6L15.1 15H8.9l-1.8-3.2C7.1 7.9 9 4.2 12 2.2z"/><circle cx="12" cy="8.8" r="1.9" fill="${SH}"/><path d="M7.3 11.4L4.6 14.6v3.3l3.2-2zM16.7 11.4l2.7 3.2v3.3l-3.2-2z"/><path d="M9.8 16h4.4l-.7 3.4L12 21.8l-1.5-2.4z" opacity=".75"/>`,
    cactus: `<rect x="9.8" y="2.5" width="4.4" height="19" rx="2.2"/><path d="M4.6 8.2a1.6 1.6 0 013.2 0v3.9h2.4v3.1H6.4a1.8 1.8 0 01-1.8-1.8z"/><path d="M19.4 5.7a1.6 1.6 0 00-3.2 0v4.6h-2.4v3.1h3.8a1.8 1.8 0 001.8-1.8z"/>`,
    crown: `<path d="M2.8 7.6l4.8 4.2L12 4.6l4.4 7.2 4.8-4.2-2 10.4H4.8z"/><rect x="4.8" y="19" width="14.4" height="2.4" rx="1.2"/><circle cx="12" cy="13.6" r="1.5" fill="${SH}"/>`,
    bolt: `<path d="M13.8 1.8L4.6 13.6h6.2L9.2 22.2l10.2-12.6h-6.3z"/>`,
    star: `<path d="M12 2.2l3 6.1 6.7.9-4.9 4.6 1.3 6.6L12 17.1l-6.1 3.3 1.3-6.6-4.9-4.6 6.7-.9z"/>`,
    paw: `<ellipse cx="12" cy="16.2" rx="4.8" ry="4"/><ellipse cx="5.6" cy="10.4" rx="2.1" ry="2.5"/><ellipse cx="9.4" cy="6" rx="2.1" ry="2.6"/><ellipse cx="14.6" cy="6" rx="2.1" ry="2.6"/><ellipse cx="18.4" cy="10.4" rx="2.1" ry="2.5"/>`,
    gem: `<path d="M6.6 3.6h10.8l4.2 5.4L12 21.4 2.4 9z"/><path d="M2.6 9h18.8M9 3.8l3 5.2 3-5.2M12 9v12" stroke="${SH}" stroke-width="1.3" fill="none" stroke-linejoin="round"/>`,
    note: `<path d="M8.6 4.4l11.4-2.2v13.6a3.1 3.1 0 11-2.1-2.9V6.6l-7.2 1.4v9.7a3.1 3.1 0 11-2.1-2.9z"/>`,
    ball: `<circle cx="12" cy="12" r="9.4"/><path d="M6.8 5.2c2.4 2.4 2.4 11.2 0 13.6M17.2 5.2c-2.4 2.4-2.4 11.2 0 13.6" stroke="${SH}" stroke-width="1.5" fill="none" stroke-dasharray="1.5 1.3"/>`,
    taco: `<path d="M2.2 17a9.8 9.8 0 0119.6 0z"/><path d="M4.4 13.4c1.2-1.6 2.6-1 3.7-2.1 1.1-1 2.5-.5 3.9-1.2 1.4.7 2.8.2 3.9 1.2 1.1 1.1 2.5.5 3.7 2.1" stroke="${SH}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  };

  const INK = '#22263A', PAPER = '#FFF8EA';
  const SPACE = {
    station: `<rect x="5" y="2.5" width="14" height="14.5" rx="3.4" fill="${INK}"/><rect x="7.4" y="5" width="9.2" height="5.2" rx="1.2" fill="#9AD8F2"/><circle cx="8.8" cy="13.4" r="1.4" fill="#FFD34D"/><circle cx="15.2" cy="13.4" r="1.4" fill="#FFD34D"/><path d="M8.2 17l-2.4 4.4M15.8 17l2.4 4.4M7 20h10" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`,
    power: `<path d="M12 1.8a6.6 6.6 0 00-3.9 11.9c.8.6 1.3 1.6 1.3 2.6v.7h5.2v-.7c0-1 .5-2 1.3-2.6A6.6 6.6 0 0012 1.8z" fill="#FFD34D" stroke="${INK}" stroke-width="1.4"/><path d="M12.8 5.2L10 9.6h2.6l-1.2 3.6" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linejoin="round"/><rect x="9.4" y="18" width="5.2" height="1.8" rx=".9" fill="${INK}"/><rect x="10" y="20.6" width="4" height="1.8" rx=".9" fill="${INK}"/>`,
    water: `<path d="M12 2.2C9.2 6.6 5.8 10.2 5.8 14.2a6.2 6.2 0 0012.4 0c0-4-3.4-7.6-6.2-12z" fill="#43B0E3" stroke="${INK}" stroke-width="1.4"/><path d="M8.8 14.4a3.2 3.2 0 003.2 3.2" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    luck: `<path d="M12 1.8l2 4.6 5-.2-3.6 3.4 1.8 4.7L12 11.8l-5.2 2.5 1.8-4.7L5 6.2l5 .2z" fill="#FF8A3D" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><text x="12" y="23" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="10" fill="${INK}">?</text>`,
    community: `<ellipse cx="9" cy="8.4" rx="4.4" ry="5.4" fill="#E2619F" stroke="${INK}" stroke-width="1.2"/><ellipse cx="15.4" cy="9.6" rx="4" ry="5" fill="#5BC48A" stroke="${INK}" stroke-width="1.2"/><path d="M9 13.8c-.4 3 1.6 4.6 1.8 8.2M15.4 14.6c.3 2.6-1.8 4-2 7.4" stroke="${INK}" stroke-width="1.1" fill="none"/><path d="M7.4 6.4a2 2 0 011.6-1.4" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
    tax: `<path d="M9 2.6h6l-1.6 3.2h-2.8z" fill="#C9A25A" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><path d="M10.4 6.2h3.2c4.6 2.4 6.8 6.4 6.8 9.6 0 3.4-2.8 5.6-8.4 5.6s-8.4-2.2-8.4-5.6c0-3.2 2.2-7.2 6.8-9.6z" fill="#E7C57E" stroke="${INK}" stroke-width="1.3"/><text x="12" y="18.6" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="8.5" fill="${INK}">$</text>`,
    car: `<path d="M3 15.2v-3.4l2.2-4.6c.4-.8 1.2-1.3 2.1-1.3h9.4c.9 0 1.7.5 2.1 1.3l2.2 4.6v3.4z" fill="#E5484D" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.4 11.2l1.4-3h8.4l1.4 3z" fill="#BDE7F7"/><circle cx="7.4" cy="16.4" r="2.2" fill="${INK}"/><circle cx="16.6" cy="16.4" r="2.2" fill="${INK}"/>`,
    siren: `<path d="M6.6 17v-5.2a5.4 5.4 0 0110.8 0V17z" fill="#E5484D" stroke="${INK}" stroke-width="1.3"/><rect x="4.4" y="17" width="15.2" height="3.6" rx="1.2" fill="${INK}"/><path d="M12 1.6v2.6M4.2 4.6l1.8 1.8M19.8 4.6L18 6.4M2 11h2.4M19.6 11H22" stroke="#FFB224" stroke-width="1.6" stroke-linecap="round"/><path d="M9.4 11.4a2.6 2.6 0 012.6-2.6" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,
  };

  window.ICONS = { TOKENS, SPACE, INK, PAPER };
})();
