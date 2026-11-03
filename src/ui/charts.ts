/**
 * Minimal canvas charts for the dashboard. Rules (dataviz method): one y-axis per chart, 2 px lines,
 * recessive grid, text in text colours, single-series charts are named by their title (no legend),
 * multi-series charts get a legend + direct end labels, every chart supports tap-for-value.
 */
export const VIZ = {
  surface: '#1e2433',
  grid: 'rgba(240,239,236,0.10)',
  axis: '#8d93a8',
  text: '#f0efec',
  textSecondary: '#c3c2b7',
  series: ['#3987e5', '#d95926'],
  status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
};

export interface Series {
  name: string;
  values: number[];
  color?: string;
}

export interface ChartOpts {
  labels: string[];
  series: Series[];
  kind: 'line' | 'bar';
  format: (v: number) => string;
  height?: number;
  zeroBased?: boolean;
}

export function chart(opts: ChartOpts): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const canvas = document.createElement('canvas');
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  wrap.append(canvas, tip);
  const height = opts.height ?? 120;
  let selected = -1;
  const draw = () => {
    const w = wrap.clientWidth || 320;
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);
    const n = opts.labels.length;
    if (n === 0) {
      ctx.fillStyle = VIZ.textSecondary;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Ingen historik ännu – data visas efter första dygnet.', 8, height / 2);
      return;
    }
    const all = opts.series.flatMap((s) => s.values);
    let min = Math.min(...all, opts.zeroBased === false ? Infinity : 0);
    let max = Math.max(...all, 0);
    if (max === min) max = min + 1;
    const pad = { l: 44, r: opts.series.length > 1 ? 64 : 12, t: 10, b: 20 };
    const pw = w - pad.l - pad.r;
    const ph = height - pad.t - pad.b;
    const range = max - min;
    min -= range * 0.05;
    max += range * 0.08;
    const y = (v: number) => pad.t + ph - ((v - min) / (max - min)) * ph;
    const x = (i: number) => pad.l + (n === 1 ? pw / 2 : (i / (n - 1)) * pw);
    // Grid + axis labels (recessive).
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = VIZ.axis;
    ctx.strokeStyle = VIZ.grid;
    ctx.lineWidth = 1;
    for (let k = 0; k <= 3; k++) {
      const v = min + ((max - min) * k) / 3;
      const yy = Math.round(y(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(pad.l + pw, yy);
      ctx.stroke();
      ctx.fillText(opts.format(v), 2, yy + 4);
    }
    if (min < 0 && max > 0) {
      ctx.strokeStyle = 'rgba(240,239,236,0.35)';
      ctx.beginPath();
      ctx.moveTo(pad.l, Math.round(y(0)) + 0.5);
      ctx.lineTo(pad.l + pw, Math.round(y(0)) + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = VIZ.axis;
    const step = Math.max(1, Math.ceil(n / 6));
    for (let i = 0; i < n; i += step) ctx.fillText(opts.labels[i]!, x(i) - 8, height - 5);
    opts.series.forEach((s, si) => {
      const color = s.color ?? VIZ.series[si]!;
      if (opts.kind === 'bar') {
        const bw = Math.max(2, Math.min(18, pw / n / opts.series.length - 2));
        s.values.forEach((v, i) => {
          const bx = x(i) - (bw * opts.series.length) / 2 + si * (bw + 2);
          const y0 = y(0);
          const y1 = y(v);
          ctx.fillStyle = color;
          const top = Math.min(y0, y1);
          const hh = Math.max(1, Math.abs(y1 - y0));
          ctx.beginPath();
          const r = Math.min(4, bw / 2, hh);
          if (v >= 0) ctx.roundRect(bx, top, bw, hh, [r, r, 0, 0]);
          else ctx.roundRect(bx, top, bw, hh, [0, 0, r, r]);
          ctx.fill();
        });
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        s.values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
        ctx.stroke();
        if (n <= 14) for (let i = 0; i < n; i++) {
          ctx.fillStyle = VIZ.surface;
          ctx.beginPath();
          ctx.arc(x(i), y(s.values[i]!), 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x(i), y(s.values[i]!), 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Direct end label for multi-series charts (text in text colour, marker carries identity).
      if (opts.series.length > 1) {
        const last = s.values[s.values.length - 1] ?? 0;
        const ly = Math.max(pad.t + 8, Math.min(pad.t + ph, y(last) + 4 + si * 2));
        ctx.fillStyle = color;
        ctx.fillRect(pad.l + pw + 6, ly - 7, 8, 8);
        ctx.fillStyle = VIZ.text;
        ctx.fillText(s.name, pad.l + pw + 17, ly);
      }
    });
    if (selected >= 0 && selected < n) {
      ctx.strokeStyle = 'rgba(240,239,236,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x(selected)) + 0.5, pad.t);
      ctx.lineTo(Math.round(x(selected)) + 0.5, pad.t + ph);
      ctx.stroke();
    }
  };
  const pick = (clientX: number) => {
    const r = canvas.getBoundingClientRect();
    const n = opts.labels.length;
    if (n === 0) return;
    const pw = r.width - 44 - (opts.series.length > 1 ? 64 : 12);
    const i = Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left - 44) / pw) * (n - 1))));
    selected = i;
    tip.replaceChildren();
    const head = document.createElement('b');
    head.textContent = opts.labels[i]!;
    tip.append(head);
    for (const [si, s] of opts.series.entries()) {
      const row = document.createElement('div');
      const sw = document.createElement('i');
      sw.style.background = s.color ?? VIZ.series[si]!;
      row.append(sw, document.createTextNode(`${s.name}: ${opts.format(s.values[i] ?? 0)}`));
      tip.append(row);
    }
    tip.style.display = 'block';
    draw();
  };
  canvas.addEventListener('pointerdown', (e) => pick(e.clientX));
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons || e.pointerType === 'mouse') pick(e.clientX);
  });
  canvas.addEventListener('pointerleave', () => {
    tip.style.display = 'none';
    selected = -1;
    draw();
  });
  requestAnimationFrame(draw);
  if (opts.series.length > 1) {
    const legend = document.createElement('div');
    legend.className = 'legend';
    opts.series.forEach((s, si) => {
      const item = document.createElement('span');
      const sw = document.createElement('i');
      sw.style.background = s.color ?? VIZ.series[si]!;
      item.append(sw, document.createTextNode(s.name));
      legend.append(item);
    });
    wrap.prepend(legend);
  }
  return wrap;
}

/** Horizontal meter (0–100) with a text value; status colour never alone (value + label shown). */
export function meter(value: number, max = 100, tone: 'auto' | 'neutral' = 'auto', invert = false): HTMLElement {
  const el = document.createElement('div');
  el.className = 'meter';
  const fill = document.createElement('span');
  const pct = Math.max(0, Math.min(1, value / max));
  fill.style.width = `${Math.round(pct * 100)}%`;
  const q = invert ? 1 - pct : pct;
  fill.style.background = tone === 'neutral' ? VIZ.series[0]! : q > 0.6 ? VIZ.status.good : q > 0.3 ? VIZ.status.warning : VIZ.status.critical;
  el.append(fill);
  return el;
}
