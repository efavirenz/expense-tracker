/* ============================================================
   app.js — router + screens + event wiring (vanilla JS, no deps)
   ============================================================ */

Store.init();

const APP_VERSION = 'V6';

const appEl = document.getElementById('app');
const titleEl = document.getElementById('pageTitle');
const backBtn = document.getElementById('backBtn');
const searchBtn = document.getElementById('searchBtn');
const toastEl = document.getElementById('toast');
const modalRoot = document.getElementById('modalRoot');

/* ---------------- helpers ---------------- */

const thb = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function formatTHB(n) { return '\u0E3F' + thb.format(n); }

const dateDisplayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function formatDateDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return dateDisplayFmt.format(new Date(y, m - 1, d));
}

function monthLabel(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

let toastTimer = null;
function showToast(message, isError) {
  toastEl.textContent = message;
  toastEl.classList.toggle('toast--error', !!isError);
  toastEl.classList.add('toast--visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('toast--visible'), 2600);
}

function showConfirm(message, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="modalBackdrop">
        <div class="modal-card" role="alertdialog" aria-modal="true">
          <p class="modal-message">${escapeHtml(message)}</p>
          <div class="modal-actions">
            <button class="btn btn--ghost" id="modalNo">${opts.noLabel || 'Cancel'}</button>
            <button class="btn ${opts.danger ? 'btn--danger' : 'btn--primary'}" id="modalYes">${opts.yesLabel || 'Yes'}</button>
          </div>
        </div>
      </div>`;
    const close = (val) => { modalRoot.innerHTML = ''; resolve(val); };
    document.getElementById('modalYes').addEventListener('click', () => close(true));
    document.getElementById('modalNo').addEventListener('click', () => close(false));
    document.getElementById('modalBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modalBackdrop') close(false);
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function downloadTextFile(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function categoryOptionsHtml(selected, includeExtra) {
  let cats = Store.getSelectableCategories();
  if (includeExtra && !cats.includes(includeExtra) && includeExtra !== '') {
    cats = [includeExtra, ...cats].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }
  const opts = ['<option value="" disabled' + (selected ? '' : ' selected') + '>-- Select Category --</option>'];
  cats.forEach(c => {
    opts.push(`<option value="${escapeHtml(c)}" ${c === selected ? 'selected' : ''}>${escapeHtml(c)}</option>`);
  });
  return opts.join('');
}

function merchantDatalistHtml() {
  const merchants = Store.getMerchants();
  return `<datalist id="merchantList">${merchants.map(m => `<option value="${escapeHtml(m)}">`).join('')}</datalist>`;
}

function renderSummaryTable(rows, total, showMerchants = true) {
  if (rows.length === 0) {
    return `<div class="empty-state">No expenses in this period.</div>`;
  }
  const body = rows.map(r => {
    const catRow = `
    <tr class="summary-table__cat-row">
      <td>${escapeHtml(r.category)}</td>
      <td class="num">${formatTHB(r.total)}</td>
    </tr>`;
    const merchantRows = r.merchants.map(m => `
    <tr class="summary-table__merchant-row">
      <td class="summary-table__merchant-name ${m.merchant === Store.NO_MERCHANT_LABEL ? 'summary-table__merchant-name--empty' : ''}">&nbsp;&nbsp;&nbsp;${escapeHtml(m.merchant)}</td>
      <td class="num summary-table__merchant-num">${formatTHB(m.total)}&nbsp;&nbsp;&nbsp;</td>
    </tr>`).join('');
    return catRow + merchantRows;
  }).join('');
  const hideClass = !showMerchants ? ' hide-merchants' : '';
  return `
    <table class="summary-table${hideClass}">
      <thead><tr><th>Category</th><th class="num">Total</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><th>Grand Total</th><th class="num">${formatTHB(total)}</th></tr></tfoot>
    </table>`;
}

/* ---------------- router ---------------- */

const state = { stack: [{ view: 'home' }] };
function topScreen() { return state.stack[state.stack.length - 1]; }
function navigate(view, params) { state.stack.push(Object.assign({ view }, params)); render(); }
function goBack() { if (state.stack.length > 1) { state.stack.pop(); render(); } }
function goHome() { state.stack = [{ view: 'home' }]; render(); }
function replaceTop(view, params) { state.stack[state.stack.length - 1] = Object.assign({ view }, params); render(); }
// Pops back to an existing occurrence of `view` in the stack (used after an action
// completes, to return to the menu the user came from without leaving a duplicate
// frame behind — a duplicate frame would make the back button need two taps).
function popToView(view) {
  while (state.stack.length > 1 && topScreen().view !== view) state.stack.pop();
  render();
}

/* ---------------- screens ---------------- */

const Screens = {

  home(p) {
    const month = Store.currentMonthISO();
    const monthTotal = Store.grandTotal(Store.getExpensesForMonth(month));
    return {
      title: 'Expenses',
      back: false,
      html: `
        <div class="home-version">${APP_VERSION}</div>
        <div class="month-glance">
          <span class="month-glance__label">This month - ${monthLabel(month)}</span>
          <span class="month-glance__value">${formatTHB(monthTotal)}</span>
        </div>
        <nav class="menu-list">
          <button class="menu-item" data-action="nav" data-view="addExpense">
            <span>Add Expense</span><span class="chev">&#8250;</span>
          </button>
          <button class="menu-item" data-action="nav" data-view="expensesList" data-month="${month}">
            <span>View / Edit Expenses</span><span class="chev">&#8250;</span>
          </button>
          <button class="menu-item" data-action="nav" data-view="summaryMenu">
            <span>Summary</span><span class="chev">&#8250;</span>
          </button>
          <button class="menu-item" data-action="nav" data-view="categoriesMenu">
            <span>Edit Category / Merchant</span><span class="chev">&#8250;</span>
          </button>
          <button class="menu-item" data-action="nav" data-view="backup">
            <span>Backup & Restore</span><span class="chev">&#8250;</span>
          </button>
        </nav>`
    };
  },

  addExpense(p) {
    const today = Store.todayISO();
    return {
      title: 'Add Expense',
      back: true,
      html: `
        <form class="form" id="expenseForm">
          <div id="formError" class="form-error" hidden></div>
          <label class="field">
            <span class="field__label">Date</span>
            <input type="date" id="expDate" value="${today}" max="${today}" required>
          </label>
          <label class="field">
            <span class="field__label">Expense (THB)</span>
            <input type="number" id="expAmount" inputmode="decimal" step="0.01" min="0.01" placeholder="0.00" required autofocus>
          </label>
          <label class="field">
            <span class="field__label">Category</span>
            <select id="expCategory" required>${categoryOptionsHtml('')}</select>
          </label>
          <label class="field">
            <span class="field__label">Merchant (optional)</span>
            <input type="text" id="expMerchant" list="merchantList" placeholder="e.g. Shopee, Lazada&hellip;" autocomplete="off">
          </label>
          ${merchantDatalistHtml()}
          <label class="field">
            <span class="field__label">Note (optional)</span>
            <textarea id="expNote" rows="2" placeholder="Add a note&hellip;"></textarea>
          </label>
          <div class="form-actions">
            <button type="button" class="btn btn--ghost" data-action="goBack">Cancel</button>
            <button type="submit" class="btn btn--primary">Save</button>
          </div>
        </form>`,
      afterRender() {
        document.getElementById('expenseForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const date = document.getElementById('expDate').value;
          const amount = document.getElementById('expAmount').value;
          const category = document.getElementById('expCategory').value;
          const merchant = document.getElementById('expMerchant').value;
          const note = document.getElementById('expNote').value;
          const res = Store.addExpense({ date, amount, category, merchant, note });
          if (!res.ok) { showFormError(res.error); return; }
          showToast('Expense saved.');
          goHome();
        });
      }
    };
  },

  categoriesMenu() {
    return {
      title: 'Edit Category / Merchant',
      back: true,
      html: `
        <section class="backup-section">
          <h2 class="section-title">Category</h2>
          <nav class="menu-list">
            <button class="menu-item" data-action="nav" data-view="categoryAdd">
              <span>Add Category</span><span class="chev">&#8250;</span>
            </button>
            <button class="menu-item" data-action="nav" data-view="categoryRenameList">
              <span>Rename Category</span><span class="chev">&#8250;</span>
            </button>
            <button class="menu-item" data-action="nav" data-view="categoryDeleteList">
              <span>Delete Category</span><span class="chev">&#8250;</span>
            </button>
          </nav>
        </section>
        <section class="backup-section">
          <h2 class="section-title">Merchant</h2>
          <nav class="menu-list">
            <button class="menu-item" data-action="nav" data-view="merchantAdd">
              <span>Add Merchant</span><span class="chev">&#8250;</span>
            </button>
            <button class="menu-item" data-action="nav" data-view="merchantRenameList">
              <span>Rename Merchant</span><span class="chev">&#8250;</span>
            </button>
            <button class="menu-item" data-action="nav" data-view="merchantDeleteList">
              <span>Delete Merchant</span><span class="chev">&#8250;</span>
            </button>
          </nav>
        </section>`
    };
  },

  categoryAdd() {
    return {
      title: 'Add Category',
      back: true,
      html: `
        <form class="form" id="catAddForm">
          <div id="formError" class="form-error" hidden></div>
          <label class="field">
            <span class="field__label">Category Name</span>
            <input type="text" id="catName" placeholder="e.g. Pets" required autofocus>
          </label>
          <div class="form-actions">
            <button type="button" class="btn btn--ghost" data-action="goBack">Cancel</button>
            <button type="submit" class="btn btn--primary">Save</button>
          </div>
        </form>`,
      afterRender() {
        document.getElementById('catAddForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const name = document.getElementById('catName').value;
          const res = Store.addCategory(name);
          if (!res.ok) { showFormError(res.error); return; }
          showToast('Category added.');
          popToView('categoriesMenu');
        });
      }
    };
  },

  categoryRenameList() {
    const cats = Store.getSelectableCategories();
    return {
      title: 'Rename Category',
      back: true,
      html: cats.length ? `
        <nav class="menu-list">
          ${cats.map(c => `
            <button class="menu-item" data-action="nav" data-view="categoryRenameForm" data-oldname="${escapeHtml(c)}">
              <span>${escapeHtml(c)}</span><span class="chev">&#8250;</span>
            </button>`).join('')}
        </nav>` : `<div class="empty-state">No categories yet.</div>`
    };
  },

  categoryRenameForm(p) {
    return {
      title: 'Rename Category',
      back: true,
      html: `
        <form class="form" id="catRenameForm">
          <div id="formError" class="form-error" hidden></div>
          <label class="field">
            <span class="field__label">New name for "${escapeHtml(p.oldname)}"</span>
            <input type="text" id="catNewName" value="${escapeHtml(p.oldname)}" required autofocus>
          </label>
          <div class="form-actions">
            <button type="button" class="btn btn--ghost" data-action="goBack">Cancel</button>
            <button type="submit" class="btn btn--primary">Save</button>
          </div>
        </form>`,
      afterRender() {
        document.getElementById('catRenameForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const newName = document.getElementById('catNewName').value;
          const confirmed = await showConfirm(`Rename "${p.oldname}" to "${newName.trim()}"? This updates all past expenses.`);
          if (!confirmed) return;
          const res = Store.renameCategory(p.oldname, newName);
          if (!res.ok) { showFormError(res.error); return; }
          showToast('Category renamed.');
          popToView('categoriesMenu');
        });
      }
    };
  },

  categoryDeleteList() {
    const cats = Store.getSelectableCategories();
    return {
      title: 'Delete Category',
      back: true,
      html: cats.length ? `
        <nav class="menu-list">
          ${cats.map(c => `
            <button class="menu-item menu-item--danger" data-action="deleteCategory" data-name="${escapeHtml(c)}">
              <span>${escapeHtml(c)}</span><span class="chev">&#8250;</span>
            </button>`).join('')}
        </nav>` : `<div class="empty-state">No categories yet.</div>`
    };
  },

  merchantAdd() {
    return {
      title: 'Add Merchant',
      back: true,
      html: `
        <form class="form" id="merchAddForm">
          <div id="formError" class="form-error" hidden></div>
          <label class="field">
            <span class="field__label">Merchant Name</span>
            <input type="text" id="merchName" placeholder="e.g. Central" required autofocus>
          </label>
          <div class="form-actions">
            <button type="button" class="btn btn--ghost" data-action="goBack">Cancel</button>
            <button type="submit" class="btn btn--primary">Save</button>
          </div>
        </form>`,
      afterRender() {
        document.getElementById('merchAddForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const name = document.getElementById('merchName').value;
          const res = Store.addMerchant(name);
          if (!res.ok) { showFormError(res.error); return; }
          showToast('Merchant added.');
          popToView('categoriesMenu');
        });
      }
    };
  },

  merchantRenameList() {
    const merchants = Store.getMerchants();
    return {
      title: 'Rename Merchant',
      back: true,
      html: merchants.length ? `
        <nav class="menu-list">
          ${merchants.map(m => `
            <button class="menu-item" data-action="nav" data-view="merchantRenameForm" data-oldname="${escapeHtml(m)}">
              <span>${escapeHtml(m)}</span><span class="chev">&#8250;</span>
            </button>`).join('')}
        </nav>` : `<div class="empty-state">No merchants yet.</div>`
    };
  },

  merchantRenameForm(p) {
    return {
      title: 'Rename Merchant',
      back: true,
      html: `
        <form class="form" id="merchRenameForm">
          <div id="formError" class="form-error" hidden></div>
          <label class="field">
            <span class="field__label">New name for "${escapeHtml(p.oldname)}"</span>
            <input type="text" id="merchNewName" value="${escapeHtml(p.oldname)}" required autofocus>
          </label>
          <div class="form-actions">
            <button type="button" class="btn btn--ghost" data-action="goBack">Cancel</button>
            <button type="submit" class="btn btn--primary">Save</button>
          </div>
        </form>`,
      afterRender() {
        document.getElementById('merchRenameForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const newName = document.getElementById('merchNewName').value;
          const confirmed = await showConfirm(`Rename "${p.oldname}" to "${newName.trim()}"? This updates all past expenses.`);
          if (!confirmed) return;
          const res = Store.renameMerchant(p.oldname, newName);
          if (!res.ok) { showFormError(res.error); return; }
          showToast('Merchant renamed.');
          popToView('categoriesMenu');
        });
      }
    };
  },

  merchantDeleteList() {
    const merchants = Store.getMerchants();
    return {
      title: 'Delete Merchant',
      back: true,
      html: merchants.length ? `
        <nav class="menu-list">
          ${merchants.map(m => `
            <button class="menu-item menu-item--danger" data-action="deleteMerchant" data-name="${escapeHtml(m)}">
              <span>${escapeHtml(m)}</span><span class="chev">&#8250;</span>
            </button>`).join('')}
        </nav>` : `<div class="empty-state">No merchants yet.</div>`
    };
  },

  expensesList(p) {
    const month = p.month || Store.currentMonthISO();
    const items = Store.getExpensesForMonth(month);
    return {
      title: 'View / Edit Expenses',
      back: true,
      html: `
        <div class="toolbar">
          <input type="month" id="monthPicker" value="${month}">
        </div>
        ${items.length === 0 ? `<div class="empty-state">No expenses in ${monthLabel(month)}.</div>` : `
        <ul class="expense-list">
          ${items.map(e => `
            <li class="expense-row" data-action="nav" data-view="expenseEdit" data-id="${e.id}">
              <div class="expense-row__main">
                <span class="expense-row__cat">${escapeHtml(e.category)}${e.merchant ? ` <span class="expense-row__merchant">&middot; ${escapeHtml(e.merchant)}</span>` : ''}</span>
                <span class="expense-row__date">${formatDateDisplay(e.date)}</span>
                ${e.note ? `<span class="expense-row__note">${escapeHtml(e.note)}</span>` : ''}
              </div>
              <span class="expense-row__amt">${formatTHB(e.amount)}</span>
            </li>`).join('')}
        </ul>`}`,
      afterRender() {
        document.getElementById('monthPicker').addEventListener('change', (e) => {
          replaceTop('expensesList', { month: e.target.value });
        });
      }
    };
  },

  searchExpenses(p) {
    const curr = Store.currentMonthISO();
    const [y, m] = curr.split('-').map(Number);
    const startDate = new Date(y, m - 1 - 5, 1);
    const defaultStart = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

    const startMonth = p.startMonth || defaultStart;
    const endMonth = p.endMonth || curr;
    const query = p.query || '';

    return {
      title: 'Search Expenses',
      back: true,
      html: `
        <div class="search-panel">
          <div class="search-range">
            <label class="field">
              <span class="field__label">From Month</span>
              <input type="month" id="searchStartMonth" value="${startMonth}">
            </label>
            <label class="field">
              <span class="field__label">To Month</span>
              <input type="month" id="searchEndMonth" value="${endMonth}">
            </label>
          </div>
          <label class="field">
            <span class="field__label">Search Text</span>
            <input type="text" id="searchInput" value="${escapeHtml(query)}" placeholder="Category, merchant, note, amount&hellip;" autofocus autocomplete="off">
          </label>
        </div>
        <div id="searchResultsContainer"></div>`,
      afterRender() {
        const startInput = document.getElementById('searchStartMonth');
        const endInput = document.getElementById('searchEndMonth');
        const qInput = document.getElementById('searchInput');
        const resultsContainer = document.getElementById('searchResultsContainer');

        function renderResults() {
          const sm = startInput.value;
          const em = endInput.value;
          const q = qInput.value;
          topScreen().startMonth = sm;
          topScreen().endMonth = em;
          topScreen().query = q;

          if (!q.trim()) {
            resultsContainer.innerHTML = `<div class="empty-state">Enter text to search expenses.</div>`;
            return;
          }

          if (sm && em && sm > em) {
            resultsContainer.innerHTML = `<div class="form-error">"From Month" must be before or equal to "To Month".</div>`;
            return;
          }

          const results = Store.searchExpenses(sm, em, q);
          if (results.length === 0) {
            resultsContainer.innerHTML = `<div class="empty-state">No matching expenses found.</div>`;
            return;
          }

          resultsContainer.innerHTML = `
            <div class="search-results-info">Found ${results.length} item${results.length === 1 ? '' : 's'}</div>
            <ul class="expense-list">
              ${results.map(e => `
                <li class="expense-row" data-action="nav" data-view="expenseEdit" data-id="${e.id}">
                  <div class="expense-row__main">
                    <span class="expense-row__cat">${escapeHtml(e.category)}${e.merchant ? ` <span class="expense-row__merchant">&middot; ${escapeHtml(e.merchant)}</span>` : ''}</span>
                    <span class="expense-row__date">${formatDateDisplay(e.date)}</span>
                    ${e.note ? `<span class="expense-row__note">${escapeHtml(e.note)}</span>` : ''}
                  </div>
                  <span class="expense-row__amt">${formatTHB(e.amount)}</span>
                </li>`).join('')}
            </ul>`;
        }

        startInput.addEventListener('change', renderResults);
        endInput.addEventListener('change', renderResults);
        qInput.addEventListener('input', renderResults);

        renderResults();
      }
    };
  },

  expenseEdit(p) {
    const record = Store.getExpenses().find(e => e.id === p.id);
    if (!record) {
      return { title: 'Edit Expense', back: true, html: `<div class="empty-state">This expense no longer exists.</div>` };
    }
    return {
      title: 'Edit Expense',
      back: true,
      html: `
        <form class="form" id="expenseEditForm">
          <div id="formError" class="form-error" hidden></div>
          <label class="field">
            <span class="field__label">Date</span>
            <input type="date" id="editDate" value="${record.date}" max="${Store.todayISO()}" required>
          </label>
          <label class="field">
            <span class="field__label">Expense (THB)</span>
            <input type="number" id="editAmount" inputmode="decimal" step="0.01" min="0.01" value="${record.amount}" required>
          </label>
          <label class="field">
            <span class="field__label">Category</span>
            <select id="editCategory" required>${categoryOptionsHtml(record.category, record.category)}</select>
          </label>
          <label class="field">
            <span class="field__label">Merchant (optional)</span>
            <input type="text" id="editMerchant" list="merchantList" value="${escapeHtml(record.merchant || '')}" placeholder="e.g. Shopee, Lazada&hellip;" autocomplete="off">
          </label>
          ${merchantDatalistHtml()}
          <label class="field">
            <span class="field__label">Note (optional)</span>
            <textarea id="editNote" rows="2" placeholder="Add a note&hellip;">${escapeHtml(record.note || '')}</textarea>
          </label>
          <div class="form-actions">
            <button type="button" class="btn btn--danger" id="deleteExpBtn">Delete</button>
            <button type="submit" class="btn btn--primary">Save</button>
          </div>
        </form>`,
      afterRender() {
        document.getElementById('expenseEditForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const date = document.getElementById('editDate').value;
          const amount = document.getElementById('editAmount').value;
          const category = document.getElementById('editCategory').value;
          const merchant = document.getElementById('editMerchant').value;
          const note = document.getElementById('editNote').value;
          const res = Store.updateExpense(record.id, { date, amount, category, merchant, note });
          if (!res.ok) { showFormError(res.error); return; }
          showToast('Expense updated.');
          goBack();
        });
        document.getElementById('deleteExpBtn').addEventListener('click', async () => {
          const confirmed = await showConfirm('Delete this expense? This cannot be undone.', { danger: true, yesLabel: 'Delete' });
          if (!confirmed) return;
          Store.deleteExpense(record.id);
          showToast('Expense deleted.');
          goBack();
        });
      }
    };
  },

  summaryMenu() {
    return {
      title: 'Summary',
      back: true,
      html: `
        <nav class="menu-list">
          <button class="menu-item" data-action="currentMonth" data-mode="display">
            <span>Display Current Month</span><span class="chev">&#8250;</span>
          </button>
          <button class="menu-item" data-action="nav" data-view="rangePicker" data-mode="display">
            <span>Display Period&hellip;</span><span class="chev">&#8250;</span>
          </button>
          <button class="menu-item" data-action="nav" data-view="periodChoice" data-mode="csv">
            <span>Save to CSV</span><span class="chev">&#8250;</span>
          </button>
        </nav>`
    };
  },

  periodChoice(p) {
    return {
      title: 'Save to CSV',
      back: true,
      html: `
        <nav class="menu-list">
          <button class="menu-item" data-action="currentMonth" data-mode="${p.mode}">
            <span>Current Month</span><span class="chev">&#8250;</span>
          </button>
          <button class="menu-item" data-action="nav" data-view="rangePicker" data-mode="${p.mode}">
            <span>Choose Period</span><span class="chev">&#8250;</span>
          </button>
        </nav>`
    };
  },

  rangePicker(p) {
    const today = Store.todayISO();
    const firstOfMonth = today.slice(0, 8) + '01';
    return {
      title: 'Choose Period',
      back: true,
      html: `
        <form class="form" id="rangeForm">
          <div id="formError" class="form-error" hidden></div>
          <label class="field">
            <span class="field__label">From</span>
            <input type="date" id="rangeStart" value="${firstOfMonth}" max="${today}" required>
          </label>
          <label class="field">
            <span class="field__label">To</span>
            <input type="date" id="rangeEnd" value="${today}" max="${today}" required>
          </label>
          <div class="form-actions">
            <button type="button" class="btn btn--ghost" data-action="goBack">Cancel</button>
            <button type="submit" class="btn btn--primary">${p.mode === 'csv' ? 'Export CSV' : 'Show'}</button>
          </div>
        </form>`,
      afterRender() {
        document.getElementById('rangeForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const start = document.getElementById('rangeStart').value;
          const end = document.getElementById('rangeEnd').value;
          if (start > end) { showFormError('"From" date must be before "To" date.'); return; }
          if (p.mode === 'csv') {
            navigate('csvTypeChoice', { start, end, returnTo: 'summaryMenu' });
          } else {
            navigate('summaryResult', { start, end });
          }
        });
      }
    };
  },

  summaryResult(p) {
    const items = Store.getExpensesInRange(p.start, p.end);
    const rows = Store.summarizeByCategoryAndMerchant(items);
    const total = Store.grandTotal(items);
    const showMerchants = Store.getShowMerchants();
    return {
      title: 'Summary',
      back: true,
      html: `
        <div class="summary-toolbar">
          <div class="period-label">${formatDateDisplay(p.start)} &ndash; ${formatDateDisplay(p.end)}</div>
          <label class="toggle-control">
            <input type="checkbox" id="toggleMerchants" ${showMerchants ? 'checked' : ''}>
            <span class="toggle-switch"></span>
            <span class="toggle-label">Show Merchant</span>
          </label>
        </div>
        ${renderSummaryTable(rows, total, showMerchants)}
        ${rows.length ? `<div class="form-actions"><button class="btn btn--primary" data-action="nav" data-view="csvTypeChoice" data-start="${p.start}" data-end="${p.end}">Save to CSV</button></div>` : ''}`,
      afterRender() {
        const toggle = document.getElementById('toggleMerchants');
        if (toggle) {
          toggle.addEventListener('change', (e) => {
            const show = e.target.checked;
            Store.setShowMerchants(show);
            const table = document.querySelector('.summary-table');
            if (table) {
              table.classList.toggle('hide-merchants', !show);
            }
          });
        }
      }
    };
  },

  csvTypeChoice(p) {
    return {
      title: 'Save to CSV',
      back: true,
      html: `
        <div class="period-label">${formatDateDisplay(p.start)} &ndash; ${formatDateDisplay(p.end)}</div>
        <nav class="menu-list">
          <button class="menu-item" data-action="exportCSVChoice" data-start="${p.start}" data-end="${p.end}" data-csvtype="summary" data-returnto="${p.returnTo || ''}">
            <span>Summary</span><span class="chev">&#8250;</span>
          </button>
          <button class="menu-item" data-action="exportCSVChoice" data-start="${p.start}" data-end="${p.end}" data-csvtype="detailed" data-returnto="${p.returnTo || ''}">
            <span>Detailed Expense List</span><span class="chev">&#8250;</span>
          </button>
          <button class="menu-item" data-action="exportCSVChoice" data-start="${p.start}" data-end="${p.end}" data-csvtype="both" data-returnto="${p.returnTo || ''}">
            <span>Both</span><span class="chev">&#8250;</span>
          </button>
        </nav>`
    };
  },

  backup() {
    return {
      title: 'Backup & Restore',
      back: true,
      html: `
        <section class="backup-section">
          <h2 class="section-title">Export</h2>
          <p class="section-hint">Saves all categories and expenses to one JSON file. Keep it somewhere safe &mdash; this is your only way to recover data if it's ever cleared from this iPhone.</p>
          <button class="btn btn--primary" data-action="exportBackup">Export All Data (JSON)</button>
        </section>
        <section class="backup-section">
          <h2 class="section-title">Restore</h2>
          <p class="section-hint">Restoring will overwrite everything currently on this device.</p>
          <label class="btn btn--ghost file-btn">
            Choose Backup File
            <input type="file" id="restoreFile" accept="application/json,.json" hidden>
          </label>
        </section>`,
      afterRender() {
        document.getElementById('restoreFile').addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const text = await file.text();
          const confirmed = await showConfirm('This will overwrite all current data with the backup file. Continue?', { danger: true, yesLabel: 'Restore' });
          if (!confirmed) { e.target.value = ''; return; }
          const res = Store.importBackup(text);
          e.target.value = '';
          if (!res.ok) { showToast(res.error, true); return; }
          showToast('Data restored.');
          goHome();
        });
      }
    };
  }
};

/* ---------------- actions used from data-action delegation ---------------- */

function showFormError(msg) {
  const el = document.getElementById('formError');
  if (!el) { showToast(msg, true); return; }
  el.textContent = msg;
  el.hidden = false;
}

function exportCSVForRange(start, end, csvType) {
  const items = Store.getExpensesInRange(start, end);
  const label = `${start}_to_${end}`;
  if (csvType === 'summary' || csvType === 'both') {
    const rows = Store.summarizeByCategoryAndMerchant(items);
    downloadTextFile(`expenses_summary_${label}.csv`, 'text/csv', Store.summaryToCSV(rows));
  }
  if (csvType === 'detailed' || csvType === 'both') {
    downloadTextFile(`expenses_detailed_${label}.csv`, 'text/csv', Store.expensesToCSV(items));
  }
}

async function handleAction(actionEl) {
  const action = actionEl.dataset.action;

  if (action === 'nav') {
    navigate(actionEl.dataset.view, { ...actionEl.dataset });
    return;
  }
  if (action === 'goBack') { goBack(); return; }

  if (action === 'currentMonth') {
    const month = Store.currentMonthISO();
    const [y, m] = month.split('-');
    const start = `${y}-${m}-01`;
    const end = Store.todayISO();
    if (actionEl.dataset.mode === 'csv') {
      navigate('csvTypeChoice', { start, end, returnTo: 'summaryMenu' });
    } else {
      navigate('summaryResult', { start, end });
    }
    return;
  }

  if (action === 'exportCSVChoice') {
    const { start, end, csvtype, returnto } = actionEl.dataset;
    exportCSVForRange(start, end, csvtype);
    showToast('CSV downloaded.');
    if (returnto) popToView(returnto); else goBack();
    return;
  }

  if (action === 'exportBackup') {
    const json = Store.exportBackup();
    downloadTextFile(`expense_tracker_backup_${Store.todayISO()}.json`, 'application/json', json);
    showToast('Backup downloaded.');
    return;
  }

  if (action === 'deleteCategory') {
    const name = actionEl.dataset.name;
    const confirmed = await showConfirm(
      `Delete category "${name}"? Past expenses in this category will be moved to "${Store.RESERVED_CATEGORY}".`,
      { danger: true, yesLabel: 'Delete' }
    );
    if (!confirmed) return;
    Store.deleteCategory(name);
    showToast('Category deleted.');
    popToView('categoriesMenu');
    return;
  }

  if (action === 'deleteMerchant') {
    const name = actionEl.dataset.name;
    const confirmed = await showConfirm(
      `Delete merchant "${name}"? Past expenses keep this merchant text — it just stops appearing as a suggestion.`,
      { danger: true, yesLabel: 'Delete' }
    );
    if (!confirmed) return;
    Store.deleteMerchant(name);
    showToast('Merchant deleted.');
    popToView('categoriesMenu');
    return;
  }
}

appEl.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) handleAction(actionEl);
});

backBtn.addEventListener('click', goBack);
if (searchBtn) {
  searchBtn.addEventListener('click', () => {
    const currentScreen = topScreen();
    const currentMonth = currentScreen.month || Store.currentMonthISO();
    navigate('searchExpenses', { startMonth: currentMonth, endMonth: Store.currentMonthISO() });
  });
}

/* ---------------- render loop ---------------- */

function render() {
  const screenState = topScreen();
  const screen = Screens[screenState.view](screenState);
  titleEl.textContent = screen.title;
  backBtn.hidden = !screen.back;
  if (searchBtn) searchBtn.hidden = (screenState.view !== 'expensesList' && screenState.view !== 'home');
  appEl.innerHTML = screen.html;
  if (screen.afterRender) screen.afterRender();
  appEl.scrollTop = 0;
}

render();
