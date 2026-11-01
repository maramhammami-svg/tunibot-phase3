/* Admin page: live robot status, battery, queue, map and controls. */
(() => {
  const $ = id => document.getElementById(id);
  const t = I18n.t;
  const map = new FloorMap($('map'));
  window.__floorMap = map;  // used by the browser tests
  let config = null;
  let world = null;
  let lastSnap = null;

  async function loadWorld() {
    const [config, layout] = await Promise.all([Tuni.api('/api/config'), Tuni.api('/api/map/layout')]);
    world = config.world;
    renderStatic(config);
    $('demo-banner').classList.toggle('hidden', config.mode !== 'mock');
    map.setWorld(layout, config.waypoints);
    const sel = $('dispatch-target');
    sel.innerHTML = Object.keys(config.waypoints)
      .map(n => `<option value="${Tuni.escapeHtml(n)}">${Tuni.escapeHtml(n)}</option>`).join('');
  }

  function renderStatic(cfg) {
    config = cfg || config;
    I18n.apply();
    const other = I18n.get() === 'fr' ? 'en' : 'fr';
    $('lang-btn').textContent = other.toUpperCase();
    if (config) $('world-title').textContent = t('a_title', config.title);
  }
  $('lang-btn').onclick = () => {
    I18n.set(I18n.get() === 'fr' ? 'en' : 'fr');
    renderStatic();
    if (lastSnap) render(lastSnap);
  };
  const stateLabel = st => (t('states')[st] || st || t('states').unknown);

  // Tap a table on the map to send the robot there
  map.onTableClick = name => {
    if (confirm(t('a_send_confirm', name))) {
      act('/api/admin/dispatch', { target: name, item: 'Admin dispatch' }, t('a_sent_to', name));
    }
  };

  // ---------------------------------------------------------------- render
  function render(s) {
    lastSnap = s;
    if (world && s.world !== world) loadWorld().catch(() => {});
    map.update(s);

    const robotOnline = s.online.robot;
    $('offline-banner').classList.toggle('hidden', robotOnline || s.mode === 'mock');

    // State
    const st = s.robot_state;
    const stateClass = !robotOnline ? 'offline' : ({ docked: 'ready', idle: 'ready', docking: 'charging', recovering: 'offline' }[st] || 'busy');
    $('state-pill').className = `pill ${stateClass}`;
    $('state-text').textContent = robotOnline ? stateLabel(st) : t('a_offline');

    // Battery
    const b = s.battery || {};
    const pct = typeof b.percentage === 'number' ? b.percentage : null;
    if (pct !== null) {
      const fill = $('gauge-fill');
      fill.style.width = `${pct}%`;
      fill.style.background = b.is_critical ? 'var(--red)' : (b.is_low ? 'var(--amber)' : 'var(--green)');
      $('battery-meter').setAttribute('aria-valuenow', String(pct));
      $('battery-pct').textContent = `${pct.toFixed(1)}%`;
      $('battery-pill-text').textContent = `${pct.toFixed(0)}%${b.is_docked ? ' ⚡' : ''}`;
      $('battery-pill').className = `pill ${b.is_critical ? 'offline' : (b.is_low ? 'charging' : '')}`;
      $('m-voltage').textContent = `${(b.voltage ?? 0).toFixed(2)} V`;
      $('m-current').textContent = `${(b.current_amps ?? 0).toFixed(2)} A ${b.is_docked ? '(in)' : '(out)'}`;
      $('m-power').textContent = `${(b.power_watts ?? 0).toFixed(0)} W`;
      $('m-temp').textContent = `${(b.temperature_c ?? 0).toFixed(1)} °C`;
      const rt = b.estimated_runtime_min;
      $('m-runtime').textContent = b.is_docked ? t('a_charging') : (rt && rt < 999 ? `${Math.floor(rt / 60)} h ${Math.round(rt % 60)} min (${t('a_sim_time')})` : '—');
      const chip = $('battery-status-chip');
      const statusMap = t('a_status');
      const [txt, cls] = statusMap[b.status] || [b.status || '—', ''];
      chip.textContent = txt;
      chip.className = `chip ${cls}`;
    }
    drawSpark(s.battery_history || []);

    // Robot
    const task = s.current_task;
    $('r-task').textContent = task ? `${task.id} → ${task.target} · ${task.item}` : (s.battery_docking_lock ? t('a_recharging') : t('a_none'));
    $('r-pos').textContent = s.pose ? `${s.pose.x.toFixed(2)}, ${s.pose.y.toFixed(2)}` : '—';
    $('r-done').textContent = s.completed_count ?? 0;
    const ob = s.obstacle || {};
    $('r-obstacle').textContent = ob.mode
      ? `${ob.mode}${typeof ob.distance_to_robot === 'number' && ob.distance_to_robot < 50 ? ` · ${t('a_from_robot', ob.distance_to_robot.toFixed(1))}` : ''}${ob.is_blocking ? ` · ${t('a_close')}` : ''}`
      : t('a_not_running');

    const hn = t('a_health_names');
    const health = [
      [hn[0], s.online.battery], [hn[1], s.online.task_manager],
      [hn[2], s.online.localization], [hn[3], s.online.obstacle],
    ];
    $('health').innerHTML = health.map(([n, ok]) => `<li><span class="dot ${ok ? 'on' : 'off'}"></span>${n}</li>`).join('');

    // Queue
    const items = [];
    if (task) items.push({ ...task, active: true });
    for (const p of s.pending_tasks || []) items.push(p);
    $('queue-count').textContent = String(items.length);
    $('queue').innerHTML = items.length ? items.map(q => `
      <li class="${q.active ? 'active' : ''}">
        <div class="q-main">
          <div><span class="q-id">${Tuni.escapeHtml(q.id)}</span> <span class="q-target">${Tuni.escapeHtml(q.target)}</span></div>
          <div class="q-item" title="${Tuni.escapeHtml(q.item)}">${Tuni.escapeHtml(q.item)}</div>
        </div>
        <span class="chip ${q.active ? 'info' : ''}">${q.active ? stateLabel(st) : t('a_queued')}</span>
        <button class="btn small danger" data-cancel="${Tuni.escapeHtml(q.id)}" type="button" aria-label="Cancel ${Tuni.escapeHtml(q.id)}">✕</button>
      </li>`).join('') : `<li class="empty">${t('a_no_orders')}</li>`;
    $('lock-note').classList.toggle('hidden', !s.battery_docking_lock);

    // Buttons that make no sense in the current state
    $('undock-btn').disabled = st !== 'docking';
    $('dock-btn').disabled = st === 'docking' || st === 'docked';

    // Events
    const ev = (s.events || []).slice().reverse();
    $('events').innerHTML = ev.length ? ev.map(e => `
      <li class="${e.level}"><time>${new Date(e.t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
      <span>${Tuni.escapeHtml(I18n.event(e.message))}</span></li>`).join('') : `<li class="empty">${t('a_no_events')}</li>`;
  }

  function drawSpark(hist) {
    const c = $('battery-chart');
    const w = c.clientWidth, h = 70, dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const y = p => h - 4 - (p / 100) * (h - 8);
    ctx.setLineDash([3, 4]);
    for (const [lvl, col] of [[25, 'rgba(245,158,11,.5)'], [15, 'rgba(244,63,94,.5)']]) {
      ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(0, y(lvl)); ctx.lineTo(w, y(lvl)); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (hist.length < 2) return;
    const t0 = hist[0].t, t1 = hist[hist.length - 1].t, span = Math.max(1, t1 - t0);
    ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2;
    ctx.beginPath();
    hist.forEach((pt, i) => { const x = ((pt.t - t0) / span) * w; i ? ctx.lineTo(x, y(pt.pct)) : ctx.moveTo(x, y(pt.pct)); });
    ctx.stroke();
  }

  // ---------------------------------------------------------------- actions
  async function act(path, body, okMsg) {
    try {
      await Tuni.api(path, { method: 'POST', body });
      if (okMsg) Tuni.toast(okMsg, 'success');
    } catch (e) {
      Tuni.toast(e.message, 'error');
    }
  }

  $('dock-btn').onclick = () => act('/api/admin/dock', null, t('a_dock_ok'));
  $('undock-btn').onclick = () => act('/api/admin/dock/cancel', null, t('a_undock_ok'));
  $('kitchen-btn').onclick = () => act('/api/admin/dispatch', { target: 'Kitchen/Pickup', item: 'Pickup at kitchen' }, t('a_kitchen_ok'));
  $('dispatch-btn').onclick = () => {
    const target = $('dispatch-target').value;
    act('/api/admin/dispatch', { target, item: 'Admin dispatch' }, t('a_sent_to', target));
  };
  document.querySelectorAll('[data-battery]').forEach(b => {
    b.onclick = () => act('/api/admin/battery', { percentage: Number(b.dataset.battery) }, t('a_battery_ok', b.dataset.battery));
  });
  document.querySelectorAll('[data-obstacle]').forEach(b => {
    b.onclick = () => act('/api/admin/obstacle', { mode: b.dataset.obstacle }, t('a_ped_ok', b.textContent.trim()));
  });
  $('queue').addEventListener('click', ev => {
    const id = ev.target.closest('[data-cancel]')?.dataset.cancel;
    if (id && confirm(t('a_cancel_q', id))) act(`/api/admin/tasks/${encodeURIComponent(id)}/cancel`, null, t('a_cancelled', id));
  });

  // ---------------------------------------------------------------- start
  renderStatic();
  loadWorld().catch(e => Tuni.toast(e.message, 'error'));
  Tuni.telemetry(render, connected => {
    $('conn-pill').className = `pill ${connected ? 'ready' : 'offline'}`;
    $('conn-text').textContent = connected ? t('a_live') : t('a_reconnecting');
  });
  window.addEventListener('resize', () => lastSnap && drawSpark(lastSnap.battery_history || []));
})();
