/* Line icons drawn for TuniBot (24x24, stroke = currentColor). Replace the emoji. */
const Icons = (() => {
  const P = {
    // drinks
    'cafe-direct': '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8.5 3.5c-.8 1 .8 2 0 3M12 3.5c-.8 1 .8 2 0 3"/>',
    'the-menthe': '<path d="M7 7h10l-1.4 12.2a1 1 0 0 1-1 .8H9.4a1 1 0 0 1-1-.8z"/><path d="M7.5 11h9"/><path d="M12 7c0-2 1.6-3.5 3.5-3.5 0 2-1.6 3.5-3.5 3.5z"/>',
    citronnade: '<path d="M7 6h10l-1.2 13.2a1 1 0 0 1-1 .8H9.2a1 1 0 0 1-1-.8z"/><path d="M13 6l2-3.5h2.5"/><circle cx="12" cy="13" r="2.4"/><path d="M12 10.6v4.8M9.6 13h4.8"/>',
    // dishes
    brik: '<path d="M3.5 17.5L12 5l8.5 12.5z"/><path d="M7 17.5c1.5-2 3-3 5-3s3.5 1 5 3"/><circle cx="12" cy="11.5" r="1.4"/>',
    'salade-tunisienne': '<path d="M3 11.5h18a9 9 0 0 1-18 0z"/><circle cx="9" cy="8.5" r="2"/><path d="M13 9.5c.5-2 2-3.5 4-3.5-.3 2-1.8 3.5-4 3.5z"/><path d="M6.5 11.5c0-1.2.6-2 1.5-2.5"/>',
    couscous: '<path d="M2.5 15.5h19"/><path d="M4.5 15.5a7.5 7.5 0 0 1 15 0"/><path d="M12 5v3"/><circle cx="12" cy="4.2" r="1"/><path d="M9 12.5l.01 0M12 11l.01 0M15 12.5l.01 0M10.5 14l.01 0M13.5 14l.01 0"/><path d="M5 18.5h14"/>',
    ojja: '<circle cx="10" cy="13" r="6.5"/><path d="M16.5 13H22"/><circle cx="8.5" cy="12" r="1.6"/><circle cx="12" cy="14.5" r="1.6"/><path d="M6 15.5c.6.8 1.4 1.3 2.4 1.5"/>',
    // desserts
    bambalouni: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/><path d="M7.5 8.5l.01 0M16 8l.01 0M16.5 15.5l.01 0M8 16l.01 0M12 5.5l.01 0"/>',
    makroudh: '<path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z"/><path d="M12 7.5l4.5 4.5-4.5 4.5L7.5 12z"/>',
    // restaurant lounge menu
    espresso: '<path d="M6 9h10v4a5 5 0 0 1-10 0z"/><path d="M16 10h1.5a2 2 0 0 1 0 4H16"/><path d="M4 20h14"/>',
    lemonade: '<path d="M7 6h10l-1.2 13.2a1 1 0 0 1-1 .8H9.2a1 1 0 0 1-1-.8z"/><path d="M13 6l2-3.5h2.5"/><path d="M8 11h8"/>',
    water: '<path d="M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10z"/>',
    burger: '<path d="M4 11a8 6 0 0 1 16 0z"/><path d="M3.5 14h17"/><path d="M4.5 17h15a1 1 0 0 1-1 2h-13a1 1 0 0 1-1-2z"/>',
    pasta: '<path d="M3 12.5h18a9 7 0 0 1-18 0z"/><path d="M8 12.5c0-3 2-5 4-5s4 2 4 5"/><path d="M15 4.5l-2.5 6"/>',
    salad: '<path d="M3 11.5h18a9 9 0 0 1-18 0z"/><path d="M9 11c0-2.5 1.5-4.5 3-5 1.5.5 3 2.5 3 5"/>',
    croissant: '<path d="M3 15c2-6 6-9 9-9s7 3 9 9c-2 1-4 .5-5-1-1 2-2.5 3-4 3s-3-1-4-3c-1 1.5-3 2-5 1z"/>',
    tiramisu: '<path d="M4 9h16v9H4z"/><path d="M4 12h16M4 15h16"/><path d="M8 6.5l.01 0M12 5.5l.01 0M16 6.5l.01 0"/>',
    // UI
    robot: '<rect x="5" y="8" width="14" height="10" rx="3"/><path d="M12 4.5V8"/><circle cx="12" cy="3.6" r="1"/><circle cx="9.5" cy="12.5" r="1.2"/><circle cx="14.5" cy="12.5" r="1.2"/><path d="M9.5 15.5h5"/><path d="M8 18v2M16 18v2"/>',
    tray: '<path d="M3 17h18"/><path d="M5 17a7 7 0 0 1 14 0"/><path d="M12 7.5V10"/><circle cx="12" cy="6.5" r="1"/>',
    receipt: '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8h6M9 11.5h6M9 15h4"/>',
    hourglass: '<path d="M7 3.5h10M7 20.5h10"/><path d="M8 3.5c0 4 8 5 8 8.5s-8 4.5-8 8.5M16 3.5c0 4-8 5-8 8.5s8 4.5 8 8.5"/>',
    check: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.7 2.7L16.2 9.5"/>',
    cross: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
    alert: '<path d="M12 4L21 19.5H3z"/><path d="M12 10v4.2M12 16.8l.01 0"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5v3M9 20.5h6"/>',
    plate: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>',
    battery: '<rect x="3" y="7.5" width="16" height="9" rx="1.5"/><path d="M21 10.5v3"/><path d="M6 10.5v3M9 10.5v3"/>',
    plug: '<path d="M9 3.5v4M15 3.5v4"/><path d="M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0z"/><path d="M12 16v4.5"/>',
    undock: '<path d="M4 4v16"/><path d="M9 12h11"/><path d="M16 8l4 4-4 4"/>',
    pot: '<path d="M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M2.5 10h19"/><path d="M9 6.5c-.6.8.6 1.5 0 2.3M12.5 5.5c-.6.8.6 1.5 0 2.3M16 6.5c-.6.8.6 1.5 0 2.3"/>',
    note: '<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4M8 12h8M8 15.5h5"/>',
  };
  function svg(name, cls = 'ico') {
    const body = P[name] || P.plate;
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }
  return { svg, has: n => n in P };
})();
