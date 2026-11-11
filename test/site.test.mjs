import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://example.test/atlas';

function build(out, env = {}) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-site.mjs'), out], {
    encoding: 'utf8', timeout: 60000, env: { ...process.env, SITE_URL, ...env }
  });
  assert.equal(r.status, 0, r.stderr);
  return r;
}
const read = (p) => fs.readFileSync(p, 'utf8');
const entries = () => fs.readdirSync(path.join(ROOT, 'errors')).filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(read(path.join(ROOT, 'errors', f))).entries).filter((e) => e.verified !== false);

test('site build produces one EN and one ID page per entry, indexes and sitemap', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-site-'));
  try {
    build(out);
    const all = entries();
    for (const e of all) {
      for (const lang of ['en', 'id']) {
        const p = path.join(out, lang, e.id, 'index.html');
        assert.ok(fs.existsSync(p), p);
      }
    }
    for (const f of ['index.html', 'id/index.html', 'sitemap.xml', 'robots.txt', '404.html', '.nojekyll', 'atlas.json']) assert.ok(fs.existsSync(path.join(out, f)), f);
    const sm = read(path.join(out, 'sitemap.xml'));
    assert.equal((sm.match(/<loc>/g) || []).length, (all.length + 1) * 2);
    assert.ok(sm.includes(`<loc>${SITE_URL}/en/openai-429-slow-down/</loc>`));
    assert.ok(sm.includes('hreflang="id"'));
    assert.match(read(path.join(out, 'robots.txt')), new RegExp(`Sitemap: ${SITE_URL}/sitemap.xml`));
    const atlas = JSON.parse(read(path.join(out, 'atlas.json')));
    assert.equal(atlas.license, 'CC-BY-4.0');
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('error pages carry canonical, hreflang, FAQPage JSON-LD, footer and no external scripts', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-site-'));
  try {
    build(out);
    for (const lang of ['en', 'id']) {
      const html = read(path.join(out, lang, 'anthropic-529-overloaded-error', 'index.html'));
      assert.match(html, new RegExp(`<html lang="${lang}">`));
      assert.ok(html.includes(`<link rel="canonical" href="${SITE_URL}/${lang}/anthropic-529-overloaded-error/">`));
      assert.ok(html.includes(`hreflang="en" href="${SITE_URL}/en/anthropic-529-overloaded-error/"`));
      assert.ok(html.includes(`hreflang="id" href="${SITE_URL}/id/anthropic-529-overloaded-error/"`));
      assert.ok(html.includes('hreflang="x-default"'));
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
      const faq = blocks.find((b) => b['@type'] === 'FAQPage');
      assert.ok(faq, 'FAQPage present');
      assert.equal(faq.mainEntity.length, 4);
      assert.ok(faq.mainEntity.every((q) => q['@type'] === 'Question' && q.acceptedAnswer.text.length > 10));
      assert.ok(!/<script[^>]+src=/i.test(html), 'no external scripts');
      assert.ok(html.includes('utm_source=github&amp;utm_medium=site&amp;utm_campaign=llm-error-atlas') || html.includes('utm_source=github&utm_medium=site&utm_campaign=llm-error-atlas'));
      assert.ok(html.includes('https://platform.claude.com/docs/en/api/errors'));
    }
    assert.ok(read(path.join(out, 'en', 'anthropic-529-overloaded-error', 'index.html')).includes('Maintained by <a href="https://ezkielyna.store/?utm_source=github'));
    assert.ok(read(path.join(out, 'en', 'anthropic-529-overloaded-error', 'index.html')).includes('an independent AI API gateway'));
    assert.match(read(path.join(out, 'id', 'anthropic-529-overloaded-error', 'index.html')), /Apa arti/);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('index pages: inline search and paste box script compiles and matches', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-site-'));
  try {
    build(out);
    for (const f of ['index.html', 'id/index.html']) {
      const html = read(path.join(out, f));
      assert.ok(!/<script[^>]+src=/i.test(html));
      assert.ok(html.includes('id="s"') && html.includes('id="q"'));
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
      assert.equal(scripts.length, 1);
      // Run the inline script against a tiny fake DOM and drive the paste form.
      let submit;
      const outEl = { innerHTML: '' };
      const fake = (extra = {}) => ({ addEventListener: (ev, fn) => { if (ev === 'submit') submit = fn; }, focus() {}, value: '', ...extra });
      const els = { f: fake(), q: fake({ value: '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}' }), out: outEl, s: fake(), none: fake(), res: fake() };
      const document = { getElementById: (id) => els[id], querySelectorAll: () => [] };
      vm.runInNewContext(scripts[0], { document });
      submit({ preventDefault() {} });
      assert.match(outEl.innerHTML, /529 overloaded_error/);
      assert.match(outEl.innerHTML, /anthropic-529-overloaded-error\//);
    }
    const jsonld = [...read(path.join(out, 'index.html')).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert.equal(jsonld[0]['@type'], 'Dataset');
    assert.equal(jsonld[0].license, 'https://creativecommons.org/licenses/by/4.0/');
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('unverified entries are left out of the site', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-site-'));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-data-'));
  try {
    for (const f of fs.readdirSync(path.join(ROOT, 'errors'))) fs.copyFileSync(path.join(ROOT, 'errors', f), path.join(data, f));
    const p = path.join(data, 'groq.json');
    const g = JSON.parse(read(p));
    g.entries.push({ ...g.entries[0], id: 'groq-999-test-unverified', verified: false });
    fs.writeFileSync(p, JSON.stringify(g));
    build(out, { ATLAS_ERRORS_DIR: data });
    assert.ok(!fs.existsSync(path.join(out, 'en', 'groq-999-test-unverified')));
    assert.ok(!read(path.join(out, 'sitemap.xml')).includes('groq-999-test-unverified'));
    assert.ok(fs.existsSync(path.join(out, 'en', 'groq-498-flex-tier-capacity-exceeded', 'index.html')));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('site text avoids banned marketing words', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-site-'));
  try {
    build(out);
    const pages = [path.join(out, 'index.html'), path.join(out, 'id', 'index.html'), path.join(out, 'en', 'http-429', 'index.html'), path.join(out, 'id', 'http-429', 'index.html')];
    for (const p of pages) {
      const text = read(p).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
      for (const re of [/\bofficial\b/i, /\bunlimited\b/i, /\bcheapest\b/i, /\bbest\b/i, /\bresmi\b/i, /\btermurah\b/i, /\bterbaik\b/i]) assert.ok(!re.test(text), `${p} ${re}`);
    }
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
