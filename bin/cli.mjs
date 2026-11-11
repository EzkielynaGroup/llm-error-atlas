#!/usr/bin/env node
import atlas from '../lib/index.cjs';

const HELP = `llm-error-atlas ${atlas.version}
Paste an LLM API error, get the cause, whether to retry, and the fix.

Usage:
  npx llm-error-atlas [options] "<error text or JSON body>"
  some-command 2>&1 | npx llm-error-atlas [options]

Options:
  --json              Print the full result as JSON
  --lang <en|id>      Output language (default: en; id = Bahasa Indonesia)
  --provider <name>   Provider hint (${Object.keys(atlas.providers).filter((p) => p !== 'generic').join(', ')})
  --status <code>     HTTP status, when the pasted text does not contain it
  --list              List every entry id
  -v, --version       Print the version
  -h, --help          Show this help

Exit codes: 0 explained, 1 not recognised, 2 usage error.
Dataset: CC BY 4.0. Code: MIT.`;

const LABELS = {
  en: { cause: 'Cause', retry: 'Retry', you: 'You', op: 'Operator', docs: 'Docs', verified: 'Verified', also: 'Also see', yes: 'yes', no: 'no', conf: 'confidence', layer: 'layer', wait: 'wait', backoff: 'then back off', fixFirst: 'fix the cause first', input: 'Seen' },
  id: { cause: 'Penyebab', retry: 'Retry', you: 'Kamu', op: 'Operator', docs: 'Dokumen', verified: 'Dicek', also: 'Lihat juga', yes: 'ya', no: 'tidak', conf: 'keyakinan', layer: 'lapisan', wait: 'tunggu', backoff: 'lalu pakai backoff', fixFirst: 'perbaiki penyebabnya dulu', input: 'Terbaca' }
};

function parseArgs(argv) {
  const o = { json: false, lang: 'en', provider: null, status: null, list: false, help: false, version: false, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
      if (i + 1 >= argv.length) throw new Error(`missing value for ${a}`);
      return argv[++i];
    };
    if (a === '--json') o.json = true;
    else if (a === '--list') o.list = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-v' || a === '--version') o.version = true;
    else if (a.startsWith('--lang')) o.lang = val();
    else if (a.startsWith('--provider')) o.provider = val();
    else if (a.startsWith('--status')) o.status = val();
    else if (a === '-') o.rest.push('-');
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.rest.push(a);
  }
  if (!['en', 'id'].includes(o.lang)) throw new Error('--lang must be en or id');
  if (o.status != null && !/^[1-5]\d\d$/.test(String(o.status))) throw new Error('--status must be an HTTP status code');
  return o;
}

async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const c of process.stdin) {
    chunks.push(c);
    size += c.length;
    if (size > 1024 * 1024) break;
  }
  return Buffer.concat(chunks).toString('utf8');
}

function render(r, lang) {
  const L = LABELS[lang];
  const lines = [];
  const where = [r.provider_name, `${L.layer}: ${r.layer}`];
  if (r.status != null) where.push(`HTTP ${r.status}`);
  lines.push(`${r.id}  (${where.join(' · ')})  ${L.conf}: ${r.confidence}`);
  lines.push('');
  lines.push(r.title);
  lines.push('');
  let retry;
  if (r.retryable) {
    retry = L.yes;
    if (r.retry_after_ms != null) retry += `, ${L.wait} ${Math.ceil(r.retry_after_ms / 1000)} s (Retry-After), ${L.backoff}`;
    else retry += ` (${L.backoff.replace(/^then |^lalu /, '')})`;
  } else retry = `${L.no}, ${L.fixFirst}`;
  const pad = (k) => (k + ':').padEnd(12);
  lines.push(`${pad(L.cause)}${r.cause}`);
  lines.push(`${pad(L.retry)}${retry}`);
  lines.push(`${pad(L.you)}${r.user_fix}`);
  lines.push(`${pad(L.op)}${r.operator_fix}`);
  if (r.docs) lines.push(`${pad(L.docs)}${r.docs}`);
  if (r.last_verified) lines.push(`${pad(L.verified)}${r.last_verified}`);
  const seen = [];
  if (r.input.status != null) seen.push(`status=${r.input.status}`);
  if (r.input.type) seen.push(`type=${r.input.type}`);
  if (r.input.code) seen.push(`code=${r.input.code}`);
  if (seen.length) lines.push(`${pad(L.input)}${seen.join(' ')}`);
  if (r.alternatives.length) lines.push(`${pad(L.also)}${r.alternatives.map((a) => a.id).join(', ')}`);
  return lines.join('\n');
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) {
    process.stderr.write(`llm-error-atlas: ${e.message}\nRun with --help for usage.\n`);
    return 2;
  }
  if (o.help) { process.stdout.write(HELP + '\n'); return 0; }
  if (o.version) { process.stdout.write(atlas.version + '\n'); return 0; }
  if (o.list) {
    const rows = atlas.entries.map((e) => (o.json ? { id: e.id, provider: e.provider, status: e.status } : `${e.id}`));
    process.stdout.write(o.json ? JSON.stringify(rows, null, 2) + '\n' : rows.join('\n') + '\n');
    return 0;
  }
  let text = o.rest.filter((x) => x !== '-').join(' ');
  if (!text || o.rest.includes('-')) {
    if (process.stdin.isTTY && !o.rest.includes('-')) {
      if (o.status == null) { process.stderr.write(HELP + '\n'); return 2; }
    } else {
      text = (text ? text + '\n' : '') + (await readStdin());
    }
  }
  if (!text.trim() && o.status == null) { process.stderr.write('llm-error-atlas: no input. Paste an error or pipe it on stdin.\n'); return 2; }
  const r = atlas.explain(text, { lang: o.lang, provider: o.provider || undefined, status: o.status != null ? Number(o.status) : undefined });
  process.stdout.write((o.json ? JSON.stringify(r, null, 2) : render(r, o.lang)) + '\n');
  return r.id === 'unknown' ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }, (e) => {
  process.stderr.write(`llm-error-atlas: ${e && e.message ? e.message : e}\n`);
  process.exitCode = 2;
});
