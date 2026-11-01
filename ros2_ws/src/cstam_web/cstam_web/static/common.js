/* Shared helpers for the client and admin pages. */
const Tuni = (() => {
  async function api(path, options = {}) {
    const opts = { headers: { 'Content-Type': 'application/json' }, ...options };
    if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    let res;
    try {
      res = await fetch(path, opts);
    } catch (e) {
      throw new Error('Cannot reach the server. Check the Wi-Fi connection.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      let detail = data && data.detail;
      if (Array.isArray(detail)) detail = detail.map(d => d.msg).join(', ');
      throw new Error(detail || `Request failed (${res.status})`);
    }
    return data;
  }

  function toast(message, kind = '') {
    let box = document.querySelector('.toasts');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = message;
    box.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  /** Opens /ws/telemetry, reconnects automatically, calls onData(snapshot) and onConn(bool). */
  function telemetry(onData, onConn) {
    let ws;
    let retry = 1000;
    function connect() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws/telemetry`);
      ws.onopen = () => { retry = 1000; onConn && onConn(true); };
      ws.onmessage = ev => { try { onData(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
      ws.onclose = () => {
        onConn && onConn(false);
        setTimeout(connect, retry);
        retry = Math.min(retry * 1.6, 8000);
      };
    }
    connect();
  }

  const STATE_LABELS = {
    idle: 'Idle · ready',
    navigating: 'Delivering',
    at_table: 'At the table',
    recovering: 'Recovering',
    docking: 'Returning to dock',
    docked: 'Docked',
    unknown: 'Unknown',
  };

  function stateLabel(s) { return STATE_LABELS[s] || s || 'Unknown'; }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { api, toast, telemetry, stateLabel, escapeHtml };
})();
