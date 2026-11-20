// node docs/designer/shots.mjs [name...]: takes the screenshots of the designer's tutorial again, into
// docs/designer/img. Run the designer first on an empty folder named cog-and-chain (its app.trb is rewritten
// for each shot) and pass it as DIR:
//   node bin/trebol-dev.js /tmp/cog-and-chain --port 5342 &  DIR=/tmp/cog-and-chain node docs/designer/shots.mjs
// Needs Google Chrome; set CHROME to
// its path when it is not the macOS one, PORT when the designer runs on another port.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = new URL('./img', import.meta.url).pathname;
const URL_ = `http://localhost:${process.env.PORT ?? 5342}/`;
const DIR = process.env.DIR;
const CDP = 9381;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const head = `Trebol [title: "Cog & Chain"]\n\n`;
const style = `stylize [\n    big: button [size: 'large]\n    note: text [role: 'muted]\n]\n\n`;
const A = head + `view [\n    title "Cog & Chain"\n]\n`;
const form = (lines, ind = '    ') => `${ind}form [\n${lines.map(l => `${ind}    ${l}\n`).join('')}${ind}]\n`;
const cust = 'field customer "Customer" required', bike = `choice bike "Bike" ["Road" "Mountain" "City" "Child's"]`;
const C = (...l) => head + `view [\n    title "Cog & Chain"\n${form(l)}]\n`;
const screens = (booking, extra = '') => `view [\n    title "Cog & Chain"\n${extra}    screens [
        counter "Counter" [
${form([cust, bike, 'submit "Book in" [toast "Booked in"]'], '            ')}        ]
        workshop "Workshop" [
            table [customer "Customer" bike "Bike"]
        ]
${booking}    ]
]
`;
const tabs = `        booking "Booking" [id] [
            tabs [
                "Repair" [
                    area fault "What is wrong"
                ]
                "Parts" [
                    rows parts "Parts" [field part "Part"  money price "Price"]
                ]
            ]
        ]
`;
const note = `    note "Bicycle repairs, done right."\n`;

const ways = `        from checking to waiting on need-parts set [parts: event/count]
        from checking to fixing on fixable
        from waiting to fixing on arrived
`;
const repair = (outer, inner = ways) => `repair: machine [
    data [bike: none  parts: 0]
    initial received
    state received []
    state work [
        initial checking
        state checking []
        state waiting []
        state fixing []
${inner}    ]
    final ready
${outer}]

view [
    title "Cog & Chain"
]
`;
const M = head + repair(`    from received to work on start set [bike: event/bike]
    from work to ready on fixed
`);
const machines = ['click', 'Machines'];

const shots = {
  window: [A, []],
  'add-menu': [A, [['tree', 'view'], ['click', 'Add'], ['click', 'Layout']]],
  added: [A, [['tree', 'view'], ['click', 'Add'], ['click', 'Layout'], ['click', 'Form'], ['click', 'Add'], ['click', 'Input'], ['click', 'Field']]],
  options: [C(cust, bike), [['tree', 'choice bike'], ['scroll', 'Written']]],
  design: [C(cust, bike, 'submit "Book in"'), [['tree', 'submit'], ['click', 'Design']]],
  phone: [C(cust, bike, 'submit "Book in"'), [['tree', 'submit'], ['click', 'Design'], ['click', 'Phone']]],
  'find-option': [C('field customer "Customer"'), [['tree', 'field customer'], ['type', 'Find an option', 'requ']]],
  written: [C(cust, bike, 'submit "Book in"'), [['tree', 'field customer'], ['scroll', 'Written']]],
  action: [C(cust, bike, 'submit "Book in" [toast "Booked in"]'), [['tree', 'submit'], ['click', 'Events']]],
  columns: [head + screens(''), [['tree', 'table']]],
  screen: [head + screens('        booking "Booking" [id] []\n'), [['tree', 'screen booking']]],
  'tabs-rows': [head + screens(tabs), [['tree', 'rows parts']]],
  'own-style': [head + style + screens(tabs), [['tree', 'title'], ['click', 'Add'], ['click', 'This file']]],
  'does-not-load': [head + style + screens(tabs, note).replace('            form [\n', '            form \n'), []],
  'machines-none': [A, [machines]],
  'machine-added': [A, [machines, ['click', 'Add'], ['click', 'Machine']]],
  'machine-states': [head + repair('', ''), [machines, ['tree', 'state work']]],
  'machine-drag': [head + repair(`    from work to ready on fixed
`), [machines, ['drag', 'received', 'work']]],
  'machine-way': [M, [machines, ['tree', 'to waiting on need-parts']]],
  'machine-try': [M, [machines, ['click', 'Try'], ['type', 'Event fields', 'bike: "Ada\'s road bike"  count: 3'], ['click', 'start'], ['click', 'need-parts']]],
  'machine-problem': [M.replace('from work to ready on fixed', 'from work to raedy on fixed'), [machines]],
  problems: [head + style + screens(tabs, note).replace('field customer "Customer" required', 'field customer "Customer" requird'), []],
};

async function json(path) { return (await fetch(`http://127.0.0.1:${CDP}${path}`)).json(); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function take(name, [text, steps]) {
  writeFileSync(`${DIR}/app.trb`, text);
  const tab = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const wait = new Map();
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ });
  await sleep(1500);
  await evaluate('localStorage.clear(); location.reload()');
  await sleep(3000);
  // the centre of the first visible element showing exactly this text
  const find = sel => `(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.offsetParent !== null && e.textContent.trim() === T)
    ?? [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.offsetParent !== null && e.textContent.trim().startsWith(T));
    if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`;
  const at = async (sel, t) => {
    const p = await evaluate(`(T => ${find(sel)})(${JSON.stringify(t)})`);
    if (!p) throw new Error(`${name}: no ${t}`);
    return p;
  };
  const mouse = async (type, [x, y]) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  for (const [op, a, b] of steps) {
    if (op === 'tree') { const p = await at('.tb-tree-label', a); await mouse('mousePressed', p); await mouse('mouseReleased', p); }
    else if (op === 'click' || op === 'hover') {
      const p = await at('button, [role=radio], label, .tb-menu-item', a);
      await mouse('mouseMoved', p);
      if (op === 'click') { await mouse('mousePressed', p); await mouse('mouseReleased', p); }
    } else if (op === 'scroll') {
      await evaluate(`(() => { const e = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.offsetParent !== null && e.textContent.trim().startsWith(${JSON.stringify(a)})); e.scrollIntoView({ block: 'start' }); let b = e.parentElement; while (b && b.scrollHeight <= b.clientHeight) b = b.parentElement; b?.scrollBy(0, -16); return 1 })()`);
    } else if (op === 'drag') {
      // from the right edge of a state in the drawing onto the middle of another
      const box = n => `(() => { const g = [...document.querySelector('tb-machine-graph').shadowRoot.querySelectorAll('.node')]
        .find(g => g.querySelector('.name')?.textContent === ${n}); const r = g.querySelector('.box').getBoundingClientRect();
        return [r.x, r.y, r.width, r.height] })()`;
      const [x, y, w, h] = await evaluate(box(JSON.stringify(a)));
      const [x2, y2, w2] = await evaluate(box(JSON.stringify(b)));
      const from = [x + w - 3, y + h / 2], to = [x2 + w2 / 2, y2 + 14];
      await mouse('mouseMoved', from);
      await mouse('mousePressed', from);
      for (let i = 1; i <= 8; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0] + (to[0] - from[0]) * i / 8, y: from[1] + (to[1] - from[1]) * i / 8, button: 'left', buttons: 1 });
      await mouse('mouseReleased', to);
      await sleep(1200);
    } else if (op === 'type') {
      await evaluate(`(() => { const l = [...document.querySelectorAll('label')].find(l => l.textContent.trim() === ${JSON.stringify(a)}); const i = l.control ?? l.parentElement.querySelector('input'); i.focus(); return 1 })()`);
      await send('Input.insertText', { text: b });
    }
    await sleep(500);
  }
  // the mouse off any face, unless it rests on a menu
  if (!steps.some(s => ['Layout', 'This file'].includes(s[1]))) await mouse('mouseMoved', [1430, 890]);
  await sleep(700);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.result.data, 'base64'));
  await send('Target.closeTarget', { targetId: tab.id }).catch(() => {});
  ws.close();
  console.log('ok', name);
}

let up = await json('/json/version').then(() => true, () => false);
if (!up) {
  spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'shots-'))}`,
    '--blink-settings=preferredColorScheme=1', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 50 && !up; i++) { await sleep(200); up = await json('/json/version').then(() => true, () => false); }
}
if (!DIR) throw new Error('set DIR to the folder the designer runs on');
const only = process.argv.slice(2);
for (const [n, s] of Object.entries(shots)) if (only.length === 0 || only.includes(n)) await take(n, s);
process.exit(0);
