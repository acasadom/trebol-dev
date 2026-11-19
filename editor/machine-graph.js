// <tb-machine-graph>: the designer's drawing of a machine. ELK lays it out (layered, left to right) in a worker,
// started the first time a drawing is made; the drawing is SVG, coloured by the theme (--tb-*).
// It is laid out both left to right and top to bottom, and drawn the way that fits its place better, made
// smaller to fit down to 80%; a bigger one scrolls.
// A state is a rounded box; a state with states inside is a box around them, its name on top; a parallel
// state's box is dashed, each region a box inside it; a final state has a double border. A black dot points
// at the initial state of each level. Ways are arrows, labelled with their events.
// Properties:
//   graph     {name, nodes: [{id, name, kind, parent, initial}], ways: [{id, from, to: [id...], label}]}
//             kind is machine, state, final or parallel; parent is the id of the node it is in (none for the machine)
//   selected  the id of what is chosen (a node or a way), or none
//   active    ids of the states the machine is in, lit (the Try mode)
// Events: `pick` with detail = the id of what the person clicked (the machine's id for empty room);
// `connect` with detail = [from to], the ids of two states, when the person drags from a state's edge onto another.
// Built into app/machine-graph.js by `npm run build:graph`, with ELK's worker copied to app/elk-worker.js.
import ELK from 'elkjs/lib/elk-api.js';

const NS = 'http://www.w3.org/2000/svg';
const EDGE = 8;           // how close to a state's border a drag makes a new way
const HEAD = 26;          // the room on top of a box for its name
const FONT = '13px Inter, system-ui, sans-serif';
const SMALLEST = 0.8;     // how much a drawing may shrink to fit its place

let elk = null;
function layouter() {
  elk ??= new ELK({ workerUrl: new URL('elk-worker.js', import.meta.url).href });
  return elk;
}

let measurer = null;
function textWidth(s, font = FONT) {
  measurer ??= document.createElement('canvas').getContext('2d');
  measurer.font = font;
  return Math.ceil(measurer.measureText(s).width);
}

const css = `
:host { display: block; position: relative; overflow: auto; min-height: 120px; }
svg { display: block; margin: auto; font: ${FONT}; user-select: none; touch-action: none; }
.box { fill: var(--tb-surface, #fff); stroke: var(--tb-border-strong, #a8a29e); stroke-width: 1.25; }
.group > .box { fill: color-mix(in oklch, var(--tb-text, #1c1c1c) 3%, var(--tb-surface, #fff)); }
.parallel > .box { stroke-dasharray: 5 4; fill: none; }
.machine > .box { fill: none; stroke: none; }
.inner { fill: none; stroke: var(--tb-border-strong, #a8a29e); stroke-width: 1.25; }
.name { fill: var(--tb-text, #1c1c1c); dominant-baseline: central; }
.group > .name, .parallel > .name { font-weight: 600; font-size: 12px; fill: var(--tb-muted, #6b7280); }
.node { cursor: pointer; outline: none; }
.node.edge { cursor: crosshair; }
.node:focus-visible > .box { stroke: var(--tb-focus, var(--tb-primary, #2563eb)); stroke-width: 2.5; }
.node.active > .box { fill: color-mix(in oklch, var(--tb-success, #16a34a) 18%, var(--tb-surface, #fff)); stroke: var(--tb-success, #16a34a); }
.node.selected > .box, .node.selected > .inner { stroke: var(--tb-primary, #2563eb); stroke-width: 2.25; }
.node.selected > .box { fill: var(--tb-primary-soft, #eef3ff); }
.node.target > .box { stroke: var(--tb-primary, #2563eb); stroke-width: 2.25; stroke-dasharray: none; }
.dot { fill: var(--tb-text, #1c1c1c); }
.way { cursor: pointer; }
.way path.line { fill: none; stroke: var(--tb-muted, #78716c); stroke-width: 1.5; }
.way path.hit { fill: none; stroke: transparent; stroke-width: 12; }
.way .label { fill: var(--tb-muted, #57534e); font-size: 12px; dominant-baseline: central; }
.way .label-bg { fill: var(--tb-bg, #fff); opacity: .85; }
.way.selected path.line { stroke: var(--tb-primary, #2563eb); stroke-width: 2.25; }
.way.selected .label { fill: var(--tb-primary, #2563eb); font-weight: 600; }
.way:hover path.line { stroke: var(--tb-text, #1c1c1c); }
.head { fill: var(--tb-muted, #78716c); }
.way.selected .head { fill: var(--tb-primary, #2563eb); }
.start path.line { stroke: var(--tb-text, #1c1c1c); }
.start .head { fill: var(--tb-text, #1c1c1c); }
.rubber { stroke: var(--tb-primary, #2563eb); stroke-width: 2; stroke-dasharray: 6 4; fill: none; pointer-events: none; }
.empty { color: var(--tb-muted, #6b7280); padding: 24px; text-align: center; font: ${FONT}; }
`;

function svg(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.append(e);
  return e;
}

/** ELK's graph for the designer's: nested nodes, every edge at the root, coordinates from the root. */
export function elkGraph(g, direction = 'RIGHT') {
  const kids = new Map();
  for (const n of g.nodes) {
    const p = n.parent ?? '';
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(n);
  }
  const edges = [];
  const make = n => {
    const inside = kids.get(n.id) ?? [];
    const label = n.kind === 'machine' ? '' : n.name;
    const e = { id: n.id, layoutOptions: {} };
    if (inside.length) {
      e.children = inside.map(make);
      e.layoutOptions['elk.padding'] = `[top=${label ? HEAD + 8 : 12},left=14,bottom=14,right=14]`;
      if (label) e.layoutOptions['elk.nodeSize.minimum'] = `(${textWidth(label) + 28},40)`;
      e.layoutOptions['elk.nodeSize.constraints'] = 'MINIMUM_SIZE';
      // the dot that points at the level's initial state
      const first = inside.find(c => c.initial);
      if (first && n.kind !== 'parallel') {
        e.children.unshift({ id: `start:${n.id}`, width: 12, height: 12 });
        edges.push({ id: `start:${n.id}>`, sources: [`start:${n.id}`], targets: [first.id] });
      }
    } else {
      e.width = Math.max(56, textWidth(label) + 28);
      e.height = 34;
    }
    return e;
  };
  const top = g.nodes.find(n => n.parent == null);
  const root = top ? make(top) : { id: 'none', children: [] };
  const known = new Set(g.nodes.map(n => n.id));
  for (const w of g.ways) {
    if (!known.has(w.from)) continue;
    w.to.forEach((t, i) => {
      if (!known.has(t)) return;
      const e = { id: `${w.id}#${i}`, sources: [w.from], targets: [t] };
      if (w.label) e.labels = [{ text: w.label, width: textWidth(w.label, '12px Inter, system-ui, sans-serif') + 8, height: 18 }];
      edges.push(e);
    });
  }
  return {
    id: 'graph',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.json.edgeCoords': 'ROOT',
      'elk.json.shapeCoords': 'ROOT',
      'elk.edgeRouting': 'SPLINES',
      'elk.layered.spacing.nodeNodeBetweenLayers': '48',
      'elk.spacing.nodeNode': '28',
      'elk.spacing.edgeLabel': '4',
      'elk.edgeLabels.inline': 'true',
      'elk.padding': '[top=12,left=12,bottom=12,right=12]',
    },
    children: [root],
    edges,
  };
}

/** The SVG path of an ELK edge section, curved where ELK routed it as splines. */
function pathOf(sec) {
  const pts = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint];
  if (pts.length > 2 && (pts.length - 1) % 3 === 0) {
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i += 3) d += ` C${pts[i].x},${pts[i].y} ${pts[i + 1].x},${pts[i + 1].y} ${pts[i + 2].x},${pts[i + 2].y}`;
    return d;
  }
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
}

function arrowHead(parent, from, to) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const l = 9, w = 4.5;
  const bx = to.x - l * Math.cos(a), by = to.y - l * Math.sin(a);
  const p = [[to.x, to.y], [bx + w * Math.sin(a), by - w * Math.cos(a)], [bx - w * Math.sin(a), by + w * Math.cos(a)]];
  svg('polygon', { class: 'head', points: p.map(q => q.join(',')).join(' ') }, parent);
}

class MachineGraph extends HTMLElement {
  #root = this.attachShadow({ mode: 'open' });
  #graph = null;
  #json = '';
  #selected = null;
  #active = [];
  #svg = null;
  #rects = [];       // [{id, x, y, width, height, depth}] of every state drawn, to find the one under a point
  #turn = 0;         // the layout asked last: an older one that ends later is dropped
  #drag = null;
  #laid = null;      // {RIGHT, DOWN}: ELK's layouts of the graph
  #shown = '';       // which of them is drawn, and how big: 'RIGHT 0.8'
  #watch = new ResizeObserver(() => this.#show());
  #dragged = false;

  connectedCallback() { this.#watch.observe(this); }
  disconnectedCallback() { this.#watch.disconnect(); }

  constructor() {
    super();
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    this.#root.adoptedStyleSheets = [sheet];
  }

  get graph() { return this.#graph; }
  set graph(g) {
    const json = JSON.stringify(g ?? null);
    if (json === this.#json) return;
    this.#json = json;
    this.#graph = g && Array.isArray(g.nodes) ? g : null;
    this.#layout();
  }

  get selected() { return this.#selected; }
  set selected(id) { this.#selected = typeof id === 'string' ? id : null; this.#paint(); }

  get active() { return this.#active; }
  set active(ids) { this.#active = Array.isArray(ids) ? ids : []; this.#paint(); }

  async #layout() {
    const turn = ++this.#turn;
    const g = this.#graph;
    if (!g || !g.nodes.length) {
      this.#root.replaceChildren(Object.assign(document.createElement('div'), { className: 'empty', textContent: 'No machine to draw.' }));
      this.#svg = null;
      return;
    }
    let laid;
    try {
      const [right, down] = await Promise.all(['RIGHT', 'DOWN'].map(d => layouter().layout(elkGraph(g, d))));
      laid = { RIGHT: right, DOWN: down };
    } catch (e) {
      if (turn !== this.#turn) return;
      this.#root.replaceChildren(Object.assign(document.createElement('div'), { className: 'empty', textContent: `The drawing failed: ${e?.message ?? e}` }));
      return;
    }
    if (turn !== this.#turn) return;
    this.#laid = laid;
    this.#shown = '';
    this.#show();
    this.dispatchEvent(new Event('drawn'));
  }

  /** The layout that fits the place better, at the size that fits it, unless it is drawn already. */
  #show() {
    if (!this.#laid || !this.#graph) return;
    const W = Math.max(1, this.clientWidth - 8), H = Math.max(1, this.clientHeight - 8);
    const fit = l => Math.min(W / l.width, H / l.height);
    const way = fit(this.#laid.DOWN) > fit(this.#laid.RIGHT) * 1.05 ? 'DOWN' : 'RIGHT';
    const scale = Math.round(Math.min(1, Math.max(SMALLEST, fit(this.#laid[way]))) * 20) / 20;
    const shown = `${way} ${scale}`;
    if (shown === this.#shown) return;
    this.#shown = shown;
    this.#draw(this.#laid[way], scale);
  }

  #draw(laid, scale) {
    const byId = new Map(this.#graph.nodes.map(n => [n.id, n]));
    const kidsOf = new Set(this.#graph.nodes.map(n => n.parent).filter(Boolean));
    const w = Math.ceil(laid.width), h = Math.ceil(laid.height);
    const s = svg('svg', { viewBox: `0 0 ${w} ${h}`, width: Math.ceil(w * scale), height: Math.ceil(h * scale), role: 'group', 'aria-label': `Machine ${this.#graph.name ?? ''}`.trim() });
    this.#rects = [];
    const nodes = svg('g', {}, s);
    const walk = (e, depth) => {
      if (e.id.startsWith('start:')) {
        svg('circle', { class: 'dot', cx: e.x + 6, cy: e.y + 6, r: 6 }, nodes);
        return;
      }
      const n = byId.get(e.id);
      if (n) {
        const kind = n.kind === 'machine' ? 'machine' : n.kind === 'parallel' ? 'parallel' : kidsOf.has(n.id) ? 'group' : n.kind;
        const g = svg('g', { class: `node ${kind}`, 'data-id': n.id }, nodes);
        if (n.kind !== 'machine') {
          g.setAttribute('tabindex', '0');
          g.setAttribute('role', 'button');
          g.setAttribute('aria-label', `${n.kind} ${n.name}`);
        }
        const r = kind === 'group' || kind === 'parallel' ? 10 : 9;
        svg('rect', { class: 'box', x: e.x, y: e.y, width: e.width, height: e.height, rx: r }, g);
        if (n.kind === 'final') svg('rect', { class: 'inner', x: e.x + 3.5, y: e.y + 3.5, width: e.width - 7, height: e.height - 7, rx: r - 3 }, g);
        if (n.kind !== 'machine') {
          const t = svg('text', { class: 'name' }, g);
          if (kind === 'group' || kind === 'parallel') {
            t.setAttribute('x', e.x + 12);
            t.setAttribute('y', e.y + HEAD / 2 + 2);
          } else {
            t.setAttribute('x', e.x + e.width / 2);
            t.setAttribute('y', e.y + e.height / 2);
            t.setAttribute('text-anchor', 'middle');
          }
          t.textContent = n.name;
          this.#rects.push({ id: n.id, x: e.x, y: e.y, width: e.width, height: e.height, depth });
        }
      }
      for (const c of e.children ?? []) walk(c, depth + 1);
    };
    for (const c of laid.children ?? []) walk(c, 0);
    const ways = svg('g', {}, s);
    for (const e of laid.edges ?? []) {
      const start = e.id.startsWith('start:');
      const g = svg('g', { class: start ? 'start' : 'way', 'data-id': start ? '' : e.id.split('#')[0] }, ways);
      for (const sec of e.sections ?? []) {
        const d = pathOf(sec);
        if (!start) svg('path', { class: 'hit', d }, g);
        svg('path', { class: 'line', d }, g);
        const pts = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint];
        arrowHead(g, pts[pts.length - 2], pts[pts.length - 1]);
      }
      for (const l of e.labels ?? []) {
        svg('rect', { class: 'label-bg', x: l.x, y: l.y, width: l.width, height: l.height, rx: 4 }, g);
        svg('text', { class: 'label', x: l.x + l.width / 2, y: l.y + l.height / 2, 'text-anchor': 'middle' }, g).textContent = l.text;
      }
    }
    this.#rects.sort((a, b) => b.depth - a.depth);
    this.#svg = s;
    this.#listen(s);
    this.#root.replaceChildren(s);
    this.#paint();
  }

  #paint() {
    const s = this.#svg;
    if (!s) return;
    const active = new Set(this.#active);
    for (const g of s.querySelectorAll('[data-id]')) {
      const id = g.getAttribute('data-id');
      g.classList.toggle('selected', id !== '' && id === this.#selected);
      g.classList.toggle('active', active.has(id));
    }
  }

  /** A point of the page in the drawing's coordinates. */
  #at(ev) {
    const p = this.#svg.createSVGPoint();
    p.x = ev.clientX;
    p.y = ev.clientY;
    return p.matrixTransform(this.#svg.getScreenCTM().inverse());
  }

  /** The innermost state under a point, and whether the point is near its border. */
  #stateAt(p) {
    for (const r of this.#rects) {
      if (p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height) {
        const near = Math.min(p.x - r.x, r.x + r.width - p.x, p.y - r.y, r.y + r.height - p.y) <= EDGE;
        return { id: r.id, near, r };
      }
    }
    return null;
  }

  #pick(id) { this.dispatchEvent(new CustomEvent('pick', { detail: id })); }

  #listen(s) {
    const machineId = this.#graph.nodes.find(n => n.parent == null)?.id ?? null;
    s.addEventListener('pointermove', ev => {
      if (this.#drag) return this.#dragTo(ev);
      const hit = this.#stateAt(this.#at(ev));
      for (const g of s.querySelectorAll('.node.edge')) g.classList.remove('edge');
      if (hit?.near) s.querySelector(`[data-id="${CSS.escape(hit.id)}"]`)?.classList.add('edge');
    });
    s.addEventListener('pointerdown', ev => {
      this.#dragged = false;
      if (ev.button !== 0) return;
      const p = this.#at(ev);
      const way = ev.target.closest?.('.way');
      if (way) return;
      const hit = this.#stateAt(p);
      if (hit?.near) {
        ev.preventDefault();
        s.setPointerCapture(ev.pointerId);
        const line = svg('path', { class: 'rubber', d: `M${p.x},${p.y}` }, s);
        this.#drag = { from: hit.id, start: p, line, over: null, moved: false };
      }
    });
    s.addEventListener('pointerup', ev => {
      const drag = this.#drag;
      if (!drag) return;
      this.#drag = null;
      drag.line.remove();
      this.#target(null);
      this.#dragged = true;
      if (!drag.moved) return this.#pick(drag.from);
      if (drag.over) this.dispatchEvent(new CustomEvent('connect', { detail: [drag.from, drag.over] }));
    });
    s.addEventListener('pointercancel', () => {
      if (!this.#drag) return;
      this.#drag.line.remove();
      this.#drag = null;
      this.#target(null);
    });
    s.addEventListener('click', ev => {
      // the click that ends a drag did its work on pointerup
      if (this.#dragged) { this.#dragged = false; return; }
      const way = ev.target.closest?.('.way');
      if (way) return this.#pick(way.getAttribute('data-id'));
      const hit = this.#stateAt(this.#at(ev));
      if (hit && !hit.near) return this.#pick(hit.id);
      if (!hit && machineId) this.#pick(machineId);
    });
    s.addEventListener('keydown', ev => {
      const node = ev.target.closest?.('.node');
      if (node && (ev.key === 'Enter' || ev.key === ' ')) {
        ev.preventDefault();
        this.#pick(node.getAttribute('data-id'));
      }
    });
  }

  #dragTo(ev) {
    const drag = this.#drag;
    const p = this.#at(ev);
    if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 4) drag.moved = true;
    drag.line.setAttribute('d', `M${drag.start.x},${drag.start.y} L${p.x},${p.y}`);
    const hit = this.#stateAt(p);
    drag.over = hit ? hit.id : null;
    this.#target(drag.over);
  }

  #target(id) {
    for (const g of this.#svg?.querySelectorAll('.node.target') ?? []) g.classList.remove('target');
    if (id) this.#svg.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add('target');
  }
}

customElements.define('tb-machine-graph', MachineGraph);
