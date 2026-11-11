#!/usr/bin/env node
// Builds the static site: one page per error in English and Indonesian, two searchable indexes,
// sitemap.xml and robots.txt. No dependencies, no network, no secrets.
//   node scripts/build-site.mjs [outDir]      (env SITE_URL sets the absolute base URL)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadFiles, version } = require(path.join(ROOT, 'lib', 'index.cjs'));
const ERRORS_DIR = process.env.ATLAS_ERRORS_DIR ? path.resolve(process.env.ATLAS_ERRORS_DIR) : undefined;

const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'site'));
const SITE = (process.env.SITE_URL || 'https://ezkielynagroup.github.io/llm-error-atlas').replace(/\/+$/, '');
const REPO = 'https://github.com/EzkielynaGroup/llm-error-atlas';
const UTM = 'https://ezkielyna.store/?utm_source=github&utm_medium=site&utm_campaign=llm-error-atlas';

const T = {
  en: {
    siteName: 'LLM Error Atlas',
    tagline: 'Paste an LLM API error. Get the cause, whether to retry, and the fix.',
    intro: 'An open dataset of documented error responses from LLM APIs, gateways and relays. Every entry links to the provider\'s public documentation and shows when it was last checked.',
    pasteLabel: 'Paste an error (status line, JSON body or SDK message)',
    explainBtn: 'Explain',
    searchLabel: 'Filter the list',
    searchPh: 'e.g. 429, overloaded_error, insufficient_quota',
    noMatch: 'No entry matches this filter.',
    cause: 'Cause', retry: 'Retry?', userFix: 'What you can do', opFix: 'What the API operator can do',
    docs: 'Provider documentation', verified: 'Last verified', layer: 'Where it happens', signals: 'How it is recognised',
    related: 'Same status from other sources', yes: 'Yes', no: 'No',
    retryYes: 'Yes. It is usually temporary: honour the Retry-After header when present, otherwise use exponential backoff with jitter and a retry cap.',
    retryNo: 'No. Retrying the same request will fail again until the cause is fixed.',
    qWhat: (t) => `What does “${t}” mean?`, qRetry: (t) => `Should I retry “${t}”?`, qFix: (t) => `How do I fix “${t}”?`,
    qOp: 'What should the API operator or admin do?',
    status: 'HTTP status', type: 'error type', code: 'error code', message: 'message pattern', anyStatus: 'any',
    lApp: 'Your app', lGw: 'Gateway / relay', lProv: 'Model provider', lLocal: 'Local runtime', lNet: 'Network',
    layerNote: { provider: 'Returned by the model provider\'s API.', gateway: 'Returned by a gateway that sits between your app and the providers.', relay: 'Returned by a self-hosted relay (New API / one-api family).', local: 'Returned by a model runtime on your own machine.', http: 'Any layer can return this status; the body tells you which.', network: 'No HTTP response arrived: the connection itself failed.' },
    footer: 'Maintained by <a href="' + UTM + '">Ezkielyna</a>, an independent AI API gateway. Dataset <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, code MIT. Not affiliated with any provider listed here.',
    source: 'Source and corrections on GitHub', edit: 'Report a mistake in this entry',
    home: 'All errors', other: 'Bahasa Indonesia', skip: 'Skip to content',
    titleSuffix: 'cause, retry, fix', providerCount: (n, p) => `${n} entries from ${p} sources`,
    resultMatched: 'Closest match', confidence: 'confidence', open: 'Open the full page',
    disclaimer: 'Summaries paraphrase public documentation and may lag behind it. The linked page is the reference.'
  },
  id: {
    siteName: 'LLM Error Atlas',
    tagline: 'Tempel error API LLM. Dapatkan penyebab, perlu retry atau tidak, dan solusinya.',
    intro: 'Dataset terbuka berisi respons error yang terdokumentasi dari API LLM, gateway, dan relay. Setiap entri menautkan dokumentasi publik penyedianya dan menampilkan tanggal terakhir dicek.',
    pasteLabel: 'Tempel error (baris status, body JSON, atau pesan SDK)',
    explainBtn: 'Jelaskan',
    searchLabel: 'Saring daftar',
    searchPh: 'mis. 429, overloaded_error, insufficient_quota',
    noMatch: 'Tidak ada entri yang cocok.',
    cause: 'Penyebab', retry: 'Perlu retry?', userFix: 'Yang bisa kamu lakukan', opFix: 'Yang bisa dilakukan operator API',
    docs: 'Dokumentasi penyedia', verified: 'Terakhir dicek', layer: 'Terjadi di mana', signals: 'Cara mengenalinya',
    related: 'Status yang sama dari sumber lain', yes: 'Ya', no: 'Tidak',
    retryYes: 'Ya. Biasanya sementara: ikuti header Retry-After kalau ada, kalau tidak pakai exponential backoff dengan jitter dan batas jumlah retry.',
    retryNo: 'Tidak. Request yang sama akan gagal lagi sampai penyebabnya diperbaiki.',
    qWhat: (t) => `Apa arti “${t}”?`, qRetry: (t) => `Apakah “${t}” perlu di-retry?`, qFix: (t) => `Bagaimana memperbaiki “${t}”?`,
    qOp: 'Apa yang perlu dilakukan operator atau admin API?',
    status: 'status HTTP', type: 'tipe error', code: 'kode error', message: 'pola pesan', anyStatus: 'apa saja',
    lApp: 'Aplikasimu', lGw: 'Gateway / relay', lProv: 'Penyedia model', lLocal: 'Runtime lokal', lNet: 'Jaringan',
    layerNote: { provider: 'Dikirim oleh API penyedia model.', gateway: 'Dikirim oleh gateway yang berada di antara aplikasimu dan penyedia.', relay: 'Dikirim oleh relay self-hosted (keluarga New API / one-api).', local: 'Dikirim oleh runtime model di mesinmu sendiri.', http: 'Lapisan mana pun bisa mengirim status ini; body-nya menunjukkan dari mana.', network: 'Tidak ada respons HTTP: koneksinya sendiri yang gagal.' },
    footer: 'Dikelola oleh <a href="' + UTM + '">Ezkielyna</a>, gateway API AI independen. Dataset <a href="https://creativecommons.org/licenses/by/4.0/deed.id">CC BY 4.0</a>, kode MIT. Tidak berafiliasi dengan penyedia mana pun di sini.',
    source: 'Sumber dan koreksi di GitHub', edit: 'Laporkan kesalahan di entri ini',
    home: 'Semua error', other: 'English', skip: 'Langsung ke konten',
    titleSuffix: 'penyebab, retry, solusi', providerCount: (n, p) => `${n} entri dari ${p} sumber`,
    resultMatched: 'Paling cocok', confidence: 'keyakinan', open: 'Buka halaman lengkap',
    disclaimer: 'Ringkasan ini memparafrasekan dokumentasi publik dan bisa tertinggal. Halaman yang ditautkan adalah acuannya.'
  }
};

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const plain = (s) => String(s || '').replace(/`([^`]+)`/g, '$1');
const pick = (f, lang) => (f && (f[lang] || f.en)) || '';
const jsonForScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029');

const CSS = `:root{--bg:#fbfbf8;--fg:#1d1f21;--muted:#5b6066;--line:#dcdcd4;--card:#ffffff;--accent:#0b5cad;--ok:#16653a;--no:#9b2c1f;--code:#efeee8;--hi:#fff3c4}
@media (prefers-color-scheme:dark){:root{--bg:#121416;--fg:#e8e6e1;--muted:#a3a8ad;--line:#2e3236;--card:#1a1d20;--accent:#7cb7ff;--ok:#6fd49a;--no:#ff9b8a;--code:#24282c;--hi:#3a3420}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.skip{position:absolute;left:-999px}.skip:focus{left:16px;top:8px;background:var(--card);padding:6px 10px}
header,main,footer{max-width:46rem;margin:0 auto;padding:0 16px}
header{padding-top:20px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline}
header .brand{font-weight:700;text-decoration:none;color:var(--fg)}
h1{font-size:1.6rem;line-height:1.25;margin:.6em 0 .3em;overflow-wrap:anywhere}h2{font-size:1.15rem;margin:1.6em 0 .4em}
p,li{overflow-wrap:anywhere}.muted{color:var(--muted)}
code{background:var(--code);padding:.05em .3em;border-radius:4px;font:0.9em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin:.4em 0 1em;padding:0;list-style:none}
.badges li{border:1px solid var(--line);border-radius:999px;padding:1px 10px;font-size:.85rem;background:var(--card)}
.yes{color:var(--ok);font-weight:600}.no{color:var(--no);font-weight:600}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:1em 0}
.layers{display:flex;flex-wrap:wrap;gap:6px;align-items:center;list-style:none;padding:0;margin:.5em 0}
.layers li{border:1px solid var(--line);border-radius:8px;padding:4px 10px;background:var(--card);font-size:.9rem}
.layers li.on{background:var(--hi);border-color:var(--fg);font-weight:600}.layers li.arrow{border:0;background:none;padding:0}
textarea,input[type=search]{width:100%;font:inherit;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px}
textarea{min-height:7rem;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9rem}
button{font:inherit;margin-top:8px;padding:8px 16px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:var(--bg);cursor:pointer}
.list h2{font-size:1rem;margin:1.4em 0 .3em}.list ul{list-style:none;padding:0;margin:0}.list li{padding:4px 0;border-bottom:1px solid var(--line)}
.list .st{display:inline-block;min-width:3.2em;color:var(--muted);font-variant-numeric:tabular-nums}
footer{padding-top:24px;padding-bottom:40px;font-size:.9rem;color:var(--muted);border-top:1px solid var(--line);margin-top:40px}
dl.sig{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:0}dl.sig dt{color:var(--muted)}dl.sig dd{margin:0}`;

function layout({ lang, title, description, canonical, alternates, body, jsonld, depth }) {
  const t = T[lang];
  const up = '../'.repeat(depth);
  const altLinks = alternates.map((a) => `<link rel="alternate" hreflang="${a.lang}" href="${esc(a.href)}">`).join('\n');
  const ld = (jsonld || []).map((j) => `<script type="application/ld+json">${jsonForScript(j)}</script>`).join('\n');
  const otherHref = alternates.find((a) => a.lang === (lang === 'en' ? 'id' : 'en'));
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
${altLinks}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(canonical)}">
<meta name="color-scheme" content="light dark">
<style>${CSS}</style>
${ld}
</head>
<body>
<a class="skip" href="#main">${t.skip}</a>
<header><a class="brand" href="${up}${lang === 'id' ? 'id/' : ''}">${t.siteName}</a>
<nav aria-label="language">${otherHref ? `<a href="${esc(otherHref.rel)}" hreflang="${otherHref.lang}" lang="${otherHref.lang}">${t.other}</a>` : ''}</nav></header>
<main id="main">
${body}
</main>
<footer><p>${t.footer}</p><p><a href="${REPO}">${t.source}</a> · v${esc(version)}</p></footer>
</body>
</html>
`;
}

function signalsHtml(e, t) {
  const m = e.match || {};
  const rows = [`<dt>${t.status}</dt><dd>${e.status != null ? e.status : t.anyStatus}</dd>`];
  if (m.type && m.type.length) rows.push(`<dt>${t.type}</dt><dd>${m.type.map((x) => `<code>${esc(x)}</code>`).join(', ')}</dd>`);
  if (m.code && m.code.length) rows.push(`<dt>${t.code}</dt><dd>${m.code.map((x) => `<code>${esc(x)}</code>`).join(', ')}</dd>`);
  if (m.message && m.message.length) rows.push(`<dt>${t.message}</dt><dd>${m.message.map((x) => `<code>/${esc(x)}/i</code>`).join(', ')}</dd>`);
  return `<dl class="sig">${rows.join('')}</dl>`;
}

function layersHtml(layer, t) {
  const third = layer === 'local' ? t.lLocal : t.lProv;
  const on = { provider: 3, local: 3, gateway: 2, relay: 2 }[layer] || 0;
  const arrowOn = layer === 'network';
  const li = (i, label) => `<li${on === i ? ' class="on" aria-current="true"' : ''}>${label}</li>`;
  const arrow = `<li class="arrow" aria-hidden="true">${arrowOn ? '<strong>⇢ ✕ ⇢</strong>' : '→'}</li>`;
  return `<ol class="layers" aria-label="${esc(t.layer)}">${li(1, t.lApp)}${arrow}${li(2, t.lGw)}${arrow}${li(3, third)}</ol><p class="muted">${esc(t.layerNote[layer] || '')}</p>`;
}

function errorPage(e, lang, all) {
  const t = T[lang];
  const title = pick(e.title, lang);
  const cause = pick(e.cause, lang);
  const retryText = e.retryable ? t.retryYes : t.retryNo;
  const canonical = `${SITE}/${lang}/${e.id}/`;
  const alternates = [
    { lang: 'en', href: `${SITE}/en/${e.id}/`, rel: `../../en/${e.id}/` },
    { lang: 'id', href: `${SITE}/id/${e.id}/`, rel: `../../id/${e.id}/` },
    { lang: 'x-default', href: `${SITE}/en/${e.id}/`, rel: `../../en/${e.id}/` }
  ];
  const related = all.filter((x) => x.id !== e.id && e.status != null && x.status === e.status).slice(0, 8);
  const faq = [
    [t.qWhat(title), cause],
    [t.qRetry(title), retryText],
    [t.qFix(title), pick(e.user_fix, lang)],
    [t.qOp, pick(e.operator_fix, lang)]
  ];
  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang,
      mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: plain(q), acceptedAnswer: { '@type': 'Answer', text: plain(a) } }))
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t.siteName, item: lang === 'en' ? `${SITE}/` : `${SITE}/id/` },
        { '@type': 'ListItem', position: 2, name: plain(title), item: canonical }
      ]
    }
  ];
  const body = `<p class="muted"><a href="../../${lang === 'id' ? 'id/' : ''}">${t.home}</a> › ${esc(e.provider_name)}</p>
<h1>${rich(title)}</h1>
<ul class="badges" aria-label="summary">
<li>${esc(e.provider_name)}</li>
<li>${e.status != null ? 'HTTP ' + e.status : t.status + ': ' + t.anyStatus}</li>
<li>${t.retry} <span class="${e.retryable ? 'yes' : 'no'}">${e.retryable ? t.yes : t.no}</span></li>
</ul>
<h2>${esc(faq[0][0])}</h2>
<p>${rich(cause)}</p>
<h2>${esc(faq[1][0])}</h2>
<p>${rich(retryText)}</p>
<h2>${esc(faq[2][0])}</h2>
<p>${rich(pick(e.user_fix, lang))}</p>
<h2>${esc(faq[3][0])}</h2>
<p>${rich(pick(e.operator_fix, lang))}</p>
<h2>${t.layer}</h2>
${layersHtml(e.layer, t)}
<h2>${t.signals}</h2>
<div class="card">${signalsHtml(e, t)}</div>
<p>${t.docs}: <a href="${esc(e.docs)}">${esc(e.docs.replace(/^https?:\/\//, ''))}</a><br>
${t.verified}: <time datetime="${esc(e.last_verified)}">${esc(e.last_verified)}</time> · <code>${esc(e.id)}</code></p>
<p class="muted">${t.disclaimer} <a href="${REPO}/issues/new?title=${encodeURIComponent('Entry ' + e.id)}">${t.edit}</a></p>
${related.length ? `<h2>${t.related}</h2><ul>${related.map((r) => `<li><a href="../${r.id}/">${rich(pick(r.title, lang))}</a> <span class="muted">(${esc(r.provider_name)})</span></li>`).join('')}</ul>` : ''}`;
  return layout({
    lang, depth: 2, canonical, alternates, jsonld, body,
    title: `${plain(title)} (${e.provider_name}): ${t.titleSuffix} | ${t.siteName}`,
    description: plain(cause).slice(0, 155)
  });
}

function indexPage(lang, entries, engineSrc) {
  const t = T[lang];
  const groups = {};
  for (const e of entries) (groups[e.provider_name] = groups[e.provider_name] || []).push(e);
  const prefix = lang === 'en' ? 'en/' : '';
  const names = Object.keys(groups).sort((a, b) => (a.startsWith('Generic') ? 1 : 0) - (b.startsWith('Generic') ? 1 : 0) || a.localeCompare(b));
  const list = names.map((name) => `<section><h2>${esc(name)}</h2><ul>${groups[name].map((e) =>
    `<li data-s="${esc((e.id + ' ' + pick(e.title, 'en') + ' ' + pick(e.title, 'id') + ' ' + Object.values(e.match || {}).flat().join(' ') + ' ' + (e.status || '')).toLowerCase())}"><span class="st">${e.status != null ? e.status : '—'}</span> <a href="${prefix}${e.id}/">${rich(pick(e.title, lang))}</a></li>`).join('')}</ul></section>`).join('\n');
  const files = {};
  for (const e of entries) {
    files[e.provider] = files[e.provider] || { provider: e.provider, name: e.provider_name, fallback: e.provider === 'generic', entries: [] };
    files[e.provider].entries.push({
      id: e.id, layer: e.layer, status: e.status, match: e.match, requires_hint: e.requires_hint, retryable: e.retryable,
      title: { [lang]: pick(e.title, lang) }, cause: { [lang]: pick(e.cause, lang) }, user_fix: { [lang]: pick(e.user_fix, lang) },
      operator_fix: { [lang]: '' }, docs: e.docs, last_verified: e.last_verified, verified: true
    });
  }
  const providerCount = names.filter((n) => !n.startsWith('Generic')).length;
  const canonical = lang === 'en' ? `${SITE}/` : `${SITE}/id/`;
  const alternates = [
    { lang: 'en', href: `${SITE}/`, rel: lang === 'en' ? './' : '../' },
    { lang: 'id', href: `${SITE}/id/`, rel: lang === 'en' ? 'id/' : './' },
    { lang: 'x-default', href: `${SITE}/`, rel: lang === 'en' ? './' : '../' }
  ];
  const L = JSON.stringify({ lang, yes: t.yes, no: t.no, cause: t.cause, retry: t.retry, fix: t.userFix, docs: t.docs, top: t.resultMatched, conf: t.confidence, open: t.open, noMatch: t.noMatch, prefix: lang === 'en' ? 'en/' : '' });
  const script = `(function(){var module={exports:{}};(function(module,exports){${engineSrc}\n})(module,module.exports);
var atlas=module.exports.createAtlas(${jsonForScript(Object.values(files))});var L=${L.replace(/</g, '\\u003c')};
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function rich(s){return esc(s).replace(/\`([^\`]+)\`/g,'<code>$1</code>')}
var f=document.getElementById('f'),q=document.getElementById('q'),out=document.getElementById('out'),items=[].slice.call(document.querySelectorAll('.list li')),none=document.getElementById('none');
f.addEventListener('submit',function(ev){ev.preventDefault();var r=atlas.explain(q.value,{lang:L.lang});
var link=r.id==='unknown'?'':'<p><a href="'+L.prefix+r.id+'/">'+esc(L.open)+'</a></p>';
out.innerHTML='<div class="card" tabindex="-1" id="res"><p class="muted">'+esc(L.top)+' · '+esc(L.conf)+': '+esc(r.confidence)+'</p><h2>'+rich(r.title)+'</h2><p><strong>'+esc(L.cause)+':</strong> '+rich(r.cause)+'</p><p><strong>'+esc(L.retry)+'</strong> <span class="'+(r.retryable?'yes':'no')+'">'+(r.retryable?L.yes:L.no)+'</span></p><p><strong>'+esc(L.fix)+':</strong> '+rich(r.user_fix)+'</p>'+(r.docs?'<p>'+esc(L.docs)+': <a href="'+esc(r.docs)+'">'+esc(r.docs)+'</a></p>':'')+link+'</div>';
document.getElementById('res').focus();});
var s=document.getElementById('s');s.addEventListener('input',function(){var v=s.value.trim().toLowerCase(),shown=0;items.forEach(function(li){var ok=!v||li.getAttribute('data-s').indexOf(v)!==-1;li.hidden=!ok;if(ok)shown++;});
[].slice.call(document.querySelectorAll('.list section')).forEach(function(sec){sec.hidden=!sec.querySelector('li:not([hidden])');});none.hidden=shown!==0;});})();`;
  const body = `<h1>${esc(t.tagline)}</h1>
<p>${esc(t.intro)} <span class="muted">${esc(t.providerCount(entries.filter((e) => e.provider !== 'generic').length, providerCount))}.</span></p>
<form id="f" class="card"><label for="q">${esc(t.pasteLabel)}</label>
<textarea id="q" name="q" spellcheck="false" placeholder='{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'></textarea>
<button type="submit">${esc(t.explainBtn)}</button>
<p class="muted">${lang === 'en' ? 'Runs in your browser. Nothing is sent anywhere.' : 'Berjalan di browsermu. Tidak ada yang dikirim ke mana pun.'}</p></form>
<div id="out" aria-live="polite"></div>
<label for="s"><h2 style="display:inline">${esc(t.searchLabel)}</h2></label>
<input type="search" id="s" placeholder="${esc(t.searchPh)}" autocomplete="off">
<p id="none" hidden>${esc(t.noMatch)}</p>
<div class="list">${list}</div>
<p class="muted">${esc(t.disclaimer)}</p>
<script>${script}</script>`;
  const jsonld = [{
    '@context': 'https://schema.org', '@type': 'Dataset', name: 'LLM Error Atlas', description: T.en.intro,
    url: `${SITE}/`, license: 'https://creativecommons.org/licenses/by/4.0/', inLanguage: ['en', 'id'],
    creator: { '@type': 'Organization', name: 'Ezkielyna', url: 'https://ezkielyna.store/' },
    distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE}/atlas.json` }],
    dateModified: entries.map((e) => e.last_verified).sort().pop()
  }];
  return layout({
    lang, depth: lang === 'en' ? 0 : 1, canonical, alternates, jsonld, body,
    title: lang === 'en' ? 'LLM Error Atlas: LLM API errors explained (cause, retry, fix)' : 'LLM Error Atlas: arti error API LLM (penyebab, retry, solusi)',
    description: t.tagline
  });
}

function build() {
  const files = loadFiles(ERRORS_DIR);
  const entries = [];
  for (const f of files) for (const e of f.entries) {
    if (e.verified === false) continue;
    entries.push(Object.assign({}, e, { provider: f.provider, provider_name: f.name }));
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const engineSrc = fs.readFileSync(path.join(ROOT, 'lib', 'engine.cjs'), 'utf8').replace(/<\/script/gi, '<\\/script');
  const write = (rel, content) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
  const urls = [];
  write('index.html', indexPage('en', entries, engineSrc));
  write(path.join('id', 'index.html'), indexPage('id', entries, engineSrc));
  write(path.join('en', 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>LLM Error Atlas</title><link rel="canonical" href="${SITE}/"><meta http-equiv="refresh" content="0; url=../"></head><body><a href="../">LLM Error Atlas</a></body></html>\n`);
  urls.push({ en: `${SITE}/`, id: `${SITE}/id/` });
  for (const e of entries) {
    write(path.join('en', e.id, 'index.html'), errorPage(e, 'en', entries));
    write(path.join('id', e.id, 'index.html'), errorPage(e, 'id', entries));
    urls.push({ en: `${SITE}/en/${e.id}/`, id: `${SITE}/id/${e.id}/`, lastmod: e.last_verified });
  }
  const sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
  for (const u of urls) for (const lang of ['en', 'id']) {
    sm.push(`<url><loc>${esc(u[lang])}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<xhtml:link rel="alternate" hreflang="en" href="${esc(u.en)}"/><xhtml:link rel="alternate" hreflang="id" href="${esc(u.id)}"/></url>`);
  }
  sm.push('</urlset>');
  write('sitemap.xml', sm.join('\n') + '\n');
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  write('.nojekyll', '');
  write('atlas.json', JSON.stringify({ name: 'llm-error-atlas', version, license: 'CC-BY-4.0', source: REPO, providers: files.map((f) => ({ provider: f.provider, name: f.name, source: f.source, entries: f.entries.filter((e) => e.verified !== false) })) }, null, 2) + '\n');
  write('404.html', layout({ lang: 'en', depth: 0, canonical: `${SITE}/`, alternates: [], title: 'Not found | LLM Error Atlas', description: 'Page not found.', body: `<h1>Page not found</h1><p><a href="${SITE}/">LLM Error Atlas</a></p>` }));
  return { out: OUT, pages: entries.length * 2 + 2, entries: entries.length };
}

const r = build();
process.stdout.write(`site built: ${r.out} (${r.entries} entries, ${r.pages} pages)\n`);
