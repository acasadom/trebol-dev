import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileOf, handleApi, listFiles, trusted } from '../server/files.js';

function project() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'trebol-dev-')));
  mkdirSync(join(root, 'screens'));
  mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
  mkdirSync(join(root, '.git'));
  writeFileSync(join(root, 'app.trb'), 'Trebol []\nview [text "a"]\n');
  writeFileSync(join(root, 'screens', 'home.trb'), 'Trebol []\n');
  writeFileSync(join(root, 'notes.txt'), 'x');
  writeFileSync(join(root, 'node_modules', 'x', 'x.trb'), 'x');
  writeFileSync(join(root, '.git', 'y.trb'), 'y');
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'trebol-out-')));
  writeFileSync(join(outside, 'secret.trb'), 'secret');
  symlinkSync(join(outside, 'secret.trb'), join(root, 'link.trb'));
  symlinkSync(outside, join(root, 'away'));
  return root;
}

const local = { host: 'localhost:5180', 'x-trebol-dev': '1' };

/** A request and a response good enough for handleApi. */
async function ask(root, method, path, { headers = local, body = '' } = {}) {
  process.env.TREBOL_DEV_PROJECT = root;
  const req = Object.assign(Readable.from(body === '' ? [] : [Buffer.from(body)]), { method, headers });
  const res = { status: 0, body: '', writeHead(s) { this.status = s; }, end(b) { this.body = String(b ?? ''); } };
  const answered = await handleApi(req, res, new URL(path, 'http://localhost:5180'));
  return { answered, ...res };
}

test('lists the .trb files of the project, never hidden, skipped or outside ones', async () => {
  const root = project();
  assert.deepEqual(await listFiles(root), ['app.trb', 'screens/home.trb']);
  const r = await ask(root, 'GET', '/api/files');
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.body).files, ['app.trb', 'screens/home.trb']);
});

test('names outside the project or not .trb are refused', async () => {
  const root = project();
  for (const n of ['../x.trb', 'notes.txt', '/etc/x.trb', 'node_modules/x/x.trb', '.git/y.trb', 'link.trb', 'away/secret.trb', 'screens//home.trb', '']) {
    assert.equal(await fileOf(root, n), null, n);
  }
  assert.equal(await fileOf(root, 'screens/home.trb'), join(root, 'screens', 'home.trb'));
  assert.equal(await fileOf(root, 'new.trb'), join(root, 'new.trb'));
});

test('reads and writes a file', async () => {
  const root = project();
  assert.equal((await ask(root, 'GET', '/api/file?path=app.trb')).body, 'Trebol []\nview [text "a"]\n');
  assert.equal((await ask(root, 'PUT', '/api/file?path=screens/home.trb', { body: 'Trebol [] ; é\n' })).status, 200);
  assert.equal(readFileSync(join(root, 'screens', 'home.trb'), 'utf8'), 'Trebol [] ; é\n');
  assert.equal((await ask(root, 'GET', '/api/file?path=gone.trb')).status, 404);
  assert.equal((await ask(root, 'PUT', '/api/file?path=../x.trb', { body: 'x' })).status, 400);
});

test('only a page of the designer may ask', async () => {
  const root = project();
  assert.ok(trusted({ headers: local }));
  assert.ok(trusted({ headers: { ...local, origin: 'http://localhost:5180' } }));
  for (const headers of [
    { host: 'localhost:5180' },
    { host: 'evil.example:5180', 'x-trebol-dev': '1' },
    { ...local, origin: 'http://evil.example' },
  ]) {
    assert.ok(!trusted({ headers }), JSON.stringify(headers));
    assert.equal((await ask(root, 'PUT', '/api/file?path=app.trb', { headers, body: 'x' })).status, 403);
  }
  assert.equal(readFileSync(join(root, 'app.trb'), 'utf8'), 'Trebol []\nview [text "a"]\n');
  assert.equal((await ask(root, 'GET', '/other')).answered, false);
});
