'use strict';
// llm-error-atlas matching engine. Pure JavaScript, no Node APIs, so the static site can inline it.

const MAX_TEXT = 20000;
const STATUS_WORDS = /\b([1-5]\d\d)\s+(?:too many requests|unauthorized|forbidden|not found|bad request|internal server error|bad gateway|service unavailable|gateway timeout|payment required|request timeout|unprocessable|request entity too large|content too large)\b/i;
const NETWORK_CODES = /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND)\b/g;
// type/code values that several providers share; alone they do not identify a provider.
const SHARED_TOKENS = new Set([
  'invalid_request_error', 'authentication_error', 'permission_error', 'not_found_error', 'rate_limit_error',
  'api_error', 'server_error', 'invalid_request', 'authentication', 'payment_required', 'permission_denied',
  'not_found', 'rate_limit_exceeded', 'service_unavailable', 'unavailable', 'server', 'timeout',
  'model_not_found', 'context_length_exceeded', 'internal_server_error'
]);
const PROVIDER_WORDS = [
  ['openrouter', /openrouter/], ['litellm', /litellm/], ['ollama', /ollama/], ['deepseek', /deepseek/],
  ['mistral', /mistral/], ['groq', /\bgroq\b/], ['anthropic', /anthropic|\bclaude\b/], ['openai', /openai/],
  ['gemini', /gemini|generativelanguage\.googleapis|google ai studio/], ['ezkielyna', /ezkielyna/],
  ['newapi', /\bnew[- ]api\b|\bone[- ]api\b/]
];
const BILLING_WORDS = /quota|credit|billing|balance|spend/i;

function redact(s) {
  return String(s)
    .replace(/\b(sk|rk|pk)-[A-Za-z0-9_\-*.]{6,}/g, '$1-***')
    .replace(/AIza[0-9A-Za-z_\-]{10,}/g, 'AIza***');
}

function emptyInput() {
  return { httpStatus: null, bodyStatus: null, status: null, types: [], codes: [], messages: [], text: '', hints: [], retryAfterMs: null, inBand: false };
}

function pushUnique(arr, v) { if (v && arr.indexOf(v) === -1) arr.push(v); }
function addType(n, v) { if (typeof v === 'string' && v && v !== 'error') pushUnique(n.types, v.toLowerCase()); }
function addCode(n, v) {
  if (typeof v === 'number') { setBodyStatus(n, v); return; }
  if (typeof v !== 'string' || !v) return;
  if (/^\d{3}$/.test(v)) { setBodyStatus(n, Number(v)); return; }
  pushUnique(n.codes, v.toLowerCase());
}
function addMsg(n, v) { if (typeof v === 'string' && v.trim()) pushUnique(n.messages, v.trim().slice(0, 4000)); }
function validStatus(v) { return Number.isInteger(v) && v >= 100 && v <= 599; }
function setHttpStatus(n, v) { v = Number(v); if (n.httpStatus == null && validStatus(v)) n.httpStatus = v; }
function setBodyStatus(n, v) { v = Number(v); if (n.bodyStatus == null && validStatus(v)) n.bodyStatus = v; }

function readHeader(h, name) {
  if (!h || typeof h !== 'object') return null;
  if (typeof h.get === 'function') { try { return h.get(name); } catch (e) { return null; } }
  for (const k of Object.keys(h)) if (k.toLowerCase() === name) return h[k];
  return null;
}
function parseRetryAfter(n, headers) {
  if (n.retryAfterMs != null) return;
  const ms = readHeader(headers, 'retry-after-ms');
  if (ms != null && isFinite(Number(ms))) { n.retryAfterMs = Math.max(0, Number(ms)); return; }
  const ra = readHeader(headers, 'retry-after');
  if (ra == null || ra === '') return;
  if (isFinite(Number(ra))) { n.retryAfterMs = Math.max(0, Number(ra) * 1000); return; }
  const t = Date.parse(ra);
  if (!isNaN(t)) n.retryAfterMs = Math.max(0, t - Date.now());
}

function extractErrObj(n, e) {
  addMsg(n, e.message);
  addType(n, e.type);
  if (typeof e.status === 'string') { addType(n, e.status); if (/^[A-Z_]+$/.test(e.status)) pushUnique(n.hints, 'gemini'); }
  else if (typeof e.status === 'number') setBodyStatus(n, e.status);
  addCode(n, e.code);
  addType(n, e.error_type);
  const m = e.metadata;
  if (m && typeof m === 'object') {
    addType(n, m.error_type);
    addCode(n, m.limit_source);
    if (m.error_type || m.limit_source) pushUnique(n.hints, 'openrouter');
  }
}

function extractBody(n, b, depth) {
  if (b == null || depth > 4) return;
  if (typeof b === 'string') { parseText(n, b, depth + 1); return; }
  if (typeof b !== 'object') return;
  if (Array.isArray(b)) { b.slice(0, 3).forEach((x) => extractBody(n, x, depth + 1)); return; }
  const e = b.error;
  if (typeof e === 'string') { addMsg(n, e); if (b.model !== undefined || Object.keys(b).length === 1) pushUnique(n.hints, 'ollama'); }
  else if (e && typeof e === 'object') extractErrObj(n, e);
  if (b.type === 'error' && e && typeof e === 'object') pushUnique(n.hints, 'anthropic');
  if (b.object === 'error') { pushUnique(n.hints, 'mistral'); extractErrObj(n, b); }
  if (typeof b.detail === 'string') addMsg(n, b.detail);
  addType(n, b.error_type);
  if (e == null && b.object !== 'error' && (typeof b.message === 'string' || typeof b.code === 'string' || typeof b.type === 'string')) extractErrObj(n, b);
  if (b.response && typeof b.response === 'object' && !Array.isArray(b.response) && (b.response.error || b.response.error_type)) extractBody(n, b.response, depth + 1);
}

function tryJson(s) { try { return JSON.parse(s); } catch (e) { return undefined; } }

function parseText(n, str, depth) {
  str = String(str).slice(0, MAX_TEXT);
  if (!str.trim()) return;
  n.text += str + '\n';
  const before = n.messages.length;
  const whole = tryJson(str.trim());
  if (whole !== undefined && typeof whole === 'object') { extractBody(n, whole, depth); }
  else {
    let found = false;
    for (const raw of str.split(/\r?\n/)) {
      const line = raw.trim().replace(/^data:\s*/, '');
      if (line[0] === '{') { const j = tryJson(line); if (j && typeof j === 'object') { extractBody(n, j, depth); found = true; } }
    }
    if (!found) {
      const a = str.indexOf('{'), z = str.lastIndexOf('}');
      const j = a >= 0 && z > a ? tryJson(str.slice(a, z + 1)) : undefined;
      if (j && typeof j === 'object') extractBody(n, j, depth);
      else scrapeFields(n, str);
    }
  }
  if (n.httpStatus == null && n.bodyStatus == null) {
    const m = str.match(/\bHTTP\/\d(?:\.\d)?\s+(\d{3})\b/i) ||
      str.match(/\b(?:status(?:[ _]?code)?|error code)\s*[:=]?\s*(\d{3})\b/i) ||
      str.match(/^\s*(\d{3})\b/) || str.match(STATUS_WORDS);
    if (m) setHttpStatus(n, Number(m[1]));
  }
  let c; NETWORK_CODES.lastIndex = 0;
  while ((c = NETWORK_CODES.exec(str))) addCode(n, c[1]);
  if (n.messages.length === before && depth === 0) addMsg(n, str.length > 4000 ? str.slice(0, 4000) : str);
}

// Python dict reprs and other almost-JSON: pull out the usual fields with a regex.
function scrapeFields(n, s) {
  const field = (name) => new RegExp('["\']' + name + '["\']\\s*:\\s*(["\'])((?:\\\\.|(?!\\1).){1,2000}?)\\1', 'g');
  let m;
  const t = field('type'); while ((m = t.exec(s))) addType(n, m[2]);
  const c = field('code'); while ((m = c.exec(s))) addCode(n, m[2]);
  const et = field('error_type'); while ((m = et.exec(s))) addType(n, m[2]);
  const st = field('status'); while ((m = st.exec(s))) { if (/^[A-Z_]+$/.test(m[2])) addType(n, m[2]); }
  const nc = /["']code["']\s*:\s*(\d{3})\b/.exec(s); if (nc) setBodyStatus(n, Number(nc[1]));
  const msg = field('message').exec(s); if (msg) addMsg(n, msg[2]);
  const det = field('detail').exec(s); if (det) addMsg(n, det[2]);
}

function visit(n, input, depth) {
  if (input == null || depth > 4) return;
  if (typeof input === 'string') { parseText(n, input, 0); return; }
  if (typeof input === 'number') { setHttpStatus(n, input); return; }
  if (typeof input !== 'object') return;
  const res = input.response && typeof input.response === 'object' ? input.response : null;
  const statusLike = input.status != null ? input.status : input.statusCode;
  if (typeof statusLike === 'number' || (typeof statusLike === 'string' && /^\d{3}$/.test(statusLike))) setHttpStatus(n, statusLike);
  if (res) setHttpStatus(n, res.status != null ? res.status : res.statusCode);
  parseRetryAfter(n, input.headers);
  if (res) parseRetryAfter(n, res.headers);
  const isWrapper = 'body' in input || 'data' in input || res || input instanceof Error || 'headers' in input;
  if (isWrapper) {
    if (typeof input.code === 'string' || typeof input.code === 'number') addCode(n, input.code);
    if (typeof input.type === 'string') addType(n, input.type);
    if (input.error != null) extractBody(n, typeof input.error === 'object' && !input.error.error && (input.error.message || input.error.type || input.error.code) ? { error: input.error } : input.error, depth + 1);
    extractBody(n, input.body, depth + 1);
    extractBody(n, input.data, depth + 1);
    if (res) { extractBody(n, res.data, depth + 1); extractBody(n, res.body, depth + 1); }
    if (typeof input.message === 'string' && input.message) {
      const before = n.messages.length;
      parseText(n, input.message, 1);
      if (n.messages.length === before) addMsg(n, input.message);
    }
    if (input.cause && typeof input.cause === 'object') {
      if (typeof input.cause.code === 'string') addCode(n, input.cause.code);
      if (typeof input.cause.message === 'string') parseText(n, input.cause.message, 1);
    }
  } else {
    extractBody(n, input, depth + 1);
  }
}

function normalize(input) {
  const n = emptyInput();
  visit(n, input, 0);
  if (n.httpStatus === 200 && n.bodyStatus != null) { n.status = n.bodyStatus; n.inBand = true; }
  else n.status = n.httpStatus != null ? n.httpStatus : n.bodyStatus;
  const hay = (n.text + '\n' + n.messages.join('\n')).toLowerCase();
  for (const [p, re] of PROVIDER_WORDS) if (re.test(hay)) pushUnique(n.hints, p);
  return n;
}

function pick(field, lang) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return (lang && field[lang]) || field.en || '';
}

function createAtlas(files) {
  const entries = [];
  const providers = {};
  for (const f of files) {
    providers[f.provider] = { id: f.provider, name: f.name, source: f.source, fallback: !!f.fallback };
    for (const e of f.entries) {
      const m = e.match || {};
      entries.push(Object.assign({}, e, {
        provider: f.provider, provider_name: f.name, fallback: !!f.fallback,
        _re: (m.message || []).map((s) => new RegExp(s, 'i')),
        _type: (m.type || []).map((s) => s.toLowerCase()),
        _code: (m.code || []).map((s) => s.toLowerCase())
      }));
    }
  }
  const statusCount = {};
  for (const e of entries) if (!e.fallback && e.status != null) statusCount[e.status] = (statusCount[e.status] || 0) + 1;
  // a status no generic entry covers (e.g. 498, 529) and only one source documents identifies that source
  for (const e of entries) if (e.fallback && e.status != null) statusCount[e.status] = Infinity;

  function score(e, n, explicit) {
    let s = 0; const on = []; let strong = false, weak = false;
    const codeHit = e._code.find((c) => n.codes.indexOf(c) !== -1) || e._code.find((c) => n.types.indexOf(c) !== -1);
    if (codeHit) { s += n.codes.indexOf(codeHit) !== -1 ? 4 : 3; on.push('code'); if (SHARED_TOKENS.has(codeHit)) weak = true; else strong = true; }
    const typeHit = e._type.find((t) => n.types.indexOf(t) !== -1) || e._type.find((t) => n.codes.indexOf(t) !== -1);
    if (typeHit && typeHit !== codeHit) { s += n.types.indexOf(typeHit) !== -1 ? 3 : 2; on.push('type'); if (SHARED_TOKENS.has(typeHit)) weak = true; else strong = true; }
    if (e._re.length && e._re.some((re) => n.messages.some((msg) => re.test(msg)))) { s += 5; on.push('message'); strong = true; }
    let statusHit = false;
    if (e.status != null && n.status != null) {
      if (e.status === n.status) { s += 1; on.push('status'); statusHit = true; } else s -= 1;
    }
    let hinted = false;
    if (explicit && explicit === e.provider) { s += 3; on.push('provider'); hinted = true; }
    else if (n.hints.indexOf(e.provider) !== -1) { s += 1.5; on.push('provider'); hinted = true; }
    let eligible;
    if (e.fallback) eligible = strong;
    else if (e.requires_hint) eligible = (strong || weak) && hinted;
    else eligible = strong || ((weak || statusHit) && hinted) || (statusHit && statusCount[e.status] === 1);
    return { s, on, eligible, strong };
  }

  function result(e, n, lang, confidence, on, alts) {
    let retryable = e.retryable;
    if (e.id === 'http-429' && n.messages.some((m) => BILLING_WORDS.test(m))) retryable = false;
    return {
      id: e.id,
      provider: e.provider,
      provider_name: e.provider_name,
      layer: e.layer,
      status: e.status != null ? e.status : n.status,
      title: pick(e.title, lang),
      cause: pick(e.cause, lang),
      retryable,
      retry_after_ms: n.retryAfterMs,
      user_fix: pick(e.user_fix, lang),
      operator_fix: pick(e.operator_fix, lang),
      docs: e.docs,
      last_verified: e.last_verified,
      confidence,
      matched_on: on,
      alternatives: alts,
      input: {
        status: n.status,
        type: n.types[0] || null,
        code: n.codes[0] || null,
        message: n.messages.length ? redact(n.messages[0]).slice(0, 300) : null,
        in_band: n.inBand
      }
    };
  }

  function explain(input, opts) {
    opts = opts || {};
    const lang = opts.lang === 'id' ? 'id' : 'en';
    const explicit = opts.provider ? String(opts.provider).toLowerCase() : null;
    const n = normalize(input);
    if (opts.status != null) { n.status = Number(opts.status); }
    const scored = entries
      .filter((e) => e.verified !== false)
      .map((e) => Object.assign({ e }, score(e, n, explicit)))
      .sort((a, b) => b.s - a.s || b.on.length - a.on.length || Number(a.e.fallback) - Number(b.e.fallback));
    const top = scored.find((x) => x.eligible);
    const altsFor = (topId) => scored
      .filter((x) => x.e.id !== topId && !x.e.fallback && x.s >= 1 && x.on.some((o) => o === 'type' || o === 'code' || o === 'message'))
      .slice(0, 3)
      .map((x) => ({ id: x.e.id, provider: x.e.provider, title: pick(x.e.title, lang), score: x.s }));
    if (top) {
      const conf = top.strong ? 'high' : 'medium';
      return result(top.e, n, lang, conf, top.on, altsFor(top.e.id));
    }
    let fb = null;
    if (n.status != null) {
      fb = entries.find((e) => e.fallback && e.status === n.status);
      if (!fb && n.status >= 500) fb = entries.find((e) => e.id === 'http-500');
      if (!fb && n.status >= 400) fb = entries.find((e) => e.id === 'http-400');
    }
    if (fb) return result(fb, n, lang, 'low', ['status'], altsFor(fb.id));
    const unknown = {
      id: 'unknown', provider: 'generic', provider_name: 'Unknown', layer: 'unknown', status: null,
      title: { en: 'Unrecognised error', id: 'Error tidak dikenali' },
      cause: { en: 'No HTTP status, error type, code or known message was found in the input.', id: 'Tidak ada status HTTP, tipe error, kode, atau pesan yang dikenal di input.' },
      retryable: false,
      user_fix: { en: 'Paste the full error including the HTTP status and the JSON body, or pass --status.', id: 'Tempel error lengkap termasuk status HTTP dan body JSON, atau isi --status.' },
      operator_fix: { en: 'Log the HTTP status and the raw response body for failed calls.', id: 'Catat status HTTP dan body respons mentah untuk panggilan yang gagal.' },
      docs: null, last_verified: null
    };
    return result(unknown, n, lang, 'none', [], altsFor('unknown'));
  }

  function isRetryable(input, opts) { return explain(input, opts).retryable === true; }

  function get(id) { return entries.find((e) => e.id === id) || null; }

  return { entries, providers, explain, isRetryable, normalize, get };
}

module.exports = { createAtlas, normalize, redact, SHARED_TOKENS: Array.from(SHARED_TOKENS) };
