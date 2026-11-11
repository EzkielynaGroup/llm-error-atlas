# Contributing

Thanks for helping keep the atlas accurate. Corrections are as valuable as new entries.

## Rules for data

1. **Public documentation only.** Every entry needs a `docs` URL to the provider's public documentation that shows
   the status, type, code or message. No strings from private logs, support tickets or screenshots of other people's
   accounts. If you cannot point to a public page, do not add the entry.
2. **Never invent error strings.** `match.message` regexes may only contain text that the documentation shows.
   Prefer `match.code` / `match.type` when the provider documents them.
3. **Paraphrase.** Write `cause`, `user_fix` and `operator_fix` in your own words, short and practical.
   Do not copy paragraphs from the documentation.
4. **Both languages.** Fill `en` and `id` (Bahasa Indonesia). If you cannot write Indonesian, open the pull request
   anyway and say so; a maintainer will translate.
5. **`last_verified`** is the date you checked the documentation (YYYY-MM-DD). Set `"verified": false` if you could
   not confirm it; unverified entries are kept out of the site and should be fixed or removed.
6. **Neutral wording.** No marketing claims, no rankings of providers, no secrets, no supplier names behind any gateway.

## Steps

```bash
git clone https://github.com/EzkielynaGroup/llm-error-atlas
cd llm-error-atlas
# edit errors/<provider>.json (schema: schema/errors.schema.json)
npm test                 # schema, regex, uniqueness, wording, matching, CLI and site tests
npm run build:site       # optional: preview site/ locally
```

Add a matching test in `test/match.test.mjs` for a new provider file. Keep code changes dependency-free.

## Code

- Node 18+, no runtime dependencies, `node --test` for tests.
- `lib/engine.cjs` must stay free of Node APIs: the static site inlines it.
