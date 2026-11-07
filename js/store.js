/* ============================================================
   store.js — data layer (localStorage). No UI code lives here.
   ============================================================ */

const Store = (function () {
  const STORAGE_KEYS = {
    categories:    'expenseApp_categories_v1',
    expenses:      'expenseApp_expenses_v1',
    merchants:     'expenseApp_merchants_v1',
    showMerchants: 'expenseApp_showMerchants_v1',
    accentColor:   'expenseApp_accentColor_v1'
  };

  const RESERVED_CATEGORY = '[Removed]';
  const LEGACY_RESERVED_CATEGORY = 'Removed';
  const NO_MERCHANT_LABEL = '(No merchant)';

  const DEFAULT_CATEGORIES = [
    '7-11🏪', 'Clothing🧥', 'Dining out🍽️', 'Education📚', 'Entertainment🎬',
    'Food & Drink🍔', 'Gifts & Donations🎁', 'Groceries🛒', 'Healthcare🩺',
    'Household🏠', 'Investment💰', 'Other📦', 'Personal care🧴', 'Shopping🛍️',
    'Skincare🌟', 'Supplements💊', 'Transportation🚗', 'Travel✈️', 'Utilities💡'
  ];

  const DEFAULT_MERCHANTS = ['Lazada', 'Shopee'];

  const cache = {};
  const KNOWN_KEYS = Object.values(STORAGE_KEYS);
  const DEFAULT_VALUES = {
    [STORAGE_KEYS.categories]: DEFAULT_CATEGORIES.slice(),
    [STORAGE_KEYS.expenses]: [],
    [STORAGE_KEYS.merchants]: DEFAULT_MERCHANTS.slice(),
    [STORAGE_KEYS.showMerchants]: true,
    [STORAGE_KEYS.accentColor]: '#0B81FE'
  };
  const MAX_EXPENSES = 50000;
  const MAX_LABELS = 500;
  const MAX_TEXT_LENGTH = 500;
  const MAX_AMOUNT = Number.MAX_SAFE_INTEGER / 100;
  let recoveryState = null;

  function deepClone(val) {
    if (val === undefined || val === null) return val;
    return JSON.parse(JSON.stringify(val));
  }

  function storageError(error, operation) {
    const name = error && error.name ? error.name : 'Error';
    const quota = name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || (error && error.code === 22);
    return {
      ok: false,
      code: quota ? 'STORAGE_QUOTA' : 'STORAGE_ACCESS',
      error: quota ? 'Storage is full. Free up device storage and try again.' : `Unable to ${operation} browser storage. Check browser privacy settings and try again.`
    };
  }

  function safeGetItem(key) {
    try { return { ok: true, value: localStorage.getItem(key) }; }
    catch (error) { return storageError(error, 'read'); }
  }

  function safeSetItem(key, value) {
    try { localStorage.setItem(key, value); return { ok: true }; }
    catch (error) { return storageError(error, 'write'); }
  }

  function safeRemoveItem(key) {
    try { localStorage.removeItem(key); return { ok: true }; }
    catch (error) { return storageError(error, 'update'); }
  }

  function isValidExpenseRecord(expense) {
    if (!expense || typeof expense !== 'object' || Array.isArray(expense)) return false;
    if (typeof expense.id !== 'string' || !expense.id.trim() || expense.id.length > 128) return false;
    if (!isValidCalendarDate(expense.date)) return false;
    if (typeof expense.amount !== 'number' || !Number.isFinite(expense.amount) || expense.amount <= 0 || expense.amount > MAX_AMOUNT) return false;
    if (!Number.isSafeInteger(Math.round(expense.amount * 100)) || Math.round(expense.amount * 100) < 1) return false;
    if (Math.abs(expense.amount * 100 - Math.round(expense.amount * 100)) > 1e-7) return false;
    if (typeof expense.category !== 'string' || !expense.category.trim() || expense.category.length > 100) return false;
    if (expense.merchant !== undefined && expense.merchant !== null && (typeof expense.merchant !== 'string' || expense.merchant.length > 100)) return false;
    if (expense.note !== undefined && expense.note !== null && (typeof expense.note !== 'string' || expense.note.length > MAX_TEXT_LENGTH)) return false;
    if (expense.createdAt !== undefined && (typeof expense.createdAt !== 'string' || !Number.isFinite(Date.parse(expense.createdAt)))) return false;
    if (expense.updatedAt !== undefined && (typeof expense.updatedAt !== 'string' || !Number.isFinite(Date.parse(expense.updatedAt)))) return false;
    return true;
  }

  function validateStoredValue(key, value, allowLegacyCategories = false) {
    if (key === STORAGE_KEYS.categories) {
      return Array.isArray(value) && value.length <= MAX_LABELS && value.every(v => typeof v === 'string' && v.trim() && v.length <= 100 && (allowLegacyCategories || (v !== RESERVED_CATEGORY && v !== LEGACY_RESERVED_CATEGORY)));
    }
    if (key === STORAGE_KEYS.merchants) {
      return Array.isArray(value) && value.length <= MAX_LABELS && value.every(v => typeof v === 'string' && v.trim() && v.length <= 100);
    }
    if (key === STORAGE_KEYS.expenses) {
      if (!Array.isArray(value) || value.length > MAX_EXPENSES || !value.every(isValidExpenseRecord)) return false;
      const ids = value.map(e => e.id);
      return new Set(ids).size === ids.length;
    }
    if (key === STORAGE_KEYS.showMerchants) return typeof value === 'boolean';
    if (key === STORAGE_KEYS.accentColor) return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
    return false;
  }

  function setRecovery(code, message, keys, originalRawValues) {
    recoveryState = {
      code,
      message,
      keys: Array.from(new Set(keys || [])),
      ...(originalRawValues ? { originalRawValues: deepClone(originalRawValues) } : {})
    };
  }

  function readJSON(key, fallback) {
    if (recoveryState) return deepClone(fallback);
    if (Object.prototype.hasOwnProperty.call(cache, key)) return deepClone(cache[key]);
    const read = safeGetItem(key);
    if (!read.ok) {
      setRecovery(read.code, read.error, [key]);
      return deepClone(fallback);
    }
    if (read.value === null) {
      cache[key] = deepClone(fallback);
      return deepClone(fallback);
    }
    let parsed;
    try { parsed = JSON.parse(read.value); }
    catch (error) {
      setRecovery('INVALID_JSON', `Stored data for ${key} is not valid JSON. Export the raw data before resetting it.`, [key]);
      return deepClone(fallback);
    }
    if (!validateStoredValue(key, parsed)) {
      setRecovery('INVALID_DATA_SHAPE', `Stored data for ${key} has an unsupported or invalid structure. Export the raw data before resetting it.`, [key]);
      return deepClone(fallback);
    }
    cache[key] = parsed;
    return deepClone(parsed);
  }

  function writeJSON(key, value) {
    if (recoveryState) return { ok: false, code: 'RECOVERY_REQUIRED', error: 'Resolve the storage recovery state before saving data.' };
    let clonedValue;
    let serialized;
    try {
      clonedValue = deepClone(value);
      if (!validateStoredValue(key, clonedValue)) {
        return { ok: false, code: 'INVALID_DATA', error: `Invalid data structure for ${key}.` };
      }
      serialized = JSON.stringify(clonedValue);
      if (typeof serialized !== 'string') throw new TypeError('Value could not be serialized.');
    } catch (error) {
      return { ok: false, code: 'SERIALIZATION_ERROR', error: 'Unable to serialize data for saving.' };
    }
    const result = safeSetItem(key, serialized);
    if (!result.ok) return result;
    cache[key] = clonedValue;
    return { ok: true };
  }

  function commitTransaction(updates) {
    if (recoveryState) return { ok: false, code: 'RECOVERY_REQUIRED', error: 'Resolve the storage recovery state before changing stored data.' };
    const snapshots = {};
    for (const update of updates) {
      const current = safeGetItem(update.key);
      if (!current.ok) return current;
      snapshots[update.key] = current.value;
    }
    const written = [];
    for (const update of updates) {
      let serialized;
      try {
        if (!validateStoredValue(update.key, update.value)) throw new TypeError('Invalid data');
        serialized = JSON.stringify(deepClone(update.value));
        if (typeof serialized !== 'string') throw new TypeError('Serialization failed');
      } catch (error) {
        return { ok: false, code: 'SERIALIZATION_ERROR', error: `Unable to prepare ${update.key} for restore.` };
      }
      const result = safeSetItem(update.key, serialized);
      if (!result.ok) {
        let rollbackFailed = false;
        const rollbackErrors = [];
        for (const key of written.concat(update.key).reverse()) {
          const original = snapshots[key];
          const rollback = original === null ? safeRemoveItem(key) : safeSetItem(key, original);
          if (!rollback.ok) { rollbackFailed = true; rollbackErrors.push({ key, error: rollback.error }); }
        }
        Object.keys(snapshots).forEach(key => delete cache[key]);
        if (rollbackFailed) {
          setRecovery('ROLLBACK_FAILED', 'Restore failed and one or more original storage values could not be restored. Do not continue using the app until the data has been recovered.', Object.keys(snapshots), snapshots);
          return { ok: false, code: 'ROLLBACK_FAILED', error: 'Restore failed, and rollback was incomplete. Stop using the app and preserve the exported backup and recovery data.', rollbackErrors };
        }
        return result;
      }
      written.push(update.key);
    }
    updates.forEach(update => { cache[update.key] = deepClone(update.value); });
    return { ok: true };
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === null) {
        Object.keys(cache).forEach(key => delete cache[key]);
        if (typeof window.onStoreUpdated === 'function') window.onStoreUpdated();
        return;
      }
      if (KNOWN_KEYS.includes(event.key)) {
        delete cache[event.key];
        if (typeof window.onStoreUpdated === 'function') window.onStoreUpdated();
      }
    });
  }

  function init() {
    const pendingDefaults = [];
    const invalidKeys = [];
    for (const key of KNOWN_KEYS) {
      const read = safeGetItem(key);
      if (!read.ok) {
        setRecovery(read.code, read.error, [key]);
        return read;
      }
      if (read.value === null) {
        pendingDefaults.push({ key, value: DEFAULT_VALUES[key] });
        continue;
      }
      let parsed;
      try { parsed = JSON.parse(read.value); }
      catch (error) { invalidKeys.push(key); continue; }
      if (!validateStoredValue(key, parsed, key === STORAGE_KEYS.categories)) invalidKeys.push(key);
      else cache[key] = parsed;
    }
    if (invalidKeys.length) {
      setRecovery('INVALID_STORED_DATA', `Stored data needs recovery for: ${invalidKeys.join(', ')}. Export the raw data before resetting invalid entries.`, invalidKeys);
      return { ok: false, code: recoveryState.code, error: recoveryState.message };
    }
    for (const item of pendingDefaults) {
      const result = writeJSON(item.key, item.value);
      if (!result.ok) {
        setRecovery(result.code, result.error, [item.key]);
        return result;
      }
    }
    migrateLegacyRemovedCategory();
    if (recoveryState) return { ok: false, code: recoveryState.code, error: recoveryState.message };
    return { ok: true };
  }

  function migrateLegacyRemovedCategory() {
    const categories = readJSON(STORAGE_KEYS.categories, DEFAULT_CATEGORIES.slice());
    const cleanCategories = categories.filter(category => category !== LEGACY_RESERVED_CATEGORY && category !== RESERVED_CATEGORY);
    const expenses = getExpenses();
    let expensesChanged = false;
    expenses.forEach(expense => {
      if (expense.category === LEGACY_RESERVED_CATEGORY) {
        expense.category = RESERVED_CATEGORY;
        expensesChanged = true;
      }
    });
    const updates = [];
    if (cleanCategories.length !== categories.length) updates.push({ key: STORAGE_KEYS.categories, value: cleanCategories });
    if (expensesChanged) updates.push({ key: STORAGE_KEYS.expenses, value: expenses });
    if (updates.length) {
      const result = commitTransaction(updates);
      if (!result.ok && !recoveryState) {
        setRecovery('MIGRATION_FAILED', 'Legacy category migration could not be saved. Your original stored values remain unchanged. Export a recovery copy, free storage if necessary, then reload to retry migration.', []);
      }
    }
  }

  function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      return Date.now().toString(36) + '-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function isValidCalendarDate(dateStr) {
    if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function tomorrowISO() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function currentMonthISO() {
    return todayISO().slice(0, 7);
  }

  // ---------- Categories ----------

  let cachedSortedCategories = null;
  let cachedRawCategoriesRef = null;
  let cachedExpensesRef = null;

  function getCategories() {
    const cats = readJSON(STORAGE_KEYS.categories, DEFAULT_CATEGORIES.slice());
    if (cachedSortedCategories && 
        cachedRawCategoriesRef === cache[STORAGE_KEYS.categories] &&
        cachedExpensesRef === cache[STORAGE_KEYS.expenses]) {
      return cachedSortedCategories.slice();
    }
    const sorted = cats.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    if (!sorted.includes(RESERVED_CATEGORY)) {
      const expenses = readJSON(STORAGE_KEYS.expenses, []);
      if (expenses.some(e => e.category === RESERVED_CATEGORY)) {
        sorted.push(RESERVED_CATEGORY);
      }
    }
    cachedRawCategoriesRef = cache[STORAGE_KEYS.categories];
    cachedExpensesRef = cache[STORAGE_KEYS.expenses];
    cachedSortedCategories = sorted;
    return sorted.slice();
  }

  function categoryExists(name, categories) {
    if (typeof name !== 'string') return false;
    const list = categories || getCategories();
    const target = name.trim().toLowerCase();
    if (target === RESERVED_CATEGORY.toLowerCase() || target === LEGACY_RESERVED_CATEGORY.toLowerCase()) return true;
    return list.some(c => c.toLowerCase() === target);
  }

  function addCategory(rawName) {
    const name = (typeof rawName === 'string' ? rawName : '').trim();
    if (!name) return { ok: false, error: 'Please enter a category name.' };
    if (name.length > 100) return { ok: false, error: 'Category names must be 100 characters or fewer.' };
    if (categoryExists(name)) return { ok: false, error: `Category "${name}" is reserved or already exists.` };
    const categories = readJSON(STORAGE_KEYS.categories, DEFAULT_CATEGORIES.slice());
    categories.push(name);
    return writeJSON(STORAGE_KEYS.categories, categories);
  }

  function renameCategory(oldName, rawNewName) {
    const newName = (rawNewName || '').trim();
    if (!newName) return { ok: false, error: 'Please enter a new name.' };
    if (newName === oldName) return { ok: false, error: 'New name must be different from current name.' };
    const oldCategories = readJSON(STORAGE_KEYS.categories, DEFAULT_CATEGORIES.slice());
    const otherCategories = oldCategories.filter(category => category !== oldName);
    if (categoryExists(newName, otherCategories)) {
      return { ok: false, error: `Category "${newName}" already exists. Please choose a different name.` };
    }
    const expensesBefore = getExpenses();
    if (oldName === RESERVED_CATEGORY) {
      if (!expensesBefore.some(expense => expense.category === RESERVED_CATEGORY)) return { ok: false, error: 'Category not found.' };
      const categories = oldCategories.concat(newName);
      const expenses = expensesBefore.map(expense => expense.category === RESERVED_CATEGORY ? { ...expense, category: newName } : expense);
      return commitTransaction([
        { key: STORAGE_KEYS.categories, value: categories },
        { key: STORAGE_KEYS.expenses, value: expenses }
      ]);
    }
    const idx = oldCategories.findIndex(category => category === oldName);
    if (idx === -1) return { ok: false, error: 'Category not found.' };
    const categories = oldCategories.slice();
    categories[idx] = newName;
    const expenses = expensesBefore.map(expense => expense.category === oldName ? { ...expense, category: newName } : expense);
    return commitTransaction([
      { key: STORAGE_KEYS.categories, value: categories },
      { key: STORAGE_KEYS.expenses, value: expenses }
    ]);
  }

  function deleteCategory(name) {
    if (name === RESERVED_CATEGORY) return { ok: false, error: 'Cannot delete reserved category.' };
    const oldCategories = readJSON(STORAGE_KEYS.categories, DEFAULT_CATEGORIES.slice());
    if (!oldCategories.includes(name)) return { ok: false, error: 'Category not found.' };
    const categories = oldCategories.filter(category => category !== name);
    const expenses = getExpenses().map(expense => expense.category === name ? { ...expense, category: RESERVED_CATEGORY } : expense);
    return commitTransaction([
      { key: STORAGE_KEYS.categories, value: categories },
      { key: STORAGE_KEYS.expenses, value: expenses }
    ]);
  }

  function getSelectableCategories() {
    return getCategories().filter(c => c !== RESERVED_CATEGORY);
  }

  // ---------- Merchants ----------

  function getMerchants() {
    const list = readJSON(STORAGE_KEYS.merchants, DEFAULT_MERCHANTS.slice());
    return list.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  function merchantExists(name, merchants) {
    const list = merchants || getMerchants();
    const target = name.trim().toLowerCase();
    return list.some(m => m.toLowerCase() === target);
  }

  function rememberMerchant(rawName) {
    const name = (rawName || '').trim();
    if (!name) return { ok: true };
    const merchants = readJSON(STORAGE_KEYS.merchants, DEFAULT_MERCHANTS.slice());
    const exists = merchants.some(m => m.toLowerCase() === name.toLowerCase());
    if (!exists) {
      merchants.push(name);
      return writeJSON(STORAGE_KEYS.merchants, merchants);
    }
    return { ok: true };
  }

  function addMerchant(rawName) {
    const name = (rawName || '').trim();
    if (!name) return { ok: false, error: 'Please enter a merchant name.' };
    if (merchantExists(name)) return { ok: false, error: `Merchant "${name}" already exists.` };
    const merchants = getMerchants();
    merchants.push(name);
    return writeJSON(STORAGE_KEYS.merchants, merchants);
  }

  function renameMerchant(oldName, rawNewName) {
    const newName = (rawNewName || '').trim();
    if (!newName) return { ok: false, error: 'Please enter a new name.' };
    if (newName.toLowerCase() === oldName.toLowerCase() && newName === oldName) {
      return { ok: false, error: 'New name must be different from current name.' };
    }
    const oldMerchants = getMerchants();
    const otherMerchants = oldMerchants.filter(merchant => merchant !== oldName);
    if (merchantExists(newName, otherMerchants)) {
      return { ok: false, error: `Merchant "${newName}" already exists. Please choose a different name.` };
    }
    const idx = oldMerchants.findIndex(merchant => merchant === oldName);
    if (idx === -1) return { ok: false, error: 'Merchant not found.' };
    const merchants = oldMerchants.slice();
    merchants[idx] = newName;
    const expenses = getExpenses().map(expense => expense.merchant === oldName ? { ...expense, merchant: newName } : expense);
    return commitTransaction([
      { key: STORAGE_KEYS.merchants, value: merchants },
      { key: STORAGE_KEYS.expenses, value: expenses }
    ]);
  }

  function deleteMerchant(name) {
    const oldMerchants = getMerchants();
    if (!oldMerchants.includes(name)) return { ok: false, error: 'Merchant not found.' };
    const merchants = oldMerchants.filter(merchant => merchant !== name);
    const expenses = getExpenses().map(expense => expense.merchant === name ? { ...expense, merchant: '' } : expense);
    return commitTransaction([
      { key: STORAGE_KEYS.merchants, value: merchants },
      { key: STORAGE_KEYS.expenses, value: expenses }
    ]);
  }

  // ---------- Expenses ----------

  function getExpenses() {
    return readJSON(STORAGE_KEYS.expenses, []);
  }

  function validateAmount(rawAmount) {
    const input = String(rawAmount ?? '').trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(input)) {
      return { ok: false, error: 'Amount must be a positive THB value with no more than 2 decimal places.' };
    }
    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      return { ok: false, error: 'Amount is outside the supported THB range.' };
    }
    const satang = Math.round(amount * 100);
    if (!Number.isSafeInteger(satang) || satang < 1) {
      return { ok: false, error: 'Amount must be at least 0.01 THB.' };
    }
    return { ok: true, value: satang / 100 };
  }

  function addExpense({ date, amount, category, merchant, note }) {
    const amt = validateAmount(amount);
    if (!amt.ok) return amt;
    if (!date || !isValidCalendarDate(date)) return { ok: false, error: 'Please select a valid date.' };
    if (date > todayISO()) return { ok: false, error: 'Date cannot be in the future.' };
    if (typeof category !== 'string' || !category.trim() || category.length > 100 || !getSelectableCategories().includes(category)) {
      return { ok: false, error: 'Please select an active category.' };
    }
    if (merchant !== undefined && merchant !== null && (typeof merchant !== 'string' || merchant.length > 100)) return { ok: false, error: 'Merchant must be text up to 100 characters.' };
    if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > MAX_TEXT_LENGTH)) return { ok: false, error: 'Note must be text up to 500 characters.' };
    const expenses = getExpenses();
    const merchantName = (merchant || '').trim();
    const record = {
      id: makeId(),
      date,
      amount: amt.value,
      category,
      merchant: merchantName,
      note: (note || '').trim(),
      createdAt: new Date().toISOString()
    };
    expenses.push(record);
    const res = writeJSON(STORAGE_KEYS.expenses, expenses);
    if (!res.ok) return res;
    let warning;
    if (merchantName) {
      const merchantResult = rememberMerchant(merchantName);
      if (!merchantResult.ok) warning = 'Expense saved, but the merchant could not be added to suggestions.';
    }
    return { ok: true, record, ...(warning ? { warning } : {}) };
  }

  function updateExpense(id, { date, amount, category, merchant, note }) {
    const amt = validateAmount(amount);
    if (!amt.ok) return amt;
    if (!date || !isValidCalendarDate(date)) return { ok: false, error: 'Please select a valid date.' };
    if (date > todayISO()) return { ok: false, error: 'Date cannot be in the future.' };
    if (typeof category !== 'string' || !category.trim() || category.length > 100 || !getSelectableCategories().includes(category)) {
      return { ok: false, error: 'Please select an active category.' };
    }
    if (merchant !== undefined && merchant !== null && (typeof merchant !== 'string' || merchant.length > 100)) return { ok: false, error: 'Merchant must be text up to 100 characters.' };
    if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > MAX_TEXT_LENGTH)) return { ok: false, error: 'Note must be text up to 500 characters.' };
    const expenses = getExpenses();
    const idx = expenses.findIndex(e => e.id === id);
    if (idx === -1) return { ok: false, error: 'Expense record not found.' };
    const merchantName = (merchant || '').trim();
    expenses[idx] = {
      ...expenses[idx],
      date,
      amount: amt.value,
      category,
      merchant: merchantName,
      note: (note || '').trim(),
      updatedAt: new Date().toISOString()
    };
    const res = writeJSON(STORAGE_KEYS.expenses, expenses);
    if (!res.ok) return res;
    let warning;
    if (merchantName) {
      const merchantResult = rememberMerchant(merchantName);
      if (!merchantResult.ok) warning = 'Expense updated, but the merchant could not be added to suggestions.';
    }
    return { ok: true, ...(warning ? { warning } : {}) };
  }

  function deleteExpense(id) {
    const expenses = getExpenses().filter(e => e.id !== id);
    return writeJSON(STORAGE_KEYS.expenses, expenses);
  }

  function compareExpenseSort(a, b) {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    const aTime = a.updatedAt || a.createdAt || '';
    const bTime = b.updatedAt || b.createdAt || '';
    return bTime.localeCompare(aTime);
  }

  function getExpensesForDate(yyyyMmDd) {
    return getExpenses()
      .filter(e => e.date === yyyyMmDd)
      .sort(compareExpenseSort);
  }

  function getExpensesForMonth(yyyyMm) {
    return getExpenses()
      .filter(e => e.date.slice(0, 7) === yyyyMm)
      .sort(compareExpenseSort);
  }

  function getExpensesInRange(startDate, endDate) {
    return getExpenses()
      .filter(e => e.date >= startDate && e.date <= endDate)
      .sort(compareExpenseSort);
  }

  function getExpensesInRangeFiltered(startDate, endDate, category, merchant) {
    return getExpenses()
      .filter(e => {
        if (e.date < startDate || e.date > endDate) return false;
        if (category && e.category !== category) return false;
        if (merchant !== undefined && merchant !== null) {
          const m = (e.merchant || '').trim() || NO_MERCHANT_LABEL;
          if (m !== merchant) return false;
        }
        return true;
      })
      .sort(compareExpenseSort);
  }

  function searchExpenses(startMonth, endMonth, query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];
    return getExpenses()
      .filter(e => {
        const month = (e.date || '').slice(0, 7);
        if (startMonth && month < startMonth) return false;
        if (endMonth && month > endMonth) return false;
        return (e.category || '').toLowerCase().includes(q)
            || (e.merchant || '').toLowerCase().includes(q)
            || (e.note || '').toLowerCase().includes(q)
            || String(e.amount || 0).includes(q)
            || (e.amount || 0).toFixed(2).includes(q);
      })
      .sort(compareExpenseSort);
  }

  // ---------- Summaries ----------

  function summarizeByCategory(expenseList) {
    const totals = {};
    expenseList.forEach(e => {
      const cat = e.category || RESERVED_CATEGORY;
      totals[cat] = (totals[cat] || 0) + (e.amount || 0);
    });
    return Object.keys(totals)
      .sort((a, b) => totals[b] - totals[a])
      .map(cat => ({ category: cat, total: Math.round(totals[cat] * 100) / 100 }));
  }

  function summarizeByCategoryAndMerchant(expenseList) {
    const catRows = summarizeByCategory(expenseList);
    const merchantTotalsByCat = {};
    expenseList.forEach(e => {
      const cat = e.category || RESERVED_CATEGORY;
      const merchantKey = (e.merchant || '').trim() || NO_MERCHANT_LABEL;
      if (!merchantTotalsByCat[cat]) merchantTotalsByCat[cat] = {};
      merchantTotalsByCat[cat][merchantKey] =
        (merchantTotalsByCat[cat][merchantKey] || 0) + (e.amount || 0);
    });
    return catRows.map(catRow => {
      const merchantTotals = merchantTotalsByCat[catRow.category] || {};
      const merchants = Object.keys(merchantTotals)
        .sort((a, b) => merchantTotals[b] - merchantTotals[a])
        .map(m => ({ merchant: m, total: Math.round(merchantTotals[m] * 100) / 100 }));
      return { category: catRow.category, total: catRow.total, merchants };
    });
  }

  function grandTotal(expenseList) {
    return Math.round(expenseList.reduce((s, e) => s + (e.amount || 0), 0) * 100) / 100;
  }

  // ---------- CSV export ----------

  function csvEscape(value) {
    let s = String(value ?? '');
    const formulaAfterLeadingWhitespace = /^[\u0000-\u0020\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]*[=+\-@]/.test(s);
    if (formulaAfterLeadingWhitespace || /^[\t\r\n]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function summaryToCSV(summaryRows) {
    const lines = ['Category,Merchant,Total (THB)'];
    summaryRows.forEach(r => {
      lines.push(`${csvEscape(r.category)},,${r.total.toFixed(2)}`);
      r.merchants.forEach(m => {
        lines.push(`,${csvEscape(m.merchant)},${m.total.toFixed(2)}`);
      });
    });
    return '\uFEFF' + lines.join('\n');
  }

  function expensesToCSV(expenseList) {
    const lines = ['Date,Category,Merchant,Amount (THB),Note'];
    const sorted = expenseList.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const aTime = a.updatedAt || a.createdAt || '';
      const bTime = b.updatedAt || b.createdAt || '';
      return aTime.localeCompare(bTime);
    });
    sorted.forEach(e => {
      lines.push([
        csvEscape(e.date),
        csvEscape(e.category),
        csvEscape(e.merchant || ''),
        (e.amount || 0).toFixed(2),
        csvEscape(e.note || '')
      ].join(','));
    });
    return '\uFEFF' + lines.join('\n');
  }

  // ---------- JSON backup / restore ----------

  function exportBackup() {
    const payload = {
      app: 'expense-tracker-pwa',
      version: 3,
      removedCategoryPolicy: 'virtual-orphan-v1',
      removedExpenseIds: getExpenses().filter(expense => expense.category === RESERVED_CATEGORY).map(expense => expense.id),
      exportedAt: new Date().toISOString(),
      categories: getCategories().filter(category => category !== RESERVED_CATEGORY),
      merchants: getMerchants(),
      expenses: getExpenses(),
      accentColor: getAccentColor()
    };
    return JSON.stringify(payload, null, 2);
  }

  function importBackup(jsonString) {
    let data;
    try { data = JSON.parse(jsonString); }
    catch (error) { return { ok: false, code: 'INVALID_JSON', error: 'File is not valid JSON.' }; }

    if (!data || data.app !== 'expense-tracker-pwa' || ![1, 2, 3].includes(data.version)) {
      return { ok: false, code: 'INVALID_BACKUP', error: 'Invalid backup file or unsupported backup version.' };
    }
    if (!Array.isArray(data.categories) || !Array.isArray(data.expenses)) {
      return { ok: false, code: 'INVALID_BACKUP', error: 'Invalid file structure (must contain categories and expenses).' };
    }
    if (data.expenses.length > MAX_EXPENSES || data.categories.length > MAX_LABELS || (data.merchants !== undefined && (!Array.isArray(data.merchants) || data.merchants.length > MAX_LABELS))) {
      return { ok: false, code: 'BACKUP_LIMIT', error: 'Backup exceeds the supported number of expenses, categories, or merchants.' };
    }
    if (data.accentColor !== undefined && (typeof data.accentColor !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(data.accentColor))) {
      return { ok: false, code: 'INVALID_BACKUP', error: 'Backup contains an invalid accent color.' };
    }

    const cleanCategories = [];
    const categorySet = new Set();
    for (const rawCategory of data.categories) {
      if (typeof rawCategory !== 'string' || !rawCategory.trim() || rawCategory.length > 100) {
        return { ok: false, code: 'INVALID_CATEGORY', error: 'Backup contains an invalid category name.' };
      }
      const name = rawCategory.trim();
      if (name === RESERVED_CATEGORY || name === LEGACY_RESERVED_CATEGORY) {
        if (data.version >= 3) return { ok: false, code: 'RESERVED_CATEGORY', error: 'The [Removed] category is reserved and must not be stored in the category list.' };
        continue;
      }
      const key = name.toLowerCase();
      if (!categorySet.has(key)) { categorySet.add(key); cleanCategories.push(name); }
    }

    const seenIds = new Set();
    const expenses = [];
    for (const source of data.expenses) {
      if (!source || typeof source !== 'object' || Array.isArray(source) ||
          (source.id !== undefined && (typeof source.id !== 'string' || !source.id.trim() || source.id.length > 128)) ||
          typeof source.date !== 'string' || !isValidCalendarDate(source.date) || source.date > tomorrowISO() ||
          typeof source.amount !== 'number' || !Number.isFinite(source.amount) || source.amount <= 0 || source.amount > MAX_AMOUNT ||
          !Number.isSafeInteger(Math.round(source.amount * 100)) || Math.round(source.amount * 100) < 1 ||
          Math.abs(source.amount * 100 - Math.round(source.amount * 100)) > 1e-7 ||
          typeof source.category !== 'string' || !source.category.trim() || source.category.length > 100 ||
          (source.merchant !== undefined && source.merchant !== null && (typeof source.merchant !== 'string' || source.merchant.length > 100)) ||
          (source.note !== undefined && source.note !== null && (typeof source.note !== 'string' || source.note.length > MAX_TEXT_LENGTH)) ||
          (source.createdAt !== undefined && (typeof source.createdAt !== 'string' || !Number.isFinite(Date.parse(source.createdAt)))) ||
          (source.updatedAt !== undefined && (typeof source.updatedAt !== 'string' || !Number.isFinite(Date.parse(source.updatedAt))))) {
        return { ok: false, code: 'INVALID_EXPENSE', error: 'Backup contains an invalid expense (check date, amount, category, merchant, note, and timestamps).' };
      }
      let category = source.category.trim();
      if (category === LEGACY_RESERVED_CATEGORY) category = RESERVED_CATEGORY;
      if (category !== RESERVED_CATEGORY) {
        const canonicalCategory = cleanCategories.find(candidate => candidate.toLowerCase() === category.toLowerCase());
        if (canonicalCategory) category = canonicalCategory;
      }
      if (category === RESERVED_CATEGORY) {
        const allowedRemovedIds = Array.isArray(data.removedExpenseIds) ? data.removedExpenseIds : [];
        if (data.version >= 3 && (data.removedCategoryPolicy !== 'virtual-orphan-v1' || !source.id || !allowedRemovedIds.includes(source.id))) {
          return { ok: false, code: 'RESERVED_CATEGORY', error: 'Backup v3 can only restore [Removed] expenses whose IDs are listed in its exported virtual-orphan metadata.' };
        }
      } else if (!categorySet.has(category.toLowerCase())) {
        if (data.version >= 3) return { ok: false, code: 'UNKNOWN_CATEGORY', error: `Expense category "${category}" is not present in the backup category list.` };
        // Legacy backups could contain orphaned category names. Keep the name as an active category rather than losing it.
        categorySet.add(category.toLowerCase());
        cleanCategories.push(category);
      }
      let id = typeof source.id === 'string' && source.id.trim() ? source.id : makeId();
      while (seenIds.has(id)) id = makeId();
      seenIds.add(id);
      expenses.push({
        id,
        date: source.date,
        amount: Math.round(source.amount * 100) / 100,
        category,
        merchant: typeof source.merchant === 'string' ? source.merchant.trim() : '',
        note: typeof source.note === 'string' ? source.note.trim() : '',
        createdAt: source.createdAt || new Date().toISOString(),
        ...(source.updatedAt ? { updatedAt: source.updatedAt } : {})
      });
    }

    const seenMerchants = new Set();
    const restoredMerchants = [];
    const candidateMerchants = (data.merchants || []).concat(expenses.map(expense => expense.merchant));
    for (const rawMerchant of candidateMerchants) {
      if (typeof rawMerchant !== 'string' || rawMerchant.length > 100) {
        return { ok: false, code: 'INVALID_MERCHANT', error: 'Backup contains an invalid merchant name.' };
      }
      const name = rawMerchant.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!seenMerchants.has(key)) { seenMerchants.add(key); restoredMerchants.push(name); }
    }

    const updates = [
      { key: STORAGE_KEYS.categories, value: cleanCategories },
      { key: STORAGE_KEYS.expenses, value: expenses },
      { key: STORAGE_KEYS.merchants, value: restoredMerchants }
    ];
    if (data.accentColor !== undefined) updates.push({ key: STORAGE_KEYS.accentColor, value: data.accentColor });
    return commitTransaction(updates);
  }

  function getShowMerchants() {
    return readJSON(STORAGE_KEYS.showMerchants, true);
  }

  function setShowMerchants(val) {
    return writeJSON(STORAGE_KEYS.showMerchants, Boolean(val));
  }

  function getAccentColor() {
    return readJSON(STORAGE_KEYS.accentColor, '#0B81FE');
  }

  function setAccentColor(hex) {
    const cleanHex = (hex || '').trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(cleanHex)) {
      return { ok: false, error: 'Invalid color code (must be in format #RRGGBB).' };
    }
    return writeJSON(STORAGE_KEYS.accentColor, cleanHex);
  }

  function getRecoveryState() {
    return recoveryState ? deepClone(recoveryState) : null;
  }

  function exportRecoveryData() {
    const rawValues = {};
    for (const key of KNOWN_KEYS) {
      const result = safeGetItem(key);
      if (!result.ok) return result;
      rawValues[key] = result.value;
    }
    const payload = { app: 'expense-tracker-raw-recovery', exportedAt: new Date().toISOString(), recovery: getRecoveryState(), rawValues };
    if (recoveryState && recoveryState.originalRawValues) payload.originalRawValues = deepClone(recoveryState.originalRawValues);
    return { ok: true, content: JSON.stringify(payload, null, 2) };
  }

  function restoreRecoverySnapshot() {
    if (!recoveryState || !recoveryState.originalRawValues) return { ok: false, code: 'NO_SNAPSHOT', error: 'No original storage snapshot is available to restore.' };
    const originalRawValues = deepClone(recoveryState.originalRawValues);
    const keys = Object.keys(originalRawValues);
    const currentValues = {};
    for (const key of keys) {
      const current = safeGetItem(key);
      if (!current.ok) return current;
      currentValues[key] = current.value;
    }
    const written = [];
    for (const key of keys) {
      const original = originalRawValues[key];
      const result = original === null ? safeRemoveItem(key) : safeSetItem(key, original);
      if (!result.ok) {
        const rollbackErrors = [];
        for (const changedKey of written.concat(key).reverse()) {
          const current = currentValues[changedKey];
          const rollback = current === null ? safeRemoveItem(changedKey) : safeSetItem(changedKey, current);
          if (!rollback.ok) rollbackErrors.push({ key: changedKey, error: rollback.error });
        }
        Object.keys(cache).forEach(cacheKey => delete cache[cacheKey]);
        if (rollbackErrors.length) {
          setRecovery('ROLLBACK_FAILED', 'Original snapshot restore failed and the current storage values could not all be restored.', keys, originalRawValues);
          return { ok: false, code: 'ROLLBACK_FAILED', error: 'Snapshot restore failed and its rollback was incomplete. Export the current recovery state before retrying.', rollbackErrors };
        }
        return result;
      }
      written.push(key);
    }
    Object.keys(cache).forEach(key => delete cache[key]);
    recoveryState = null;
    return init();
  }

  function resetRecoveryData() {
    if (!recoveryState || !recoveryState.keys.length) return { ok: false, code: 'NO_RECOVERY', error: 'There is no recoverable invalid storage entry to reset.' };
    if (recoveryState.code === 'ROLLBACK_FAILED' || recoveryState.code === 'STORAGE_ACCESS') {
      return { ok: false, code: 'RECOVERY_REQUIRED', error: 'A full snapshot restore or restored storage access is required before resetting data.' };
    }
    const snapshots = {};
    for (const key of recoveryState.keys) {
      const current = safeGetItem(key);
      if (!current.ok) return current;
      snapshots[key] = current.value;
    }
    const written = [];
    for (const key of recoveryState.keys) {
      const result = safeSetItem(key, JSON.stringify(DEFAULT_VALUES[key]));
      if (!result.ok) {
        const rollbackErrors = [];
        for (const changedKey of written.concat(key).reverse()) {
          const original = snapshots[changedKey];
          const rollback = original === null ? safeRemoveItem(changedKey) : safeSetItem(changedKey, original);
          if (!rollback.ok) rollbackErrors.push({ key: changedKey, error: rollback.error });
        }
        Object.keys(cache).forEach(cacheKey => delete cache[cacheKey]);
        if (rollbackErrors.length) {
          setRecovery('ROLLBACK_FAILED', 'Recovery reset failed and original storage values could not all be restored. Preserve the raw recovery export.', recoveryState.keys, snapshots);
          return { ok: false, code: 'ROLLBACK_FAILED', error: 'Recovery reset failed and rollback was incomplete. Preserve the raw recovery export.', rollbackErrors };
        }
        return result;
      }
      written.push(key);
    }
    Object.keys(cache).forEach(key => delete cache[key]);
    recoveryState = null;
    return init();
  }

  return {
    init,
    todayISO, currentMonthISO,
    getCategories, addCategory, renameCategory, deleteCategory, getSelectableCategories, categoryExists,
    getMerchants, rememberMerchant, merchantExists, addMerchant, renameMerchant, deleteMerchant,
    getExpenses, addExpense, updateExpense, deleteExpense, getExpensesForDate, getExpensesForMonth, getExpensesInRange, getExpensesInRangeFiltered, searchExpenses,
    summarizeByCategory, summarizeByCategoryAndMerchant, grandTotal, summaryToCSV, expensesToCSV,
    exportBackup, importBackup, getShowMerchants, setShowMerchants, getAccentColor, setAccentColor,
    getRecoveryState, exportRecoveryData, restoreRecoverySnapshot, resetRecoveryData,
    RESERVED_CATEGORY, NO_MERCHANT_LABEL
  };
})();
