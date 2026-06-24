// VCare ERP Client Scripts

function erpShell(opts = {}) {
  return {
    activeModule: opts.activeModule || 'dashboard',
    mobileNav: false,
    modal: { open: false, title: '', subtitle: '', size: 'md' },
    toasts: [],
    toastSeq: 0,
    init() {
      document.body.addEventListener('htmx:configRequest', (e) => {
        e.detail.headers['X-Requested-With'] = 'XMLHttpRequest';
      });

      document.body.addEventListener('htmx:afterSwap', (e) => {
        if (e.detail.target?.id === 'erp-modal-body' && window.Alpine) {
          Alpine.initTree(e.detail.target);
        }
        document.querySelectorAll('[data-currency]').forEach((el) => {
          if (el.dataset.currencyBound) return;
          el.dataset.currencyBound = '1';
          el.addEventListener('blur', () => {
            const val = parseFloat(el.value.replace(/[^0-9.]/g, ''));
            if (!isNaN(val)) el.value = val.toFixed(2);
          });
        });
      });

      document.body.addEventListener('htmx:responseError', () => {
        this.showToast({ type: 'error', message: 'Something went wrong. Please try again.' });
      });
    },
    setModule(id) {
      this.activeModule = id;
      this.mobileNav = true;
    },
    showToast({ type = 'info', message = '' }) {
      const id = ++this.toastSeq;
      this.toasts.push({ id, type, message });
      setTimeout(() => this.dismissToast(id), 6000);
    },
    dismissToast(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },
    openModal(detail = {}) {
      this.modal = {
        open: true,
        title: detail.title || 'Form',
        subtitle: detail.subtitle || '',
        size: detail.size || 'md',
      };
      document.body.classList.add('overflow-hidden');
      const body = document.getElementById('erp-modal-body');
      if (body && detail.url) {
        body.innerHTML = '<div class="erp-modal-loading"><div class="erp-spinner"></div><span>Loading…</span></div>';
        htmx.ajax('GET', detail.url, { target: '#erp-modal-body', swap: 'innerHTML' });
      }
    },
    closeModal() {
      this.modal.open = false;
      document.body.classList.remove('overflow-hidden');
      const body = document.getElementById('erp-modal-body');
      if (body) body.innerHTML = '';
    },
  };
}

window.erpShell = erpShell;

/** Safe Chart.js factory — avoids responsive resize feedback loops */
window.erpCreateChart = function erpCreateChart(canvasOrId, config) {
  if (!window.Chart) return null;
  const el = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
  if (!el) return null;
  el.removeAttribute('height');
  el.removeAttribute('width');
  const parent = el.parentElement;
  if (parent && !parent.classList.contains('erp-chart-wrap')) {
    const wrap = document.createElement('div');
    wrap.className = 'erp-chart-wrap erp-chart-wrap-md';
    parent.insertBefore(wrap, el);
    wrap.appendChild(el);
  }
  return new Chart(el, {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      animation: { duration: 350 },
      ...config.options,
    },
  });
};

document.addEventListener('erp-close-modal', () => {
  const root = document.body;
  if (root._x_dataStack?.[0]?.closeModal) root._x_dataStack[0].closeModal();
});

document.querySelectorAll('[data-currency]').forEach((el) => {
  el.addEventListener('blur', () => {
    const val = parseFloat(el.value.replace(/[^0-9.]/g, ''));
    if (!isNaN(val)) el.value = val.toFixed(2);
  });
});

window.billCalculator = {
  items: [],
  async addItem(item, customerCategory) {
    try {
      const res = await fetch('/billing/preview-discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          itemType: item.itemType,
          itemCode: item.itemCode,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          category: item.category || customerCategory || 'ALL',
        }),
      });
      if (res.ok) {
        const disc = await res.json();
        item.discount = disc.amount || 0;
        item.discountSource = disc.source;
        item.discountPercent = disc.percent;
      }
    } catch (_) { /* proceed without discount */ }
    this.items.push(item);
    this.render();
  },
  removeItem(index) {
    this.items.splice(index, 1);
    this.render();
  },
  render() {
    const tbody = document.getElementById('bill-items-body');
    const input = document.getElementById('bill-items-json');
    if (!tbody || !input) return;

    let subtotal = 0;
    let tax = 0;
    let lineDiscount = 0;
    if (this.items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="erp-empty-cell">Add items to the bill</td></tr>';
    } else {
      tbody.innerHTML = this.items.map((item, i) => {
        const line = item.quantity * item.unitPrice - (item.discount || 0);
        const lineTax = line * ((item.taxRate || 18) / 100);
        subtotal += item.quantity * item.unitPrice;
        lineDiscount += item.discount || 0;
        tax += lineTax;
        const discLabel = item.discountSource ? `<div class="text-[10px] text-emerald-600">${item.discountSource}</div>` : '';
        return `<tr>
          <td>${item.itemName}${discLabel}</td>
          <td>${item.quantity}</td>
          <td>₹${item.unitPrice.toLocaleString('en-IN')}</td>
          <td class="text-emerald-600">${item.discount ? '−₹' + item.discount.toLocaleString('en-IN') : '—'}</td>
          <td>₹${lineTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
          <td class="font-medium">₹${(line + lineTax).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
          <td><button type="button" onclick="billCalculator.removeItem(${i})" class="text-red-500 hover:text-red-700 text-xs">Remove</button></td>
        </tr>`;
      }).join('');
    }

    input.value = JSON.stringify(this.items);
    const extraDisc = parseFloat(document.getElementById('bill-extra-discount')?.value) || 0;
    const netSubtotal = subtotal - lineDiscount;
    const total = netSubtotal + tax - extraDisc;
    const el = (id, val) => {
      const e = document.getElementById(id);
      if (e) e.textContent = '₹' + val.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    };
    el('bill-subtotal', subtotal);
    el('bill-line-discount', lineDiscount);
    el('bill-tax', tax);
    el('bill-total', Math.max(0, total));
  },
};
