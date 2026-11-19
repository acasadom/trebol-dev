#!/usr/bin/env node
// trebol-dev [folder] [--port n]: the designer for the Trebol project in the folder (the current
// one by default), in the browser. It runs Trebol's own dev server on the designer's app, with
// the file API of server/files.js, and leaves it running until Ctrl+C.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: trebol-dev [folder] [--port n]';
const here = dirname(dirname(fileURLToPath(import.meta.url)));

let folder;
let port = '5180';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--port' && /^\d+$/.test(args[i + 1] ?? '')) port = args[++i];
  else if (a === '--version' || a === '-v') {
    console.log(JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version);
    process.exit(0);
  } else if (folder === undefined && !a.startsWith('-')) folder = a;
  else {
    console.error(USAGE);
    process.exit(1);
  }
}
const project = resolve(folder ?? '.');
if (!existsSync(project)) {
  console.error(`trebol-dev: no folder ${project}`);
  process.exit(1);
}

/** The folder of the trebol package this one depends on. */
function trebolRoot() {
  let dir = dirname(fileURLToPath(import.meta.resolve('trebol/core')));
  while (!existsSync(join(dir, 'package.json')) || JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name !== 'trebol') {
    const up = dirname(dir);
    if (up === dir) throw new Error('trebol-dev: cannot find the trebol package');
    dir = up;
  }
  return dir;
}

const trebol = trebolRoot();
// A checkout of trebol runs its sources; an installed one, its built command.
const cli = existsSync(join(trebol, 'tools', 'cli.ts')) ? join(trebol, 'tools', 'cli.ts') : join(trebol, 'dist', 'cli.js');
const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', cli, 'dev', join(here, 'app'), '--port', port, '--api', join(here, 'server', 'files.js')], {
  stdio: 'inherit',
  env: { ...process.env, TREBOL_DEV_PROJECT: project },
});
console.log(`trebol-dev: designing ${project}`);
child.on('exit', code => process.exit(code ?? 0));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
