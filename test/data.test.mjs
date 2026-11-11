import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'errors');
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const DATA = FILES.map((f) => ({ file: f, json: JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) }));
const ALL = DATA.flatMap((d) => d.json.entries.map((e) => ({ ...e, _provider: d.json.provider, _file: d.file })));

const LAYERS = new Set(['provider', 'gateway', 'relay', 'local', 'http', 'network']);
const I18N = ['title', 'cause', 'user_fix', 'operator_fix'];
// Wording rules and private names that must never ship in the dataset.
const BANNED = [
  /\bofficial\b/i, /\bcertified\b/i, /\bunlimited\b/i, /\bcheapest\b/i, /\bbest\b/i, /verified genuine/i,
  /\bresmi\b/i, /\btermurah\b/i, /\bterbaik\b/i, /uncensored/i, /abliterated/i, /\bnsfw\b/i
];
// Private infrastructure patterns. Names of suppliers behind any gateway are checked by hash so the names themselves
// never appear in this public repository (first 16 hex chars of sha256 of the lower-case word).
const PRIVATE = [/\/Users\//, /\/root\//, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, /sk-[A-Za-z0-9]{16,}/, /AIza[0-9A-Za-z_-]{30,}/];
const PRIVATE_WORD_HASHES = new Set([
  '730bea4ff16f200f', '95e1e198a2362f93', 'dbdcd7c49ff656eb', '1bd305c929ba350e', 'd7821f976debc29c', '5f5a8ed8f139be6d',
  '493474f8721dc397', '580683fe55eb0ca0', '6cf5c5c83e647021', '9d2fb6404c1be892', 'bf694ecef574797c', 'ceae6585abc620d6',
  '2b8583536076e38e', 'bccd92084476e517', 'e06e31b4a33d70a5', 'f134614a3f380ab8', '21927068ab6a8dd6', '19fba944619942b5',
  '2a05d99601ebcc8b', '26c688e91f659dd4', 'beb0220a4b837fa3', 'de66d0e8965c8fed', 'b1722f05391994cf'
]);
const wordHash = (w) => crypto.createHash('sha256').update(w).digest('hex').slice(0, 16);

test('every data file has a valid header', () => {
  assert.ok(FILES.length >= 11);
  for (const { file, json } of DATA) {
    assert.equal(json.provider, file.replace(/\.json$/, ''), file);
    assert.ok(typeof json.name === 'string' && json.name.length > 1, file);
    assert.match(json.source, /^https:\/\//, file);
    assert.ok(Array.isArray(json.entries) && json.entries.length >= 3, `${file} needs at least 3 entries`);
  }
});

test('every entry has the required fields with the right types', () => {
  for (const e of ALL) {
    const where = `${e._file}:${e.id}`;
    assert.match(e.id, /^[a-z0-9]+(-[a-z0-9]+)+$/, where);
    if (e._provider === 'generic') assert.match(e.id, /^(http|network)-/, where);
    else assert.ok(e.id.startsWith(e._provider + '-'), `${where} must start with the provider id`);
    assert.ok(LAYERS.has(e.layer), `${where} layer`);
    assert.ok(e.status === null || (Number.isInteger(e.status) && e.status >= 100 && e.status <= 599), `${where} status`);
    assert.equal(typeof e.retryable, 'boolean', where);
    assert.equal(typeof e.verified, 'boolean', where);
    assert.match(e.last_verified, /^\d{4}-\d{2}-\d{2}$/, where);
    assert.equal(e.last_verified, '2026-11-12', where);
    assert.match(e.docs, /^https:\/\/[^\s]+$/, where);
    for (const k of I18N) {
      assert.ok(e[k] && typeof e[k].en === 'string' && e[k].en.trim().length > 3, `${where} ${k}.en`);
      assert.ok(typeof e[k].id === 'string' && e[k].id.trim().length > 3, `${where} ${k}.id`);
    }
    assert.notEqual(e.cause.en, e.cause.id, `${where} cause.id must be translated`);
    assert.notEqual(e.user_fix.en, e.user_fix.id, `${where} user_fix.id must be translated`);
    assert.ok(e.match && typeof e.match === 'object' && !Array.isArray(e.match), `${where} match`);
    for (const k of Object.keys(e.match)) assert.ok(['type', 'code', 'message'].includes(k), `${where} unknown match key ${k}`);
    for (const k of ['type', 'code', 'message']) {
      if (e.match[k] === undefined) continue;
      assert.ok(Array.isArray(e.match[k]) && e.match[k].length > 0, `${where} match.${k}`);
      for (const v of e.match[k]) assert.ok(typeof v === 'string' && v.length > 0, `${where} match.${k}`);
    }
    if (e.requires_hint !== undefined) assert.equal(typeof e.requires_hint, 'boolean', where);
  }
});

test('message patterns are valid, case-insensitive regexes that never match everything', () => {
  for (const e of ALL) for (const src of e.match.message || []) {
    let re;
    assert.doesNotThrow(() => { re = new RegExp(src, 'i'); }, `${e.id}: ${src}`);
    assert.equal(re.test(''), false, `${e.id}: /${src}/ matches the empty string`);
    assert.equal(re.test('error'), false, `${e.id}: /${src}/ is too broad`);
  }
});

test('ids are unique', () => {
  const seen = new Map();
  for (const e of ALL) {
    assert.ok(!seen.has(e.id), `duplicate id ${e.id} in ${e._file} and ${seen.get(e.id)}`);
    seen.set(e.id, e._file);
  }
});

test('dataset size is in the planned range and every provider entry is verified', () => {
  const docEntries = ALL.filter((e) => e._provider !== 'generic');
  assert.ok(docEntries.length >= 60 && docEntries.length <= 90, String(docEntries.length));
  for (const e of ALL) assert.equal(e.verified, true, `${e.id} is unverified: remove it or verify it`);
});

test('no banned wording, no private or supplier names, no secrets', () => {
  for (const { file } of DATA) {
    const raw = fs.readFileSync(path.join(DIR, file), 'utf8');
    for (const re of [...BANNED, ...PRIVATE]) assert.ok(!re.test(raw), `${file} matches ${re}`);
    for (const w of raw.toLowerCase().split(/[^a-z0-9]+/)) if (w) assert.ok(!PRIVATE_WORD_HASHES.has(wordHash(w)), `${file} contains a private name`);
  }
});

test('neutrality: only the ezkielyna file links to ezkielyna', () => {
  for (const e of ALL) if (e._provider !== 'ezkielyna') assert.ok(!/ezkielyna/i.test(JSON.stringify(e)), e.id);
});

test('generic fallbacks cover the common statuses', () => {
  const statuses = new Set(ALL.filter((e) => e._provider === 'generic').map((e) => e.status));
  for (const s of [400, 401, 403, 404, 408, 413, 429, 500, 502, 503, 504]) assert.ok(statuses.has(s), String(s));
  assert.ok(ALL.some((e) => e.id === 'network-connection-error'));
});
