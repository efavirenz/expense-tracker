// test/test-store.js — Zero-dependency unit tests for Store module
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock localStorage and browser environment
const localStorageMock = (function() {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    _dump: () => ({ ...store })
  };
})();

const windowListeners = {};
const windowMock = {
  addEventListener: (event, handler) => {
    if (!windowListeners[event]) windowListeners[event] = [];
    windowListeners[event].push(handler);
  },
  _triggerStorage: (e) => {
    (windowListeners['storage'] || []).forEach(fn => fn(e));
  },
  onStoreUpdated: null
};

const context = {
  console,
  localStorage: localStorageMock,
  window: windowMock,
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
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 9),
    getRandomValues: (buf) => buf.fill(1)
  }
};
vm.createContext(context);

// Load store.js into context
const storeCode = fs.readFileSync(path.join(__dirname, '../js/store.js'), 'utf8');
const Store = vm.runInContext(storeCode + '; Store;', context);

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName}`);
  }
}

function assertEqual(actual, expected, testName) {
  const match = JSON.stringify(actual) === JSON.stringify(expected);
  assert(match, `${testName} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

console.log('--- Running Store Tests ---');

// Test 1: Initialization
localStorageMock.clear();
Store.init();
assert(Store.getCategories().length > 0, 'Store.init initializes default categories');
assert(Store.getMerchants().length > 0, 'Store.init initializes default merchants');
assertEqual(Store.getExpenses(), [], 'Store.init initializes empty expenses array');

// Test 2: Category CRUD & [Removed] purity (F-002)
const addCatRes = Store.addCategory('Groceries Test');
assert(addCatRes.ok, 'addCategory succeeds for new category');
assert(!Store.addCategory('Groceries Test').ok, 'addCategory rejects duplicate category');

// Add expense in 'Groceries Test'
const exp1 = Store.addExpense({
  date: Store.todayISO(),
  amount: '150.00',
  category: 'Groceries Test',
  merchant: 'BigC',
  note: 'Weekly shopping'
});
assert(exp1.ok, 'addExpense succeeds');

// Delete category -> expense should move to [Removed]
const delCatRes = Store.deleteCategory('Groceries Test');
assert(delCatRes.ok, 'deleteCategory succeeds');
const updatedExpenses = Store.getExpenses();
assert(updatedExpenses.some(e => e.category === Store.RESERVED_CATEGORY), 'Expense category updated to [Removed]');

// Check that localStorage categories key does NOT contain [Removed]
const rawSavedCategories = JSON.parse(localStorageMock.getItem('expenseApp_categories_v1'));
assert(!rawSavedCategories.includes(Store.RESERVED_CATEGORY), 'localStorage categories key does NOT contain [Removed] (F-002)');
assert(Store.getCategories().includes(Store.RESERVED_CATEGORY), 'getCategories() dynamically provides [Removed]');
assert(!Store.getSelectableCategories().includes(Store.RESERVED_CATEGORY), 'getSelectableCategories() excludes [Removed]');

// Test 3: updateExpense prevents [Removed] category (F-007)
const expId = updatedExpenses[0].id;
const updateBlockedRes = Store.updateExpense(expId, {
  date: Store.todayISO(),
  amount: 150,
  category: Store.RESERVED_CATEGORY,
  merchant: 'BigC',
  note: 'Attempting invalid category'
});
assert(!updateBlockedRes.ok, 'updateExpense blocks setting category to [Removed] (F-007)');

// Valid update
const updateValidRes = Store.updateExpense(expId, {
  date: Store.todayISO(),
  amount: 200,
  category: 'Shopping🛍️',
  merchant: 'BigC',
  note: 'Valid category reassignment'
});
assert(updateValidRes.ok, 'updateExpense succeeds with valid active category');

// Test 4: Search with formatted decimal string (F-006)
const searchInt = Store.searchExpenses(null, null, '200');
const searchDec = Store.searchExpenses(null, null, '200.00');
assert(searchInt.length > 0, 'searchExpenses matches integer query "200"');
assert(searchDec.length > 0, 'searchExpenses matches formatted decimal query "200.00" (F-006)');

// Test 5: CSV Formula Injection Protection (F-003)
Store.addExpense({
  date: Store.todayISO(),
  amount: 50,
  category: 'Other📦',
  merchant: '=SUM(A1:A10)',
  note: '+cmd|calc!A0'
});
const csvOutput = Store.expensesToCSV(Store.getExpenses());
assert(csvOutput.includes("'=SUM(A1:A10)"), 'CSV export escapes leading = with single quote (F-003)');
assert(csvOutput.includes("'+cmd|calc!A0"), 'CSV export escapes leading + with single quote (F-003)');

// Test 6: Backup restore deduplication and sanitization (F-005)
const mockBackup = {
  app: 'expense-tracker-pwa',
  version: 2,
  exportedAt: new Date().toISOString(),
  categories: ['Food', 'food', 'Food', Store.RESERVED_CATEGORY, 'Transport'],
  merchants: ['ShopA', 'shopa'],
  expenses: [
    { date: Store.todayISO(), amount: 100, category: 'Food' }
  ]
};
const importRes = Store.importBackup(JSON.stringify(mockBackup));
assert(importRes.ok, 'importBackup succeeds');
const importedCats = JSON.parse(localStorageMock.getItem('expenseApp_categories_v1'));
assert(!importedCats.includes(Store.RESERVED_CATEGORY), 'importBackup filters [Removed] from saved categories (F-005)');
assertEqual(importedCats.filter(c => c.toLowerCase() === 'food').length, 1, 'importBackup deduplicates categories case-insensitively (F-005)');

// Test 7: Multi-tab storage clear event handler (F-004)
let updateCalled = false;
windowMock.onStoreUpdated = () => { updateCalled = true; };
windowMock._triggerStorage({ key: null });
assert(updateCalled, 'storage event with null key triggers onStoreUpdated (F-004)');

console.log('\n-----------------------------------');
console.log(`Test Results: ${passedTests}/${totalTests} passed, ${failedTests} failed.`);
if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('All assertions PASSED successfully.');
}
