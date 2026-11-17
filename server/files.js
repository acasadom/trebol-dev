// The designer's window on the project: lists its .trb files, reads one and writes one back.
// `trebol dev --api` calls handleApi for every request; the project folder comes in
// TREBOL_DEV_PROJECT. Only this machine reaches the server, and only a page of the designer
// itself may ask: the Host must be a local name (no DNS rebinding) and requests carry the
// X-Trebol-Dev header, which a page of another site cannot send without the server agreeing.

import { readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';

/** Folders never listed nor read: tools' output and other people's code. */
const SKIP = new Set(['node_modules', 'dist', '_site', '_build']);
/** The largest file the designer writes, in bytes. */
const MOST = 4 * 1024 * 1024;

/** The project folder. */
export function projectRoot() {
  return resolve(process.env.TREBOL_DEV_PROJECT ?? '.');
}

/** Whether a request comes from a page of the designer. */
export function trusted(req) {
  const host = req.headers.host ?? '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return false;
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) return false;
  return req.headers['x-trebol-dev'] === '1';
}

const hidden = part => part.startsWith('.') || SKIP.has(part);

/**
 * The path of the project file `name` names, or null when it is not a .trb file inside the
 * project, outside hidden and skipped folders, links included. `name` uses / between folders.
 */
export async function fileOf(root, name) {
  if (typeof name !== 'string' || name === '' || extname(name) !== '.trb') return null;
  const parts = name.split('/');
  if (parts.some(p => p === '' || p === '..' || hidden(p))) return null;
  const path = resolve(root, ...parts);
  const realRoot = await realpath(root);
  const realDir = await realpath(dirname(path)).catch(() => null);
  if (realDir === null || !(realDir === realRoot || realDir.startsWith(realRoot + sep))) return null;
  const realFile = await realpath(path).catch(() => null);
  if (realFile !== null && !realFile.startsWith(realRoot + sep)) return null;
  return path;
}

/** Every .trb file of the project, as paths with / from its folder, in order. */
export async function listFiles(root) {
  const out = [];
  const walk = async dir => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (hidden(e.name)) continue;
      const path = resolve(dir, e.name);
      if (e.isDirectory()) await walk(path);
      else if (e.isFile() && extname(e.name) === '.trb') out.push(relative(root, path).split(sep).join('/'));
    }
  };
  await walk(root);
  return out.sort();
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

async function bodyOf(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MOST) return null;
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Answers /api/files and /api/file; gives false for every other request. */
export async function handleApi(req, res, url) {
  if (url.pathname !== '/api/files' && url.pathname !== '/api/file') return false;
  if (!trusted(req)) {
    send(res, 403, 'Only the designer may ask for the files of the project.');
    return true;
  }
  const root = projectRoot();
  if (url.pathname === '/api/files') {
    if (req.method !== 'GET') return send(res, 405, 'GET only'), true;
    send(res, 200, JSON.stringify({ name: basename(root), files: await listFiles(root) }), 'application/json');
    return true;
  }
  const path = await fileOf(root, url.searchParams.get('path'));
  if (path === null) {
    send(res, 400, 'Not a .trb file of the project.');
    return true;
  }
  if (req.method === 'GET') {
    const text = await readFile(path, 'utf8').catch(() => null);
    if (text === null) send(res, 404, 'No such file.');
    else send(res, 200, text);
  } else if (req.method === 'PUT') {
    const text = await bodyOf(req);
    if (text === null) return send(res, 413, 'Too big.'), true;
    await writeFile(path, text, 'utf8');
    send(res, 200, 'Saved.');
  } else {
    send(res, 405, 'GET or PUT only');
  }
  return true;
}
