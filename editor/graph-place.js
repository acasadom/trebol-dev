// Where <tb-machine-graph> draws each state, and the ways between them.
// A state's place is its box's top-left corner from the top-left corner of the box it is in (the file's places,
// or ELK's when the machine has none). A box with states inside is as big as they need, its name on top: a state
// put past its left or top edge makes it grow that way. A state with no place is put to the right of the others.
// Every point here is in the drawing's coordinates, the machine's corner at 0,0.
import { HEAD, LABEL_FONT, shownName, textWidth } from './graph-draw.js';

const PAD = { l: 14, t: HEAD + 8, r: 14, b: 14 };      // the room inside a box around its states
const ROOT = { l: 24, t: 24, r: 24, b: 24 };           // and around the machine's
const GAP = 48;                                        // between a state put where there was room and the others
const DOT = 26;                                        // how far left of the initial state its dot is

export const leafSize = name => ({ w: Math.max(64, textWidth(name) + 32), h: 36 });

/** The nodes inside each node, by id. */
function kidsOf(graph) {
  const kids = new Map();
  for (const n of graph.nodes) {
    if (n.parent == null) continue;
    if (!kids.has(n.parent)) kids.set(n.parent, []);
    kids.get(n.parent).push(n);
  }
  return kids;
}

const shift = (items, dx, dy) => { for (const b of items) { b.x += dx; b.y += dy; if ('tx' in b) { b.tx += dx; b.ty += dy; } } };

const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The initial dot of a box, {x, y, tx, ty}: left of it, else above, right or below, where no other box is. */
function dotBeside(b, others) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const sides = [
    { x: b.x - DOT + 6, y: cy, tx: b.x, ty: cy, room: { x: b.x - DOT - 4, y: cy - 10, w: DOT + 4, h: 20 } },
    { x: cx, y: b.y - DOT + 6, tx: cx, ty: b.y, room: { x: cx - 10, y: b.y - DOT - 4, w: 20, h: DOT + 4 } },
    { x: b.x + b.w + DOT - 6, y: cy, tx: b.x + b.w, ty: cy, room: { x: b.x + b.w, y: cy - 10, w: DOT + 4, h: 20 } },
    { x: cx, y: b.y + b.h + DOT - 6, tx: cx, ty: b.y + b.h, room: { x: cx - 10, y: b.y + b.h, w: 20, h: DOT + 4 } },
  ];
  const side = sides.find(s => !others.some(o => meets(s.room, o))) ?? sides[0];
  return { x: side.x, y: side.y, tx: side.tx, ty: side.ty };
}

/**
 * A node and what is inside it, from its own corner: {box: {x, y, w, h}, items: [box...], dots: [{x, y, to}]}.
 * A box is {id, kind, x, y, w, h, depth}; kind is machine, state, group, parallel or final.
 */
function measure(graph, kids, n, rel, skip, depth) {
  const inside = (kids.get(n.id) ?? []).filter(c => c.id !== skip);
  const all = kids.get(n.id) ?? [];
  const root = n.parent == null;
  if (!all.length && !root) {
    const { w, h } = leafSize(shownName(n));
    return { box: { x: 0, y: 0, w, h }, items: [{ id: n.id, kind: n.kind, x: 0, y: 0, w, h, depth }], dots: [] };
  }
  const pad = root ? ROOT : PAD;
  const items = [], dots = [];
  const placed = [], loose = [];
  for (const c of inside) {
    const m = measure(graph, kids, c, rel, skip, depth + 1);
    (rel.has(c.id) ? placed : loose).push([c, m]);
  }
  const boxes = [];   // [node, its box from n's corner]
  for (const [c, m] of placed) {
    const r = rel.get(c.id);
    shift(m.items, r.x - m.box.x, r.y - m.box.y);
    shift(m.dots, r.x - m.box.x, r.y - m.box.y);
    items.push(...m.items);
    dots.push(...m.dots);
    boxes.push([c, { x: r.x, y: r.y, w: m.box.w, h: m.box.h }]);
  }
  let x = boxes.length ? Math.max(...boxes.map(([, b]) => b.x + b.w)) + GAP : pad.l + (n.kind !== 'parallel' ? DOT : 0);
  const y = boxes.length ? Math.min(...boxes.map(([, b]) => b.y)) : pad.t;
  for (const [c, m] of loose) {
    shift(m.items, x - m.box.x, y - m.box.y);
    shift(m.dots, x - m.box.x, y - m.box.y);
    items.push(...m.items);
    dots.push(...m.dots);
    boxes.push([c, { x, y, w: m.box.w, h: m.box.h }]);
    x += m.box.w + GAP;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [, b] of boxes) {
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  }
  // the dot that points at the level's initial state, on the first side of it with no other state there
  const first = boxes.find(([c]) => c.initial);
  if (first && n.kind !== 'parallel') {
    const dot = dotBeside(first[1], boxes.filter(x => x !== first).map(([, b]) => b));
    dot.to = first[0].id;
    dots.push(dot);
    minX = Math.min(minX, dot.x - 6); minY = Math.min(minY, dot.y - 6);
    maxX = Math.max(maxX, dot.x + 6); maxY = Math.max(maxY, dot.y + 6);
  }
  const label = root ? '' : shownName(n);
  const minW = root ? (all.length < 3 ? 320 : 0) : Math.max(64, textWidth(label) + 28);
  const minH = root ? (all.length < 3 ? 180 : 0) : HEAD + 14;
  const box = boxes.length
    ? { x: Math.min(0, minX - pad.l), y: Math.min(0, minY - pad.t) }
    : { x: 0, y: 0 };
  box.w = Math.max(minW, (boxes.length ? maxX + pad.r : 0) - box.x);
  box.h = Math.max(minH, (boxes.length ? maxY + pad.b : 0) - box.y);
  const kind = root ? 'machine' : n.kind === 'parallel' ? 'parallel' : 'group';
  items.push({ id: n.id, kind, ...box, depth });
  return { box, items, dots };
}

/**
 * Every box of the drawing, innermost first, with the dots at initial states and the machine's box.
 * rel: Map id -> {x, y}, a state's place. drag: {id, x, y} draws that state (and what is inside it) with its
 * corner there, out of the box it is in, which keeps the size it has without it.
 */
export function arrange(graph, rel, drag = null) {
  const kids = kidsOf(graph);
  const top = graph.nodes.find(n => n.parent == null);
  const m = measure(graph, kids, top, rel, drag?.id ?? null, 0);
  if (drag) {
    const n = graph.nodes.find(x => x.id === drag.id);
    // drawn over everything while it is carried
    const d = measure(graph, kids, n, rel, null, 100);
    shift(d.items, drag.x - d.box.x, drag.y - d.box.y);
    shift(d.dots, drag.x - d.box.x, drag.y - d.box.y);
    m.items.push(...d.items);
    m.dots.push(...d.dots);
  }
  m.items.sort((a, b) => b.depth - a.depth);
  const root = m.items.find(b => b.id === top.id);
  return { boxes: m.items, dots: m.dots, frame: { x: root.x, y: root.y, w: root.w, h: root.h } };
}

/** The corner the places in a box are from: the box's top-left corner, the machine's own corner (0, 0). */
export function cornerOf(graph, arranged, id) {
  const n = graph.nodes.find(x => x.id === id);
  if (!n) return null;
  if (n.parent == null) return { x: 0, y: 0 };
  return arranged.boxes.find(b => b.id === id) ?? null;
}

/** The places of the states as drawn, each from the box it is in: [id, x, y, ...]. into: where drag goes. */
export function placesOf(graph, arranged, moved = null, into = null) {
  const byId = new Map(arranged.boxes.map(b => [b.id, b]));
  const out = [];
  for (const n of graph.nodes) {
    // what a state shows of the fragment it uses is not placed here: it is placed on the fragment's drawing
    if (n.parent == null || n.fixed) continue;
    const b = byId.get(n.id), p = cornerOf(graph, arranged, n.id === moved ? into : n.parent);
    if (b && p) out.push(n.id, Math.round(b.x - p.x), Math.round(b.y - p.y));
  }
  return out;
}

/**
 * What states show of the fragments they use and has no places yet: a graph for each such state, the state
 * at its root, to be laid out on its own. Its name is the state's id.
 */
export function unplacedInsides(graph, rel) {
  const owners = new Set(graph.nodes.filter(n => n.fixed && !rel.has(n.id)).map(n => n.owner));
  return [...owners].map(owner => ({
    name: owner,
    nodes: [{ ...graph.nodes.find(n => n.id === owner), parent: null }, ...graph.nodes.filter(n => n.fixed && n.owner === owner)],
    ways: graph.ways.filter(w => w.fixed && w.owner === owner),
  }));
}

/** The places of ELK's layout: Map id -> {x, y}. */
export function elkPlaces(laid) {
  const rel = new Map();
  const walk = (e, px, py, top) => {
    if (!top && !e.id.startsWith('start:')) rel.set(e.id, { x: Math.round(e.x - px), y: Math.round(e.y - py) });
    for (const c of e.children ?? []) walk(c, e.x, e.y, false);
  };
  for (const c of laid.children ?? []) walk(c, c.x, c.y, true);
  return rel;
}

// --- the ways -------------------------------------------------------------------------------------

const center = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const contains = (a, b) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;

/** Where a line from a box's center toward a point leaves the box. */
function edgeToward(b, p) {
  const c = center(b);
  const dx = p.x - c.x, dy = p.y - c.y;
  if (!dx && !dy) return c;
  const t = Math.min(dx ? (b.w / 2) / Math.abs(dx) : Infinity, dy ? (b.h / 2) / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** The side of an outer box nearest to an inner one, and the points of a way between them across it. */
function across(outer, inner) {
  const c = center(inner);
  const sides = [
    [inner.x - outer.x, { x: outer.x, y: c.y }, { x: inner.x, y: c.y }],
    [outer.x + outer.w - inner.x - inner.w, { x: outer.x + outer.w, y: c.y }, { x: inner.x + inner.w, y: c.y }],
    [outer.y + outer.h - inner.y - inner.h, { x: c.x, y: outer.y + outer.h }, { x: c.x, y: inner.y + inner.h }],
  ];
  sides.sort((a, b) => a[0] - b[0]);
  return [sides[0][1], sides[0][2]];
}

/**
 * The ways drawn between the boxes: [{id, d, tip: [from, to], label: {x, y, text} | null}], and one arrow from
 * each initial dot. Ways between the same two states bend apart; a way back to its own state loops over it.
 */
export function route(graph, arranged) {
  const byId = new Map(arranged.boxes.map(b => [b.id, b]));
  const out = [];
  const pairs = new Map();
  const ends = [];
  for (const w of graph.ways) {
    w.to.forEach((t, i) => {
      if (!byId.has(w.from) || !byId.has(t)) return;
      const key = [w.from, t].sort().join('|');
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
      ends.push({ w, t, i, key });
    });
  }
  const seen = new Map();
  for (const { w, t, i, key } of ends) {
    const a = byId.get(w.from), b = byId.get(t);
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    const label = i === 0 && w.label ? w.label : '';
    const lw = label ? textWidth(label, LABEL_FONT) + 8 : 0;
    if (a === b) {
      const s = 14 + k * 10;
      const p0 = { x: a.x + a.w - 18 - k * 8, y: a.y }, p3 = { x: a.x + a.w, y: a.y + 14 + k * 4 };
      const c1 = { x: p0.x, y: p0.y - 30 - s }, c2 = { x: p3.x + 30 + s, y: p3.y };
      out.push({ id: w.id, d: `M${p0.x},${p0.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p3.x},${p3.y}`, tip: [c2, p3],
        label: label ? { x: p3.x + 12 + s + lw / 2, y: p0.y - 22 - s, w: lw, text: label } : null });
      continue;
    }
    let p0, p2;
    if (contains(a, b)) [p0, p2] = across(a, b);
    else if (contains(b, a)) [p2, p0] = across(b, a);
    else {
      p0 = center(a);
      p2 = center(b);
    }
    // the bend: the ways between the same two states side by side, the first of one straight
    const n = pairs.get(key);
    const forward = w.from < t;
    let off = (k - (n - 1) / 2) * 26 * (forward ? 1 : -1);
    if (n === 2 && !off) off = 13;
    const mx = (p0.x + p2.x) / 2, my = (p0.y + p2.y) / 2;
    const len = Math.hypot(p2.x - p0.x, p2.y - p0.y) || 1;
    const nx = -(p2.y - p0.y) / len, ny = (p2.x - p0.x) / len;
    const c = { x: mx + nx * off * 2, y: my + ny * off * 2 };
    if (!contains(a, b) && !contains(b, a)) {
      p0 = edgeToward(a, c);
      p2 = edgeToward(b, c);
    }
    // the label beside the way, on the side it bends to, so it covers no line and no arrow
    const mid = { x: 0.25 * p0.x + 0.5 * c.x + 0.25 * p2.x, y: 0.25 * p0.y + 0.5 * c.y + 0.25 * p2.y };
    const side = off < 0 ? -1 : 1;
    const away = Math.abs(nx) * lw / 2 + Math.abs(ny) * 9 + 4;
    out.push({ id: w.id, d: `M${p0.x},${p0.y} Q${c.x},${c.y} ${p2.x},${p2.y}`, tip: [c, p2],
      label: label ? { x: mid.x + nx * away * side, y: mid.y + ny * away * side, w: lw, text: label } : null });
  }
  for (const dot of arranged.dots) {
    if (!byId.has(dot.to)) continue;
    const len = Math.hypot(dot.tx - dot.x, dot.ty - dot.y) || 1;
    const from = { x: dot.x + (dot.tx - dot.x) / len * 6, y: dot.y + (dot.ty - dot.y) / len * 6 }, to = { x: dot.tx, y: dot.ty };
    out.push({ id: '', start: true, d: `M${from.x},${from.y} L${to.x},${to.y}`, tip: [from, to], label: null });
  }
  return out;
}
