# AGENTS.md — Expense Tracker

## Project Overview

Offline-first PWA expense tracker. Zero dependencies — vanilla HTML/CSS/JS only.
Currency: THB. Target: mobile Safari (iPhone home screen install).

## Tech Stack

| Layer        | Tech                                                              |
| ------------ | ----------------------------------------------------------------- |
| Structure    | HTML5 (single `index.html` app shell)                             |
| Logic        | Vanilla ES6+ JavaScript — no frameworks, no build tools           |
| Styling      | Vanilla CSS3 with custom properties                               |
| Data         | `localStorage` (JSON), deep-cloned cache in memory                |
| PWA          | Service Worker (Stale-While-Revalidate), Web Manifest             |
| Formatting   | `Intl.NumberFormat` (THB), `Intl.DateTimeFormat`                  |
| Security     | CSP in `<meta>`, `escapeHtml()` for HTML, formula escape for CSV   |
| Testing      | Node.js zero-dep unit test runner (`node:vm`, `node:fs`)          |
| IDs          | `crypto.randomUUID()` with `getRandomValues()` fallback           |

## File Layout

```
expense_tracker/
├── index.html            # App shell, meta tags, script loader
├── manifest.json         # PWA manifest (standalone, icons, theme)
├── service-worker.js     # Offline cache (key: expense-tracker-v22)
├── css/
│   └── style.css         # Mobile-first styles, CSS variables, BEM-ish
├── js/
│   ├── store.js          # Data layer (IIFE). CRUD, search, CSV, backup/restore
│   ├── app.js            # SPA router, view renderers, event delegation
│   └── sw-register.js    # SW registration + update toast
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── test/
│   └── test-store.js     # Zero-dep unit tests for Store module
├── _NoGit/               # Local untracked files
├── README.md             # User-facing docs & changelog
└── AGENTS.md             # This file
```

## How to Run

No build step. Serve static files:

```bash
# Any of these work:
python3 -m http.server 8000
npx serve .
npx live-server
```

Open `http://localhost:8000` in browser. No `npm install` needed.

Run unit tests:

```bash
node test/test-store.js
```

## Architecture Rules

1. **Zero dependencies** — no npm, no CDN, no external libs. Keep it that way.
2. **IIFE modules** — `store.js` exposes `Store`, `app.js` exposes router + UI.
   Do not convert to ES modules unless explicitly asked.
3. **Load order matters** — `index.html` loads: `store.js` → `app.js` → `sw-register.js`.
4. **Event delegation** — single click listener on `#app` using `data-action` attributes.
   Add new actions via `data-action="yourAction"`, not new event listeners.
5. **Return structured results** — Store mutations return `{ ok: true }` or
   `{ ok: false, code, error }`; expense creation may also return a non-blocking
   `warning` when merchant suggestions cannot be updated.
6. **Validate persistence boundaries** — validate each stored key and expense
   record before use. Never silently replace malformed persisted data with defaults;
   use the recovery state and preserve/export raw values first.
7. **Deep-clone and write safely** — serialize before persistence, guard localStorage
   access, and update the in-memory cache only after a successful write.
8. **Escape all dynamic HTML** — use `escapeHtml()` for user-controlled text and
   attribute values in template strings. Prefer DOM APIs and `textContent` for new UI.
9. **CSV formula injection protection** — keep CSV quoting separate from formula
   mitigation; detect formula triggers after leading whitespace/control characters.
10. **Virtual `[Removed]` category** — this is a fallback for existing orphan expenses.
    Never persist it in the active category list or allow new expense assignments.
11. **THB amount precision** — accept finite positive amounts with at most two decimal
    places; reject excess precision rather than silently rounding user input.
12. **Backup compatibility** — export schema version 3; continue supporting version 1
    and 2 imports through explicit legacy migration. Preserve virtual orphan expenses
    using the v3 `removedCategoryPolicy` marker and `removedExpenseIds` list.
13. **Router history** — keep the in-memory screen stack synchronized with History API
    `pushState` / `replaceState` and handle `popstate` for Browser Back/Forward.
14. **Test coverage** — run `node test/test-store.js` after Store changes. The suite
    includes fault-injected restore rollback and storage recovery cases.

## Release and PWA Conventions

- The user-facing release label is `APP_VERSION` in `js/app.js` (currently `v11`).
- The Service Worker cache revision is independent (`expense-tracker-v22`).
  Increment it whenever an app-shell asset or Service Worker caching behavior changes.
- Cache cleanup and Force Update must remain scoped to the `expense-tracker-` cache
  namespace and this app's Service Worker registration; do not clear origin-wide caches
  or unregister unrelated app registrations.
- Service Worker cache matching is exact by default. Revalidation and cache writes must
  be tied to the fetch event lifetime with `event.waitUntil()`.
- Keep the app shell in `APP_SHELL` synchronized with added, removed or renamed assets.

## Styling Conventions

- Mobile-first, max-width `480px` breakpoint.
- CSS custom properties in `:root` for accent, background, surface, text.
- BEM-inspired naming: `.block__element--modifier`.
- Safe area insets: `env(safe-area-inset-bottom)` for iPhone notch/home bar.
- Accent color is user-configurable at runtime via `applyAccentColor()`.
- Keep interactive touch targets at least 48 × 48 CSS pixels where applicable.
- Search month fields stack vertically on narrow screens and return to a row at
  the 480px breakpoint; preserve this responsive behavior.
- Summary merchant names use 14px text; merchant amounts retain their own table
  typography. Keep Category and Merchant rows compact without shrinking 48px links.

## Git Rules

- Commit messages: concise, imperative mood.
- `_NoGit/` directory is untracked — for local scratch files.
- `.serena/` and `reports/` are intentionally ignored local working data.
- `AGENTS.md` is a tracked project instruction file and should be kept in sync
  with repository architecture, security policy, testing, and release conventions.
- Bump service worker cache revision (`expense-tracker-vNN`) when cached assets or
  Service Worker behavior change; app release number and cache revision are independent.

## What NOT to Do

- Do not add `node_modules`, `package.json`, or any build tooling.
- Do not add external CSS frameworks (Tailwind, Bootstrap, etc.).
- Do not use `eval()`, inline `onclick=`, or `innerHTML` without escaping.
- Do not store sensitive data in `localStorage` — this is a local-only app.
- Do not break offline functionality — test with DevTools Network → Offline.
- Do not weaken `script-src 'self'`; review CSP and runtime style changes together.
- Current CSP: `default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'none'; img-src 'self' data:`. Validate runtime theme custom-property updates and UI flows if changing it.
- Do not overwrite malformed stored data or reset it without first offering a raw
  recovery export and an explicit user action.
- Do not implement Browser History changes without testing Back, Forward, Home,
  `replaceTop`, `popToView`, and nested routes.
