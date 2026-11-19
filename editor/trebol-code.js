// <trebol-code>: the designer's code view, a CodeMirror editor that colours Trebol and takes the theme's colours.
// It is a widget face: its value is the text, both ways; `change` says the person changed it. Properties:
//   mark   [index length] of the text to mark (the chosen face), in code points from 1, or none
//   words  {style-word: kind}: words coloured as the dialect's (kind = "style" or "flag")
// Events: `caret` with detail = the code point index (from 1) where the person put the cursor; `undo` and `redo`
// on Ctrl+Z and Ctrl+Shift+Z or Ctrl+Y (Cmd on a Mac): the designer keeps the history, as it has every change,
// made in the code or with the mouse, so this editor keeps none. Their detail is the text when a change typed
// is still waiting to be sent, which then is not sent apart: none when there is none.
// <trebol-code-small>: the same for a block of a property: no line numbers, as tall as its lines (up to 10),
// and `change` only once the person leaves it, so what they type is read when they are done.
// Built into app/trebol-code.js by `npm run build:editor`.
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, Decoration } from '@codemirror/view';
import { EditorState, StateEffect, StateField, Annotation } from '@codemirror/state';
import { StreamLanguage, syntaxHighlighting, HighlightStyle, indentUnit, bracketMatching } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';

// --- Trebol's tokens, as editors/vscode/syntaxes/trebol.tmLanguage.json reads them ------------------------
const DELIM = /[\s\[\](){}";]/;
const CONTROL = new Set('if either unless case switch while until loop repeat foreach forall forskip forever break continue return exit throw catch try attempt do func function does has make'.split(' '));
const CONSTANT = new Set(['true', 'false', 'none', 'yes', 'no', 'on', 'off']);
const OPERATOR = new Set(['+', '-', '*', '**', '/', '//', '%', '%%', '=', '==', '<>', '!=', '<', '>', '<=', '>=', '=?', 'and', 'or', 'xor']);

function trebolMode(words) {
  return {
    name: 'trebol',
    startState: () => ({ braces: 0 }),
    copyState: s => ({ braces: s.braces }),
    token(stream, state) {
      // a {braced} string runs over lines, with braces inside it
      if (state.braces > 0) {
        while (!stream.eol()) {
          const c = stream.next();
          if (c === '^') stream.next();
          else if (c === '{') state.braces++;
          else if (c === '}' && --state.braces === 0) break;
        }
        return 'string';
      }
      if (stream.eatSpace()) return null;
      const c = stream.peek();
      if (c === ';') { stream.skipToEnd(); return 'comment'; }
      if (c === '"') {
        stream.next();
        while (!stream.eol()) {
          const d = stream.next();
          if (d === '^') stream.next();
          else if (d === '"') break;
        }
        return 'string';
      }
      if (c === '{') { stream.next(); state.braces = 1; return this.token(stream, state) ?? 'string'; }
      if (c === '[' || c === ']' || c === '(' || c === ')') { stream.next(); return 'bracket'; }
      if (stream.match(/^#"(?:\^.|[^"])"/)) return 'char';
      if (stream.match(/^<[A-Za-z/!?][^>]*>/)) return 'tag';
      // one value: up to the next delimiter
      let v = '';
      while (!stream.eol() && !DELIM.test(stream.peek())) v += stream.next();
      if (v === '') { stream.next(); return null; }
      if (/^#/.test(v)) return 'issue';
      if (/^%/.test(v)) return 'file';
      if (/^[A-Za-z][A-Za-z0-9+.\-]*:[^:]/.test(v) && !v.endsWith(':')) return 'url';
      if (/^[+-]?(?:[A-Za-z]{3})?\$|^[+-]?[\d.,]/.test(v) && /\d/.test(v)) return 'number';
      if (v.endsWith(':')) return 'setWord';
      if (v.startsWith(':')) return 'getWord';
      if (v.startsWith("'")) return 'litWord';
      if (v.startsWith('/')) return OPERATOR.has(v) ? 'operator' : 'refinement';
      if (v.endsWith('!')) return 'datatype';
      const w = v.split('/')[0].toLowerCase();
      if (OPERATOR.has(w)) return 'operator';
      if (CONSTANT.has(w)) return 'constant';
      const k = words[w];
      if (k === 'style') return 'style';
      if (k === 'flag') return 'flag';
      if (CONTROL.has(w)) return 'control';
      return 'word';
    },
    tokenTable: {
      comment: t.lineComment, string: t.string, bracket: t.bracket, char: t.character, tag: t.tagName,
      issue: t.atom, file: t.special(t.string), url: t.url, number: t.number, setWord: t.definition(t.variableName),
      getWord: t.variableName, litWord: t.atom, refinement: t.attributeName, datatype: t.typeName,
      operator: t.operator, constant: t.bool, style: t.keyword, flag: t.modifier, control: t.controlKeyword,
      word: t.name,
    },
  };
}

// colours: the theme's own where it has them, else a pair for light and dark (the page sets color-scheme)
const c = (light, dark) => `light-dark(${light}, ${dark})`;
const highlight = HighlightStyle.define([
  { tag: t.lineComment, color: 'var(--tb-muted, #6b7280)', fontStyle: 'italic' },
  { tag: [t.string, t.special(t.string), t.character], color: c('#047857', '#6ee7b7') },
  { tag: t.keyword, color: c('#6d28d9', '#c4b5fd') },
  { tag: t.modifier, color: c('#0e7490', '#67e8f9') },
  { tag: t.definition(t.variableName), color: c('#b45309', '#fcd34d') },
  { tag: [t.atom, t.url, t.tagName], color: c('#be185d', '#f9a8d4') },
  { tag: [t.number, t.bool], color: c('#1d4ed8', '#93c5fd') },
  { tag: [t.typeName, t.attributeName], color: c('#0f766e', '#5eead4') },
  { tag: t.controlKeyword, color: c('#9f1239', '#fda4af') },
  { tag: [t.bracket, t.operator], color: 'var(--tb-muted, #78716c)' },
]);

const smallTheme = EditorView.theme({
  '&': { minHeight: '30px', maxHeight: '180px', border: '1px solid var(--tb-border, #d6d3d1)', borderRadius: '6px', background: 'var(--tb-surface, #fff)', color: 'var(--tb-text, #1c1c1c)', fontSize: '12px' },
  '&.cm-focused': { outline: '2px solid var(--tb-primary, #2563eb)', outlineOffset: '-1px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace', lineHeight: '1.5', overflow: 'auto' },
  '.cm-content': { caretColor: 'var(--tb-text, #000)', padding: '4px 0' },
  '.cm-line': { padding: '0 8px' },
  '.cm-activeLine': { background: 'transparent' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { background: 'color-mix(in oklch, var(--tb-primary, #2563eb) 22%, transparent) !important' },
});

const theme = EditorView.theme({
  '&': { height: '100%', minHeight: '240px', background: 'var(--tb-surface, #fff)', color: 'var(--tb-text, #1c1c1c)', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--tb-text, #000)', padding: '8px 0' },
  '.cm-gutters': { background: 'var(--tb-surface, #fff)', color: 'var(--tb-muted, #8a8a8a)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px 0 8px', minWidth: '28px' },
  '.cm-activeLine': { background: 'transparent' },
  '.cm-tb-mark': { background: 'var(--tb-primary-soft, #eef3ff)' },
  '.cm-tb-mark-line': { boxShadow: 'inset 3px 0 0 var(--tb-primary, #2563eb)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { background: 'color-mix(in oklch, var(--tb-primary, #2563eb) 22%, transparent) !important' },
  '.cm-matchingBracket': { background: 'color-mix(in oklch, var(--tb-primary, #2563eb) 18%, transparent)', outline: 'none' },
});

// --- the mark of the chosen face --------------------------------------------------------------------------
const setMark = StateEffect.define();
const markField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setMark)) continue;
      if (!e.value) { deco = Decoration.none; continue; }
      const { from, to } = e.value;
      const doc = tr.state.doc;
      const ranges = [];
      for (let l = doc.lineAt(from).number; l <= doc.lineAt(Math.max(from, to - 1)).number; l++) {
        ranges.push(Decoration.line({ class: 'cm-tb-mark-line' }).range(doc.line(l).from));
      }
      ranges.push(Decoration.mark({ class: 'cm-tb-mark' }).range(from, Math.max(from, to)));
      deco = Decoration.set(ranges, true);
    }
    return deco;
  },
  provide: f => EditorView.decorations.from(f),
});

// what Trebol sets is not the person's change
const fromTrebol = Annotation.define();

// code point index (from 1) <-> UTF-16 offset
function offsetOf(text, index) {
  let o = 0, n = 1;
  while (n < index && o < text.length) { o += text.codePointAt(o) > 0xffff ? 2 : 1; n++; }
  return o;
}
function indexOf(text, offset) {
  let o = 0, n = 1;
  while (o < offset && o < text.length) { o += text.codePointAt(o) > 0xffff ? 2 : 1; n++; }
  return n;
}

class TrebolCode extends HTMLElement {
  static small = false;
  #view = null;
  #text = '';
  #mark = null;
  #words = {};
  #changed = 0;
  #dirty = false;

  // what was typed and not yet sent goes with the undo, as one event, so it is undone as the rest
  #ask(what) {
    const waiting = this.#changed !== 0;
    clearTimeout(this.#changed);
    this.#changed = 0;
    this.dispatchEvent(new CustomEvent(what, { detail: waiting ? this.#text : null }));
    return true;
  }

  #left() {
    if (!this.#dirty) return;
    this.#dirty = false;
    this.dispatchEvent(new Event('change'));
  }

  connectedCallback() {
    if (this.#view) return;
    // as wide as its place, whatever the lines: they scroll inside it
    this.style.contain = 'inline-size';
    // the person left it: what they typed is read now
    this.addEventListener('focusout', () => this.#left());
    this.#view = new EditorView({
      parent: this,
      state: this.#state(this.#text),
    });
    this.#showMark();
  }

  #state(doc) {
    const small = this.constructor.small;
    // the small one undoes its own typing; the big one asks the designer
    const undo = small ? [history()] : [];
    const undoKeys = small ? historyKeymap : [
      { key: 'Mod-z', run: () => this.#ask('undo'), preventDefault: true },
      { key: 'Mod-Shift-z', run: () => this.#ask('redo'), preventDefault: true },
      { key: 'Mod-y', run: () => this.#ask('redo'), preventDefault: true },
    ];
    return EditorState.create({
      doc,
      extensions: [
        ...(this.constructor.small ? [] : [lineNumbers()]),
        ...undo, drawSelection(), highlightActiveLine(), bracketMatching(), highlightSelectionMatches(),
        indentUnit.of('    '), EditorState.tabSize.of(4),
        StreamLanguage.define(trebolMode(this.#words)), syntaxHighlighting(highlight),
        this.constructor.small ? smallTheme : theme, markField,
        keymap.of([...undoKeys, indentWithTab, ...defaultKeymap, ...searchKeymap]),
        EditorView.contentAttributes.of({ 'aria-label': this.getAttribute('aria-label') ?? 'Code' }),
        EditorView.updateListener.of(u => this.#update(u)),
      ],
    });
  }

  #update(u) {
    const mine = u.transactions.some(tr => tr.annotation(fromTrebol));
    if (u.docChanged && !mine) {
      this.#text = u.state.doc.toString();
      if (this.constructor.small) { this.#dirty = true; return; }
      // the design is read again from the text: not on every key
      clearTimeout(this.#changed);
      this.#changed = setTimeout(() => { this.#changed = 0; this.dispatchEvent(new Event('change')); }, 250);
    }
    if (u.selectionSet && !mine && !u.docChanged && u.transactions.some(tr => tr.isUserEvent('select'))) {
      const at = u.state.selection.main.head;
      this.dispatchEvent(new CustomEvent('caret', { detail: indexOf(u.state.doc.toString(), at) }));
    }
  }

  get value() { return this.#text; }
  set value(v) {
    const text = typeof v === 'string' ? v : '';
    if (text === this.#text) return;
    this.#text = text;
    const view = this.#view;
    if (!view) return;
    const doc = view.state.doc.toString();
    if (doc === text) return;
    // the smallest change, so the cursor and the scroll stay where they are
    let a = 0;
    while (a < doc.length && a < text.length && doc[a] === text[a]) a++;
    let z = 0;
    while (z < doc.length - a && z < text.length - a && doc[doc.length - 1 - z] === text[text.length - 1 - z]) z++;
    view.dispatch({ changes: { from: a, to: doc.length - z, insert: text.slice(a, text.length - z) }, annotations: fromTrebol.of(true) });
    this.#showMark();
  }

  get mark() { return this.#mark; }
  set mark(m) {
    this.#mark = Array.isArray(m) && m.length === 2 ? m : null;
    this.#showMark();
  }

  get words() { return this.#words; }
  set words(w) {
    this.#words = w && typeof w === 'object' ? w : {};
    // the colours come from the language: a new one with the words
    if (this.#view) {
      const sel = this.#view.state.selection;
      this.#view.setState(this.#state(this.#view.state.doc.toString()));
      this.#view.dispatch({ selection: sel, annotations: fromTrebol.of(true) });
      this.#showMark();
    }
  }

  #showMark() {
    const view = this.#view;
    if (!view) return;
    const doc = view.state.doc.toString();
    let value = null;
    if (this.#mark) {
      const from = offsetOf(doc, this.#mark[0]);
      const to = offsetOf(doc, this.#mark[0] + this.#mark[1]);
      if (from <= doc.length) value = { from, to: Math.min(to, doc.length) };
    }
    const effects = [setMark.of(value)];
    // the person typing in it: the mark follows, the view stays
    if (value && !view.hasFocus) effects.push(EditorView.scrollIntoView(value.from, { y: 'nearest', yMargin: 48 }));
    view.dispatch({ effects, annotations: fromTrebol.of(true) });
  }
}

customElements.define('trebol-code', TrebolCode);
customElements.define('trebol-code-small', class extends TrebolCode { static small = true; });
