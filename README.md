# strayaword

**Strayaword** — a daily word game like Wordle where every answer is Australian slang.
Six guesses, a new five-letter word each day, streak tracking, shareable emoji grid, and a
built-in Aussie slang dictionary. 100% client-side, no accounts, no tracking.

**Live:** https://strayaword.correia95.workers.dev/

## Stack

- React 18 + TypeScript + Vite
- No runtime dependencies beyond React
- Deploys as a static-assets Cloudflare Worker (`wrangler.jsonc`)

## Develop

```bash
npm install
npm run dev
```

## Build & deploy

```bash
npm run deploy   # build + wrangler deploy (needs CLOUDFLARE_API_TOKEN in env)
```

## How it works

- The answer list lives in [`src/words.ts`](src/words.ts) (~70 five-letter Aussie slang words
  with meanings and example sentences).
- [`src/game.ts`](src/game.ts) picks the daily word deterministically from the puzzle number
  (days since 8 Sept 2026), scores guesses, and persists streak/stats to `localStorage`.
- Puzzle numbers past the end of the list start a fresh deterministic shuffle, so the sequence
  doesn't repeat for a long time. Add more words to `ANSWERS` to extend it.
- Guesses aren't dictionary-validated (any five letters submit) — kept simple for the MVP.
