// Zero-dependency Store tests: data integrity, validation, restore rollback and storage events.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const storeCode = fs.readFileSync(path.join(__dirname, '../js/store.js'), 'utf8');
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, name) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${name}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

function assertEqual(actual, expected, name) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  assert(same, `${name} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function createEnvironment(initialStorage = {}) {
  const backing = { ...initialStorage };
  const listeners = {};
  const failures = [];
  let nextId = 0;
  function maybeFail(operation, key) {
    const index = failures.findIndex(rule => rule.operation === operation && rule.key === key);
    if (index === -1) return;
    const rule = failures[index];
    if (rule.once) failures.splice(index, 1);
    const error = new Error(rule.name || 'Mock storage failure');
    error.name = rule.name || 'Error';
    if (rule.code !== undefined) error.code = rule.code;
    throw error;
  }
  const localStorage = {
    getItem(key) {
      maybeFail('getItem', key);
      return Object.prototype.hasOwnProperty.call(backing, key) ? backing[key] : null;
    },
    setItem(key, value) {
      maybeFail('setItem', key);
      backing[key] = String(value);
    },
    removeItem(key) {
      maybeFail('removeItem', key);
      delete backing[key];
    },
    clear() { Object.keys(backing).forEach(key => delete backing[key]); },
    _dump() { return { ...backing }; },
    _fail(operation, key, name = 'Error', options = {}) {
      failures.push({ operation, key, name, once: options.once !== false, code: options.code });
    },
    _clearFailures() { failures.splice(0, failures.length); }
  };
  const window = {
    onStoreUpdated: null,
    addEventListener(event, handler) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    _trigger(event, value) { (listeners[event] || []).forEach(handler => handler(value)); }
  };
  const context = {
    console,
    localStorage,
    window,
    Intl,
    Date,
    Math,
    JSON,
    Array,
    Object,
    Set,
    String,
    Number,
    parseFloat,
    isNaN,
    crypto: {
      randomUUID: () => `test-uuid-${++nextId}`,
      getRandomValues: buffer => buffer.fill(1)
    }
  };
  vm.createContext(context);
  const Store = vm.runInContext(`${storeCode}; Store;`, context);
  return { Store, localStorage, window, context };
}

console.log('--- Running Store Tests ---');

// Initialization and CRUD invariants.
{
  const { Store, localStorage } = createEnvironment();
  const init = Store.init();
  assert(init.ok, 'Store.init initializes a clean storage area');
  assert(Store.getCategories().length > 0, 'Default categories are initialized');
  assert(Store.getMerchants().length > 0, 'Default merchants are initialized');
  assertEqual(Store.getExpenses(), [], 'Default expense list is empty');

  assert(Store.addCategory('Groceries Test').ok, 'addCategory accepts a new category');
  assert(!Store.addCategory('Groceries Test').ok, 'addCategory rejects duplicates');
  const added = Store.addExpense({ date: Store.todayISO(), amount: '150.00', category: 'Groceries Test', merchant: 'BigC', note: 'Weekly shopping' });
  assert(added.ok && added.record.amount === 150, 'addExpense saves a valid expense');
  assert(Store.deleteCategory('Groceries Test').ok, 'deleteCategory succeeds');
  assert(Store.getExpenses()[0].category === Store.RESERVED_CATEGORY, 'Deleting a category moves its expenses to virtual [Removed]');
  const rawCategories = JSON.parse(localStorage.getItem('expenseApp_categories_v1'));
  assert(!rawCategories.includes(Store.RESERVED_CATEGORY), 'Reserved category is never persisted in the categories key');
  assert(Store.getCategories().includes(Store.RESERVED_CATEGORY), 'Virtual [Removed] appears while orphaned expenses exist');
  assert(!Store.getSelectableCategories().includes(Store.RESERVED_CATEGORY), 'Virtual [Removed] is not selectable for new expenses');
  assert(Store.addCategory('New Category While Orphans Exist').ok, 'Adding a category works while virtual [Removed] expenses exist');
  assert(Store.renameCategory(Store.RESERVED_CATEGORY, 'Legacy Orphans').ok, 'The virtual [Removed] category can still be renamed');
  assert(Store.getExpenses()[0].category === 'Legacy Orphans', 'Renaming virtual [Removed] migrates all orphan expenses');
  assert(!Store.getCategories().includes(Store.RESERVED_CATEGORY), 'Renamed orphan expenses no longer synthesize [Removed]');
  assert(!Store.addExpense({ date: Store.todayISO(), amount: 10, category: Store.RESERVED_CATEGORY }).ok, 'addExpense blocks the reserved category');
  assert(!Store.updateExpense(added.record.id, { date: Store.todayISO(), amount: 10, category: Store.RESERVED_CATEGORY }).ok, 'updateExpense blocks the reserved category');
  assert(Store.grandTotal(Store.getExpenses()) === 150, 'grandTotal reconciles expense amounts');
  assert(Store.summarizeByCategory(Store.getExpenses())[0].total === 150, 'Category summary reconciles to stored expenses');
}

// Failed legacy migration pauses the app without resetting valid financial data.
{
  const legacyStorage = {
    expenseApp_categories_v1: JSON.stringify(['Food', 'Removed']),
    expenseApp_expenses_v1: JSON.stringify([{ id: 'legacy-migration-fail', date: '2026-11-07', amount: 10, category: 'Removed', merchant: '', note: '' }]),
    expenseApp_merchants_v1: JSON.stringify([]),
    expenseApp_showMerchants_v1: 'true',
    expenseApp_accentColor_v1: JSON.stringify('#0B81FE')
  };
  const { Store, localStorage } = createEnvironment(legacyStorage);
  localStorage._fail('setItem', 'expenseApp_categories_v1', 'QuotaExceededError');
  const init = Store.init();
  assert(!init.ok && init.code === 'MIGRATION_FAILED', 'Failed legacy migration enters a controlled migration state');
  assertEqual(localStorage._dump(), legacyStorage, 'Failed migration leaves every original storage value unchanged');
  assert(!Store.resetRecoveryData().ok, 'Default reset is unavailable for a migration-only failure');
  const retry = createEnvironment(localStorage._dump());
  assert(retry.Store.init().ok, 'Migration succeeds after storage becomes writable on a fresh app load');
  assert(retry.Store.getExpenses()[0].category === '[Removed]', 'Retried migration preserves the legacy expense');
}

// Legacy localStorage values using the old Removed label migrate at startup.
{
  const date = '2026-11-07';
  const { Store, localStorage } = createEnvironment({
    expenseApp_categories_v1: JSON.stringify(['Food', 'Removed', '[Removed]']),
    expenseApp_expenses_v1: JSON.stringify([{ id: 'legacy-local', date, amount: 10, category: 'Removed', merchant: '', note: '' }]),
    expenseApp_merchants_v1: JSON.stringify([]),
    expenseApp_showMerchants_v1: 'true',
    expenseApp_accentColor_v1: JSON.stringify('#0B81FE')
  });
  assert(Store.init().ok, 'Legacy localStorage with Removed category initializes');
  assert(Store.getExpenses()[0].category === '[Removed]', 'Legacy Removed expense migrates to virtual [Removed]');
  assert(!JSON.parse(localStorage.getItem('expenseApp_categories_v1')).includes('Removed') && !JSON.parse(localStorage.getItem('expenseApp_categories_v1')).includes('[Removed]'), 'Legacy reserved labels are removed from active stored categories');
}

// Strict THB amount policy.
{
  const { Store } = createEnvironment();
  Store.init();
  const invalidAmounts = ['12abc', '0.004', '0.005', '0', '-1', '1e2', 'Infinity', 'NaN', '1.000', '1.234', ''];
  invalidAmounts.forEach(amount => {
    assert(!Store.addExpense({ date: Store.todayISO(), amount, category: 'Food & Drink🍔' }).ok, `Amount ${JSON.stringify(amount)} is rejected`);
  });
  ['0.01', '1', '100.50', 200].forEach(amount => {
    assert(Store.addExpense({ date: Store.todayISO(), amount, category: 'Food & Drink🍔' }).ok, `Amount ${JSON.stringify(amount)} is accepted`);
  });
}

// Legacy backup migration and v3 round-trip semantics for virtual orphan expenses.
{
  const versionOne = createEnvironment();
  versionOne.Store.init();
  const v1Backup = {
    app: 'expense-tracker-pwa', version: 1, categories: ['Old Food'],
    expenses: [{ id: 'legacy-v1', date: versionOne.Store.todayISO(), amount: 5, category: 'Old Food' }]
  };
  assert(versionOne.Store.importBackup(JSON.stringify(v1Backup)).ok, 'Version 1 backup without merchant fields still restores');
  assert(versionOne.Store.getExpenses()[0].merchant === '', 'Version 1 expenses restore with a blank merchant');

  const { Store, localStorage } = createEnvironment();
  Store.init();
  const legacy = {
    app: 'expense-tracker-pwa', version: 2,
    categories: ['Food', '[Removed]'], merchants: ['Shop'],
    expenses: [{ id: 'legacy-1', date: Store.todayISO(), amount: 25.5, category: '[Removed]', merchant: 'Shop', note: 'legacy row' }]
  };
  assert(Store.importBackup(JSON.stringify(legacy)).ok, 'Version 2 backup with [Removed] expense is migrated');
  assert(!JSON.parse(localStorage.getItem('expenseApp_categories_v1')).includes('[Removed]'), 'Legacy migration keeps [Removed] out of active categories');
  assert(Store.getExpenses()[0].category === '[Removed]', 'Legacy orphan expense is preserved');
  const exported = JSON.parse(Store.exportBackup());
  assert(exported.version === 3 && exported.removedCategoryPolicy === 'virtual-orphan-v1', 'New backups use v3 with explicit virtual-orphan policy');
  assert(exported.removedExpenseIds.includes('legacy-1'), 'v3 export records the IDs of existing virtual orphan expenses');
  assert(!exported.categories.includes('[Removed]'), 'New v3 category list excludes [Removed]');
  const roundTrip = createEnvironment();
  roundTrip.Store.init();
  assert(roundTrip.Store.importBackup(JSON.stringify(exported)).ok, 'A v3 backup from this app can be restored');
  assert(roundTrip.Store.getExpenses()[0].category === '[Removed]', 'v3 restore preserves an existing virtual orphan');

  const forgedV3 = { ...exported, removedCategoryPolicy: undefined };
  assert(!roundTrip.Store.importBackup(JSON.stringify(forgedV3)).ok, 'v3 backup cannot introduce [Removed] expenses without the explicit orphan marker');
  const forgedNewOrphan = {
    ...exported,
    expenses: exported.expenses.concat({ id: 'new-orphan-id', date: Store.todayISO(), amount: 1, category: '[Removed]' })
  };
  assert(!roundTrip.Store.importBackup(JSON.stringify(forgedNewOrphan)).ok, 'v3 backup cannot add an unlisted new [Removed] expense even when the policy marker exists');
  const mismatched = { app: 'expense-tracker-pwa', version: 3, categories: ['Food'], expenses: [{ id: 'x', date: Store.todayISO(), amount: 10, category: 'Unknown' }] };
  assert(!Store.importBackup(JSON.stringify(mismatched)).ok, 'v3 import rejects expenses whose category is missing from the category list');
  const invalidPrecision = { app: 'expense-tracker-pwa', version: 3, categories: ['Food'], expenses: [{ id: 'x2', date: Store.todayISO(), amount: 10.001, category: 'Food' }] };
  assert(!Store.importBackup(JSON.stringify(invalidPrecision)).ok, 'v3 backup import rejects amounts with more than two decimal places');
}

// Restore is atomic across categories, expenses, merchants and accent color.
{
  const { Store, localStorage } = createEnvironment();
  Store.init();
  Store.addCategory('Original Category');
  Store.addExpense({ date: Store.todayISO(), amount: 12.34, category: 'Original Category', merchant: 'Original Shop' });
  Store.setAccentColor('#123456');
  const baseline = localStorage._dump();
  const restore = {
    app: 'expense-tracker-pwa', version: 3, removedCategoryPolicy: 'virtual-orphan-v1',
    categories: ['Replacement'], merchants: ['Replacement Shop'],
    expenses: [{ id: 'replacement-1', date: Store.todayISO(), amount: 99.99, category: 'Replacement', merchant: 'Replacement Shop' }],
    accentColor: '#ABCDEF'
  };
  localStorage._fail('setItem', 'expenseApp_categories_v1', 'QuotaExceededError');
  assert(!Store.importBackup(JSON.stringify(restore)).ok, 'Restore reports a category write failure');
  assertEqual(localStorage._dump(), baseline, 'Category write failure leaves all original keys unchanged');

  localStorage._fail('setItem', 'expenseApp_expenses_v1', 'QuotaExceededError');
  assert(!Store.importBackup(JSON.stringify(restore)).ok, 'Restore reports an expense write failure');
  assertEqual(localStorage._dump(), baseline, 'Expense write failure rolls the category update back');

  localStorage._fail('setItem', 'expenseApp_merchants_v1', 'QuotaExceededError');
  const failedAtMerchant = Store.importBackup(JSON.stringify(restore));
  assert(!failedAtMerchant.ok && failedAtMerchant.code === 'STORAGE_QUOTA', 'Restore reports a merchant write failure');
  assertEqual(localStorage._dump(), baseline, 'Failed restore rolls all previously written keys back');

  localStorage._fail('setItem', 'expenseApp_accentColor_v1', 'QuotaExceededError');
  const failedAtColor = Store.importBackup(JSON.stringify(restore));
  assert(!failedAtColor.ok, 'Restore reports an accent-color write failure');
  assertEqual(localStorage._dump(), baseline, 'Accent-color failure rolls categories, expenses and merchants back too');

  assert(Store.importBackup(JSON.stringify(restore)).ok, 'Restore succeeds when all storage writes succeed');
  assert(Store.getAccentColor() === '#ABCDEF', 'Successful restore includes accent color');
  assert(Store.getExpenses()[0].amount === 99.99, 'Successful restore replaces the expense dataset');
}

// A failed rollback preserves its snapshot and offers an explicit restore path.
{
  const { Store, localStorage } = createEnvironment();
  Store.init();
  Store.addCategory('Before Failed Rollback');
  Store.addExpense({ date: Store.todayISO(), amount: 8.5, category: 'Before Failed Rollback' });
  const baseline = localStorage._dump();
  const restore = {
    app: 'expense-tracker-pwa', version: 3, removedCategoryPolicy: 'virtual-orphan-v1',
    categories: ['Replacement'], merchants: ['Replacement Shop'],
    expenses: [{ id: 'rollback-fail-id', date: Store.todayISO(), amount: 99, category: 'Replacement' }],
    accentColor: '#ABCDEF'
  };
  localStorage._fail('setItem', 'expenseApp_merchants_v1', 'QuotaExceededError', { once: false });
  const result = Store.importBackup(JSON.stringify(restore));
  assert(!result.ok && result.code === 'ROLLBACK_FAILED', 'A rollback write failure is surfaced distinctly');
  assert(Store.getRecoveryState().originalRawValues.expenseApp_categories_v1 === baseline.expenseApp_categories_v1, 'Recovery state retains the original raw snapshot');
  assert(!Store.resetRecoveryData().ok, 'Default reset is blocked after a failed transaction rollback');
  const recoveryExport = JSON.parse(Store.exportRecoveryData().content);
  assert(recoveryExport.originalRawValues.expenseApp_expenses_v1 === baseline.expenseApp_expenses_v1, 'Recovery export includes the original raw snapshot');
  localStorage._clearFailures();
  assert(Store.restoreRecoverySnapshot().ok, 'Original storage snapshot can be restored explicitly');
  assertEqual(localStorage._dump(), baseline, 'Restoring the snapshot returns every key to its original value');
}

// Invalid persisted data is preserved and puts the app into an explicit recovery state.
{
  const categories = JSON.stringify(['Preserved Category']);
  const { Store, localStorage } = createEnvironment({
    expenseApp_categories_v1: categories,
    expenseApp_expenses_v1: '{}'
  });
  const init = Store.init();
  assert(!init.ok && init.code === 'INVALID_STORED_DATA', 'Wrong-shaped persisted JSON blocks normal initialization');
  assert(Store.getRecoveryState() !== null, 'Invalid storage exposes a recovery state');
  const raw = Store.exportRecoveryData();
  assert(raw.ok && JSON.parse(raw.content).rawValues.expenseApp_expenses_v1 === '{}', 'Raw invalid storage can be exported without modification');
  const reset = Store.resetRecoveryData();
  assert(reset.ok, 'Explicit recovery reset initializes the invalid key');
  assertEqual(JSON.parse(localStorage.getItem('expenseApp_categories_v1')), ['Preserved Category'], 'Recovery reset preserves valid stored categories');
  assertEqual(JSON.parse(localStorage.getItem('expenseApp_expenses_v1')), [], 'Recovery reset replaces only the invalid expense key with an empty list');
}

// Recovery reset also rolls back partially written defaults on a storage failure.
{
  const { Store, localStorage } = createEnvironment({
    expenseApp_categories_v1: 'not-json',
    expenseApp_expenses_v1: '{}'
  });
  Store.init();
  const baseline = localStorage._dump();
  localStorage._fail('setItem', 'expenseApp_expenses_v1', 'QuotaExceededError');
  const failedReset = Store.resetRecoveryData();
  assert(!failedReset.ok && failedReset.code === 'STORAGE_QUOTA', 'Recovery reset reports a storage write failure');
  assertEqual(localStorage._dump(), baseline, 'Failed recovery reset preserves all original raw values');
  assert(Store.resetRecoveryData().ok, 'Recovery reset can be retried after storage recovers');
}

// Storage access exceptions are classified rather than thrown through app startup.
{
  const { Store, localStorage } = createEnvironment();
  localStorage._fail('getItem', 'expenseApp_categories_v1', 'SecurityError');
  const init = Store.init();
  assert(!init.ok && init.code === 'STORAGE_ACCESS', 'Blocked localStorage access returns a controlled error');
  assert(Store.getRecoveryState() !== null, 'Storage access failure exposes recovery state');
  const raw = Store.exportRecoveryData();
  assert(raw.ok, 'Raw values can be exported once storage access is available again');
}

// CSV formula mitigation, quoting and UTF-8 BOM.
{
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const storedExpense = { id: 'csv-test', date, amount: 50, category: 'Other📦', merchant: ' =SUM(A1:A10)', note: '\t+cmd|calc!A0' };
  const { Store } = createEnvironment({ expenseApp_expenses_v1: JSON.stringify([storedExpense]) });
  Store.init();
  const csv = Store.expensesToCSV(Store.getExpenses());
  assert(csv.charCodeAt(0) === 0xFEFF, 'CSV export includes a UTF-8 BOM');
  assert(csv.includes("' =SUM(A1:A10)"), 'CSV export escapes formulas after leading spaces');
  assert(csv.includes("'\t+cmd|calc!A0"), 'CSV export escapes formulas after leading control characters');
  assert(Store.csvEscapeForTests === undefined, 'CSV internals are not exposed as public API');
  const summary = Store.summarizeByCategoryAndMerchant(Store.getExpenses());
  assert(Store.summaryToCSV(summary).includes('Total (THB)'), 'Summary CSV contains its documented header');
}

// Known-key storage events refresh other tabs even before that key was read into cache.
{
  const { Store, window } = createEnvironment();
  let refreshes = 0;
  window.onStoreUpdated = () => { refreshes++; };
  window._trigger('storage', { key: 'expenseApp_showMerchants_v1' });
  assert(refreshes === 1, 'Known-key storage event triggers refresh even when its cache entry is absent');
  window._trigger('storage', { key: 'unrelated_app_key' });
  assert(refreshes === 1, 'Unrelated storage keys do not trigger refresh');
  window._trigger('storage', { key: null });
  assert(refreshes === 2, 'Storage clear event triggers refresh');
}

// Preference writes return results so the UI can keep state consistent.
{
  const { Store, localStorage } = createEnvironment();
  Store.init();
  assert(Store.setShowMerchants(false).ok && Store.getShowMerchants() === false, 'Show-merchant preference persists and returns a result');
  localStorage._fail('setItem', 'expenseApp_showMerchants_v1', 'QuotaExceededError');
  const failed = Store.setShowMerchants(true);
  assert(!failed.ok && failed.code === 'STORAGE_QUOTA', 'Preference write failure is returned to the caller');
  assert(Store.getShowMerchants() === false, 'Failed preference write does not alter the in-memory preference');
}

// Search, update, delete and range accessors.
{
  const { Store } = createEnvironment();
  Store.init();
  const today = Store.todayISO();
  const month = Store.currentMonthISO();
  const first = Store.addExpense({ date: today, amount: '12.50', category: 'Food & Drink🍔', merchant: 'Shopee', note: 'Lunch' });
  const second = Store.addExpense({ date: today, amount: '20.00', category: 'Food & Drink🍔', merchant: '', note: 'Snack' });
  assert(first.ok && second.ok, 'Search fixtures are created');

  assertEqual(Store.searchExpenses(month, month, 'shopee').map(e => e.id), [first.record.id], 'searchExpenses matches merchant case-insensitively');
  assert(Store.searchExpenses(month, month, 'FOOD').length === 2, 'searchExpenses matches category text');
  assertEqual(Store.searchExpenses(month, month, '12.5').map(e => e.id), [first.record.id], 'searchExpenses matches a raw amount substring');
  assertEqual(Store.searchExpenses(month, month, '20.00').map(e => e.id), [second.record.id], 'searchExpenses matches a fixed-precision amount');
  assertEqual(Store.searchExpenses(month, month, 'zzz'), [], 'searchExpenses returns no matches for unknown text');
  assertEqual(Store.searchExpenses(month, month, ''), [], 'searchExpenses returns nothing for an empty query');

  assert(Store.updateExpense(first.record.id, { date: today, amount: '15.75', category: 'Food & Drink🍔', merchant: 'Shopee', note: 'Updated' }).ok, 'updateExpense saves valid changes');
  assert(Store.getExpenses().find(e => e.id === first.record.id).amount === 15.75, 'updateExpense persists the new amount');
  assert(!Store.updateExpense('missing-id', { date: today, amount: 1, category: 'Food & Drink🍔' }).ok, 'updateExpense reports a missing record');

  assert(Store.getExpensesForDate(today).length === 2, 'getExpensesForDate returns matching records');
  assert(Store.getExpensesForMonth(month).length === 2, 'getExpensesForMonth returns matching records');
  assert(Store.getExpensesInRange(today, today).length === 2, 'getExpensesInRange includes both endpoints');
  assert(Store.getExpensesInRangeFiltered(today, today, 'Food & Drink🍔', 'Shopee').length === 1, 'getExpensesInRangeFiltered filters by merchant');
  assert(Store.getExpensesInRangeFiltered(today, today, 'Food & Drink🍔', Store.NO_MERCHANT_LABEL).length === 1, 'getExpensesInRangeFiltered filters the no-merchant label');

  assert(Store.deleteExpense(first.record.id).ok && Store.getExpenses().length === 1, 'deleteExpense removes a record');
  const beforeMissingDelete = Store.getExpenses().length;
  assert(Store.deleteExpense('missing-id').ok && Store.getExpenses().length === beforeMissingDelete, 'deleteExpense is a safe no-op for a missing record');
}

// Merchant lifecycle, length boundary and read-time validation.
{
  const { Store } = createEnvironment();
  Store.init();
  const today = Store.todayISO();
  assert(Store.addMerchant('Zed').ok, 'addMerchant accepts a new merchant');
  assert(!Store.addMerchant('zed').ok, 'addMerchant rejects case-insensitive duplicates');
  assert(!Store.addMerchant('x'.repeat(101)).ok, 'addMerchant rejects names longer than 100 characters');
  assert(Store.addMerchant('y'.repeat(100)).ok, 'addMerchant accepts exactly 100 characters');
  assert(Store.addExpense({ date: today, amount: 5, category: 'Food & Drink🍔', merchant: 'Zed' }).ok, 'Expense with a remembered merchant saves');
  assert(Store.rememberMerchant('ZED').ok, 'rememberMerchant is safe for an existing name');
  assert(Store.getMerchants().filter(m => m.toLowerCase() === 'zed').length === 1, 'rememberMerchant does not duplicate case variants');
  assert(Store.renameMerchant('Zed', 'Zed Two').ok, 'renameMerchant updates the merchant list');
  assert(Store.getExpenses()[0].merchant === 'Zed Two', 'renameMerchant updates past expenses');
  assert(!Store.renameMerchant('Missing', 'Other').ok, 'renameMerchant reports a missing merchant');
  assert(Store.deleteMerchant('Zed Two').ok, 'deleteMerchant removes the merchant');
  assert(Store.getExpenses()[0].merchant === '', 'deleteMerchant clears the merchant from past expenses');
  assert(!Store.deleteMerchant('Zed Two').ok, 'deleteMerchant reports a missing merchant');
}

// Date ceilings: add is today-only, update and legacy import tolerate tomorrow.
{
  const { Store } = createEnvironment();
  Store.init();
  const today = Store.todayISO();
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const dayAfterTomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const added = Store.addExpense({ date: today, amount: 10, category: 'Food & Drink🍔' });
  assert(!Store.addExpense({ date: tomorrow, amount: 10, category: 'Food & Drink🍔' }).ok, 'addExpense rejects a tomorrow date');
  assert(Store.updateExpense(added.record.id, { date: tomorrow, amount: 10, category: 'Food & Drink🍔' }).ok, 'updateExpense accepts an imported tomorrow record');

  const v3Future = { app: 'expense-tracker-pwa', version: 3, categories: ['Food & Drink🍔'], expenses: [{ id: 'future-v3', date: tomorrow, amount: 1, category: 'Food & Drink🍔' }] };
  assert(Store.importBackup(JSON.stringify(v3Future)).ok, 'v3 import accepts tomorrow so its own exports remain restorable');
  const v3FarFuture = { ...v3Future, expenses: [{ ...v3Future.expenses[0], id: 'far-future-v3', date: dayAfterTomorrow }] };
  assert(!Store.importBackup(JSON.stringify(v3FarFuture)).ok, 'v3 import rejects dates beyond tomorrow');
  const v1Future = { ...v3Future, version: 1 };
  assert(Store.importBackup(JSON.stringify(v1Future)).ok, 'legacy v1 import still tolerates a tomorrow date');
  const v2Future = { ...v3Future, version: 2 };
  assert(Store.importBackup(JSON.stringify(v2Future)).ok, 'legacy v2 import still tolerates a tomorrow date');

  const leapDay = { app: 'expense-tracker-pwa', version: 3, categories: ['Food & Drink🍔'], expenses: [{ id: 'leap-day', date: '2024-02-29', amount: 1, category: 'Food & Drink🍔' }] };
  assert(Store.importBackup(JSON.stringify(leapDay)).ok, 'A valid leap day imports');
  const invalidLeapDay = { ...leapDay, expenses: [{ ...leapDay.expenses[0], id: 'bad-leap', date: '2023-02-29' }] };
  assert(!Store.importBackup(JSON.stringify(invalidLeapDay)).ok, 'An invalid leap day is rejected');

  const december = createEnvironment({
    expenseApp_expenses_v1: JSON.stringify([{ id: 'dec-31', date: '2026-12-31', amount: 1, category: 'Food & Drink🍔', merchant: '', note: '' }])
  });
  december.Store.init();
  assert(december.Store.getExpensesForMonth('2026-12').length === 1 && december.Store.getExpensesForMonth('2027-01').length === 0, 'Month filtering handles a December to January boundary');
}

// Expense IDs are charset-restricted on import but existing stored IDs stay readable.
{
  const { Store } = createEnvironment();
  Store.init();
  const today = Store.todayISO();
  const unsafe = { app: 'expense-tracker-pwa', version: 3, categories: ['Food & Drink🍔'], expenses: [{ id: 'bad"id', date: today, amount: 1, category: 'Food & Drink🍔' }] };
  const unsafeResult = Store.importBackup(JSON.stringify(unsafe));
  assert(!unsafeResult.ok && unsafeResult.code === 'INVALID_EXPENSE', 'Import rejects an expense ID with unsafe characters');
  const safe = { app: 'expense-tracker-pwa', version: 3, categories: ['Food & Drink🍔'], expenses: [{ id: 'abc_DEF-123:x.y', date: today, amount: 1, category: 'Food & Drink🍔' }] };
  assert(Store.importBackup(JSON.stringify(safe)).ok, 'Import accepts the documented safe ID charset');
  const omitted = { app: 'expense-tracker-pwa', version: 3, categories: ['Food & Drink🍔'], expenses: [{ date: today, amount: 1, category: 'Food & Drink🍔' }] };
  assert(Store.importBackup(JSON.stringify(omitted)).ok && Store.getExpenses()[0].id.length > 0, 'Import generates an ID when one is omitted');
  const duplicate = { app: 'expense-tracker-pwa', version: 3, categories: ['Food & Drink🍔'], expenses: [{ id: 'same', date: today, amount: 1, category: 'Food & Drink🍔' }, { id: 'same', date: today, amount: 2, category: 'Food & Drink🍔' }] };
  assert(Store.importBackup(JSON.stringify(duplicate)).ok && new Set(Store.getExpenses().map(e => e.id)).size === 2, 'Import regenerates duplicate IDs');

  const storedUnsafe = createEnvironment({
    expenseApp_expenses_v1: JSON.stringify([{ id: 'bad"id', date: today, amount: 1, category: 'Food & Drink🍔', merchant: '', note: '' }])
  });
  assert(storedUnsafe.Store.init().ok && storedUnsafe.Store.getExpenses().length === 1, 'Existing stored IDs are not retroactively invalidated');
}

// Accent default and validation.
{
  const { Store } = createEnvironment();
  Store.init();
  assert(Store.getAccentColor() === '#0866CB', 'Default accent uses the accessible contrast-safe color');
  ['', 'red', '#12345', '#GGGGGG', '#1234567'].forEach(value => {
    assert(!Store.setAccentColor(value).ok, `setAccentColor rejects ${JSON.stringify(value)}`);
  });
  assert(Store.setAccentColor('#123456').ok && Store.getAccentColor() === '#123456', 'setAccentColor saves a valid color');
}

// Backup size guard and tolerant orphan metadata handling.
{
  const { Store } = createEnvironment();
  Store.init();
  const today = Store.todayISO();
  const oversized = 'x'.repeat(6 * 1024 * 1024 + 1);
  const sizeResult = Store.importBackup(oversized);
  assert(!sizeResult.ok && sizeResult.code === 'BACKUP_TOO_LARGE', 'importBackup rejects an oversized payload before parsing');
  const weirdMetadata = {
    app: 'expense-tracker-pwa', version: 3, removedCategoryPolicy: 'virtual-orphan-v1', removedExpenseIds: [1, 2],
    categories: ['Food & Drink🍔'], expenses: [{ id: 'normal-row', date: today, amount: 1, category: 'Food & Drink🍔' }]
  };
  assert(Store.importBackup(JSON.stringify(weirdMetadata)).ok, 'Non-string orphan metadata does not block a normal restore');
}

// Read batches share one snapshot and never write through to the cache.
{
  const { Store } = createEnvironment();
  Store.init();
  Store.addExpense({ date: Store.todayISO(), amount: 10, category: 'Food & Drink🍔' });
  const originalCount = Store.getExpenses().length;
  Store.beginReadBatch();
  const snapshotA = Store.getExpenses();
  const snapshotB = Store.getExpenses();
  assert(snapshotA === snapshotB, 'A read batch returns one shared snapshot');
  snapshotA.push({ id: 'mutated-in-batch', date: Store.todayISO(), amount: 1, category: 'Food & Drink🍔' });
  assert(Store.getExpenses().length === originalCount + 1, 'The active batch reflects its own in-memory snapshot');
  Store.endReadBatch();
  assert(Store.getExpenses().length === originalCount, 'Mutating a batched snapshot never changes the stored cache');

  Store.beginReadBatch();
  Store.beginReadBatch();
  Store.getExpenses().push({ id: 'nested-mutation', date: Store.todayISO(), amount: 1, category: 'Food & Drink🍔' });
  Store.endReadBatch();
  assert(Store.getExpenses().length === originalCount + 1, 'Nested batches remain active until the outermost end');
  Store.endReadBatch();
  assert(Store.getExpenses().length === originalCount, 'Ending the outer batch releases the shared snapshot');
  Store.endReadBatch();
  assert(true, 'endReadBatch is safe without an active batch');
}

console.log('\n-----------------------------------');
console.log(`Test Results: ${passedTests}/${totalTests} passed, ${failedTests} failed.`);
if (failedTests > 0) process.exit(1);
console.log('All assertions PASSED successfully.');
