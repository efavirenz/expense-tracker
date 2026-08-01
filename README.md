# Expense Tracker (PWA)

A personal, single-user daily expense tracker. Runs entirely in the browser — no
backend, no account, no App Store. All data is stored locally on the device
(`localStorage`), and everything works offline once installed.

## Install on iPhone

1. Open the URL *https://efavirenz.github.io/expense-tracker/* in **Safari** (must be Safari, not Chrome — iOS only
   allows installing PWAs from Safari).
2. Tap the **Share** icon → **Add to Home Screen** → **Add**.
3. Launch it from the home screen icon like any other app.

## Categories & merchants

Every expense has a **category** (a fixed list you manage under *Edit
Category / Merchant*) and an optional **merchant** (e.g. `Shopee`, `Lazada`,
`7-Eleven`, a specific shop name — anything you like).

- Merchant is still **not a validated list** — typing a brand-new name on the
  expense form works exactly as before and it's simply remembered for
  autocomplete next time. What's new in v3 is that you can now also manage
  that suggestion list directly from *Edit Category / Merchant → Add /
  Rename / Delete Merchant*, the same way categories are managed:
  - **Add Merchant** adds a name to the suggestion list up front, without
    waiting to type it on an expense first.
  - **Rename Merchant** updates the suggestion list and cascades to every
    past expense using that merchant, just like Rename Category does.
  - **Delete Merchant** only removes it from the suggestion list — past
    expenses keep their merchant text unchanged, since merchant was never a
    required field the way category is.
- This replaces the old pattern of bolting the platform onto the category
  name itself (e.g. `Skincare-Shopee`, `Clothing-Lazada`). Now the category
  stays clean (`Skincare`, `Clothing`) and the merchant carries that detail
  separately, so summaries and totals per category aren't fragmented across
  near-duplicate categories.
- The app ships with a default category list and two seed merchants
  (`Lazada`, `Shopee`) based on real prior usage — edit or delete any of them
  freely from *Edit Category / Merchant*, and the merchant suggestions adjust
  automatically as you type new ones.

## Data & backup — please read

- All data lives in this browser's local storage on this one iPhone. There is
  **no cloud sync**. If you use the app on another device, it starts empty.
- Apps installed to the Home Screen are exempt from Safari's normal 7-day
  data-clearing rule, but iOS can still clear storage under low disk space or
  if the app goes unused for a very long time. Treat local storage as
  convenient, not indestructible.
- Use **Backup & Restore → Export All Data (JSON)** regularly (e.g. monthly).
  This is a full raw copy of every category, merchant, and expense — the only
  way to recover your data if it's ever cleared, or to move it to a new
  phone. Backup files are versioned (`version: 2` now includes the
  `merchants` list and each expense's `merchant` field); older `version: 1`
  backups without a `merchant` field still restore fine — merchant just comes
  back blank on those old entries.
- **Save to CSV** under Summary is for *reporting* (category totals, or an
  itemized list with Date / Category / Merchant / Amount / Note, for a
  period) — it is not a full backup and cannot be re-imported.
- On iPhone, "downloading" a file from Safari opens the share sheet /
  "Save to Files" rather than saving straight to a folder like on a computer.
  This is expected iOS behavior, not a bug.

## What's included beyond the original spec

Two things were added during planning review, both agreed on beforehand:

- **View / Edit Expenses** — browse past entries by month, correct mistakes,
  or delete an entry. The original plan had no way to fix a wrong entry once
  saved.
- **Backup & Restore** — full JSON export/import, separate from the CSV
  summary export, specifically to protect against local data loss.

## Changelog

**v9.6 — Dedicated Inline '+' Button for Instant iOS Keypad Focus**
- **iOS Keypad Focus Fix**: Replaced the `<select>` drop-down `+ Add Merchant...` option with an explicit, dedicated `+` button directly next to the merchant dropdown field. Tapping the `+` button is a clean, direct user gesture (bypassing native iOS select picker focus steals completely) that opens the modal and focuses `#modalInput` synchronously, bringing up the iPhone virtual keyboard automatically every single time.
- Home screen version tag bumped to **v9.6**; service worker cache bumped to `v17`.

**v9.5 — Proxy Input iOS Keypad Activation**
- **Proxy Input Synchronous Focus**: Added off-screen proxy `<input>` focus synchronously inside the `<select>` user gesture `change` event handler, preserving the iOS Safari user-gesture chain and seamlessly transferring focus to `#modalInput` so the iPhone virtual keyboard appears reliably.
- Home screen version tag bumped to **v9.5**; service worker cache bumped to `v16`.

**v9.4 — iOS Keypad Auto-Focus on Add Merchant**
- **iOS Keypad Focus Fix**: Explicitly blur `<select>` element upon choosing `+ Add Merchant...` and increase modal input focus delay to 250ms (plus `autofocus` attribute) to allow iOS native picker dismissal transition to finish without cancelling virtual keyboard activation.
- Home screen version tag bumped to **v9.4**; service worker cache bumped to `v15`.

**v9.3 — Technical audit remediation, data safety & security hardening**
- **Data Integrity & Rollback**: Added transaction rollback for multi-key storage updates (`renameCategory`, `deleteCategory`, `renameMerchant`) so partial storage quota failures never leave orphaned references. Standardized `importBackup` to perform point-in-time full merchant state replacement.
- **Validation & Input Limits**: Added strict calendar date validation (`isValidCalendarDate`) preventing non-existent calendar dates (e.g. `2026-02-31`). Enforced payload boundary limits on backup JSON import (max 50k expenses, 500 categories/merchants, string length checks).
- **Excel Thai CSV Encoding**: Added UTF-8 Byte Order Mark (`\uFEFF`) to CSV exports ensuring Thai text renders correctly when opened in Microsoft Excel on Windows.
- **Accessibility & Router Hardening**: Escaped modal option buttons with `escapeHtml()`, added Tab focus trap inside modal dialogs, added route fallback guard in main render loop to prevent blank screen crashes on invalid views, and enabled `{ ignoreSearch: true }` in Service Worker offline fetch handling.
- Home screen version tag bumped to **v9.3**; service worker cache bumped to `v14`.

**v9.2 — Merchant select dropdown, inline Add Merchant prompt & Date field alignment**
- **Merchant Dropdown & Inline Add Prompt**: Converted `Merchant (optional)` text/datalist field in Add & Edit Expense forms into a `<select>` dropdown with `-- Optional --` default. Added a `+ Add Merchant…` option that pops up an interactive modal prompt for creating new merchants on-the-fly.
- **Date Field Layout Fix**: Fixed `input[type="date"]` appearance and layout sizing (`-webkit-appearance: none`, `min-height: 46px`, `box-sizing: border-box`, `max-width: 100%`) so Date field width perfectly aligns with all other form controls across iOS Safari and desktop browsers.
- Home screen version tag bumped to **v9.2**; service worker cache bumped to `v13`.

**v9.1 — Search text auto-focus & Interactive Version Badge force update**
- **Search Text Auto-Focus**: Opening the `Search Expenses` screen automatically focuses and selects the `Search Text` field so the keypad appears automatically on iOS devices.
- **Software Force Update & Interactive Version Badge**: Updated top right homepage badge to `v9.1`. Added automatic service worker update checks on launch (`reg.update()`). Tapping the `v9.1` version badge unregisters service workers, clears cache storage, and reloads to guarantee instantaneous client updates.
- Home screen version tag bumped to **v9.1**; service worker cache bumped to `v12`.

**v9 — Today's expense totals, default amount focus & Display Today summary**
- **Today's Expense Summaries**: Added Today's expense total calculation to the homepage summary card (positioned directly under the monthly total) and to the top area of the View / Edit Expenses screen (under the month picker).
- **Default Focus on Add Expense**: Opening the Add Expense screen automatically focuses and selects the `Expense (THB)` field so the numeric keypad appears automatically on iOS devices.
- **Display Today Summary Menu**: Added a new **Display Today** menu option as the top entry in the Summary menu, showing category and merchant breakdown for today's expenses.
- Home screen version tag bumped to **V9**; service worker cache bumped to `v11`.

**v8 — Summary drill-down, today's expense highlight, date+time sort, custom accent color & security hardening**
- **Summary Drill-Down**: Tapping any category or merchant in Summary results navigates directly to filtered expense list for that period. Subtotal card positioned above list (right-aligned, hidden when empty).
- **View / Edit Expenses Enhancements**: Today's expenses highlighted with pale accent background. Expenses sorted by date + time (`createdAt`/`updatedAt` tiebreaker, latest first). Note fields show up to 2 lines.
- **Change Color Menu**: New **Change color** menu above Backup & Restore allows customizing theme accent color via live color picker + hex code input. Auto-syncs theme across app & backups. Reverts unsaved preview on navigation exit.
- **Homepage Summary Card Link**: Tapping summary card on homepage navigates directly to View / Edit Expenses for current month.
- **Security & Data Layer Hardening**: Removed `'unsafe-inline'` script CSP by extracting SW registration to `js/sw-register.js`. Deep-cloned store cache to prevent mutation before disk write. Fixed case-only category renames, `[Removed]` category filtering in dropdowns, timezone grace in backup import, merchant case deduplication, and toast timer leaks.
- Home screen version tag bumped to **V8**; service worker cache bumped to `v10`.

**v7 — Theme sync, edit expense cancel button & header shortcuts**
- Updated theme accent color and primary buttons to `#0B81FE` with white font color to match homepage summary card.
- Added `Cancel` button between `Delete` and `Save` on expense edit screen.
- Added Home icon (🏠) next to Search icon (🔍) in header. Home icon is hidden on homepage and visible on all sub-pages; tapping Home resets navigation to homepage.
- Fixed all security, bug, data integrity, and accessibility issues from audit report (crypto.randomUUID IDs, localStorage quota error handling, CSP headers, stale-while-revalidate SW, backup import validation, focus trap, maxlength input limits, cross-tab sync).
- Home screen version tag bumped to **V7**; service worker cache bumped to `v9`.

**v6 — Search expenses & home menu simplification**
- Added Search Expenses feature (🔍 button in header and View / Edit Expenses screen).
- Search allows filtering by month range (From / To month pickers) and searching text across 4 fields: category, merchant, note, and amount.
- Tapping search result navigates directly to expense edit screen.
- Simplified home screen menu: merged *Add Today's Expense* and *Add Expense (Other Day)* into a single **Add Expense** item. Date field defaults to today and remains fully editable via date picker.
- Home screen version tag bumped to **V6**; service worker cache bumped to `v8`.

**v5 — Summary display formatting, toggle & theme update**
- Renamed *Category Summary* menu to **Summary**.
- Updated Summary result view: merchant names are indented by 3 space characters, and 3 space characters follow each merchant's total number.
- Added a toggle switch at the top of Summary views to show or hide merchant lines.
- Updated top homepage summary card background color to `#00FFF2` with dark font.
- Home screen version tag bumped to **V5**; service worker cache bumped to `v7`.

**v4 — Merchant breakdown in Category Summary**
- The Category Summary **Display** screen now nests a merchant breakdown
  under each category: the category's total on its own row, then one
  indented row per merchant showing that merchant's share of the category.
  Expenses with a blank merchant are grouped under **(No merchant)**.
- The **Category Summary CSV** export gained a `Merchant` column with the
  same nesting: a totals row per category (`Merchant` blank), followed by
  one row per merchant (`Category` blank, so it reads as a group when
  opened in a spreadsheet). The Detailed Expense List CSV already had a
  Merchant column and is unchanged.
- Added `Store.summarizeByCategoryAndMerchant`, which reuses
  `summarizeByCategory` for the category totals and layers a merchant
  breakdown on top, so Display and CSV can never drift out of sync with
  each other.
- Home screen version tag bumped to **V4**; service worker cache bumped to
  `v6`.

**v3 — Merchant management & menu reorg**
- *Edit Category* renamed to **Edit Category / Merchant**, and moved on the
  home screen to sit directly above **Backup & Restore** (was previously
  third, above *View / Edit Expenses*).
- Under that menu, category management is unchanged (**Add / Rename / Delete
  Category**), and a new **Merchant** section sits alongside it with the same
  three actions — **Add / Rename / Delete Merchant**. Renaming a merchant
  cascades to past expenses; deleting one only affects the suggestion list
  (see *Categories & merchants* above for why that's different from category
  deletion).
- Added `Store.addMerchant`, `Store.renameMerchant`, and
  `Store.deleteMerchant` to `store.js`, mirroring the existing category
  functions.
- Home screen now shows a small **V3** version tag, right-aligned above the
  month total.
- Re-checked the default category list and seed merchants against a fresh
  iPhone export (2026-07-22) — already in sync, no changes needed.
- Service worker cache bumped to `v5` so installed home-screen apps pick up
  this update.

**v2 — Merchant field & menu cleanup**
- Added a free-text **Merchant** field to the add/edit expense form, with
  `<datalist>` autocomplete sourced from previously-used merchants
  (`expenseApp_merchants_v1` in local storage). Not tied to the category
  list — anything typed is remembered.
- *Category Summary* menu flattened: **Just Display → Current Month /
  Choose Period** is now two direct items, **Display Current Month** and
  **Display Period…**, sitting alongside **Save to CSV** (one tap saved).
- Itemized CSV export now includes a Merchant column.
- JSON backup format bumped to `version: 2`: adds a top-level `merchants`
  array and a `merchant` field on every expense. Restoring rebuilds the
  merchant suggestion list from both the backup's `merchants` array and
  whatever merchants actually appear on its expenses.
- Default categories and seed merchants updated to match real-world usage
  (Shopee/Lazada-suffixed categories like `Skincare-Shopee` were merged back
  into their base category, e.g. `Skincare`, with `Shopee` moved to the new
  merchant field).

## Known limitations

- Single user, single device unless you manually move the JSON backup.
- No push notifications, no background sync (not needed for this use case,
  and Apple restricts both heavily for PWAs anyway).
- UI is plain/functional by design (per your choice of "simple web form"
  over an iOS-style mimicked interface).
- Deleting a merchant only removes it from the suggestion list; it does not
  retroactively edit past expenses (unlike deleting a category, which moves
  affected expenses to `[Removed]`). This is intentional — merchant was never
  a required field, so there's no need for a "removed" bucket.
