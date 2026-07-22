/* ============================================================
   store.js — data layer (localStorage). No UI code lives here.
   ============================================================ */

const STORAGE_KEYS = {
  categories: 'expenseApp_categories_v1',
  expenses:   'expenseApp_expenses_v1',
  merchants:  'expenseApp_merchants_v1'
};

const RESERVED_CATEGORY = '[Removed]';
// Old reserved-category label, kept only so existing data (saved before this
// rename) can be migrated on load — see migrateLegacyRemovedCategory().
const LEGACY_RESERVED_CATEGORY = 'Removed';

const DEFAULT_CATEGORIES = [
  '7-11🏪', 'Clothing🧥', 'Dining out🍽️', 'Education📚', 'Entertainment🎬',
  'Food & Drink🍔', 'Gifts & Donations🎁', 'Groceries🛒', 'Healthcare🩺',
  'Household🏠', 'Investment💰', 'Other📦', 'Personal care🧴', 'Shopping🛍️',
  'Skincare🌟', 'Supplements💊', 'Transportation🚗', 'Travel✈️', 'Utilities💡'
];

// Seed merchants for the free-text merchant/sub-category field (autocomplete
// only — not a fixed list, users can type anything and it gets remembered).
const DEFAULT_MERCHANTS = ['Lazada', 'Shopee'];

const Store = (function () {

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      console.error('Store read error for', key, e);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function init() {
    if (localStorage.getItem(STORAGE_KEYS.categories) === null) {
      writeJSON(STORAGE_KEYS.categories, DEFAULT_CATEGORIES.slice());
    }
    if (localStorage.getItem(STORAGE_KEYS.expenses) === null) {
      writeJSON(STORAGE_KEYS.expenses, []);
    }
    if (localStorage.getItem(STORAGE_KEYS.merchants) === null) {
      writeJSON(STORAGE_KEYS.merchants, DEFAULT_MERCHANTS.slice());
    }
    migrateLegacyRemovedCategory();
  }

  // One-time migration: expenses saved before the reserved category was
  // renamed from "Removed" to "[Removed]" still carry the old label.
  function migrateLegacyRemovedCategory() {
    const expenses = getExpenses();
    let changed = false;
    expenses.forEach(e => {
      if (e.category === LEGACY_RESERVED_CATEGORY) {
        e.category = RESERVED_CATEGORY;
        changed = true;
      }
    });
    if (changed) writeJSON(STORAGE_KEYS.expenses, expenses);
  }

  function makeId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function currentMonthISO() {
    return todayISO().slice(0, 7); // YYYY-MM
  }

  // ---------- Categories ----------

  function getCategories() {
    const cats = readJSON(STORAGE_KEYS.categories, DEFAULT_CATEGORIES.slice());
    return cats.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  function categoryExists(name, categories) {
    const list = categories || getCategories();
    const target = name.trim().toLowerCase();
    if (target === RESERVED_CATEGORY.toLowerCase()) return true;
    return list.some(c => c.toLowerCase() === target);
  }

  function addCategory(rawName) {
    const name = (rawName || '').trim();
    if (!name) return { ok: false, error: 'กรุณากรอกชื่อหมวดหมู่' };
    if (categoryExists(name)) return { ok: false, error: `มีหมวดหมู่ชื่อ "${name}" อยู่แล้ว` };
    const categories = getCategories();
    categories.push(name);
    writeJSON(STORAGE_KEYS.categories, categories);
    return { ok: true };
  }

  function renameCategory(oldName, rawNewName) {
    const newName = (rawNewName || '').trim();
    if (!newName) return { ok: false, error: 'กรุณากรอกชื่อใหม่' };
    if (oldName === RESERVED_CATEGORY) return { ok: false, error: 'ไม่สามารถแก้ไขหมวดหมู่นี้ได้' };
    if (newName.toLowerCase() === oldName.toLowerCase()) {
      return { ok: false, error: 'ชื่อใหม่เหมือนชื่อเดิม' };
    }
    const categories = getCategories();
    if (categoryExists(newName, categories)) {
      return { ok: false, error: `มีหมวดหมู่ชื่อ "${newName}" อยู่แล้ว กรุณาใช้ชื่ออื่น` };
    }
    const idx = categories.findIndex(c => c === oldName);
    if (idx === -1) return { ok: false, error: 'ไม่พบหมวดหมู่นี้' };
    categories[idx] = newName;
    writeJSON(STORAGE_KEYS.categories, categories);

    // cascade to historical expenses
    const expenses = getExpenses();
    let changed = false;
    expenses.forEach(e => {
      if (e.category === oldName) { e.category = newName; changed = true; }
    });
    if (changed) writeJSON(STORAGE_KEYS.expenses, expenses);

    return { ok: true };
  }

  function deleteCategory(name) {
    if (name === RESERVED_CATEGORY) return { ok: false, error: 'ไม่สามารถลบหมวดหมู่นี้ได้' };
    const categories = getCategories().filter(c => c !== name);
    writeJSON(STORAGE_KEYS.categories, categories);

    const expenses = getExpenses();
    let changed = false;
    expenses.forEach(e => {
      if (e.category === name) { e.category = RESERVED_CATEGORY; changed = true; }
    });
    if (changed) writeJSON(STORAGE_KEYS.expenses, expenses);

    return { ok: true };
  }

  // Categories selectable when adding/editing an expense (Removed is hidden)
  function getSelectableCategories() {
    return getCategories();
  }

  // ---------- Merchants (free-text sub-category, not a fixed list) ----------
  // Merchant is a plain string on each expense record, so it is still NOT
  // validated against this list on save (typing a brand-new merchant on the
  // expense form works exactly as before, via rememberMerchant). The list is
  // now also directly manageable — Add/Rename/Delete Merchant — the same way
  // categories are, for tidying up the autocomplete suggestions.

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
    if (!name) return;
    const merchants = readJSON(STORAGE_KEYS.merchants, DEFAULT_MERCHANTS.slice());
    const exists = merchants.some(m => m.toLowerCase() === name.toLowerCase());
    if (!exists) {
      merchants.push(name);
      writeJSON(STORAGE_KEYS.merchants, merchants);
    }
  }

  function addMerchant(rawName) {
    const name = (rawName || '').trim();
    if (!name) return { ok: false, error: 'กรุณากรอกชื่อร้านค้า' };
    if (merchantExists(name)) return { ok: false, error: `มีร้านค้าชื่อ "${name}" อยู่แล้ว` };
    const merchants = getMerchants();
    merchants.push(name);
    writeJSON(STORAGE_KEYS.merchants, merchants);
    return { ok: true };
  }

  function renameMerchant(oldName, rawNewName) {
    const newName = (rawNewName || '').trim();
    if (!newName) return { ok: false, error: 'กรุณากรอกชื่อใหม่' };
    if (newName.toLowerCase() === oldName.toLowerCase()) {
      return { ok: false, error: 'ชื่อใหม่เหมือนชื่อเดิม' };
    }
    const merchants = getMerchants();
    if (merchantExists(newName, merchants)) {
      return { ok: false, error: `มีร้านค้าชื่อ "${newName}" อยู่แล้ว กรุณาใช้ชื่ออื่น` };
    }
    const idx = merchants.findIndex(m => m === oldName);
    if (idx === -1) return { ok: false, error: 'ไม่พบร้านค้านี้' };
    merchants[idx] = newName;
    writeJSON(STORAGE_KEYS.merchants, merchants);

    // cascade to historical expenses, same as renameCategory does
    const expenses = getExpenses();
    let changed = false;
    expenses.forEach(e => {
      if (e.merchant === oldName) { e.merchant = newName; changed = true; }
    });
    if (changed) writeJSON(STORAGE_KEYS.expenses, expenses);

    return { ok: true };
  }

  // Unlike deleteCategory, this never touches past expenses: merchant was
  // never a required/validated field, so there is no "[Removed]" bucket to
  // move orphaned records into. Deleting just removes the name from the
  // autocomplete suggestion list going forward.
  function deleteMerchant(name) {
    const merchants = getMerchants().filter(m => m !== name);
    writeJSON(STORAGE_KEYS.merchants, merchants);
    return { ok: true };
  }

  // ---------- Expenses ----------

  function getExpenses() {
    return readJSON(STORAGE_KEYS.expenses, []);
  }

  function validateAmount(rawAmount) {
    const amount = parseFloat(rawAmount);
    if (isNaN(amount) || amount <= 0) {
      return { ok: false, error: 'จำนวนเงินต้องเป็นตัวเลขมากกว่า 0' };
    }
    // round to 2 decimals (satang)
    return { ok: true, value: Math.round(amount * 100) / 100 };
  }

  function addExpense({ date, amount, category, merchant, note }) {
    const amt = validateAmount(amount);
    if (!amt.ok) return amt;
    if (!date) return { ok: false, error: 'กรุณาเลือกวันที่' };
    if (!category || category === RESERVED_CATEGORY) {
      return { ok: false, error: 'กรุณาเลือกหมวดหมู่' };
    }
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
    writeJSON(STORAGE_KEYS.expenses, expenses);
    if (merchantName) rememberMerchant(merchantName);
    return { ok: true, record };
  }

  function updateExpense(id, { date, amount, category, merchant, note }) {
    const amt = validateAmount(amount);
    if (!amt.ok) return amt;
    if (!date) return { ok: false, error: 'กรุณาเลือกวันที่' };
    if (!category) return { ok: false, error: 'กรุณาเลือกหมวดหมู่' };
    const expenses = getExpenses();
    const idx = expenses.findIndex(e => e.id === id);
    if (idx === -1) return { ok: false, error: 'ไม่พบรายการนี้' };
    const merchantName = (merchant || '').trim();
    expenses[idx] = { ...expenses[idx], date, amount: amt.value, category, merchant: merchantName, note: (note || '').trim() };
    writeJSON(STORAGE_KEYS.expenses, expenses);
    if (merchantName) rememberMerchant(merchantName);
    return { ok: true };
  }

  function deleteExpense(id) {
    const expenses = getExpenses().filter(e => e.id !== id);
    writeJSON(STORAGE_KEYS.expenses, expenses);
    return { ok: true };
  }

  function getExpensesForMonth(yyyyMm) {
    return getExpenses()
      .filter(e => e.date.slice(0, 7) === yyyyMm)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function getExpensesInRange(startDate, endDate) {
    return getExpenses()
      .filter(e => e.date >= startDate && e.date <= endDate)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  // ---------- Summaries ----------

  function summarizeByCategory(expenseList) {
    const totals = {};
    expenseList.forEach(e => {
      totals[e.category] = (totals[e.category] || 0) + e.amount;
    });
    return Object.keys(totals)
      .sort((a, b) => totals[b] - totals[a])
      .map(cat => ({ category: cat, total: Math.round(totals[cat] * 100) / 100 }));
  }

  function grandTotal(expenseList) {
    return Math.round(expenseList.reduce((s, e) => s + e.amount, 0) * 100) / 100;
  }

  // ---------- CSV export ----------

  function csvEscape(value) {
    const s = String(value);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function summaryToCSV(summaryRows) {
    const lines = ['Category,Total (THB)'];
    summaryRows.forEach(r => {
      lines.push(`${csvEscape(r.category)},${r.total.toFixed(2)}`);
    });
    return lines.join('\n');
  }

  // Itemized, one-row-per-expense CSV (includes Note). Sorted oldest-to-newest
  // so it reads like a ledger rather than the newest-first order used on screen.
  function expensesToCSV(expenseList) {
    const lines = ['Date,Category,Merchant,Amount (THB),Note'];
    const sorted = expenseList.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
    sorted.forEach(e => {
      lines.push([
        csvEscape(e.date),
        csvEscape(e.category),
        csvEscape(e.merchant || ''),
        e.amount.toFixed(2),
        csvEscape(e.note || '')
      ].join(','));
    });
    return lines.join('\n');
  }

  // ---------- JSON backup / restore ----------

  function exportBackup() {
    const payload = {
      app: 'expense-tracker-pwa',
      version: 2,
      exportedAt: new Date().toISOString(),
      categories: getCategories(),
      merchants: getMerchants(),
      expenses: getExpenses()
    };
    return JSON.stringify(payload, null, 2);
  }

  function importBackup(jsonString) {
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      return { ok: false, error: 'ไฟล์ไม่ใช่ JSON ที่ถูกต้อง' };
    }
    if (!data || !Array.isArray(data.categories) || !Array.isArray(data.expenses)) {
      return { ok: false, error: 'โครงสร้างไฟล์ไม่ถูกต้อง (ต้องมี categories และ expenses)' };
    }
    // light validation of expense records
    const validExpenses = data.expenses.every(e =>
      e && typeof e.date === 'string' &&
      typeof e.amount === 'number' &&
      typeof e.category === 'string'
    );
    if (!validExpenses) {
      return { ok: false, error: 'พบข้อมูลรายการที่ไม่ถูกต้องในไฟล์' };
    }
    writeJSON(STORAGE_KEYS.categories, data.categories);
    const expenses = data.expenses.map(e => ({
      id: e.id || makeId(),
      date: e.date,
      amount: e.amount,
      category: e.category,
      merchant: typeof e.merchant === 'string' ? e.merchant : '',
      note: typeof e.note === 'string' ? e.note : '',
      createdAt: e.createdAt || new Date().toISOString()
    }));
    writeJSON(STORAGE_KEYS.expenses, expenses);

    // Rebuild the merchant autocomplete list: whatever the backup explicitly
    // shipped (data.merchants, if present) plus every merchant actually used
    // on an expense, deduped case-insensitively. Backups from before the
    // merchant field existed simply produce an empty list here, which is fine.
    const seen = new Set();
    const mergedMerchants = [];
    const candidateMerchants = (Array.isArray(data.merchants) ? data.merchants : [])
      .concat(expenses.map(e => e.merchant));
    candidateMerchants.forEach(m => {
      const name = (m || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); mergedMerchants.push(name); }
    });
    writeJSON(STORAGE_KEYS.merchants, mergedMerchants);

    return { ok: true };
  }

  return {
    init,
    todayISO, currentMonthISO,
    getCategories, addCategory, renameCategory, deleteCategory, getSelectableCategories, categoryExists,
    getMerchants, rememberMerchant, merchantExists, addMerchant, renameMerchant, deleteMerchant,
    getExpenses, addExpense, updateExpense, deleteExpense, getExpensesForMonth, getExpensesInRange,
    summarizeByCategory, grandTotal, summaryToCSV, expensesToCSV,
    exportBackup, importBackup,
    RESERVED_CATEGORY
  };
})();
