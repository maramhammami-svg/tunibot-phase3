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
  // Floor plans: pick a table, then watch the robot drive to it
  const lightPlan = document.body.classList.contains('theme-nabeul') ? FLOOR_MAP_NABEUL : null;
  const plan = new FloorMap($('plan'), lightPlan);
  plan.maxHeight = 360;
  plan.minTablePx = 15;
  window.__plan = plan;  // used by the browser tests
  const trackPlan = new FloorMap($('track-plan'), lightPlan);
  trackPlan.maxHeight = 320;
  trackPlan.minTablePx = 12;
  plan.onTableClick = name => {
    if (!config || !config.tables.some(tb => tb.id === name)) return;
    table = name; tableLocked = false; renderTables(); updateCheckout();
  };

  // ------------------------------------------------------------ setup
  // Line icons in place of emoji
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = Icons.svg(el.dataset.icon); });
  $('brand-logo').innerHTML = Icons.svg('robot');
  $('hero-robot').innerHTML = Icons.svg('robot', 'ico hero-ico');

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
    Tuni.api('/api/map/layout').then(layout => {
      plan.setWorld(layout, config.waypoints);
      trackPlan.setWorld(layout, config.waypoints);
    }).catch(() => $('plan-wrap').classList.add('hidden'));

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
    $('hero-title').textContent = t('hero_welcome', config.menu.title || config.title);
    $('venue-sub').textContent = I18n.field(config.menu, 'subtitle') || t('order_from_table');
    renderTables();
    renderMenu();
    renderCatTabs();
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
    plan.selectedTable = table;
    trackPlan.selectedTable = table;
    $('plan-wrap').classList.toggle('hidden', !showGrid);
    $('grid-label').classList.toggle('hidden', !showGrid);
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
    const cats = config.menu.categories;
    const catName = c => I18n.field(c, 'name') || catNames[c.name] || c.name;
    root.classList.add('menu-book');
    for (const cat of cats) {
      const idx = cats.indexOf(cat);
      const sec = document.createElement('div');
      sec.className = `menu-cat page${idx === bookPage ? ' current' : ''}`;
      sec.id = `cat-${idx}`;
      sec.dataset.page = idx;
      sec.innerHTML = `<header class="page-head"><h3>${Tuni.escapeHtml(catName(cat))}</h3><span class="page-orn" aria-hidden="true"></span></header>`;
      for (const it of cat.items) {
        menuIndex[it.id] = it;
        const row = document.createElement('div');
        row.className = 'menu-item';
        row.dataset.id = it.id;
        row.innerHTML = `
          <div class="menu-emoji" aria-hidden="true">${Dishes.svg(it.id)}</div>
          <div class="menu-text">
            <div class="menu-name">${Tuni.escapeHtml(it.name)}</div>
            <div class="menu-desc">${Tuni.escapeHtml(I18n.field(it, 'desc'))}</div>
          </div>
          <div class="qty">
            <button type="button" class="minus" aria-label="${Tuni.escapeHtml(t('remove_one', it.name))}">−</button>
            <span aria-live="polite">0</span>
            <button type="button" class="add" aria-label="${Tuni.escapeHtml(t('add_one', it.name))}">+</button>
          </div>`;
        row.querySelector('.add').onclick = () => { flyToTray(row.querySelector('.menu-emoji')); changeQty(it.id, +1); };
        row.querySelector('.minus').onclick = () => changeQty(it.id, -1);
        sec.appendChild(row);
      }
      const next = (idx + 1) % cats.length;
      const foot = document.createElement('footer');
      foot.className = 'page-foot';
      foot.innerHTML = `<span class="page-no">${idx + 1} / ${cats.length}</span>
        <button type="button" class="page-turn">${Tuni.escapeHtml(idx + 1 < cats.length ? t('page_next', catName(cats[next])) : t('page_first', catName(cats[0])))}</button>`;
      foot.querySelector('.page-turn').onclick = () => goToPage(next, true);
      sec.appendChild(foot);
      root.appendChild(sec);
    }
    refreshQty();
  }

  // ---- Menu book: one category per page, pages turn like a real menu
  let bookPage = 0;
  let turning = null;
  function goToPage(i, scroll) {
    const cats = config.menu.categories;
    i = Math.max(0, Math.min(cats.length - 1, i));
    const book = $('menu');
    if (i === bookPage) return;
    const from = $(`cat-${bookPage}`), to = $(`cat-${i}`);
    const forward = i > bookPage;
    bookPage = i;
    highlightCat();
    if (turning) { clearTimeout(turning.t); turning.done(); }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    book.querySelectorAll('.page').forEach(p => p.classList.remove('current', 'turn-out', 'turn-in', 'under'));
    to.classList.add('current');
    if (!reduce && from) {
      from.classList.add(forward ? 'turn-out' : 'under');
      if (!forward) to.classList.add('turn-in');
      const done = () => { from.classList.remove('turn-out', 'under'); to.classList.remove('turn-in'); turning = null; };
      turning = { done, t: setTimeout(done, 650) };
    }
    if (scroll) {
      const nav = $('cat-tabs');
      const y = nav.getBoundingClientRect().top + window.scrollY - 70;
      if (window.scrollY > y) window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    }
  }
  // Swipe left / right on the book to turn pages
  (() => {
    let x0 = null, y0 = null;
    $('menu').addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    $('menu').addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goToPage(bookPage + (dx < 0 ? 1 : -1));
    }, { passive: true });
  })();

  function renderCatTabs() {
    const nav = $('cat-tabs');
    const catNames = t('cat');
    nav.innerHTML = config.menu.categories.map((cat, i) =>
      `<button type="button" class="cat-tab" data-cat="${i}">${Tuni.escapeHtml(I18n.field(cat, 'name') || catNames[cat.name] || cat.name)}<span class="cat-count" id="cat-count-${i}"></span></button>`).join('');
    nav.querySelectorAll('.cat-tab').forEach(b => {
      b.onclick = () => goToPage(Number(b.dataset.cat));
    });
    highlightCat();
  }

  function highlightCat() {
    const nav = $('cat-tabs');
    if (!config || !nav.children.length) return;
    const active = bookPage;
    nav.querySelectorAll('.cat-tab').forEach(b => b.classList.toggle('active', Number(b.dataset.cat) === active));
  }

  function changeQty(id, delta) {
    cart[id] = Math.max(0, Math.min(9, (cart[id] || 0) + delta));
    if (!cart[id]) delete cart[id];
    refreshQty();
    updateCheckout();
  }

  // A copy of the dish plate slides down to the order tray when you add it
  function flyToTray(from) {
    const to = $('checkout-count');
    if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const ghost = from.cloneNode(true);
    ghost.classList.add('fly-ghost');
    Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.appendChild(ghost);
    const dx = b.left + 10 - a.left, dy = b.top - a.top - 6;
    ghost.animate([
      { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.35}px) scale(.8) rotate(-20deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(.35) rotate(-40deg)`, opacity: 0.2 },
    ], { duration: 560, easing: 'cubic-bezier(.5,0,.3,1)' }).onfinish = () => {
      ghost.remove();
      $('checkout').classList.remove('tray-bump'); void $('checkout').offsetWidth; $('checkout').classList.add('tray-bump');
    };
  }

  function refreshQty() {
    if (config) {
      config.menu.categories.forEach((cat, i) => {
        const n = cat.items.reduce((a, it) => a + (cart[it.id] || 0), 0);
        const el = $(`cat-count-${i}`);
        if (el) el.textContent = n ? String(n) : '';
      });
    }
    document.querySelectorAll('.menu-item').forEach(row => {
      const q = cart[row.dataset.id] || 0;
      const qEl = row.querySelector('.qty span');
      if (qEl.textContent !== String(q)) {
        qEl.textContent = q;
        qEl.classList.remove('bump'); void qEl.offsetWidth; qEl.classList.add('bump');
      }
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
  // The language you SPEAK is chosen separately from the page language
  // (French by default): an English page with French speech gave nonsense.
  const SPEECH_LANGS = { fr: 'fr-FR', en: 'en-US', ar: 'ar-TN' };  // ar = Tunisian Darija
  let voiceLang = localStorage.getItem('tunibot_voice_lang') || 'fr';
  if (!SPEECH_LANGS[voiceLang]) voiceLang = 'fr';
  function renderVoiceLang() {
    document.querySelectorAll('[data-voice-lang]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.voiceLang === voiceLang));
    });
  }
  document.querySelectorAll('[data-voice-lang]').forEach(b => {
    b.onclick = () => {
      voiceLang = b.dataset.voiceLang;
      localStorage.setItem('tunibot_voice_lang', voiceLang);
      renderVoiceLang();
      if (recognizing) recognition.abort();
    };
  });
  renderVoiceLang();

  function setVoiceStatus(state) {
    voiceState = state;
    const msg = { listening: 'voice_listening', idle: SR ? 'voice_idle' : 'voice_unsupported', denied: 'voice_denied',
                  nothing: 'voice_nothing', nomic: 'voice_nomic', network: 'voice_network' }[state];
    $('voice-status').textContent = t(msg || 'voice_idle');
    $('mic-dot').classList.toggle('on', state === 'listening');
    $('mic-fab').classList.toggle('listening', state === 'listening');
  }

  const SILENCE_MS = 2500;   // stop listening after this much silence once something was heard
  const MAX_LISTEN_MS = 15000;

  function startListening() {
    if (!SR) { setVoiceStatus('idle'); $('voice-input').focus(); return; }
    if (recognizing) { recognition.stop(); return; }
    recognition = new SR();
    recognition.lang = SPEECH_LANGS[voiceLang];
    recognition.continuous = true;      // do not cut the sentence at the first short pause
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;    // the server keeps the guess that best fits the menu
    const finals = [];                  // one entry per final segment: [best, alt2, ...]
    let silenceTimer = null;
    let hardStop = null;
    const armSilence = () => {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => recognition.stop(), SILENCE_MS);
    };
    recognition.onstart = () => {
      recognizing = true;
      setVoiceStatus('listening');
      hardStop = setTimeout(() => recognition.stop(), MAX_LISTEN_MS);
    };
    recognition.onresult = ev => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finals.push(Array.from(r).map(a => a.transcript.trim()));
        else interim += r[0].transcript;
      }
      showHeard([...finals.map(f => f[0]), interim].join(' ').trim());
      armSilence();
    };
    recognition.onerror = ev => {
      const map = { 'not-allowed': 'denied', 'service-not-allowed': 'denied', 'no-speech': 'nothing',
                    'audio-capture': 'nomic', network: 'network' };
      if (map[ev.error]) setVoiceStatus(map[ev.error]);
    };
    recognition.onend = () => {
      recognizing = false;
      clearTimeout(silenceTimer);
      clearTimeout(hardStop);
      if (voiceState === 'listening') setVoiceStatus('idle');
      if (!finals.length) return;
      const best = finals.map(f => f[0]).join(' ').trim();
      // Alternatives: swap one segment at a time for its other guesses
      const alts = [];
      finals.forEach((f, i) => f.slice(1).forEach(alt => {
        alts.push(finals.map((g, j) => (j === i ? alt : g[0])).join(' ').trim());
      }));
      understand(best, alts.slice(0, 5));
    };
    recognition.start();
  }

  function showHeard(text) {
    $('voice-heard').classList.toggle('hidden', !text);
    $('voice-heard').textContent = text ? t('voice_heard', text) : '';
  }

  async function understand(text, alternatives = []) {
    showHeard(text);
    try {
      const res = await Tuni.api('/api/voice/parse', { method: 'POST', body: { text, alternatives, lang: voiceLang } });
      if (res.text && res.text !== text) showHeard(res.text);
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
    // Open the book on the page of the first dish heard
    const first = res.items.find(it => menuIndex[it.id]);
    if (first) goToPage(config.menu.categories.findIndex(c => c.items.some(x => x.id === first.id)));
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
      // Dish names are French, so a Darija order is read back in French
      const sayLang = voiceLang === 'ar' ? 'fr' : voiceLang;
      const u = new SpeechSynthesisUtterance(I18n.tIn(sayLang, 'voice_say_ok', list, res.table));
      u.lang = SPEECH_LANGS[sayLang];
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
  $('mic-fab').onclick = () => {
    $('voice-btn').click();
    $('voice-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  $('voice-form').onsubmit = ev => {
    ev.preventDefault();
    const text = $('voice-input').value.trim();
    if (!text) return;
    $('voice-input').value = '';
    understand(text);
  };

  // ------------------------------------------------------------ review sheet
  function openReview() {
    renderReview();
    $('review-backdrop').classList.remove('hidden');
    $('review-sheet').classList.remove('hidden');
    $('review-confirm').focus();
  }
  function closeReview() {
    $('review-backdrop').classList.add('hidden');
    $('review-sheet').classList.add('hidden');
  }
  function renderReview() {
    const ids = Object.keys(cart);
    if (!ids.length) { closeReview(); return; }
    $('review-table').innerHTML = `${Icons.svg('plate', 'ico inline')} <strong>${Tuni.escapeHtml(table)}</strong>`;
    $('review-items').innerHTML = ids.map(id => {
      const it = menuIndex[id];
      return `<li data-id="${Tuni.escapeHtml(id)}">
        <span class="menu-emoji small" aria-hidden="true">${Dishes.svg(it.id)}</span>
        <span class="review-name">${Tuni.escapeHtml(it.name)}</span>
        <span class="qty">
          <button type="button" class="minus" aria-label="${Tuni.escapeHtml(t('remove_one', it.name))}">−</button>
          <span>${cart[id]}</span>
          <button type="button" class="add" aria-label="${Tuni.escapeHtml(t('add_one', it.name))}">+</button>
        </span></li>`;
    }).join('');
    $('review-items').querySelectorAll('li').forEach(li => {
      li.querySelector('.add').onclick = () => { changeQty(li.dataset.id, +1); renderReview(); };
      li.querySelector('.minus').onclick = () => { changeQty(li.dataset.id, -1); renderReview(); };
    });
    const note = $('note-input').value.trim();
    $('review-note').classList.toggle('hidden', !note);
    $('review-note').textContent = note ? `« ${note} »` : '';
    const ahead = availability ? availability.orders_ahead : 0;
    $('review-eta').textContent = availability && availability.level === 'charging' ? availabilityMessage()
      : (ahead > 0 ? t('hint_ahead', ahead) : t('review_ready'));
    const count = Object.values(cart).reduce((a, b) => a + b, 0);
    $('review-confirm').textContent = t('review_confirm', count);
    $('review-confirm').disabled = availability && !availability.accepting;
  }
  $('review-back').onclick = closeReview;
  $('review-backdrop').onclick = closeReview;
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeReview(); });

  // ------------------------------------------------------------ ordering
  $('order-btn').onclick = openReview;
  $('review-confirm').onclick = async () => {
    const btn = $('review-confirm');
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
      closeReview();
      showTracking(res.order);
    } catch (e) {
      Tuni.toast(e.message, 'error');
      renderReview();
    } finally {
      updateCheckout();
    }
  };

  // ------------------------------------------------------------ tracking
  const VIEW = {
    submitted: { icon: 'receipt', step: 'received' },
    queued: { icon: 'hourglass', step: 'queued' },
    en_route: { icon: 'robot', step: 'en_route', bounce: true },
    arrived: { icon: 'tray', step: 'arrived', bounce: true },
    delivered: { icon: 'check', step: 'done' },
    cancelled: { icon: 'cross', step: null },
    failed: { icon: 'alert', step: null },
    rejected: { icon: 'alert', step: null },
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
    trackPlan.selectedTable = o.target;
    const status = VIEW[o.status] ? o.status : 'submitted';
    const v = VIEW[status];
    const [title, defaultSub] = t(`st_${status}`);
    $('track-emoji').innerHTML = Icons.svg(v.icon, 'ico big');
    $('track-emoji').dataset.status = status;
    $('track-waiter').dataset.status = status;
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
    if (showEta) $('eta').innerHTML = `${Icons.svg('hourglass', 'ico inline')} ${Tuni.escapeHtml(t('eta', o.eta_s))}`;

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
    plan.update(snap);
    trackPlan.update(snap);
    availability = snap.availability;
    renderAvailability();
    updateCheckout();
  }, isConnected => {
    connected = isConnected;
    if (!isConnected) renderAvailability();
  });

  init();
})();
