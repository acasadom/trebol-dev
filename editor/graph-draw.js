// The drawing of <tb-machine-graph> (machine-graph.js): its styles, the graph ELK lays out (for a machine with no
// places, and Tidy), and the SVG made from the boxes graph-place.js places. ELK runs in a worker,
// app/elk-worker.js, started the first time it is needed.
// A state is a rounded box; a state with states inside is a box around them, its name on top; a parallel state's
// box is dashed, each region a box inside it; a final state has a double border. A black dot points at the
// initial state of each level. Ways are arrows, labelled with their events.
import ELK from 'elkjs/lib/elk-api.js';

export const NS = 'http://www.w3.org/2000/svg';
export const HEAD = 26;          // the room on top of a box for its name
export const FONT = '13px Inter, system-ui, sans-serif';
export const LABEL_FONT = '12px Inter, system-ui, sans-serif';

let elk = null;
export function layouter() {
  elk ??= new ELK({ workerUrl: new URL('elk-worker.js', import.meta.url).href });
  return elk;
}

let measurer = null;
export function textWidth(s, font = FONT) {
  measurer ??= document.createElement('canvas').getContext('2d');
  measurer.font = font;
  return Math.ceil(measurer.measureText(s).width);
}

/** The name a state is drawn with: a state that uses a fragment says which. */
export const MARK = ' \u25C7 ';
export const shownName = n => n.uses ? `${n.name}${MARK}${n.uses}` : n.name;

export function svg(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.append(e);
  return e;
}

export const css = `
:host { position: relative; height: 100%; min-height: 320px; font: ${FONT}; color: var(--tb-text, #1c1c1c); }
/* the page's styles set the element's display: the column is a box of its own */
.frame { display: flex; flex-direction: column; height: 100%; min-height: 320px; }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 4px; margin-bottom: 6px;
  border: 1px solid var(--tb-border, #e7e5e4); border-radius: var(--tb-radius, 8px); background: var(--tb-surface, #fff); }
.bar button { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid transparent;
  border-radius: calc(var(--tb-radius, 8px) - 2px); background: none; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.bar button:hover:not(:disabled) { background: color-mix(in oklch, var(--tb-text, #1c1c1c) 7%, transparent); }
.bar button:focus-visible { outline: 2px solid var(--tb-focus, var(--tb-primary, #2563eb)); outline-offset: 1px; }
.bar button:disabled { opacity: .4; cursor: default; }
.bar button.tool { cursor: grab; border-color: var(--tb-border, #e7e5e4); }
.bar button.go { margin-left: auto; border-color: var(--tb-border, #e7e5e4); font-weight: 600; }
.bar .sep { width: 1px; height: 20px; background: var(--tb-border, #e7e5e4); margin: 0 4px; }
.bar svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.stage { position: relative; flex: 1; overflow: auto; min-height: 160px; outline: none; }
.stage > svg { display: block; user-select: none; touch-action: none; overflow: visible; }
.node.lifted { opacity: .85; }
.node.lifted > .box { stroke-dasharray: 4 3; }
.hint { position: absolute; left: 0; right: 0; bottom: 12px; margin: 0 auto; max-width: 420px; text-align: center; color: var(--tb-muted, #6b7280); font-size: 13px; pointer-events: none; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 16px; color: var(--tb-muted, #6b7280); text-align: center; }
.empty button { height: 34px; padding: 0 14px; border: 1px solid var(--tb-border-strong, #a8a29e); border-radius: var(--tb-radius, 8px);
  background: var(--tb-surface, #fff); color: var(--tb-text, #1c1c1c); font: inherit; cursor: pointer; }
.box { fill: var(--tb-surface, #fff); stroke: var(--tb-border-strong, #a8a29e); stroke-width: 1.25; }
.group > .box { fill: color-mix(in oklch, var(--tb-text, #1c1c1c) 3%, var(--tb-surface, #fff)); }
.parallel > .box { stroke-dasharray: 5 4; fill: none; }
.machine > .box { fill: none; stroke: none; }
.inner { fill: none; stroke: var(--tb-border-strong, #a8a29e); stroke-width: 1.25; }
.name { fill: var(--tb-text, #1c1c1c); dominant-baseline: central; }
.group > .name, .parallel > .name { font-weight: 600; font-size: 12px; fill: var(--tb-muted, #6b7280); }
.node { cursor: pointer; outline: none; }
.node:focus-visible > .box { stroke: var(--tb-focus, var(--tb-primary, #2563eb)); stroke-width: 2.5; }
.node.active > .box { fill: color-mix(in oklch, var(--tb-success, #16a34a) 18%, var(--tb-surface, #fff)); stroke: var(--tb-success, #16a34a); }
:is(.group, .parallel).active > .box { fill: color-mix(in oklch, var(--tb-success, #16a34a) 6%, var(--tb-surface, #fff)); }
.node.selected > .box, .node.selected > .inner { stroke: var(--tb-primary, #2563eb); stroke-width: 2.25; }
.node.selected > .box { fill: var(--tb-primary-soft, #eef3ff); }
.node.target > .box { stroke: var(--tb-primary, #2563eb); stroke-width: 2.5; stroke-dasharray: none;
  fill: color-mix(in oklch, var(--tb-primary, #2563eb) 10%, var(--tb-surface, #fff)); }
.machine.target > .box { stroke: var(--tb-primary, #2563eb); stroke-dasharray: 6 4; }
.uses > .box { stroke: var(--tb-primary, #2563eb); stroke-opacity: .55; }
.mark { fill: var(--tb-primary, #2563eb); font-weight: 600; }
/* what a state shows of the fragment it uses: seen, not changed here */
.fixed > .box { fill: color-mix(in oklch, var(--tb-text, #1c1c1c) 4%, var(--tb-surface, #fff)); stroke-dasharray: 3 3; stroke-opacity: .7; }
.fixed > .name { fill: var(--tb-muted, #6b7280); }
.fixed.group > .box { fill: none; }
.way.fixed path.line { stroke-dasharray: 4 3; stroke-opacity: .7; }
.way.fixed { cursor: default; }
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
.handle { fill: var(--tb-surface, #fff); stroke: var(--tb-primary, #2563eb); stroke-width: 2; cursor: crosshair; }
.handle:hover { fill: var(--tb-primary, #2563eb); }
.rubber { stroke: var(--tb-primary, #2563eb); stroke-width: 2; stroke-dasharray: 6 4; fill: none; pointer-events: none; }
.ghost { position: fixed; z-index: 10; pointer-events: none; padding: 6px 14px; border: 1.5px dashed var(--tb-primary, #2563eb);
  border-radius: 9px; background: var(--tb-surface, #fff); color: var(--tb-text, #1c1c1c); font: ${FONT}; opacity: .9; }
.naming > .name, .naming > .label, .naming:not(.group, .parallel) > :is(.box, .inner) { visibility: hidden; }
.inline { position: absolute; z-index: 5; box-sizing: border-box; height: 28px; padding: 0 6px;
  border: 2px solid var(--tb-primary, #2563eb); border-radius: 6px; background: var(--tb-surface, #fff);
  color: var(--tb-text, #1c1c1c); font: ${FONT}; text-align: center; outline: none; }
.menu { position: fixed; z-index: 20; min-width: 180px; padding: 4px; border: 1px solid var(--tb-border, #e7e5e4);
  border-radius: var(--tb-radius, 8px); background: var(--tb-surface, #fff); box-shadow: 0 8px 24px rgb(0 0 0 / .14); }
.menu button { display: block; width: 100%; padding: 7px 10px; border: none; border-radius: 5px; background: none;
  color: var(--tb-text, #1c1c1c); font: inherit; text-align: left; cursor: pointer; }
.menu button:hover, .menu button:focus-visible { background: color-mix(in oklch, var(--tb-primary, #2563eb) 12%, transparent); outline: none; }
.menu button.danger { color: var(--tb-danger, #dc2626); }
`;

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
    const label = n.kind === 'machine' ? '' : shownName(n);
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
      e.width = Math.max(64, textWidth(label) + 32);
      e.height = 36;
    }
    return e;
  };
  const top = g.nodes.find(n => n.parent == null);
  const root = top ? make(top) : { id: 'none', children: [] };
  // a machine of one state still gets room around it to drop more in
  if (top && (kids.get(top.id) ?? []).length < 3) root.layoutOptions['elk.nodeSize.minimum'] = '(320,180)';
  const known = new Set(g.nodes.map(n => n.id));
  for (const w of g.ways) {
    if (!known.has(w.from)) continue;
    w.to.forEach((t, i) => {
      if (!known.has(t)) return;
      const e = { id: `${w.id}#${i}`, sources: [w.from], targets: [t] };
      if (w.label) e.labels = [{ text: w.label, width: textWidth(w.label, LABEL_FONT) + 8, height: 18 }];
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

function arrowHead(parent, from, to) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const l = 9, w = 4.5;
  const bx = to.x - l * Math.cos(a), by = to.y - l * Math.sin(a);
  const p = [[to.x, to.y], [bx + w * Math.sin(a), by - w * Math.cos(a)], [bx - w * Math.sin(a), by + w * Math.cos(a)]];
  svg('polygon', { class: 'head', points: p.map(q => q.join(',')).join(' ') }, parent);
}

/**
 * The SVG of the boxes and ways placed by graph-place.js, at a scale, showing the frame given
 * ({x, y, w, h}, the machine's box unless a drag keeps an older one). Gives the svg and every box drawn,
 * the innermost first: [{id, kind, x, y, width, height, depth}].
 */
export function drawGraph(graph, arranged, ways, scale, frame = arranged.frame) {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const w = Math.ceil(frame.w), h = Math.ceil(frame.h);
  const s = svg('svg', { viewBox: `${frame.x} ${frame.y} ${w} ${h}`, width: Math.ceil(w * scale), height: Math.ceil(h * scale),
    role: 'group', 'aria-label': `Machine ${graph.name ?? ''}`.trim() });
  const nodes = svg('g', {}, s);
  // outer boxes first, so the states inside them are drawn over them
  const order = [...arranged.boxes].sort((a, b) => a.depth - b.depth);
  for (const b of order) {
    const n = byId.get(b.id);
    if (!n) continue;
    const kind = b.kind;
    const g = svg('g', { class: `node ${kind}${n.fixed ? ' fixed' : ''}${n.uses ? ' uses' : ''}`, 'data-id': n.id }, nodes);
    if (n.kind !== 'machine' && !n.fixed) {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', n.uses ? `${n.kind} ${n.name}, uses the fragment ${n.uses}` : `${n.kind} ${n.name}`);
    }
    const r = kind === 'group' || kind === 'parallel' ? 10 : 9;
    svg('rect', { class: 'box', x: b.x, y: b.y, width: b.w, height: b.h, rx: r }, g);
    if (n.kind === 'final') svg('rect', { class: 'inner', x: b.x + 3.5, y: b.y + 3.5, width: b.w - 7, height: b.h - 7, rx: r - 3 }, g);
    if (n.kind !== 'machine') {
      const t = svg('text', { class: 'name' }, g);
      if (kind === 'group' || kind === 'parallel') {
        t.setAttribute('x', b.x + 12);
        t.setAttribute('y', b.y + HEAD / 2 + 2);
      } else {
        t.setAttribute('x', b.x + b.w / 2);
        t.setAttribute('y', b.y + b.h / 2);
        t.setAttribute('text-anchor', 'middle');
      }
      t.textContent = n.name;
      // the fragment it uses, after its name
      if (n.uses) svg('tspan', { class: 'mark' }, t).textContent = `${MARK}${n.uses}`;
    }
  }
  for (const d of arranged.dots) svg('circle', { class: 'dot', cx: d.x, cy: d.y, r: 6 }, nodes);
  const lines = svg('g', {}, s);
  for (const way of ways) {
    const g = svg('g', { class: way.start ? 'start' : way.fixed ? 'way fixed' : 'way', 'data-id': way.id }, lines);
    if (!way.start) svg('path', { class: 'hit', d: way.d }, g);
    svg('path', { class: 'line', d: way.d }, g);
    arrowHead(g, way.tip[0], way.tip[1]);
    if (way.label) {
      const lw = way.label.w;
      svg('rect', { class: 'label-bg', x: way.label.x - lw / 2, y: way.label.y - 9, width: lw, height: 18, rx: 4 }, g);
      svg('text', { class: 'label', x: way.label.x, y: way.label.y, 'text-anchor': 'middle' }, g).textContent = way.label.text;
    }
  }
  svg('g', { class: 'overlay' }, s);
  const rects = arranged.boxes.map(b => ({ id: b.id, kind: b.kind, x: b.x, y: b.y, width: b.w, height: b.h, depth: b.depth }));
  return { svg: s, rects };
}
