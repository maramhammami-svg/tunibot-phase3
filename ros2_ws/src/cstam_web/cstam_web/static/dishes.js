/* Dish illustrations for the menu book (64x64, flat colours, manganese outline).
   Dishes are seen from above on a Nabeul plate; drinks are seen from the side. */
const Dishes = (() => {
  const INK = '#2b1d19';
  const plate = (rim = '#1d6b4f') =>
    `<circle cx="32" cy="32" r="29" fill="#fbf6ea"/>` +
    `<circle cx="32" cy="32" r="24.5" fill="none" stroke="${rim}" stroke-width="1.3" stroke-dasharray="1.5 3.2"/>`;
  const bowl = (rim = '#b07a06') =>
    `<circle cx="32" cy="32" r="28" fill="#fbf6ea"/><circle cx="32" cy="32" r="22" fill="#f3e6cc" stroke="${rim}" stroke-width="1.3"/>`;

  const D = {
    // ---------- Dar Tunibot (Tunisian menu)
    couscous: plate() +
      '<circle cx="32" cy="33" r="18" fill="#f2cf7a"/>' +
      '<g stroke="none" fill="#d9a943"><circle cx="24" cy="28" r=".9"/><circle cx="29" cy="24" r=".9"/><circle cx="38" cy="26" r=".9"/><circle cx="41" cy="35" r=".9"/><circle cx="25" cy="39" r=".9"/><circle cx="33" cy="43" r=".9"/><circle cx="20" cy="33" r=".9"/></g>' +
      '<path d="M28 30c2-4 7-5 10-2 2 3 0 7-4 8-4 1-8-2-6-6z" fill="#8a4b2a"/>' +
      '<path d="M18 36l9 4-2 3z" fill="#e8742a"/><path d="M40 20l2 9-4-1z" fill="#e8742a"/><path d="M42 38l-8 5 1-4z" fill="#e8742a"/>' +
      '<circle cx="23" cy="25" r="2.2" fill="#e9d29a"/><circle cx="43" cy="31" r="2.2" fill="#e9d29a"/><circle cx="30" cy="40" r="2.2" fill="#e9d29a"/>' +
      '<path d="M36 24c2-1 4 0 4 2" fill="none" stroke="#3d8a4a" stroke-width="2"/>',
    brik: plate() +
      '<path d="M14 40C14 26 22 17 34 17c8 0 15 5 17 12z" fill="#e9a93b"/>' +
      '<path d="M14 40l37-11c-1 8-9 15-19 16-8 1-14-1-18-5z" fill="#d48a22"/>' +
      '<path d="M20 31c3-4 7-7 12-8M24 37c4-6 10-9 17-10" fill="none" stroke="#f6d27a" stroke-width="1.6"/>' +
      '<circle cx="31" cy="30" r="3.2" fill="#f7b81e" stroke="none"/>' +
      '<path d="M42 44a6 6 0 0 0 9-5z" fill="#f5e04a"/><path d="M44 42l4-2.5" stroke="#d9c13a" stroke-width="1"/>' +
      '<path d="M18 44c1-2 3-2 4-1M22 46c1-2 3-2 4-1" fill="none" stroke="#3d8a4a" stroke-width="1.8"/>',
    ojja: '<circle cx="30" cy="34" r="22" fill="#3a2a25"/><path d="M50 26l11-6" stroke="#3a2a25" stroke-width="6"/>' +
      '<circle cx="30" cy="34" r="18" fill="#c8402b" stroke="none"/>' +
      '<path d="M16 30c3-1 5 1 8 0M34 44c3-1 5 1 8 0M38 24c2 0 4 1 5 3" fill="none" stroke="#e0684d" stroke-width="1.6"/>' +
      '<path d="M18 36c0-5 5-8 9-6 4 1 5 6 2 9-3 3-11 2-11-3z" fill="#fff" stroke="none"/><circle cx="23" cy="36" r="3.2" fill="#f7b81e" stroke="none"/>' +
      '<path d="M32 28c1-5 7-6 10-3 3 3 1 8-3 9-4 1-8-2-7-6z" fill="#fff" stroke="none"/><circle cx="37" cy="29" r="3.2" fill="#f7b81e" stroke="none"/>' +
      '<g fill="#8a2f1f"><circle cx="35" cy="42" r="3"/><circle cx="26" cy="45" r="3"/><circle cx="42" cy="37" r="3"/></g>' +
      '<g stroke="none" fill="#3d8a4a"><circle cx="29" cy="25" r="1"/><circle cx="20" cy="42" r="1"/><circle cx="44" cy="44" r="1"/></g>',
    'salade-tunisienne': bowl('#1d6b4f') +
      '<g><rect x="20" y="22" width="7" height="7" rx="1.5" fill="#d8402e"/><rect x="34" y="20" width="7" height="7" rx="1.5" fill="#d8402e" transform="rotate(12 37 23)"/><rect x="38" y="35" width="7" height="7" rx="1.5" fill="#d8402e"/><rect x="22" y="38" width="7" height="7" rx="1.5" fill="#d8402e" transform="rotate(-10 25 41)"/></g>' +
      '<g><rect x="28" y="28" width="6" height="6" rx="1.5" fill="#8cc06a"/><rect x="17" y="31" width="6" height="6" rx="1.5" fill="#8cc06a"/><rect x="31" y="40" width="6" height="6" rx="1.5" fill="#8cc06a"/><rect x="43" y="26" width="6" height="6" rx="1.5" fill="#8cc06a"/></g>' +
      '<path d="M27 21c2-2 5-2 6 0" fill="none" stroke="#9b4f9a" stroke-width="1.8"/><path d="M36 31c2-2 5-2 6 0" fill="none" stroke="#9b4f9a" stroke-width="1.8"/>' +
      '<circle cx="45" cy="44" r="3.4" fill="#fff"/><circle cx="45" cy="44" r="1.6" fill="#f7b81e" stroke="none"/>' +
      '<circle cx="20" cy="45" r="2" fill="#2b1d19"/><circle cx="41" cy="18" r="2" fill="#2b1d19"/>' +
      '<path d="M27 46l5 2-3 2z" fill="#e7b3a0"/>',
    bambalouni: plate('#a8603a') +
      '<circle cx="32" cy="32" r="18" fill="#e5a33f"/><circle cx="32" cy="32" r="6" fill="#fbf6ea"/>' +
      '<path d="M18 26c4-7 13-10 20-7" fill="none" stroke="#f5cc72" stroke-width="2.4"/>' +
      '<g stroke="none" fill="#fff"><circle cx="22" cy="36" r="1"/><circle cx="26" cy="22" r="1"/><circle cx="40" cy="24" r="1"/><circle cx="43" cy="35" r="1"/><circle cx="35" cy="44" r="1"/><circle cx="25" cy="42" r="1"/><circle cx="31" cy="20" r="1"/><circle cx="44" cy="29" r="1"/></g>',
    makroudh: plate('#a8603a') +
      '<g><path d="M14 30l9-9 9 9-9 9z" fill="#c98a3a"/><path d="M19 30l4-4 4 4-4 4z" fill="#5e2f1d"/></g>' +
      '<g><path d="M32 30l9-9 9 9-9 9z" fill="#c98a3a"/><path d="M37 30l4-4 4 4-4 4z" fill="#5e2f1d"/></g>' +
      '<g><path d="M23 41l9-9 9 9-9 9z" fill="#d79a46"/><path d="M28 41l4-4 4 4-4 4z" fill="#5e2f1d"/></g>' +
      '<path d="M16 46c6 4 12 6 18 6" fill="none" stroke="#f0b23a" stroke-width="2.2" stroke-opacity=".8"/>' +
      '<g stroke="none" fill="#fbf0cf"><circle cx="22" cy="24" r=".9"/><circle cx="44" cy="25" r=".9"/><circle cx="31" cy="36" r=".9"/><circle cx="36" cy="46" r=".9"/></g>',
    'cafe-direct': '<ellipse cx="32" cy="50" rx="22" ry="5" fill="#fbf6ea"/>' +
      '<path d="M16 24h28v12c0 9-6 14-14 14s-14-5-14-14z" fill="#fbf6ea"/>' +
      '<path d="M44 28h3a5 5 0 0 1 0 10h-4" fill="none"/>' +
      '<ellipse cx="30" cy="24" rx="14" ry="3.6" fill="#c69a6d"/><path d="M24 23.5c3 1.5 8 1.5 11 0" fill="none" stroke="#f3e2c8" stroke-width="1.4"/>' +
      '<path d="M20 34h20" stroke="#1d6b4f" stroke-width="1.6" stroke-dasharray="2 2.5"/>' +
      '<path d="M25 10c-2 3 2 5 0 8M32 8c-2 3 2 5 0 8" fill="none" stroke="#a8603a" stroke-width="1.6"/>',
    'the-menthe': '<path d="M21 18h22l-3 32a3 3 0 0 1-3 2.6H27a3 3 0 0 1-3-2.6z" fill="#fbf6ea"/>' +
      '<path d="M22.2 28h19.6l-2 21a2 2 0 0 1-2 1.8H26.2a2 2 0 0 1-2-1.8z" fill="#c4761f" stroke="none"/>' +
      '<path d="M22.2 28h19.6" />' +
      '<path d="M25 33l3 15" stroke="#e5a24f" stroke-width="1.6"/>' +
      '<path d="M30 18c-1-6 3-10 9-10 0 6-4 10-9 10z" fill="#3d8a4a"/><path d="M30 18c3-3 5-6 9-10" fill="none" stroke="#2a6a36" stroke-width="1"/>' +
      '<path d="M32 18c-4-3-9-2-10 2 4 2 8 1 10-2z" fill="#5aa65e"/>' +
      '<g fill="#f3e2c8"><ellipse cx="28" cy="27" rx="1.6" ry="1"/><ellipse cx="33" cy="26.5" rx="1.6" ry="1"/><ellipse cx="37" cy="27.3" rx="1.6" ry="1"/></g>',
    citronnade: '<path d="M20 14h24l-3 38a3 3 0 0 1-3 2.6H26a3 3 0 0 1-3-2.6z" fill="#fbf6ea"/>' +
      '<path d="M20.9 22h22.2l-2.4 29a2 2 0 0 1-2 1.8H25.3a2 2 0 0 1-2-1.8z" fill="#f2e7a6" stroke="none"/>' +
      '<path d="M20.9 22h22.2"/>' +
      '<circle cx="42" cy="15" r="8" fill="#f5e04a"/><circle cx="42" cy="15" r="5.5" fill="#fbf2a6" stroke="#e1c83a" stroke-width="1"/><path d="M42 9.5v11M36.5 15h11" stroke="#e1c83a" stroke-width="1"/>' +
      '<g fill="#e9cfa0"><ellipse cx="28" cy="40" rx="2.4" ry="1.4" transform="rotate(-20 28 40)"/><ellipse cx="35" cy="45" rx="2.4" ry="1.4" transform="rotate(25 35 45)"/></g>' +
      '<path d="M29 6l4 34" stroke="#1d6b4f" stroke-width="2.4"/>',

    // ---------- Restaurant Lounge
    espresso: '<ellipse cx="32" cy="48" rx="20" ry="5" fill="#fbf6ea"/><path d="M18 28h24v8c0 7-5 11-12 11s-12-4-12-11z" fill="#fbf6ea"/>' +
      '<path d="M42 31h3a4 4 0 0 1 0 8h-4" fill="none"/><ellipse cx="30" cy="28" rx="12" ry="3" fill="#6b3a1f"/><path d="M26 27.6c2 1 6 1 8 0" fill="none" stroke="#c98a5a" stroke-width="1.2"/>' +
      '<path d="M27 14c-2 3 2 5 0 8M33 12c-2 3 2 5 0 8" fill="none" stroke="#a8603a" stroke-width="1.6"/>',
    lemonade: '<path d="M20 16h24l-3 36a3 3 0 0 1-3 2.6H26a3 3 0 0 1-3-2.6z" fill="#fbf6ea"/>' +
      '<path d="M20.9 24h22.2l-2.4 27a2 2 0 0 1-2 1.8H25.3a2 2 0 0 1-2-1.8z" fill="#fbe57a" stroke="none"/><path d="M20.9 24h22.2"/>' +
      '<g fill="#fff" stroke="none"><circle cx="28" cy="34" r="1.3"/><circle cx="34" cy="41" r="1.1"/><circle cx="31" cy="47" r="1.3"/><circle cx="37" cy="31" r="1"/></g>' +
      '<circle cx="42" cy="17" r="7" fill="#f5e04a"/><path d="M42 12v10M37 17h10" stroke="#e1c83a" stroke-width="1"/><path d="M30 8l3 34" stroke="#c2412d" stroke-width="2.4"/>',
    water: '<path d="M27 6h10v6l4 6v34a3 3 0 0 1-3 3H26a3 3 0 0 1-3-3V18l4-6z" fill="#d7ecf2"/>' +
      '<rect x="27" y="4" width="10" height="5" rx="1.5" fill="#1d6b4f"/><rect x="23" y="28" width="18" height="12" fill="#fbf6ea"/>' +
      '<path d="M29 33h6M29 36h4" stroke="#1d6b4f" stroke-width="1.3"/><path d="M27 20v4" stroke="#fff" stroke-width="2"/>',
    burger: '<path d="M12 30c0-10 9-16 20-16s20 6 20 16z" fill="#e5a33f"/>' +
      '<g stroke="none" fill="#fbf0cf"><ellipse cx="24" cy="21" rx="1.4" ry=".8"/><ellipse cx="32" cy="18" rx="1.4" ry=".8"/><ellipse cx="40" cy="22" rx="1.4" ry=".8"/></g>' +
      '<path d="M10 32c4 3 8-1 11 2s7-2 11 1 7-2 11 1 7-1 11-2v1H10z" fill="#7cb85a"/>' +
      '<path d="M12 34h40l-2 4H14z" fill="#f2b628"/><rect x="11" y="38" width="42" height="6" rx="3" fill="#7a3b22"/>' +
      '<path d="M12 46h40c0 4-3 6-6 6H18c-3 0-6-2-6-6z" fill="#e5a33f"/>',
    pasta: plate() + '<path d="M18 32c2-8 8-12 14-12s12 4 14 12c-2 8-8 12-14 12s-12-4-14-12z" fill="#f2d68a"/>' +
      '<path d="M22 30c4-4 8 4 12 0s8 4 10 0M22 36c4-4 8 4 12 0s8 4 10 0M26 25c3-3 6 2 10-1" fill="none" stroke="#d9b45a" stroke-width="1.6"/>' +
      '<g fill="#a5512d"><rect x="27" y="28" width="4" height="3" rx="1"/><rect x="36" y="34" width="4" height="3" rx="1"/><rect x="24" y="37" width="4" height="3" rx="1"/></g>' +
      '<g stroke="none" fill="#3a2a25"><circle cx="33" cy="25" r=".8"/><circle cx="40" cy="30" r=".8"/><circle cx="30" cy="40" r=".8"/></g>',
    salad: bowl('#1d6b4f') + '<path d="M18 30c2-7 9-10 14-6 5-5 13-2 14 5-1 8-8 13-14 13s-13-5-14-12z" fill="#7cb85a"/>' +
      '<path d="M24 27c3 3 6 4 8 3M36 26c-2 4-2 7 0 9" fill="none" stroke="#4f8a3a" stroke-width="1.4"/>' +
      '<rect x="27" y="33" width="7" height="6" rx="1" fill="#fbf6ea"/><circle cx="40" cy="36" r="3" fill="#d8402e"/><circle cx="23" cy="36" r="3" fill="#d8402e"/>' +
      '<circle cx="35" cy="24" r="2" fill="#2b1d19"/><circle cx="29" cy="43" r="2" fill="#2b1d19"/>',
    croissant: plate('#a8603a') + '<path d="M12 36c4-12 12-18 20-18s16 6 20 18c-4 1-8-1-10-3-2 4-6 6-10 6s-8-2-10-6c-2 2-6 4-10 3z" fill="#e5a33f"/>' +
      '<path d="M24 22l2 15M32 18v20M40 22l-2 15" fill="none" stroke="#b9772a" stroke-width="1.6"/>' +
      '<path d="M20 28c3-5 7-8 12-8" fill="none" stroke="#f5cc72" stroke-width="2"/>',
    tiramisu: plate('#a8603a') + '<path d="M16 28l16-10 16 10v14l-16 8-16-8z" fill="#f3e2c8"/>' +
      '<path d="M16 28l16 8 16-8M32 36v14" fill="none"/><path d="M16 28l16-10 16 10-16 8z" fill="#6b3a1f"/>' +
      '<path d="M16 34l16 8 16-8M16 39l16 8 16-8" fill="none" stroke="#b9772a" stroke-width="1.4"/>' +
      '<g stroke="none" fill="#3a2015"><circle cx="28" cy="25" r=".9"/><circle cx="34" cy="23" r=".9"/><circle cx="36" cy="29" r=".9"/><circle cx="26" cy="29" r=".9"/></g>',
  };

  function svg(id, cls = 'dish') {
    if (!D[id]) return typeof Icons !== 'undefined' ? Icons.svg(id, 'ico') : '';
    return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true"><g stroke="${INK}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${D[id]}</g></svg>`;
  }
  return { svg, has: id => id in D };
})();
