#!/usr/bin/env node
// Monthly link check: every documentation URL in errors/*.json must still answer with 2xx/3xx.
// Read-only GET requests, no secrets.  node scripts/check-links.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, 'errors');
const urls = new Map();
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const add = (u, id) => { if (!urls.has(u)) urls.set(u, []); urls.get(u).push(id); };
  add(d.source, f);
  for (const e of d.entries) add(e.docs, e.id);
}

async function check(url) {
  const base = url.split('#')[0];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(base, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
        headers: { 'user-agent': 'llm-error-atlas-link-check (+https://github.com/EzkielynaGroup/llm-error-atlas)', accept: 'text/html,*/*' }
      });
      if (res.status < 400) return { ok: true, status: res.status };
      if (attempt === 2) return { ok: false, status: res.status };
    } catch (e) {
      if (attempt === 2) return { ok: false, status: e.name || 'error' };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { ok: false, status: 'unknown' };
}

let failed = 0;
for (const [url, ids] of urls) {
  const r = await check(url);
  process.stdout.write(`${r.ok ? 'ok  ' : 'FAIL'} ${r.status} ${url}${r.ok ? '' : `  (used by ${ids.join(', ')})`}\n`);
  if (!r.ok) failed++;
}
process.stdout.write(`\n${urls.size - failed}/${urls.size} documentation URLs reachable\n`);
process.exitCode = failed ? 1 : 0;
