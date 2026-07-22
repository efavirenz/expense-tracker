# Expense Tracker (PWA)

A personal, single-user daily expense tracker. Runs entirely in the browser — no
backend, no account, no App Store. All data is stored locally on the device
(`localStorage`), and everything works offline once installed.

## Deploy to GitHub Pages (free)

1. Create a new **public** GitHub repository (e.g. `expense-tracker`).
2. Upload every file in this folder, keeping the folder structure exactly as-is
   (`index.html`, `manifest.json`, `service-worker.js`, `css/`, `js/`, `icons/`
   all at the repo root).
3. In the repo: **Settings → Pages → Source → Deploy from a branch → `main` /
   `(root)` → Save**.
4. Wait 1–2 minutes. Your app will be live at:
   `https://<your-username>.github.io/<repo-name>/`

## Install on iPhone

1. Open the URL above in **Safari** (must be Safari, not Chrome — iOS only
   allows installing PWAs from Safari).
2. Tap the **Share** icon → **Add to Home Screen** → **Add**.
3. Launch it from the home screen icon like any other app.

## Categories & merchants

Every expense has a **category** (a fixed list you manage under *Edit
Category*) and an optional **merchant** (a free-text field, e.g. `Shopee`,
`Lazada`, `7-Eleven`, a specific shop name — anything you like).

- Merchant is **not** a fixed list. Type anything; it's just remembered so it
  shows up as a suggestion (via the browser's native autocomplete) the next
  time you type an expense. There's nothing to "add" or manage — it learns
  from what you type.
- This replaces the old pattern of bolting the platform onto the category
  name itself (e.g. `Skincare-Shopee`, `Clothing-Lazada`). Now the category
  stays clean (`Skincare`, `Clothing`) and the merchant carries that detail
  separately, so summaries and totals per category aren't fragmented across
  near-duplicate categories.
- The app ships with a default category list and two seed merchants
  (`Lazada`, `Shopee`) based on real prior usage — edit or delete any of them
  freely from *Edit Category*, and the merchant suggestions adjust
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
- The merchant field is a plain suggestion list with no dedicated management
  screen (no rename/delete UI) — it grows from what you type and is only
  meant to speed up entry, not to be curated like categories are.
