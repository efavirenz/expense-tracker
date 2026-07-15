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

## Data & backup — please read

- All data lives in this browser's local storage on this one iPhone. There is
  **no cloud sync**. If you use the app on another device, it starts empty.
- Apps installed to the Home Screen are exempt from Safari's normal 7-day
  data-clearing rule, but iOS can still clear storage under low disk space or
  if the app goes unused for a very long time. Treat local storage as
  convenient, not indestructible.
- Use **Backup & Restore → Export All Data (JSON)** regularly (e.g. monthly).
  This is a full raw copy of every category and expense — the only way to
  recover your data if it's ever cleared, or to move it to a new phone.
- **Save to CSV** under Summary is for *reporting* (category totals for a
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

## Known limitations

- Single user, single device unless you manually move the JSON backup.
- No push notifications, no background sync (not needed for this use case,
  and Apple restricts both heavily for PWAs anyway).
- UI is plain/functional by design (per your choice of "simple web form"
  over an iOS-style mimicked interface).
