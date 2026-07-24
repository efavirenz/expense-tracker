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

  function deepClone(val) {
    if (val === undefined || val === null) return val;
    return JSON.parse(JSON.stringify(val));
  }

  function readJSON(key, fallback) {
    if (cache[key] !== undefined) return deepClone(cache[key]);
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) {
        cache[key] = fallback;
        return deepClone(fallback);
      }
      const parsed = JSON.parse(raw);
      const val = (parsed === null || parsed === undefined) ? fallback : parsed;
      cache[key] = val;
      return deepClone(val);
    } catch (e) {
      console.error('Store read error for', key, e);
      cache[key] = fallback;
      return deepClone(fallback);
    }
  }

  function writeJSON(key, value) {
    const clonedValue = deepClone(value);
    cache[key] = clonedValue;
    try {
      localStorage.setItem(key, JSON.stringify(clonedValue));
      return { ok: true };
    } catch (e) {
      delete cache[key];
      console.error('Store write error for', key, e);
      return { ok: false, error: 'หน่วยความจำเต็ม ไม่สามารถบันทึกข้อมูลได้ (Storage Quota Exceeded)' };
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key && cache[e.key] !== undefined) {
        delete cache[e.key];
        if (typeof window.onStoreUpdated === 'function') window.onStoreUpdated();
      }
    });
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
    return writeJSON(STORAGE_KEYS.categories, categories);
  }

  function renameCategory(oldName, rawNewName) {
    const newName = (rawNewName || '').trim();
    if (!newName) return { ok: false, error: 'กรุณากรอกชื่อใหม่' };
    if (oldName === RESERVED_CATEGORY) return { ok: false, error: 'ไม่สามารถแก้ไขหมวดหมู่นี้ได้' };
    if (newName === oldName) {
      return { ok: false, error: 'ชื่อใหม่เหมือนชื่อเดิม' };
    }
    const categories = getCategories();
    const otherCategories = categories.filter(c => c !== oldName);
    if (categoryExists(newName, otherCategories)) {
      return { ok: false, error: `มีหมวดหมู่ชื่อ "${newName}" อยู่แล้ว กรุณาใช้ชื่ออื่น` };
    }
    const idx = categories.findIndex(c => c === oldName);
    if (idx === -1) return { ok: false, error: 'ไม่พบหมวดหมู่นี้' };
    categories[idx] = newName;
    const res1 = writeJSON(STORAGE_KEYS.categories, categories);
    if (!res1.ok) return res1;

    const expenses = getExpenses();
    let changed = false;
    expenses.forEach(e => {
      if (e.category === oldName) { e.category = newName; changed = true; }
    });
    if (changed) {
      const res2 = writeJSON(STORAGE_KEYS.expenses, expenses);
      if (!res2.ok) return res2;
    }

    return { ok: true };
  }

  function deleteCategory(name) {
    if (name === RESERVED_CATEGORY) return { ok: false, error: 'ไม่สามารถลบหมวดหมู่นี้ได้' };
    const categories = getCategories().filter(c => c !== name);
    const res1 = writeJSON(STORAGE_KEYS.categories, categories);
    if (!res1.ok) return res1;

    const expenses = getExpenses();
    let changed = false;
    expenses.forEach(e => {
      if (e.category === name) { e.category = RESERVED_CATEGORY; changed = true; }
    });
    if (changed) {
      const res2 = writeJSON(STORAGE_KEYS.expenses, expenses);
      if (!res2.ok) return res2;
    }

    return { ok: true };
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
    return writeJSON(STORAGE_KEYS.merchants, merchants);
  }

  function renameMerchant(oldName, rawNewName) {
    const newName = (rawNewName || '').trim();
    if (!newName) return { ok: false, error: 'กรุณากรอกชื่อใหม่' };
    if (newName.toLowerCase() === oldName.toLowerCase() && newName !== oldName) {
      // allow casing change
    } else if (newName.toLowerCase() === oldName.toLowerCase()) {
      return { ok: false, error: 'ชื่อใหม่เหมือนชื่อเดิม' };
    }
    const merchants = getMerchants();
    const otherMerchants = merchants.filter(m => m !== oldName);
    if (merchantExists(newName, otherMerchants)) {
      return { ok: false, error: `มีร้านค้าชื่อ "${newName}" อยู่แล้ว กรุณาใช้ชื่ออื่น` };
    }
    const idx = merchants.findIndex(m => m === oldName);
    if (idx === -1) return { ok: false, error: 'ไม่พบร้านค้านี้' };
    merchants[idx] = newName;
    const res1 = writeJSON(STORAGE_KEYS.merchants, merchants);
    if (!res1.ok) return res1;

    const expenses = getExpenses();
    let changed = false;
    expenses.forEach(e => {
      if (e.merchant === oldName) { e.merchant = newName; changed = true; }
    });
    if (changed) {
      const res2 = writeJSON(STORAGE_KEYS.expenses, expenses);
      if (!res2.ok) return res2;
    }

    return { ok: true };
  }

  function deleteMerchant(name) {
    const merchants = getMerchants().filter(m => m !== name);
    return writeJSON(STORAGE_KEYS.merchants, merchants);
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
    return { ok: true, value: Math.round(amount * 100) / 100 };
  }

  function addExpense({ date, amount, category, merchant, note }) {
    const amt = validateAmount(amount);
    if (!amt.ok) return amt;
    if (!date) return { ok: false, error: 'กรุณาเลือกวันที่' };
    if (date > todayISO()) return { ok: false, error: 'วันที่ต้องไม่เป็นวันในอนาคต' };
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
    const res = writeJSON(STORAGE_KEYS.expenses, expenses);
    if (!res.ok) return res;
    if (merchantName) rememberMerchant(merchantName);
    return { ok: true, record };
  }

  function updateExpense(id, { date, amount, category, merchant, note }) {
    const amt = validateAmount(amount);
    if (!amt.ok) return amt;
    if (!date) return { ok: false, error: 'กรุณาเลือกวันที่' };
    if (date > todayISO()) return { ok: false, error: 'วันที่ต้องไม่เป็นวันในอนาคต' };
    if (!category) return { ok: false, error: 'กรุณาเลือกหมวดหมู่' };
    const expenses = getExpenses();
    const idx = expenses.findIndex(e => e.id === id);
    if (idx === -1) return { ok: false, error: 'ไม่พบรายการนี้' };
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
    if (merchantName) rememberMerchant(merchantName);
    return { ok: true };
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
        const month = e.date.slice(0, 7);
        if (startMonth && month < startMonth) return false;
        if (endMonth && month > endMonth) return false;
        return e.category.toLowerCase().includes(q)
            || (e.merchant || '').toLowerCase().includes(q)
            || (e.note || '').toLowerCase().includes(q)
            || String(e.amount).includes(q);
      })
      .sort(compareExpenseSort);
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

  function summarizeByCategoryAndMerchant(expenseList) {
    const catRows = summarizeByCategory(expenseList);
    const merchantTotalsByCat = {};
    expenseList.forEach(e => {
      const merchantKey = (e.merchant || '').trim() || NO_MERCHANT_LABEL;
      if (!merchantTotalsByCat[e.category]) merchantTotalsByCat[e.category] = {};
      merchantTotalsByCat[e.category][merchantKey] =
        (merchantTotalsByCat[e.category][merchantKey] || 0) + e.amount;
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
    return Math.round(expenseList.reduce((s, e) => s + e.amount, 0) * 100) / 100;
  }

  // ---------- CSV export ----------

  function csvEscape(value) {
    const s = String(value);
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
    return lines.join('\n');
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
      expenses: getExpenses(),
      accentColor: getAccentColor()
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
    if (!data || data.app !== 'expense-tracker-pwa') {
      return { ok: false, error: 'ไฟล์แอปพลิเคชันไม่ถูกต้อง (ต้องเป็น backup จาก Expense Tracker)' };
    }
    if (!Array.isArray(data.categories) || !Array.isArray(data.expenses)) {
      return { ok: false, error: 'โครงสร้างไฟล์ไม่ถูกต้อง (ต้องมี categories และ expenses)' };
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const maxAllowedDate = tomorrowISO();
    const validExpenses = data.expenses.every(e =>
      e && typeof e.date === 'string' && dateRegex.test(e.date) && e.date <= maxAllowedDate &&
      typeof e.amount === 'number' && e.amount > 0 &&
      typeof e.category === 'string' && e.category.trim() !== ''
    );
    if (!validExpenses) {
      return { ok: false, error: 'พบข้อมูลรายการที่ไม่ถูกต้องในไฟล์ (เช่น วันในอนาคต หรือ จำนวนเงินติดลบ)' };
    }

    const seenIds = new Set();
    const expenses = data.expenses.map(e => {
      let id = (e.id && typeof e.id === 'string') ? e.id : makeId();
      if (seenIds.has(id)) id = makeId();
      seenIds.add(id);
      return {
        id,
        date: e.date,
        amount: Math.round(e.amount * 100) / 100,
        category: e.category,
        merchant: typeof e.merchant === 'string' ? e.merchant : '',
        note: typeof e.note === 'string' ? e.note : '',
        createdAt: e.createdAt || new Date().toISOString(),
        updatedAt: e.updatedAt || undefined
      };
    });

    const res1 = writeJSON(STORAGE_KEYS.categories, data.categories);
    if (!res1.ok) return res1;
    const res2 = writeJSON(STORAGE_KEYS.expenses, expenses);
    if (!res2.ok) return res2;

    const existingMerchants = getMerchants();
    const seen = new Set(existingMerchants.map(m => m.toLowerCase()));
    const mergedMerchants = existingMerchants.slice();
    const candidateMerchants = (Array.isArray(data.merchants) ? data.merchants : [])
      .concat(expenses.map(e => e.merchant));
    candidateMerchants.forEach(m => {
      const name = (m || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); mergedMerchants.push(name); }
    });
    const res3 = writeJSON(STORAGE_KEYS.merchants, mergedMerchants);
    if (!res3.ok) return res3;

    if (data.accentColor && typeof data.accentColor === 'string') {
      const cleanColor = data.accentColor.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(cleanColor)) {
        setAccentColor(cleanColor);
      }
    }

    return { ok: true };
  }

  function getShowMerchants() {
    return readJSON(STORAGE_KEYS.showMerchants, true);
  }

  function setShowMerchants(val) {
    writeJSON(STORAGE_KEYS.showMerchants, Boolean(val));
  }

  function getAccentColor() {
    return readJSON(STORAGE_KEYS.accentColor, '#0B81FE');
  }

  function setAccentColor(hex) {
    const cleanHex = (hex || '').trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(cleanHex)) {
      return { ok: false, error: 'รหัสสีไม่ถูกต้อง (ต้องเป็น #RRGGBB)' };
    }
    return writeJSON(STORAGE_KEYS.accentColor, cleanHex);
  }

  return {
    init,
    todayISO, currentMonthISO,
    getCategories, addCategory, renameCategory, deleteCategory, getSelectableCategories, categoryExists,
    getMerchants, rememberMerchant, merchantExists, addMerchant, renameMerchant, deleteMerchant,
    getExpenses, addExpense, updateExpense, deleteExpense, getExpensesForMonth, getExpensesInRange, getExpensesInRangeFiltered, searchExpenses,
    summarizeByCategory, summarizeByCategoryAndMerchant, grandTotal, summaryToCSV, expensesToCSV,
    exportBackup, importBackup, getShowMerchants, setShowMerchants, getAccentColor, setAccentColor,
    RESERVED_CATEGORY, NO_MERCHANT_LABEL
  };
})();
