/* Client page: pick a table, pick dishes (by tapping or by voice), follow the delivery. */
(() => {
  const $ = id => document.getElementById(id);
  const t = I18n.t;
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
  let lastOrder = null;

  // ------------------------------------------------------------ setup
  async function init() {
    I18n.apply();
    renderLangButton();
    try {
      config = await Tuni.api('/api/config');
    } catch (e) {
      Tuni.toast(e.message, 'error');
      setTimeout(init, 3000);
      return;
    }
    $('demo-banner').classList.toggle('hidden', config.mode !== 'mock');

    const fromUrl = new URLSearchParams(location.search).get('table');
    if (fromUrl) {
      const wanted = /^\d+$/.test(fromUrl) ? `Table ${fromUrl}` : fromUrl;
      if (config.tables.some(tb => tb.id === wanted)) { table = wanted; tableLocked = true; }
    }
    renderAll();
    if (activeRef) showTracking();
  }

  function renderAll() {
    I18n.apply();
    if (!config) return;
    $('venue-title').textContent = config.menu.title || config.title;
    $('venue-sub').textContent = I18n.field(config.menu, 'subtitle') || t('order_from_table');
    renderTables();
    renderMenu();
    updateCheckout();
    renderAvailability();
    if (lastOrder) renderOrder(lastOrder);
    setVoiceStatus(recognizing ? 'listening' : 'idle');
  }

  function renderLangButton() {
    const other = I18n.get() === 'fr' ? 'en' : 'fr';
    $('lang-btn').textContent = other.toUpperCase();
    $('lang-btn').setAttribute('aria-label', other === 'en' ? 'Switch to English' : 'Passer en français');
  }
  $('lang-btn').onclick = () => {
    I18n.set(I18n.get() === 'fr' ? 'en' : 'fr');
    renderLangButton();
    if (recognition) recognition.lang = t('speech_lang');
    renderAll();
  };

  function renderTables() {
    const grid = $('table-grid');
    grid.innerHTML = '';
    for (const tb of config.tables) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'table-btn';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(tb.id === table));
      b.textContent = tb.id.replace('Table ', '');
      b.setAttribute('aria-label', tb.id);
      b.onclick = () => { table = tb.id; tableLocked = true; renderTables(); updateCheckout(); };
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
    const catNames = t('cat');
    for (const cat of config.menu.categories) {
      const sec = document.createElement('div');
      sec.className = 'menu-cat';
      sec.innerHTML = `<h3>${Tuni.escapeHtml(I18n.field(cat, 'name') || catNames[cat.name] || cat.name)}</h3>`;
      for (const it of cat.items) {
        menuIndex[it.id] = it;
        const row = document.createElement('div');
        row.className = 'menu-item';
        row.dataset.id = it.id;
        row.innerHTML = `
          <div class="menu-emoji" aria-hidden="true">${it.emoji || '🍽️'}</div>
          <div class="menu-text">
            <div class="menu-name">${Tuni.escapeHtml(it.name)}</div>
            <div class="menu-desc">${Tuni.escapeHtml(I18n.field(it, 'desc'))}</div>
          </div>
          <div class="qty">
            <button type="button" class="minus" aria-label="${Tuni.escapeHtml(t('remove_one', it.name))}">−</button>
            <span aria-live="polite">0</span>
            <button type="button" class="add" aria-label="${Tuni.escapeHtml(t('add_one', it.name))}">+</button>
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

  function availabilityMessage() {
    if (!availability) return '';
    if (availability.level === 'offline') return t('av_offline_msg');
    if (availability.level === 'charging') {
      const m = /\(([\d.]+)%\)/.exec(availability.message || '');
      return t('av_charging_msg', m ? m[1] : '?');
    }
    return availability.message;
  }

  function updateCheckout() {
    const count = Object.values(cart).reduce((a, b) => a + b, 0);
    $('checkout-count').textContent = count ? t('items', count) : t('no_items');
    let hint = '';
    if (!table) hint = t('hint_table');
    else if (!count) hint = t('hint_item');
    else if (availability && !availability.accepting) hint = availabilityMessage();
    else if (availability && availability.orders_ahead > 0) hint = t('hint_ahead', availability.orders_ahead);
    else hint = t('hint_deliver', table);
    $('checkout-hint').textContent = hint;
    $('order-btn').disabled = !table || !count || (availability && !availability.accepting);
    $('order-btn').textContent = table ? t('order_to', table) : t('order');
  }

  // ------------------------------------------------------------ voice ordering
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let recognizing = false;
  let voiceState = 'idle';

  function setVoiceStatus(state) {
    voiceState = state;
    const msg = { listening: 'voice_listening', idle: SR ? 'voice_idle' : 'voice_unsupported', denied: 'voice_denied', nothing: 'voice_nothing' }[state];
    $('voice-status').textContent = t(msg || 'voice_idle');
    $('mic-dot').classList.toggle('on', state === 'listening');
  }

  function startListening() {
    if (!SR) { setVoiceStatus('idle'); $('voice-input').focus(); return; }
    if (recognizing) { recognition.stop(); return; }
    recognition = new SR();
    recognition.lang = t('speech_lang');
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    let finalText = '';
    recognition.onstart = () => { recognizing = true; setVoiceStatus('listening'); };
    recognition.onresult = ev => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript;
        else interim += ev.results[i][0].transcript;
      }
      showHeard(finalText + interim);
    };
    recognition.onerror = ev => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') setVoiceStatus('denied');
      else if (ev.error === 'no-speech') setVoiceStatus('nothing');
    };
    recognition.onend = () => {
      recognizing = false;
      if (voiceState === 'listening') setVoiceStatus('idle');
      if (finalText.trim()) understand(finalText.trim());
    };
    recognition.start();
  }

  function showHeard(text) {
    $('voice-heard').classList.toggle('hidden', !text);
    $('voice-heard').textContent = text ? t('voice_heard', text) : '';
  }

  async function understand(text) {
    showHeard(text);
    try {
      const res = await Tuni.api('/api/voice/parse', { method: 'POST', body: { text, lang: I18n.get() } });
      applyVoiceResult(res);
    } catch (e) {
      Tuni.toast(e.message, 'error');
    }
  }

  function applyVoiceResult(res) {
    if (res.table) { table = res.table; tableLocked = true; renderTables(); }
    for (const it of res.items) {
      if (!menuIndex[it.id]) continue;
      cart[it.id] = Math.min(9, (cart[it.id] || 0) + it.qty);
    }
    refreshQty();
    updateCheckout();

    const box = $('voice-result');
    box.classList.remove('hidden', 'ok', 'warn');
    let html = '';
    if (res.items.length) {
      html += `<strong>${Tuni.escapeHtml(t('voice_added'))}</strong><ul>` +
        res.items.map(i => `<li>${i.qty} × ${Tuni.escapeHtml(i.name)}</li>`).join('') + '</ul>';
    } else {
      html += `<div>${Tuni.escapeHtml(t('voice_none'))}</div>`;
    }
    if (res.table) html += `<div>${Tuni.escapeHtml(t('voice_table', res.table))}</div>`;
    if (res.unmatched && res.unmatched.length && res.items.length) {
      html += `<div class="muted">${Tuni.escapeHtml(t('voice_unknown', res.unmatched.join(' ')))}</div>`;
    }
    if (res.items.length) html += `<div class="muted small">${Tuni.escapeHtml(t('voice_check'))}</div>`;
    box.innerHTML = html;
    box.classList.add(res.items.length ? 'ok' : 'warn');

    if (res.items.length && 'speechSynthesis' in window) {
      const list = res.items.map(i => `${i.qty} ${i.name}`).join(', ');
      const u = new SpeechSynthesisUtterance(t('voice_say_ok', list, res.table));
      u.lang = t('speech_lang');
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  }

  $('voice-btn').onclick = () => {
    const panel = $('voice-panel');
    const opening = panel.classList.contains('hidden');
    panel.classList.remove('hidden');
    $('voice-btn').setAttribute('aria-expanded', 'true');
    if (opening) setVoiceStatus('idle');
    startListening();
  };
  $('voice-form').onsubmit = ev => {
    ev.preventDefault();
    const text = $('voice-input').value.trim();
    if (!text) return;
    $('voice-input').value = '';
    understand(text);
  };

  // ------------------------------------------------------------ ordering
  $('order-btn').onclick = async () => {
    const btn = $('order-btn');
    btn.disabled = true;
    btn.textContent = t('sending');
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
      $('voice-result').classList.add('hidden');
      showHeard('');
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
    submitted: { emoji: '🧾', step: 'received' },
    queued: { emoji: '⏳', step: 'queued' },
    en_route: { emoji: '🤖', step: 'en_route', bounce: true },
    arrived: { emoji: '🛎️', step: 'arrived', bounce: true },
    delivered: { emoji: '✅', step: 'done' },
    cancelled: { emoji: '🚫', step: null },
    failed: { emoji: '⚠️', step: null },
    rejected: { emoji: '⚠️', step: null },
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
    lastOrder = o;
    const status = VIEW[o.status] ? o.status : 'submitted';
    const v = VIEW[status];
    const [title, defaultSub] = t(`st_${status}`);
    $('track-emoji').textContent = v.emoji;
    $('track-emoji').classList.toggle('bounce', !!v.bounce);
    $('track-title').textContent = title;
    let sub = defaultSub;
    if (status === 'queued') {
      sub = o.queue_position > 1 ? t('queue_ahead', o.queue_position - 1) : t('queue_next');
      if (availability && availability.level === 'charging') sub += t('queue_charging');
    }
    $('track-sub').textContent = sub;
    const showEta = status === 'en_route' && typeof o.eta_s === 'number';
    $('eta').classList.toggle('hidden', !showEta);
    if (showEta) $('eta').textContent = `⏱ ${t('eta', o.eta_s)}`;

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
    if (!confirm(t('cancel_confirm'))) return;
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
    lastOrder = null;
    localStorage.removeItem(STORAGE_KEY);
    $('track-screen').classList.add('hidden');
    $('order-screen').classList.remove('hidden');
    $('checkout').classList.remove('hidden');
    updateCheckout();
  }
  $('new-order-btn').onclick = resetToOrder;

  // ------------------------------------------------------------ live status
  let connected = false;
  function renderAvailability() {
    const pill = $('availability-pill');
    if (!connected || !availability) {
      pill.className = 'pill offline';
      $('availability-text').textContent = t('av_reconnecting');
      return;
    }
    pill.className = `pill ${availability.level}`;
    const short = { ready: t('av_ready'), busy: t('av_busy', availability.orders_ahead), charging: t('av_charging'), offline: t('av_offline') };
    $('availability-text').textContent = short[availability.level] || availability.message;
    const off = $('offline-banner');
    off.classList.toggle('hidden', availability.level !== 'offline');
    off.textContent = availability.level === 'offline' ? t('av_offline_msg') : '';
  }

  Tuni.telemetry(snap => {
    connected = true;
    availability = snap.availability;
    renderAvailability();
    updateCheckout();
  }, isConnected => {
    connected = isConnected;
    if (!isConnected) renderAvailability();
  });

  init();
})();
