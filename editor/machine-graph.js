// <tb-machine-graph>: the designer's canvas for a machine. The machine is made here with the mouse, and the
// designer writes it as Trebol; the drawing is laid out by ELK every time (graph-draw.js), so nothing is placed
// by hand: dragging a state only puts it inside another state, or out of it.
//   - The bar: State, Final and Parallel are dragged onto the drawing (into a box: inside that state), or
//     clicked to add one to the machine; Undo and Redo; Try, or Restart and Stop while the machine runs.
//   - A double click on an empty spot adds a state there (inside the box it is in); on a name or a way's label
//     it renames it in place; Enter keeps it, Escape leaves it.
//   - Around the state under the pointer, four dots: dragged onto a state they make a way to it, onto an empty
//     spot a new state and a way to it.
//   - A right click gives what can be done to a state or a way; Delete deletes what is chosen.
// It is laid out both left to right and top to bottom, and drawn the way that fits its place better, made
// smaller to fit down to 80%; a bigger one scrolls.
// Properties:
//   graph     {name, nodes: [{id, name, kind, parent, initial}], ways: [{id, from, to: [id...], label, events}]}
//             kind is machine, state, final or parallel; parent is the id of the node it is in (none for the machine)
//   selected  the id of what is chosen, or none       active   ids of the states the machine is in (Try)
//   editing   the id of a state or way whose name is to be typed now, as it is made, or none
//   trying    whether the machine runs (Try)          canUndo, canRedo   whether Undo and Redo can be used
// Events, their detail: pick id · add [kind parent] (kind state, final, parallel or machine) · connect [from to] ·
// grow from (a new state and a way to it) · rename [id text] · remove id · initial id · move [id parent] ·
// undo · redo · try · restart · stop.
// Built into app/machine-graph.js by `npm run build:graph`, with ELK's worker copied to app/elk-worker.js.
import { css, drawGraph, elkGraph, layouter, svg, HEAD } from './graph-draw.js';

const SMALLEST = 0.8;     // how much a drawing may shrink to fit its place
const NEAR = 14;          // how far from a state its dots stay shown

const ICONS = {
  state: '<rect x="3" y="6" width="18" height="12" rx="4"/>',
  final: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><rect x="5.5" y="8.5" width="13" height="7" rx="2"/>',
  parallel: '<rect x="3" y="4" width="18" height="16" rx="3" stroke-dasharray="3 2.5"/><path d="M12 7v10"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  try: '<path d="M7 4v16l13-8z"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  stop: '<path d="M6 6l12 12M18 6 6 18"/>',
};

function button(cls, icon, text, title) {
  const b = document.createElement('button');
  b.type = 'button';
  if (cls) b.className = cls;
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
  b.append(text);
  if (title) b.title = title;
  return b;
}

class MachineGraph extends HTMLElement {
  #root = this.attachShadow({ mode: 'open' });
  #bar = document.createElement('div');
  #stage = document.createElement('div');
  #graph = null;
  #json = '';
  #selected = null;
  #active = [];
  #editing = null;   // the editing asked last, so the same one asked again opens once
  #pending = null;   // an editing asked and not opened yet: its state is drawn after the layout ends
  #trying = false;
  #canUndo = false;
  #canRedo = false;
  #svg = null;
  #rects = [];        // the boxes drawn, innermost first
  #turn = 0;          // the layout asked last: an older one that ends later is dropped
  #laid = null;       // {RIGHT, DOWN}: ELK's layouts of the graph
  #shown = '';        // which of them is drawn, and how big
  #press = null;      // what the pointer is doing on the drawing: {mode: press | move | link, ...}
  #handled = false;   // the click that ends a press did its work on pointerup
  #hover = null;      // the state whose dots are shown
  #menu = null;
  #inline = null;     // the box a name is typed in: {id, input, place, finish}
  #watch = new ResizeObserver(() => this.#show());

  constructor() {
    super();
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    this.#root.adoptedStyleSheets = [sheet];
    this.#bar.className = 'bar';
    this.#bar.setAttribute('role', 'toolbar');
    this.#bar.setAttribute('aria-label', 'Machine');
    this.#stage.className = 'stage';
    this.#stage.tabIndex = 0;
    this.#stage.setAttribute('aria-label', 'Drawing of the machine');
    const frame = Object.assign(document.createElement('div'), { className: 'frame' });
    frame.append(this.#bar, this.#stage);
    this.#root.append(frame);
    this.#listen();
    this.#fillBar();
  }

  connectedCallback() { this.#watch.observe(this.#stage); }
  disconnectedCallback() { this.#watch.disconnect(); this.#closeMenu(); }

  get graph() { return this.#graph; }
  set graph(g) {
    const json = JSON.stringify(g ?? null);
    if (json === this.#json) return;
    this.#json = json;
    this.#graph = g && Array.isArray(g.nodes) ? g : null;
    this.#fillBar();
    this.#layout();
  }

  get selected() { return this.#selected; }
  set selected(id) { this.#selected = typeof id === 'string' ? id : null; this.#paint(); }

  get active() { return this.#active; }
  set active(ids) { this.#active = Array.isArray(ids) ? ids : []; this.#paint(); }

  get editing() { return this.#editing; }
  set editing(id) {
    const want = typeof id === 'string' ? id : null;
    // none takes back nothing asked: the designer clears it at once, before the drawing is ready
    if (want && want !== this.#editing) this.#pending = want;
    this.#editing = want;
    this.#openEditing();
  }

  get trying() { return this.#trying; }
  set trying(v) { if (this.#trying !== !!v) { this.#trying = !!v; this.#fillBar(); } }

  get canUndo() { return this.#canUndo; }
  set canUndo(v) { this.#canUndo = !!v; this.#fillBar(); }

  get canRedo() { return this.#canRedo; }
  set canRedo(v) { this.#canRedo = !!v; this.#fillBar(); }

  #tell(name, detail = null) { this.dispatchEvent(new CustomEvent(name, { detail })); }

  #rootId() { return this.#graph?.nodes.find(n => n.parent == null)?.id ?? null; }
  #node(id) { return this.#graph?.nodes.find(n => n.id === id) ?? null; }
  #way(id) { return this.#graph?.ways.find(w => w.id === id) ?? null; }

  /** Whether a node is another or inside it. */
  #within(id, outer) {
    for (let n = this.#node(id); n; n = this.#node(n.parent)) if (n.id === outer) return true;
    return false;
  }

  // --- the bar ------------------------------------------------------------------------------------

  #fillBar() {
    const bar = this.#bar;
    bar.replaceChildren();
    const tools = [['state', 'State', 'Drag it onto the drawing, or click it'],
      ['final', 'Final', 'A state the machine ends in'],
      ['parallel', 'Parallel', 'A state whose regions run at once']];
    for (const [kind, text, title] of tools) {
      const b = button('tool', kind, text, title);
      b.disabled = !this.#graph;
      b.addEventListener('pointerdown', ev => this.#toolDown(ev, kind, text));
      b.addEventListener('click', () => {
        if (this.#handled) { this.#handled = false; return; }
        this.#tell('add', [kind, this.#rootId()]);
      });
      bar.append(b);
    }
    bar.append(Object.assign(document.createElement('span'), { className: 'sep' }));
    const undo = button('', 'undo', 'Undo');
    undo.disabled = !this.#canUndo;
    undo.addEventListener('click', () => this.#tell('undo'));
    const redo = button('', 'redo', 'Redo');
    redo.disabled = !this.#canRedo;
    redo.addEventListener('click', () => this.#tell('redo'));
    bar.append(undo, redo);
    if (!this.#graph) return;
    if (this.#trying) {
      const restart = button('go', 'restart', 'Restart');
      restart.addEventListener('click', () => this.#tell('restart'));
      const stop = button('', 'stop', 'Stop');
      stop.addEventListener('click', () => this.#tell('stop'));
      bar.append(restart, stop);
    } else {
      const go = button('go', 'try', 'Try', 'Run the machine here and send it events');
      go.addEventListener('click', () => this.#tell('try'));
      bar.append(go);
    }
  }

  // a tool dragged from the bar: a ghost follows the pointer, and the box it would go in is lit
  #toolDown(ev, kind, text) {
    if (ev.button !== 0 || !this.#graph) return;
    const b = ev.currentTarget;
    b.setPointerCapture(ev.pointerId);
    const ghost = Object.assign(document.createElement('div'), { className: 'ghost', textContent: text });
    let moved = false, into = null;
    const start = [ev.clientX, ev.clientY];
    const move = e => {
      if (!moved && Math.hypot(e.clientX - start[0], e.clientY - start[1]) < 5) return;
      if (!moved) { moved = true; this.#root.append(ghost); }
      ghost.style.left = `${e.clientX + 10}px`;
      ghost.style.top = `${e.clientY + 6}px`;
      into = this.#svg && this.#overStage(e) ? this.#containerAt(this.#at(e), null) : null;
      this.#target(into);
    };
    const up = e => {
      b.removeEventListener('pointermove', move);
      b.removeEventListener('pointerup', up);
      b.removeEventListener('pointercancel', up);
      ghost.remove();
      this.#target(null);
      if (!moved) return;
      this.#handled = true;
      if (e.type === 'pointerup' && into) this.#tell('add', [kind, into]);
    };
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }

  #overStage(e) {
    const r = this.#stage.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  // --- drawing --------------------------------------------------------------------------------------

  async #layout() {
    const turn = ++this.#turn;
    const g = this.#graph;
    if (!g || !g.nodes.length) {
      this.#laid = null;
      this.#svg = null;
      const empty = Object.assign(document.createElement('div'), { className: 'empty' });
      empty.append('This file makes no machines yet.');
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: 'New machine' });
      b.addEventListener('click', () => this.#tell('add', ['machine', null]));
      empty.append(b);
      this.#stage.replaceChildren(empty);
      return;
    }
    let laid;
    try {
      const [right, down] = await Promise.all(['RIGHT', 'DOWN'].map(d => layouter().layout(elkGraph(g, d))));
      laid = { RIGHT: right, DOWN: down };
    } catch (e) {
      if (turn !== this.#turn) return;
      this.#stage.replaceChildren(Object.assign(document.createElement('div'), { className: 'empty', textContent: `The drawing failed: ${e?.message ?? e}` }));
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
    const W = Math.max(1, this.#stage.clientWidth - 8), H = Math.max(1, this.#stage.clientHeight - 8);
    const fit = l => Math.min(W / l.width, H / l.height);
    const way = fit(this.#laid.DOWN) > fit(this.#laid.RIGHT) * 1.05 ? 'DOWN' : 'RIGHT';
    const scale = Math.round(Math.min(1, Math.max(SMALLEST, fit(this.#laid[way]))) * 20) / 20;
    const shown = `${way} ${scale}`;
    if (shown === this.#shown) return;
    this.#shown = shown;
    const { svg: s, rects } = drawGraph(this.#graph, this.#laid[way], scale);
    this.#svg = s;
    this.#rects = rects;
    this.#hover = null;
    const parts = [s];
    const states = this.#graph.nodes.length - 1;
    if (states < 3 || this.#graph.ways.length === 0) {
      parts.push(Object.assign(document.createElement('div'), { className: 'hint',
        textContent: 'Drag a state from the bar, or double-click an empty spot. Drag from the dots around a state to join it to another.' }));
    }
    this.#stage.replaceChildren(...parts);
    // a name being typed stays, over its state as now drawn
    if (this.#inline) {
      this.#stage.append(this.#inline.input);
      if (!this.#inline.place()) this.#inline.input.remove();
      else this.#inline.input.focus();
    }
    this.#paint();
    this.#openEditing();
    // one asked for what this drawing does not have (taken back with Undo) is dropped
    if (this.#pending && !this.#el(this.#pending)) this.#pending = null;
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

  #el(id) { return id ? this.#svg?.querySelector(`[data-id="${CSS.escape(id)}"]`) : null; }

  /** A point of the page in the drawing's coordinates. */
  #at(ev) {
    const p = this.#svg.createSVGPoint();
    p.x = ev.clientX;
    p.y = ev.clientY;
    return p.matrixTransform(this.#svg.getScreenCTM().inverse());
  }

  #inside(r, p, pad = 0) { return p.x >= r.x - pad && p.x <= r.x + r.width + pad && p.y >= r.y - pad && p.y <= r.y + r.height + pad; }

  /** The innermost state under a point: not the machine. */
  #stateAt(p) { return this.#rects.find(r => r.kind !== 'machine' && this.#inside(r, p)) ?? null; }

  /** The id of the box a state dropped at a point goes into: a state that can hold states, or the machine. */
  #containerAt(p, moving) {
    for (const r of this.#rects) {
      if (r.kind === 'final' || !this.#inside(r, p)) continue;
      if (moving && this.#within(r.id, moving)) continue;
      return r.id;
    }
    return this.#rootId();
  }

  #target(id) {
    for (const g of this.#svg?.querySelectorAll('.node.target') ?? []) g.classList.remove('target');
    this.#el(id)?.classList.add('target');
  }

  // --- the dots around a state ----------------------------------------------------------------------

  #showDots(r) {
    const overlay = this.#svg?.querySelector('.overlay');
    if (!overlay) return;
    if (this.#hover === r?.id) return;
    this.#hover = r?.id ?? null;
    overlay.replaceChildren();
    if (!r || this.#press) return;
    const spots = [[r.x + r.width / 2, r.y], [r.x + r.width, r.y + r.height / 2], [r.x + r.width / 2, r.y + r.height], [r.x, r.y + r.height / 2]];
    for (const [cx, cy] of spots) {
      const c = svg('circle', { class: 'handle', cx, cy, r: 5.5, 'data-for': r.id }, overlay);
      svg('title', {}, c).textContent = 'Drag onto another state to make a way';
    }
  }

  // --- the pointer on the drawing -------------------------------------------------------------------

  #listen() {
    const st = this.#stage;
    st.addEventListener('pointermove', ev => {
      if (!this.#svg) return;
      const p = this.#at(ev);
      const press = this.#press;
      if (!press) {
        const r = this.#stateAt(p);
        if (r) this.#showDots(r);
        else {
          const kept = this.#rects.find(x => x.id === this.#hover);
          if (!kept || !this.#inside(kept, p, NEAR)) this.#showDots(null);
        }
        return;
      }
      if (press.mode === 'link') {
        press.line.setAttribute('d', `M${press.start.x},${press.start.y} L${p.x},${p.y}`);
        press.over = this.#stateAt(p)?.id ?? null;
        this.#target(press.over);
        return;
      }
      if (press.mode === 'press' && Math.hypot(ev.clientX - press.client[0], ev.clientY - press.client[1]) > 5) {
        press.mode = 'move';
        this.#el(press.id)?.classList.add('lifted');
        this.#showDots(null);
      }
      if (press.mode === 'move') {
        press.into = this.#containerAt(p, press.id);
        this.#target(press.into);
      }
    });
    st.addEventListener('pointerdown', ev => {
      this.#closeMenu();
      if (ev.button !== 0 || !this.#svg) return;
      const p = this.#at(ev);
      const dot = ev.target.closest?.('.handle');
      if (dot) {
        ev.preventDefault();
        st.setPointerCapture(ev.pointerId);
        const from = dot.getAttribute('data-for');
        const start = { x: +dot.getAttribute('cx'), y: +dot.getAttribute('cy') };
        const line = svg('path', { class: 'rubber', d: `M${start.x},${start.y}` }, this.#svg);
        this.#press = { mode: 'link', from, start, line, over: null };
        this.#svg.querySelector('.overlay')?.replaceChildren();
        this.#hover = null;
        return;
      }
      if (ev.target.closest?.('.way')) return;
      const r = this.#stateAt(p);
      if (r) {
        st.setPointerCapture(ev.pointerId);
        this.#press = { mode: 'press', id: r.id, client: [ev.clientX, ev.clientY] };
      }
    });
    const end = ev => {
      const press = this.#press;
      if (!press) return;
      this.#press = null;
      this.#target(null);
      press.line?.remove();
      this.#el(press.id)?.classList.remove('lifted');
      if (ev.type !== 'pointerup') return;
      this.#handled = true;
      if (press.mode === 'press') { if (press.id !== this.#selected) this.#tell('pick', press.id); }
      else if (press.mode === 'link') {
        if (press.over) this.#tell('connect', [press.from, press.over]);
        else this.#tell('grow', press.from);
      } else if (press.mode === 'move') {
        const n = this.#node(press.id);
        if (press.into && n && press.into !== n.parent) this.#tell('move', [press.id, press.into]);
      }
    };
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', end);
    st.addEventListener('pointerleave', () => { if (!this.#press) this.#showDots(null); });
    st.addEventListener('click', ev => {
      if (this.#handled) { this.#handled = false; return; }
      if (!this.#svg) return;
      const way = ev.target.closest?.('.way');
      if (way) return this.#tell('pick', way.getAttribute('data-id'));
      if (!this.#stateAt(this.#at(ev))) this.#tell('pick', this.#rootId());
    });
    st.addEventListener('dblclick', ev => {
      if (!this.#svg) return;
      ev.preventDefault();
      const way = ev.target.closest?.('.way');
      if (way) return this.#rename(way.getAttribute('data-id'));
      const p = this.#at(ev);
      const r = this.#stateAt(p);
      if (!r) return this.#tell('add', ['state', this.#rootId()]);
      // a box with states inside: its name renames it, its room takes a new state
      if ((r.kind === 'group' || r.kind === 'parallel') && p.y > r.y + HEAD) return this.#tell('add', ['state', r.id]);
      this.#rename(r.id);
    });
    st.addEventListener('contextmenu', ev => {
      if (!this.#svg) return;
      ev.preventDefault();
      const way = ev.target.closest?.('.way');
      const r = way ? null : this.#stateAt(this.#at(ev));
      this.#openMenu(ev, way ? way.getAttribute('data-id') : r?.id ?? this.#rootId());
    });
    st.addEventListener('keydown', ev => {
      const node = ev.target.closest?.('.node');
      const id = node?.getAttribute('data-id') ?? this.#selected;
      if (ev.key === 'Enter' && node) { ev.preventDefault(); this.#tell('pick', id); }
      else if ((ev.key === 'Delete' || ev.key === 'Backspace') && id && id !== this.#rootId()) { ev.preventDefault(); this.#tell('remove', id); }
      else if (ev.key === 'F2' && id && id !== this.#rootId()) { ev.preventDefault(); this.#rename(id); }
      else if (ev.key === 'ContextMenu' && node) {
        ev.preventDefault();
        const b = node.getBoundingClientRect();
        this.#openMenu({ clientX: b.left + 8, clientY: b.bottom }, id);
      }
    });
  }

  // --- naming in place --------------------------------------------------------------------------------

  #openEditing() {
    const id = this.#pending;
    if (!id || !this.#el(id)) return;
    this.#pending = null;
    this.#rename(id);
  }

  #rename(id) {
    const el = this.#el(id);
    if (!el) return;
    const way = this.#way(id);
    const node = way ? null : this.#node(id);
    if (!way && (!node || node.kind === 'machine')) return;
    const was = way ? way.events ?? '' : node.name;
    const input = Object.assign(document.createElement('input'), { className: 'inline', value: was, spellcheck: false });
    input.setAttribute('aria-label', way ? 'The events the way is taken on' : 'The name of the state');
    if (way) input.placeholder = 'event';
    // it takes the place of what it names, wherever the drawing has it now, so it never looks like a second
    // state: a state's whole box, the head of a box with states inside, a way's label; the name drawn under
    // it is hidden, and it grows to the sides when the name typed is longer
    const place = () => {
      const at = this.#el(id);
      if (!at) return false;
      for (const g of this.#svg?.querySelectorAll('.naming') ?? []) g.classList.remove('naming');
      at.classList.add('naming');
      const st = this.#stage.getBoundingClientRect();
      let spot, height, radius;
      if (way) {
        spot = (at.querySelector('.label-bg') ?? at.querySelector('.line')).getBoundingClientRect();
        height = 28;
        radius = 6;
      } else {
        const box = at.querySelector('.box');
        const b = box.getBoundingClientRect();
        const scale = b.width / (+box.getAttribute('width') || b.width || 1);
        const head = at.classList.contains('group') || at.classList.contains('parallel');
        spot = head ? { left: b.left + 4 * scale, top: b.top + 3 * scale, width: b.width - 8 * scale, height: (HEAD - 2) * scale } : b;
        height = spot.height;
        radius = (head ? 7 : 9) * scale;
      }
      input.style.height = `${height}px`;
      input.style.borderRadius = `${radius}px`;
      input.style.width = `${spot.width}px`;
      const w = Math.max(spot.width, input.scrollWidth > input.clientWidth ? input.scrollWidth + 16 : 0, way ? 90 : 0);
      input.style.width = `${w}px`;
      input.style.left = `${Math.max(this.#stage.scrollLeft + 2, spot.left - st.left + this.#stage.scrollLeft + spot.width / 2 - w / 2)}px`;
      input.style.top = `${spot.top - st.top + this.#stage.scrollTop + spot.height / 2 - height / 2}px`;
      return true;
    };
    input.addEventListener('input', () => place());
    let done = false;
    // it closes when the person leaves it: a click elsewhere or Tab; the designer drawing its panels anew
    // may take the focus away, which gives it back
    let left = false;
    const away = e => { if (!e.composedPath().includes(input)) left = true; };
    document.addEventListener('pointerdown', away, true);
    const finish = keep => {
      if (done) return;
      done = true;
      document.removeEventListener('pointerdown', away, true);
      this.#inline = null;
      input.remove();
      for (const g of this.#svg?.querySelectorAll('.naming') ?? []) g.classList.remove('naming');
      const text = input.value.trim();
      if (keep && text && text !== was) this.#tell('rename', [id, text]);
      this.#stage.focus({ preventScroll: true });
    };
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Tab') left = true;
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => {
      if (left) return finish(true);
      setTimeout(() => { if (!done && input.isConnected) input.focus(); });
    });
    input.addEventListener('pointerdown', e => e.stopPropagation());
    input.addEventListener('dblclick', e => e.stopPropagation());
    this.#inline?.finish(true);
    this.#stage.append(input);
    place();
    this.#inline = { id, input, place, finish };
    input.focus();
    input.select();
  }

  // --- the menu of a right click ----------------------------------------------------------------------

  #openMenu(ev, id) {
    this.#closeMenu();
    if (!id) return;
    const items = [];
    const way = this.#way(id);
    const node = way ? null : this.#node(id);
    if (way) {
      items.push(['Rename its events', () => this.#rename(id)], ['Delete the way', () => this.#tell('remove', id), 'danger']);
    } else if (node?.kind === 'machine') {
      items.push(['Add a state', () => this.#tell('add', ['state', id])], ['Add a final state', () => this.#tell('add', ['final', id])]);
    } else if (node) {
      const parent = this.#node(node.parent);
      if (!node.initial && parent?.kind !== 'parallel') items.push(['Make it the initial state', () => this.#tell('initial', id)]);
      if (node.kind !== 'final') items.push(['Add a state inside', () => this.#tell('add', ['state', id])]);
      items.push(['Rename', () => this.#rename(id)]);
      if (node.parent !== this.#rootId()) items.push(['Take it out of ' + (parent?.name ?? 'its state'), () => this.#tell('move', [id, parent?.parent])]);
      items.push(['Delete the state', () => this.#tell('remove', id), 'danger']);
    }
    if (!items.length) return;
    this.#tell('pick', id);
    const menu = Object.assign(document.createElement('div'), { className: 'menu' });
    menu.setAttribute('role', 'menu');
    for (const [text, act, cls] of items) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: text });
      b.setAttribute('role', 'menuitem');
      if (cls) b.className = cls;
      b.addEventListener('click', () => { this.#closeMenu(); act(); });
      menu.append(b);
    }
    menu.addEventListener('keydown', e => {
      const bs = [...menu.querySelectorAll('button')];
      const i = bs.indexOf(this.#root.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); this.#closeMenu(); this.#stage.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
    });
    menu.style.left = `${Math.min(ev.clientX, innerWidth - 200)}px`;
    menu.style.top = `${Math.min(ev.clientY, innerHeight - 40 * items.length - 16)}px`;
    this.#root.append(menu);
    this.#menu = menu;
    menu.querySelector('button').focus();
    this.#outside = e => { if (!e.composedPath().includes(menu)) this.#closeMenu(); };
    setTimeout(() => document.addEventListener('pointerdown', this.#outside, true));
  }

  #outside = null;

  #closeMenu() {
    this.#menu?.remove();
    this.#menu = null;
    if (this.#outside) document.removeEventListener('pointerdown', this.#outside, true);
    this.#outside = null;
  }
}

customElements.define('tb-machine-graph', MachineGraph);
