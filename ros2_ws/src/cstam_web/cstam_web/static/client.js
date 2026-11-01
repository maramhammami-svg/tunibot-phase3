/* Client page: pick a table, pick dishes, follow the delivery. */
(() => {
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'tunibot_active_order';
  let config = null;
  let table = null;
  let tableLocked = false;  // set when the page is opened from a table QR code (?table=5)
  const cart = {};          // item id -> qty
  let menuIndex = {};
  let availability = null;
  let activeRef = localStorage.getItem(STORAGE_KEY);
  let pollTimer = null;
  let lastStatus = null;

  // ------------------------------------------------------------ setup
  async function init() {
    try {
      config = await Tuni.api('/api/config');
    } catch (e) {
      Tuni.toast(e.message, 'error');
      setTimeout(init, 3000);
      return;
    }
    $('venue-title').textContent = config.menu.title || config.title;
    $('venue-sub').textContent = config.menu.subtitle || 'Order from your table';
    $('demo-banner').classList.toggle('hidden', config.mode !== 'mock');

    const fromUrl = new URLSearchParams(location.search).get('table');
    if (fromUrl) {
      const wanted = /^\d+$/.test(fromUrl) ? `Table ${fromUrl}` : fromUrl;
      if (config.tables.some(t => t.id === wanted)) { table = wanted; tableLocked = true; }
    }
    renderTables();
    renderMenu();
    updateCheckout();
    if (activeRef) showTracking();
  }

  function renderTables() {
    const grid = $('table-grid');
    grid.innerHTML = '';
    for (const t of config.tables) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'table-btn';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(t.id === table));
      b.textContent = t.id.replace('Table ', '');
      b.setAttribute('aria-label', t.id);
      b.onclick = () => { table = t.id; tableLocked = true; renderTables(); updateCheckout(); };
      grid.appendChild(b);
    }
    const showGrid = !tableLocked || !table;
    grid.classList.toggle('hidden', !showGrid);
    $('table-selected').classList.toggle('hidden', showGrid);
    $('table-selected').textContent = table || '';
    $('change-table-btn').classList.toggle('hidden', showGrid);
  }
  $('change-table-btn').onclick = () => { tableLocked = false; renderTables(); };

  function renderMenu() {
    const root = $('menu');
    root.innerHTML = '';
    menuIndex = {};
    for (const cat of config.menu.categories) {
      const sec = document.createElement('div');
      sec.className = 'menu-cat';
      sec.innerHTML = `<h3>${Tuni.escapeHtml(cat.name)}</h3>`;
      for (const it of cat.items) {
        menuIndex[it.id] = it;
        const row = document.createElement('div');
        row.className = 'menu-item';
        row.dataset.id = it.id;
        row.innerHTML = `
          <div class="menu-emoji" aria-hidden="true">${it.emoji || '🍽️'}</div>
          <div class="menu-text">
            <div class="menu-name">${Tuni.escapeHtml(it.name)}</div>
            <div class="menu-desc">${Tuni.escapeHtml(it.desc || '')}</div>
          </div>
          <div class="qty">
            <button type="button" class="minus" aria-label="Remove one ${Tuni.escapeHtml(it.name)}">−</button>
            <span aria-live="polite">0</span>
            <button type="button" class="add" aria-label="Add one ${Tuni.escapeHtml(it.name)}">+</button>
          </div>`;
        row.querySelector('.add').onclick = () => changeQty(it.id, +1);
        row.querySelector('.minus').onclick = () => changeQty(it.id, -1);
        sec.appendChild(row);
      }
      root.appendChild(sec);
    }
    refreshQty();
  }

  function changeQty(id, delta) {
    cart[id] = Math.max(0, Math.min(9, (cart[id] || 0) + delta));
    if (!cart[id]) delete cart[id];
    refreshQty();
    updateCheckout();
  }

  function refreshQty() {
    document.querySelectorAll('.menu-item').forEach(row => {
      const q = cart[row.dataset.id] || 0;
      row.querySelector('.qty span').textContent = q;
      row.querySelector('.minus').disabled = q === 0;
      row.classList.toggle('selected', q > 0);
    });
  }

  function updateCheckout() {
    const count = Object.values(cart).reduce((a, b) => a + b, 0);
    $('checkout-count').textContent = count ? `${count} item${count > 1 ? 's' : ''}` : 'No items yet';
    let hint = '';
    if (!table) hint = 'Choose your table';
    else if (!count) hint = 'Add at least one item';
    else if (availability && !availability.accepting) hint = availability.message;
    else if (availability && availability.orders_ahead > 0) hint = `${availability.orders_ahead} order(s) before yours`;
    else hint = `Delivered to ${table}`;
    $('checkout-hint').textContent = hint;
    $('order-btn').disabled = !table || !count || (availability && !availability.accepting);
    $('order-btn').textContent = table ? `Order to ${table.replace('Table ', 'T')}` : 'Order';
  }

  // ------------------------------------------------------------ ordering
  $('order-btn').onclick = async () => {
    const btn = $('order-btn');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    const items = Object.entries(cart).map(([id, qty]) => ({ id, name: menuIndex[id].name, qty }));
    try {
      const res = await Tuni.api('/api/orders', {
        method: 'POST',
        body: { target: table, items, note: $('note-input').value.trim() || null },
      });
      activeRef = res.order.order_ref;
      localStorage.setItem(STORAGE_KEY, activeRef);
      for (const k of Object.keys(cart)) delete cart[k];
      $('note-input').value = '';
      refreshQty();
      showTracking(res.order);
    } catch (e) {
      Tuni.toast(e.message, 'error');
    } finally {
      updateCheckout();
    }
  };

  // ------------------------------------------------------------ tracking
  const VIEW = {
    submitted: { emoji: '🧾', title: 'Order received', sub: 'Sending your order to the robot…', step: 'received' },
    queued: { emoji: '⏳', title: 'In the queue', sub: '', step: 'queued' },
    en_route: { emoji: '🤖', title: 'On the way!', sub: 'The robot is coming to your table.', step: 'en_route', bounce: true },
    arrived: { emoji: '🛎️', title: 'Your order is here', sub: 'Please take your order from the robot tray.', step: 'arrived', bounce: true },
    delivered: { emoji: '✅', title: 'Delivered', sub: 'Enjoy your meal!', step: 'done' },
    cancelled: { emoji: '🚫', title: 'Order cancelled', sub: 'Your order was cancelled.', step: null },
    failed: { emoji: '⚠️', title: 'Delivery problem', sub: 'The robot could not reach your table. A waiter will bring your order.', step: null },
    rejected: { emoji: '⚠️', title: 'Order not accepted', sub: 'The robot did not accept the order. Please ask the staff.', step: null },
  };
  const STEPS = ['received', 'queued', 'en_route', 'arrived'];

  function showTracking(order) {
    $('order-screen').classList.add('hidden');
    $('checkout').classList.add('hidden');
    $('track-screen').classList.remove('hidden');
    window.scrollTo(0, 0);
    if (order) renderOrder(order);
    clearInterval(pollTimer);
    pollOrder();
    pollTimer = setInterval(pollOrder, 1500);
  }

  async function pollOrder() {
    if (!activeRef) return;
    try {
      renderOrder(await Tuni.api(`/api/orders/${activeRef}`));
    } catch (e) {
      if (/not found/i.test(e.message)) {  // server restarted: forget the order
        resetToOrder();
      }
    }
  }

  function renderOrder(o) {
    const v = VIEW[o.status] || VIEW.submitted;
    $('track-emoji').textContent = v.emoji;
    $('track-emoji').classList.toggle('bounce', !!v.bounce);
    $('track-title').textContent = v.title;
    let sub = v.sub;
    if (o.status === 'queued') {
      sub = o.queue_position > 1 ? `${o.queue_position - 1} order(s) before yours.` : 'You are next!';
      if (availability && availability.level === 'charging') sub += ' The robot is recharging first.';
    }
    $('track-sub').textContent = sub;

    const idx = v.step === 'done' ? STEPS.length : STEPS.indexOf(v.step);
    document.querySelectorAll('#stepper li').forEach((li, i) => {
      li.classList.toggle('done', idx >= 0 && i < idx);
      li.classList.toggle('current', i === idx);
    });
    $('stepper').classList.toggle('hidden', v.step === null);

    $('track-items').innerHTML =
      `<div><strong>${Tuni.escapeHtml(o.target)}</strong></div>` +
      (o.items || []).map(i => `<div>${i.qty} × ${Tuni.escapeHtml(i.name)}</div>`).join('');

    const final = ['delivered', 'cancelled', 'failed', 'rejected'].includes(o.status);
    $('cancel-btn').classList.toggle('hidden', !['submitted', 'queued'].includes(o.status));
    $('new-order-btn').classList.toggle('hidden', !final);
    if (o.status !== lastStatus) {
      if (o.status === 'arrived' && navigator.vibrate) navigator.vibrate([200, 100, 200]);
      lastStatus = o.status;
    }
    if (final) clearInterval(pollTimer);
  }

  $('cancel-btn').onclick = async () => {
    if (!confirm('Cancel this order?')) return;
    try {
      await Tuni.api(`/api/orders/${activeRef}`, { method: 'DELETE' });
      pollOrder();
    } catch (e) {
      Tuni.toast(e.message, 'error');
    }
  };

  function resetToOrder() {
    clearInterval(pollTimer);
    activeRef = null;
    lastStatus = null;
    localStorage.removeItem(STORAGE_KEY);
    $('track-screen').classList.add('hidden');
    $('order-screen').classList.remove('hidden');
    $('checkout').classList.remove('hidden');
    updateCheckout();
  }
  $('new-order-btn').onclick = resetToOrder;

  // ------------------------------------------------------------ live status
  Tuni.telemetry(snap => {
    availability = snap.availability;
    const pill = $('availability-pill');
    pill.className = `pill ${availability.level}`;
    const short = { ready: 'Robot available', busy: `Busy · ${availability.orders_ahead} ahead`, charging: 'Recharging', offline: 'Robot offline' };
    $('availability-text').textContent = short[availability.level] || availability.message;
    const off = $('offline-banner');
    off.classList.toggle('hidden', availability.level !== 'offline');
    off.textContent = availability.level === 'offline' ? availability.message : '';
    updateCheckout();
  }, connected => {
    if (!connected) {
      $('availability-pill').className = 'pill offline';
      $('availability-text').textContent = 'Reconnecting…';
    }
  });

  init();
})();
