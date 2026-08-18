# NinjaCoPilot

A Chrome extension (Manifest V3) that helps cloud operations support automate
repetitive browser tasks. Built with TypeScript and a feature-based architecture
so new capabilities can be added cleanly over time.

## Feature 1 — Fill Public IP

Fetches the machine's public IPv4 address and fills it into a form field on
pages that match a configured URL rule. The initial rule targets the
**Azure Portal → Key Vault → Firewall** address field.

## Architecture

```
src/
  background/service-worker.ts   Orchestrator: IP -> rule match -> inject -> fill
  content/
    content-script.ts            Injected on demand; fills the field, replies
    formFiller.ts                Framework-safe value setter (React/Fluent UI)
  popup/                         Toolbar UI (HTML/CSS/TS)
  features/publicIp/rules.ts     URL pattern -> selector configuration
  core/
    ipService.ts                 Public IP fetch (multi-provider + cache)
    logger.ts                    Leveled logging + persisted warn/error buffer
    result.ts / errors.ts        Result<T> + typed AppError for error handling
    messaging.ts                 Typed chrome messaging wrappers
  shared/types/messages.ts       Message contracts between contexts
```

Design choices:

- **On-demand injection** via `activeTab` + `scripting` — no always-on content
  scripts, so the extension only touches a page when you click the button.
- **`Result<T>` + typed errors** carried across message boundaries instead of
  throwing across contexts.
- **Multi-provider IP fetch** with timeout, validation and short-lived cache.
- **Structured logging**; warnings/errors persist to `chrome.storage.local`.

## Getting started

```powershell
npm install
npm run build      # outputs to dist/
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder.

Use `npm run watch` for incremental rebuilds during development, and
`npm run typecheck` to run the TypeScript compiler without emitting.

## Adding a new site/form

Add an entry to `FILL_RULES` in
[`src/features/publicIp/rules.ts`](src/features/publicIp/rules.ts):

```ts
{
  id: 'my-tool',
  name: 'Internal Tool — Allow list',
  urlPattern: /https:\/\/tool\.example\.com\/firewall/i,
  selectors: ['input[name="ipAddress"]'],
}
```

## Notes

- The Azure selectors are best-effort guesses because the portal uses dynamic
  Fluent UI markup. Verify them against the live blade and adjust as needed.
- Icons are not bundled yet; Chrome shows a default icon. Add PNGs under
  `src/icons/` and reference them in `src/manifest.json` when ready.
