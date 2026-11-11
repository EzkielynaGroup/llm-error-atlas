'use strict';
const fs = require('fs');
const path = require('path');
const { createAtlas, normalize, redact } = require('./engine.cjs');

const ERRORS_DIR = path.join(__dirname, '..', 'errors');

function loadFiles(dir) {
  dir = dir || ERRORS_DIR;
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

const files = loadFiles();
const atlas = createAtlas(files);
const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;

/** Read a fetch Response (or Response-like object) and explain it. */
async function explainResponse(res, opts) {
  let body = null;
  try {
    const r = typeof res.clone === 'function' ? res.clone() : res;
    body = typeof r.text === 'function' ? await r.text() : (r.body != null ? r.body : null);
  } catch (e) { body = null; }
  return atlas.explain({ status: res.status, headers: res.headers, body }, opts);
}

module.exports = {
  explain: atlas.explain,
  isRetryable: atlas.isRetryable,
  explainResponse,
  normalize,
  redact,
  createAtlas,
  loadFiles,
  entries: atlas.entries,
  providers: atlas.providers,
  get: atlas.get,
  version
};
