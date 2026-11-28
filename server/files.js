// The designer's window on the project: lists its .trb files, reads one and writes one back.
// `trebol dev --api` calls handleApi for every request; the project folder comes in
// TREBOL_DEV_PROJECT. Only this machine reaches the server, and only a page of the designer
// itself may ask: the Host must be a local name (no DNS rebinding) and requests carry the
// X-Trebol-Dev header, which a page of another site cannot send without the server agreeing.

import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, realpath, rename, rm } from 'node:fs/promises';
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

/**
 * The path of a module file the designer may read, not write: a project file, or a .trb file of a
 * package under the project's node_modules (a linked package may live outside the project).
 */
export async function moduleOf(root, name) {
  const own = await fileOf(root, name);
  if (own !== null) return own;
  if (typeof name !== 'string' || extname(name) !== '.trb') return null;
  const parts = name.split('/');
  if (parts[0] !== 'node_modules' || parts.length < 3) return null;
  if (parts.slice(1).some(p => p === '' || p.startsWith('.') || p === 'node_modules')) return null;
  return resolve(root, ...parts);
}

/** The path from the project's folder of a package's Trebol module (the "trebol" of its package.json), or null. */
export async function packageOf(root, name) {
  if (typeof name !== 'string' || !/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name)) return null;
  const json = await readFile(resolve(root, 'node_modules', ...name.split('/'), 'package.json'), 'utf8').catch(() => null);
  if (json === null) return null;
  let main;
  try { main = JSON.parse(json).trebol; } catch { return null; }
  if (typeof main !== 'string') return null;
  const path = ['node_modules', ...name.split('/'), ...main.split('/').filter(p => p !== '' && p !== '.')].join('/');
  return (await moduleOf(root, path)) === null ? null : path;
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

function send(res, status, body, type = 'text/plain; charset=utf-8', more = {}) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...more });
  res.end(body);
}

/** The version of a file's text: the SHA-256 of its UTF-8 bytes, in lowercase hex. */
export function versionOf(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The version a save says it read (?base=), lowercase, or null when it names none. */
function baseOf(url) {
  const b = url.searchParams.get('base');
  return b === null || b.trim() === '' ? null : b.trim().toLowerCase();
}

/**
 * Writes text to path all at once: into a file beside it, then renamed over it, so a reader
 * never sees half of it and a failed write leaves the old file whole.
 */
async function writeWhole(path, text) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tmp, text, 'utf8');
    await rename(tmp, path);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
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

/**
 * Answers /api/files.json (the listing, which on a page of trebol build is the static file
 * app/api/files.json saying demo), /api/file and /api/package (where a package's Trebol module is);
 * gives false for every other request.
 */
export async function handleApi(req, res, url) {
  if (!['/api/files.json', '/api/file', '/api/package'].includes(url.pathname)) return false;
  if (!trusted(req)) {
    send(res, 403, 'Only the designer may ask for the files of the project.');
    return true;
  }
  const root = projectRoot();
  if (url.pathname === '/api/files.json') {
    if (req.method !== 'GET') return send(res, 405, 'GET only'), true;
    send(res, 200, JSON.stringify({ name: basename(root), files: await listFiles(root) }), 'application/json');
    return true;
  }
  if (url.pathname === '/api/package') {
    if (req.method !== 'GET') return send(res, 405, 'GET only'), true;
    const path = await packageOf(root, url.searchParams.get('name'));
    send(res, 200, JSON.stringify({ path: path ?? '' }), 'application/json');
    return true;
  }
  // a package's files are read, never written
  const path = await (req.method === 'GET' ? moduleOf : fileOf)(root, url.searchParams.get('path'));
  if (path === null) {
    send(res, 400, 'Not a .trb file of the project.');
    return true;
  }
  if (req.method === 'GET') {
    const text = await readFile(path, 'utf8').catch(() => null);
    if (text === null) send(res, 404, 'No such file.');
    else send(res, 200, text, undefined, { etag: `"${versionOf(text)}"` });
  } else if (req.method === 'PUT') {
    const text = await bodyOf(req);
    if (text === null) return send(res, 413, 'Too big.'), true;
    // base names the version the designer read: when the file changed since, the edit made
    // outside is not lost, the designer is told and asks the person
    const base = baseOf(url);
    if (base !== null) {
      const now = await readFile(path, 'utf8').catch(() => null);
      if (now === null || versionOf(now) !== base) {
        const more = now === null ? {} : { etag: `"${versionOf(now)}"` };
        return send(res, 412, now === null ? 'The file is gone.' : 'The file changed since it was read.', undefined, more), true;
      }
    }
    await writeWhole(path, text);
    send(res, 200, 'Saved.', undefined, { etag: `"${versionOf(text)}"` });
  } else {
    send(res, 405, 'GET or PUT only');
  }
  return true;
}
