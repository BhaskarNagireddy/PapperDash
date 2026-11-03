# papperdash.se: the customer website

Next.js 16 (App Router), React 19, TypeScript. Swedish at `/sv` (default) and English at `/en`. Decisions: [ADR 0011](../../docs/decisions/0011-website-architecture.md).

## Run it

```sh
pnpm install
pnpm --filter @papperdash/web... build   # builds contracts and design tokens too
pnpm --filter @papperdash/web dev        # http://localhost:3000, forwards /v1/* to core on :4000
```

Start the API alongside with `pnpm dev:infra && pnpm dev:core`. `CORE_URL` points the website elsewhere.

## Test it

| Command | What it checks |
| --- | --- |
| `pnpm --filter @papperdash/web test` | Translations complete, locale routing, API client error handling |
| `pnpm --filter @papperdash/web test:e2e` | In a real browser, desktop and phone: Swedish default, remembered language, 404s, WCAG 2.2 AA (axe), no sideways scrolling, 48 px tap targets, skip link, security headers |
| `pnpm --filter @papperdash/web typecheck` | Types, including the Swedish file having every English key |

## How it is built

- `src/i18n/`: `en.ts` defines every message, and `sv.ts` must match it (a type error otherwise). Pages call `getMessages()`.
- `src/proxy.ts`: sends paths without a language to `/sv`, or to the remembered choice.
- `src/lib/api.ts`: calls `/v1/*` on the same origin and turns the backend's `{ error, message }` into `ApiError`.
- `src/components/ui/`: buttons, cards, status chips and the wordmark, using only design tokens from `@papperdash/design-tokens`.
- `next.config.ts`: security headers and the `/v1` rewrite to core for development.
