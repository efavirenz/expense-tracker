// Scratch static validation for the approved remediation items. Not part of the app.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let total = 0, passed = 0;
function assert(condition, name) {
  total++;
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else console.error(`  ✗ FAIL: ${name}`);
}

const indexHtml = read('index.html');
const manifest = read('manifest.json');
const css = read('css/style.css');
const app = read('js/app.js');
const store = read('js/store.js');
const sw = read('service-worker.js');
const swRegister = read('js/sw-register.js');
const agents = read('AGENTS.md');
const readme = read('README.md');

console.log('--- Static App Validation ---');

// N5 accessibility
assert(!/<main id="app"[^>]*aria-live/.test(indexHtml), 'App container no longer has aria-live');
assert(/id="pageTitle"[^>]*tabindex="-1"/.test(indexHtml), 'Page title is programmatically focusable');
assert(/id="searchStatus"[^>]*role="status"[^>]*aria-live="polite"/.test(app), 'Search has a scoped polite status region');
assert(/focusAfterNavigation/.test(app) && /titleEl\.focus/.test(app), 'Navigation focus handling is present');

// N6 contrast and accent defaults
assert(/--accent:\s*#0866CB/i.test(css), 'CSS default accent is #0866CB');
assert(/--accent-dark:\s*#0651A2/i.test(css), 'CSS dark accent is #0651A2');
assert(/theme_color":\s*"#0866CB"/i.test(manifest), 'Manifest theme color matches the new accent');
assert(/theme-color" content="#0866CB"/i.test(indexHtml), 'HTML theme color matches the new accent');
assert(/'#0866CB'/.test(store) && /'#0866CB'/.test(app), 'Store/app accent fallbacks match the new accent');
function lum(hex) {
  const c = hex.replace('#', '');
  const v = [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) / 255)
    .map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const ratio = (1.05) / (lum('#0866CB') + 0.05);
assert(ratio >= 4.5, `White on #0866CB meets 4.5:1 (${ratio.toFixed(2)}:1)`);
assert(/accentHasSufficientContrast/.test(app), 'Accent save uses the contrast guard');

// N1/N18 attribute encoding
assert(!/data-id="\$\{e\.id\}"/.test(app), 'Expense IDs are escaped in data-id attributes');
assert((app.match(/data-id="\$\{escapeHtml\(e\.id\)\}"/g) || []).length === 3, 'All three expense list renderers escape data-id');
assert(!/data-(?:start|end|category|month|name|oldname|mode|returnto)="\$\{(?!escapeHtml)/.test(app), 'Dynamic data-* attributes use escapeHtml');
assert(/SAFE_ID_PATTERN/.test(store) && /safe ID|invalid expense/i.test(store), 'Store restricts imported ID charset');

// N3 transient UI guard
assert(/function hasTransientUi/.test(app) && /Finish or cancel this screen to refresh/.test(app), 'Cross-tab updates preserve transient UI');

// N4 scroll reset
assert(/window\.scrollTo\(0,\s*0\)/.test(app), 'Render resets the window scroll position');
assert(!/appEl\.scrollTop\s*=\s*0;\s*return;/.test(app), 'Recovery screen uses the shared scroll helper');

// N7 merchant length
assert(/Merchant names must be 100 characters or fewer/.test(store), 'addMerchant has an explicit length error');

// N8 orphan edit
assert(/isOrphan/.test(app) && /editSaveBtn/.test(app) && /disabled/.test(app), 'Orphan expenses require reassignment before saving');
assert(/record\.date > Store\.todayISO\(\) \? record\.date/.test(app), 'Edit date max respects an imported future record');

// N2 date rules
assert(/source\.date > tomorrowISO\(\)/.test(store), 'All import versions preserve the next-day ceiling for round trips');
assert(/if \(date > tomorrowISO\(\)\)/.test(store), 'updateExpense tolerates imported tomorrow records');

// N9 read batching
assert(/beginReadBatch/.test(store) && /endReadBatch/.test(store), 'Store exposes read batching');
assert(/Store\.beginReadBatch\(\)/.test(app) && /finally[\s\S]*Store\.endReadBatch\(\)/.test(app), 'Render wraps reads in a try/finally batch');

// N11 modal lifecycle
assert(/closeActiveModal/.test(app) && /activeModalCleanup/.test(app), 'Modals share one active cleanup owner');
assert(/if \(settled\) return;/.test(app), 'Modal cleanup is idempotent');

// N12/N13 history
assert(/function goHome\(\) \{\s*popToView\('home'\);/.test(app), 'Home navigation uses the history-aware stack path');
assert(/topScreen\(\)\.query = q;\s*\/\/ Keep browser history aligned[\s\S]*syncBrowserHistory\(true\)/.test(app), 'Search state updates replace the current history entry');

// N14/N15 Service Worker
assert(/CACHE_NAME = 'expense-tracker-v26'/.test(sw), 'Service Worker cache revision is v26');
assert(!/skipWaiting/.test(sw), 'Service Worker no longer forces skipWaiting');
assert(!/clients\.claim/.test(sw), 'Service Worker no longer forces clients.claim');
assert(/APP_SHELL\.map/.test(sw) && /failed to pre-cache/.test(sw), 'Service Worker pre-caches assets individually');
assert(/cache open failed/.test(sw) && /cache read failed/.test(sw), 'Service Worker handles cache-open/read failures');

// N16/N17 backup and toast
assert(/MAX_BACKUP_FILE_BYTES = 5 \* 1024 \* 1024/.test(app), 'UI backup size cap is 5 MB');
assert(/MAX_BACKUP_CHARS = 6 \* 1024 \* 1024/.test(store), 'Store JSON size cap is 6M characters');
assert(/TOAST_ERROR_MS = 7000/.test(app) && /TOAST_SUCCESS_MS = 2600/.test(app), 'Toast durations differ for errors and success');
assert(/pointer-events: auto/.test(css) && /hideToast/.test(app), 'Visible toasts are tappable and dismissible');

// Version/documentation consistency
assert(/const APP_VERSION = 'v11\.5'/.test(app), 'APP_VERSION is v11.5');
assert(/v11\.4/.test(readme) && /v11\.5/.test(readme), 'README keeps historical and current release notes');
assert(/currently `v11\.5`/.test(agents) && /expense-tracker-v26/.test(agents), 'AGENTS.md release references are synchronized');
assert(/close and reopen the app to update/.test(swRegister), 'Update toast matches the non-forced activation model');

console.log(`\nStatic App Validation: ${passed}/${total} passed.`);
if (passed !== total) process.exit(1);
