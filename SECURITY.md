# Security policy

## Supported versions

Only the latest release of `llm-error-atlas` receives fixes.

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's private vulnerability reporting
("Security" tab → "Report a vulnerability") on https://github.com/EzkielynaGroup/llm-error-atlas.
We aim to reply within 7 days.

## What this package does and does not do

- The library and CLI make **no network requests**. `explainResponse()` only reads a Response object you already have.
- Inputs are capped (20 000 characters per text, 1 MiB on stdin) and the bundled regexes are simple literals,
  checked in tests, to avoid catastrophic backtracking.
- API keys that appear in pasted messages (`sk-...`, `AIza...`) are masked in the echoed `input.message`.
  Still, avoid pasting full keys anywhere.
- The static site runs entirely in the browser and sends nothing anywhere.
- `scripts/check-links.mjs` (monthly workflow) only sends GET requests to the documentation URLs in `errors/`.
