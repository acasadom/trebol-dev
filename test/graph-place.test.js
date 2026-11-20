// The geometry of the machine canvas (editor/graph-place.js): where boxes go, how boxes with states inside
// grow, the places sent back to the file, and the ways between boxes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// text is measured on a canvas in the browser: here every character is 7 wide
globalThis.document = { createElement: () => ({ getContext: () => ({ measureText: s => ({ width: 7 * s.length }) }) }) };
const { arrange, placesOf, route, cornerOf, unplacedInsides } = await import('../editor/graph-place.js');

const graph = {
  name: 'repair',
  nodes: [
    { id: 'm1.1', name: 'repair', kind: 'machine', parent: null },
    { id: 's1.2', name: 'received', kind: 'state', parent: 'm1.1', initial: true },
    { id: 's1.3', name: 'work', kind: 'state', parent: 'm1.1' },
    { id: 's1.4', name: 'checking', kind: 'state', parent: 's1.3', initial: true },
    { id: 's1.5', name: 'waiting', kind: 'state', parent: 's1.3' },
    { id: 's1.6', name: 'ready', kind: 'final', parent: 'm1.1' },
  ],
  ways: [
    { id: 'w1.1', from: 's1.2', to: ['s1.3'], label: 'start' },
    { id: 'w1.2', from: 's1.4', to: ['s1.5'], label: 'need-parts' },
    { id: 'w1.3', from: 's1.5', to: ['s1.4'], label: 'parts' },
    { id: 'w1.4', from: 's1.6', to: ['s1.6'], label: 'again' },
  ],
};

const places = {
  's1.2': { x: 40, y: 30 }, 's1.3': { x: 40, y: 120 }, 's1.4': { x: 40, y: 40 }, 's1.5': { x: 200, y: 40 }, 's1.6': { x: 400, y: 30 },
};
const rel = (over = {}) => new Map(Object.entries({ ...places, ...over }));
const box = (arr, id) => arr.boxes.find(b => b.id === id);

test('states are drawn at their places, from the box they are in', () => {
  const arr = arrange(graph, rel());
  assert.deepEqual([box(arr, 's1.2').x, box(arr, 's1.2').y], [40, 30]);
  assert.deepEqual([box(arr, 's1.5').x, box(arr, 's1.5').y], [240, 160]);
  assert.equal(box(arr, 's1.2').w, Math.max(64, 7 * 8 + 32));
});

test('a box with states inside holds them, its name on top', () => {
  const arr = arrange(graph, rel());
  const work = box(arr, 's1.3'), waiting = box(arr, 's1.5');
  assert.equal(work.kind, 'group');
  assert.ok(work.x + work.w >= waiting.x + waiting.w + 14);
  assert.ok(work.y + work.h >= waiting.y + waiting.h + 14);
  assert.deepEqual([work.x, work.y], [40, 120]);
});

test('a state put past the left of its box makes the box grow that way', () => {
  const arr = arrange(graph, rel({ 's1.4': { x: -30, y: 40 } }));
  const work = box(arr, 's1.3'), checking = box(arr, 's1.4');
  assert.ok(work.x < checking.x - 14);
});

test('the places sent back give the same drawing', () => {
  const arr = arrange(graph, rel({ 's1.4': { x: -30, y: 40 } }));
  const sent = placesOf(graph, arr);
  const again = new Map();
  for (let i = 0; i < sent.length; i += 3) again.set(sent[i], { x: sent[i + 1], y: sent[i + 2] });
  const arr2 = arrange(graph, again);
  for (const b of arr.boxes) assert.deepEqual([box(arr2, b.id).x, box(arr2, b.id).y, box(arr2, b.id).w], [b.x, b.y, b.w], b.id);
});

test('a state with no place goes to the right of the others', () => {
  const m = rel();
  m.delete('s1.6');
  const arr = arrange(graph, m);
  const ready = box(arr, 's1.6'), work = box(arr, 's1.3');
  assert.ok(ready.x >= work.x + work.w + 40);
});

test('a state carried is drawn where the pointer takes it, the box it leaves keeps its size without it', () => {
  const before = box(arrange(graph, rel()), 's1.3');
  const arr = arrange(graph, rel(), { id: 's1.5', x: 600, y: 300 });
  assert.deepEqual([box(arr, 's1.5').x, box(arr, 's1.5').y], [600, 300]);
  assert.ok(box(arr, 's1.3').w < before.w);
  const sent = placesOf(graph, arr, 's1.5', 'm1.1');
  const i = sent.indexOf('s1.5');
  assert.deepEqual(sent.slice(i, i + 3), ['s1.5', 600, 300]);
});

test('the machine\'s places are from its own corner', () => {
  assert.deepEqual(cornerOf(graph, arrange(graph, rel()), 'm1.1'), { x: 0, y: 0 });
});

test('the initial dot goes on a side of its state with no other state there', () => {
  const free = arrange(graph, rel()).dots.find(d => d.to === 's1.2');
  assert.ok(free.x < 40);
  const crowded = arrange(graph, rel({ 's1.6': { x: -40, y: 30 } })).dots.find(d => d.to === 's1.2');
  assert.ok(crowded.y < 30, 'above, as left is taken');
});

test('ways: two between the same states bend apart, one back to its state loops', () => {
  const arr = arrange(graph, rel());
  const ways = route(graph, arr);
  const a = ways.find(w => w.id === 'w1.2'), b = ways.find(w => w.id === 'w1.3');
  assert.match(a.d, /Q/);
  assert.notDeepEqual([a.label.x, a.label.y], [b.label.x, b.label.y]);
  assert.match(ways.find(w => w.id === 'w1.4').d, /C/);
  assert.equal(ways.filter(w => w.start).length, 2);
});

test('the label of a way back to its own state sits close beside its loop', () => {
  const arr = arrange(graph, rel());
  const box = arr.boxes.find(b => b.id === 's1.6');
  const l = route(graph, arr).find(w => w.id === 'w1.4').label;
  const left = l.x - l.w / 2;
  assert.ok(left > box.x + box.w && left < box.x + box.w + 30, `left edge ${left}, box right ${box.x + box.w}`);
  assert.ok(l.y > box.y - 30 && l.y < box.y + 10, `y ${l.y}, box top ${box.y}`);
});

test('a state that uses a fragment is drawn wide enough for its mark, and what it shows of it is placed on the fragment only', () => {
  const g = {
    name: 'order',
    nodes: [
      { id: 'm2.1', name: 'order', kind: 'machine', parent: null },
      { id: 's2.2', name: 'charging', kind: 'state', parent: 'm2.1', initial: true, uses: 'retry', x: 40, y: 40 },
      { id: 'u2.2:2', name: 'attempt', kind: 'state', parent: 's2.2', initial: true, fixed: true, owner: 's2.2', x: 30, y: 40 },
    ],
    ways: [],
  };
  const closed = { ...g, nodes: g.nodes.slice(0, 2) };
  const rel = new Map(closed.nodes.filter(n => n.parent).map(n => [n.id, { x: n.x, y: n.y }]));
  const box = arrange(closed, rel).boxes.find(b => b.id === 's2.2');
  assert.equal(box.w, 7 * 'charging ◇ retry'.length + 32);
  const all = new Map(g.nodes.filter(n => n.parent).map(n => [n.id, { x: n.x, y: n.y }]));
  const arr = arrange(g, all);
  assert.ok(arr.boxes.find(b => b.id === 'u2.2:2'));
  assert.equal(arr.boxes.find(b => b.id === 's2.2').kind, 'group');
  assert.deepEqual(placesOf(g, arr), ['s2.2', 40, 40]);
});

test('what a state shows of a fragment with no places is laid out on its own, the state at its root', () => {
  const g = {
    name: 'order',
    nodes: [
      { id: 'm2.1', name: 'order', kind: 'machine', parent: null },
      { id: 's2.2', name: 'charging', kind: 'state', parent: 'm2.1', uses: 'retry', x: 40, y: 40 },
      { id: 'u2.2:2', name: 'attempt', kind: 'state', parent: 's2.2', fixed: true, owner: 's2.2' },
      { id: 'u2.2:3', name: 'done', kind: 'final', parent: 's2.2', fixed: true, owner: 's2.2' },
    ],
    ways: [{ id: 'v2.2:1', from: 'u2.2:2', to: ['u2.2:3'], fixed: true, owner: 's2.2' }, { id: 'w2.1', from: 's2.2', to: ['s2.2'] }],
  };
  const [sub, more] = unplacedInsides(g, new Map([['s2.2', { x: 40, y: 40 }]]));
  assert.equal(more, undefined);
  assert.equal(sub.name, 's2.2');
  assert.deepEqual(sub.nodes.map(n => [n.id, n.parent]), [['s2.2', null], ['u2.2:2', 's2.2'], ['u2.2:3', 's2.2']]);
  assert.deepEqual(sub.ways.map(w => w.id), ['v2.2:1']);
  assert.deepEqual(unplacedInsides(g, new Map([['u2.2:2', { x: 0, y: 0 }], ['u2.2:3', { x: 0, y: 0 }]])), []);
});
