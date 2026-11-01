/* Floor map renderer: walls, tables, stations, Nav2 plan, robot pose and the simulated pedestrian. */
const FLOOR_MAP_DARK = {
  bg: '#0d1320', wall: '#26324a',
  table: '#3a2e22', tableEdge: '#8c6b3e', tableText: '#e9c98f',
  active: 'rgba(56,189,248,0.35)', activeEdge: '#38bdf8', activeText: '#e0f2fe',
  selected: 'rgba(212,160,75,0.45)', selectedEdge: '#f3c273', selectedText: '#fff7e6',
  robot: '#38bdf8', robotBody: '#0f172a', path: 'rgba(56,189,248,0.85)', trail: '56,189,248',
  dock: '#10b981', kitchen: '#60a5fa', font: 'Inter, sans-serif',
};

class FloorMap {
  constructor(canvas, palette) {
    this.canvas = canvas;
    this.pal = Object.assign({}, FLOOR_MAP_DARK, palette || {});
    this.selectedTable = null;
    this.maxHeight = 640;
    this.minTablePx = 0;  // client page: bigger tap targets
    this.ctx = canvas.getContext('2d');
    this.layout = { walls: [], tables: [] };
    this.waypoints = {};
    this.snap = null;
    this.trail = [];
    this.bounds = { minX: -10, maxX: 10, minY: -10, maxY: 10 };
    this.onTableClick = null;
    this.hoverTable = null;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    canvas.addEventListener('click', ev => {
      const name = this.tableAt(ev);
      if (name && this.onTableClick) this.onTableClick(name);
    });
    canvas.addEventListener('mousemove', ev => {
      this.hoverTable = this.onTableClick ? this.tableAt(ev) : null;
      canvas.style.cursor = this.hoverTable ? 'pointer' : 'default';
    });
    canvas.addEventListener('mouseleave', () => { this.hoverTable = null; });
    this.resize();
    const loop = () => { this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  setWorld(layout, waypoints) {
    this.layout = layout || { walls: [], tables: [] };
    this.waypoints = waypoints || {};
    const xs = [], ys = [];
    for (const w of this.layout.walls || []) {
      // Axis-aligned half extents of the (possibly rotated) box
      const cs = Math.abs(Math.cos(w.yaw || 0)), sn = Math.abs(Math.sin(w.yaw || 0));
      const hx = (cs * (w.sx || 0) + sn * (w.sy || 0)) / 2, hy = (sn * (w.sx || 0) + cs * (w.sy || 0)) / 2;
      xs.push(w.x - hx, w.x + hx); ys.push(w.y - hy, w.y + hy);
    }
    for (const t of this.layout.tables || []) { xs.push(t.x); ys.push(t.y); }
    for (const wp of Object.values(this.waypoints)) { xs.push(wp.x); ys.push(wp.y); }
    if (xs.length) {
      this.bounds = { minX: Math.min(...xs) - 0.6, maxX: Math.max(...xs) + 0.6, minY: Math.min(...ys) - 0.6, maxY: Math.max(...ys) + 0.6 };
    }
    this.resize();
  }

  update(snap) {
    this.snap = snap;
    if (snap && snap.pose) {
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(last.x - snap.pose.x, last.y - snap.pose.y) > 0.08) {
        this.trail.push({ x: snap.pose.x, y: snap.pose.y });
        if (this.trail.length > 80) this.trail.shift();
      }
    }
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth;
    const b = this.bounds;
    const aspect = (b.maxY - b.minY) / (b.maxX - b.minX || 1);
    const h = Math.min(Math.max(200, w * aspect), this.maxHeight);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
    const sx = w / (b.maxX - b.minX), sy = h / (b.maxY - b.minY);
    this.scale = Math.min(sx, sy);
    this.ox = (w - (b.maxX - b.minX) * this.scale) / 2;
    this.oy = (h - (b.maxY - b.minY) * this.scale) / 2;
  }

  /** Name of the table waypoint under the pointer (within ~0.8 m), or null. */
  tableAt(ev) {
    const r = this.canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const wx = this.bounds.minX + (mx - this.ox) / this.scale;
    const wy = this.bounds.maxY - (my - this.oy) / this.scale;
    let best = null, bestD = Math.max(0.8, 16 / this.scale);
    for (const [name, wp] of Object.entries(this.waypoints)) {
      if (!name.toLowerCase().startsWith('table')) continue;
      const d = Math.hypot(wp.x - wx, wp.y - wy);
      if (d < bestD) { best = name; bestD = d; }
    }
    if (best) return best;
    // Also accept a click on the table furniture itself
    for (const tb of this.layout.tables || []) {
      const name = tb.label || (tb.model ? `Table ${tb.model.replace('table_', '')}` : '');
      if (this.waypoints[name] && Math.hypot(tb.x - wx, tb.y - wy) < Math.max(0.7, 14 / this.scale)) return name;
    }
    return null;
  }

  px(x, y) {
    return { x: this.ox + (x - this.bounds.minX) * this.scale, y: this.oy + (this.bounds.maxY - y) * this.scale };
  }

  draw() {
    const c = this.ctx, s = this.scale;
    if (!s) return;
    c.clearRect(0, 0, this.w, this.h);
    const P = this.pal;
    c.fillStyle = P.bg;
    c.fillRect(0, 0, this.w, this.h);

    const snap = this.snap || {};
    const target = snap.current_task ? snap.current_task.target : null;

    // Walls & fixed furniture
    for (const wl of this.layout.walls || []) {
      const p = this.px(wl.x, wl.y);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(-(wl.yaw || 0));
      c.fillStyle = P.wall;
      if (wl.is_cylinder) {
        c.beginPath(); c.arc(0, 0, Math.max(2, (wl.radius || 0.2) * s), 0, Math.PI * 2); c.fill();
      } else {
        c.fillRect(-(wl.sx * s) / 2, -(wl.sy * s) / 2, Math.max(2, wl.sx * s), Math.max(2, wl.sy * s));
      }
      c.restore();
    }

    // Tables
    for (const t of this.layout.tables || []) {
      const name = t.label || (t.model ? `Table ${t.model.replace('table_', '')}` : '');
      const p = this.px(t.x, t.y);
      const sel = name === this.selectedTable;
      const active = !sel && (name === target || name === this.hoverTable);
      c.fillStyle = sel ? P.selected : (active ? P.active : P.table);
      c.strokeStyle = sel ? P.selectedEdge : (active ? P.activeEdge : P.tableEdge);
      c.lineWidth = sel ? 3 : (active ? 2 : 1);
      c.beginPath();
      const m = this.minTablePx;
      if (t.radius) c.arc(p.x, p.y, Math.max(t.radius * s, m), 0, Math.PI * 2);
      else c.rect(p.x - Math.max(t.sx * s, 2 * m) / 2, p.y - Math.max(t.sy * s, 2 * m) / 2, Math.max(t.sx * s, 2 * m), Math.max(t.sy * s, 2 * m));
      c.fill(); c.stroke();
      c.fillStyle = sel ? P.selectedText : (active ? P.activeText : P.tableText);
      c.font = `700 ${Math.max(9, Math.min(13, s * 0.38))}px ${P.font}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(name.replace('Table ', 'T'), p.x, p.y);
    }

    // Stations
    for (const [name, wp] of Object.entries(this.waypoints)) {
      if (name.toLowerCase().startsWith('table')) continue;
      const p = this.px(wp.x, wp.y);
      const isDock = name === 'Dock';
      c.globalAlpha = 0.25; c.fillStyle = isDock ? P.dock : P.kitchen;
      c.lineWidth = 1.5;
      const r = Math.max(8, 0.45 * s);
      c.beginPath(); c.roundRect(p.x - r, p.y - r, 2 * r, 2 * r, 5); c.fill(); c.globalAlpha = 1;
      c.strokeStyle = isDock ? P.dock : P.kitchen; c.stroke();
      c.fillStyle = isDock ? P.dock : P.kitchen;
      c.font = `700 11px ${P.font}`;
      c.textAlign = 'center'; c.textBaseline = 'bottom';
      const tr = (k, d) => (typeof I18n !== 'undefined' ? I18n.t(k) : d);
      c.fillText(isDock ? `⚡ ${tr('a_dock_name', 'Dock')}` : `🍳 ${tr('a_kitchen_name', 'Kitchen')}`, p.x, p.y - r - 3);
    }

    // Trail
    this.trail.forEach((pt, i) => {
      const p = this.px(pt.x, pt.y);
      c.fillStyle = `rgba(${P.trail},${(i / this.trail.length) * 0.4})`;
      c.beginPath(); c.arc(p.x, p.y, 2, 0, Math.PI * 2); c.fill();
    });

    // Planned path
    if (snap.plan && snap.plan.length > 1) {
      c.strokeStyle = P.path;
      c.lineWidth = 2;
      c.setLineDash([6, 5]);
      c.beginPath();
      snap.plan.forEach((pt, i) => { const p = this.px(pt.x, pt.y); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); });
      c.stroke();
      c.setLineDash([]);
    }

    // Pedestrian (dynamic obstacle)
    const ob = snap.obstacle;
    if (ob && typeof ob.x === 'number' && ob.mode && ob.mode !== 'clear') {
      const p = this.px(ob.x, ob.y);
      c.fillStyle = ob.is_blocking ? 'rgba(244,63,94,0.18)' : 'rgba(245,158,11,0.15)';
      c.beginPath(); c.arc(p.x, p.y, 1.2 * s, 0, Math.PI * 2); c.fill();
      c.fillStyle = ob.is_blocking ? '#f43f5e' : '#f59e0b';
      c.beginPath(); c.arc(p.x, p.y, Math.max(5, 0.25 * s), 0, Math.PI * 2); c.fill();
    }

    // Robot
    if (snap.pose) {
      const p = this.px(snap.pose.x, snap.pose.y);
      const st = snap.robot_state;
      const color = st === 'recovering' ? '#f43f5e' : (st === 'docked' ? P.dock : P.robot);
      const r = Math.max(7, 0.3 * s);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(-snap.pose.yaw);
      c.fillStyle = `rgba(${P.trail},0.15)`;
      c.beginPath(); c.moveTo(r, -r * 0.5); c.lineTo(r * 3, -r * 1.4); c.lineTo(r * 3, r * 1.4); c.lineTo(r, r * 0.5); c.fill();
      c.fillStyle = P.robotBody; c.strokeStyle = color; c.lineWidth = 2.5;
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.strokeStyle = color; c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 1.3, 0); c.stroke();
      c.restore();
    }
  }
}
