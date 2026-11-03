/** Tiny DOM helper. All text goes through textContent – user/save data is never interpreted as HTML. */
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: string; onclick?: (e: MouseEvent) => void };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function icon(name: string, small = false): HTMLSpanElement {
  return h('span', { class: `ico ${small ? 's1 ' : ''}i-${name}`, 'aria-hidden': 'true' });
}

export function kr(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}${Math.abs(Math.round(n)).toLocaleString('sv-SE').replace(/\u00a0/g, ' ')} kr`;
}

export function num(n: number, d = 0): string {
  return n.toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\u00a0/g, ' ');
}

export function clockText(minuteOfDay: number): string {
  const m = Math.floor(minuteOfDay);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function replace(el: Element, ...children: (Child | Child[])[]): void {
  el.replaceChildren(...children.flat().filter((c): c is Node | string => c !== null && c !== undefined && c !== false).map((c) => (c instanceof Node ? c : String(c))));
}
