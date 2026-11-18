// The designer's pages: every app shown in them (a ```trebol-ui block) is checked as `trebol check` checks
// a file, and every picture they show is there. Trebol's documentation runs them too, live, when it is built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGES = fileURLToPath(new URL('../docs/designer/', import.meta.url));
const TREBOL = fileURLToPath(new URL('../node_modules/.bin/trebol', import.meta.url));

for (const name of readdirSync(PAGES).filter(n => n.endsWith('.md'))) {
  test(`docs: ${name}`, () => {
    const md = readFileSync(join(PAGES, name), 'utf8');
    const apps = [...md.matchAll(/```trebol-ui\n([\s\S]*?)```/g)].map(m => m[1]);
    const dir = mkdtempSync(join(tmpdir(), 'trebol-dev-docs-'));
    apps.forEach((code, i) => {
      const file = join(dir, `${i + 1}.trb`);
      writeFileSync(file, code);
      const r = spawnSync(TREBOL, ['check', file], { encoding: 'utf8' });
      assert.equal(r.status, 0, `${name}, app ${i + 1}:\n${r.stdout}${r.stderr}`);
    });
    for (const [, img] of md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) assert.ok(existsSync(join(PAGES, img)), `${name}: no ${img}`);
  });
}
