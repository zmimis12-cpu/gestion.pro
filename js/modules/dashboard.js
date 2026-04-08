/* ================================================================
   GestionPro — modules/dashboard.js
   Tableau de bord : getAlerts, updateAlertCount, renderAlerts,
   setDashPeriod, getDashSales, renderDashboard
================================================================ */

function getAlerts() {
  // Alertes sur produits uniques (stock total toutes zones)
  const groupMap = new Map();
  products.forEach(p => {
    const key = (p.code&&p.code.trim()) ? p.code.trim().toLowerCase() : p.name.trim().toLowerCase();
    if (!groupMap.has(key)) groupMap.set(key, { ...p, _total: p.stock });
    else groupMap.get(key)._total += p.stock;
  });
  return [...groupMap.values()].filter(g => g._total <= g.minStock);
}

function updateAlertCount() {
  const count = getAlerts().length;
  document.getElementById('alert-count').textContent = count;
  document.getElementById('alert-count').style.display = count > 0 ? 'inline' : 'none';
}

function renderAlerts() {
  const alerts = getAlerts();
  const container = document.getElementById('alerts-list');
  if (!alerts.length) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">✅</div><p>${t('no_alerts')}</p></div>`;
    return;
  }
  container.innerHTML = alerts.map(p => {
    const urgent = p.stock === 0;
    return `
      <div class="alert-item ${urgent ? 'urgent' : 'warn'}">
        <div class="alert-icon">${urgent ? '🔴' : '🟡'}</div>
        <div class="alert-info">
          <div class="alert-name">${escapeHTML(p.name)}</div>
          <div class="alert-detail">
            ${t('alert_current_stock')} : <strong>${p.stock} ${p.unit}</strong> —
            ${t('alert_min_req')} : <strong>${p.minStock} ${p.unit}</strong> —
            ${t('alert_to_order')} : <strong>${Math.max(0, p.minStock - p.stock + 10)} ${p.unit}</strong>
          </div>
        </div>
        <div class="alert-action">
          <span class="chip ${urgent ? 'chip-red' : 'chip-orange'}">${urgent ? t('alert_rupture') : t('alert_low')}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ─── DASHBOARD ───
let DASH_PERIOD = 'today'; // today | week | month | year | all

function setDashPeriod(period) {
  DASH_PERIOD = period;
  // Update button styles
  ['today','week','month','year','all'].forEach(p => {
    const btn = document.getElementById('dp-' + p);
    if (!btn) return;
    if (p === period) {
      btn.style.background = 'rgba(37,99,235,0.15)';
      btn.style.borderColor = 'rgba(37,99,235,0.4)';
      btn.style.color = 'var(--accent)';
    } else {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'var(--border)';
      btn.style.color = 'var(--text2)';
    }
  });
  renderDashboard();
}

function getDashSales() {
  const now = new Date();
  const today = now.toDateString();
  switch(DASH_PERIOD) {
    case 'today':
      return sales.filter(s => new Date(s.date).toDateString() === today);
    case 'week': {
      const startWeek = new Date(now); startWeek.setDate(now.getDate() - now.getDay());
      startWeek.setHours(0,0,0,0);
      return sales.filter(s => new Date(s.date) >= startWeek);
    }
    case 'month': {
      return sales.filter(s => {
        const d = new Date(s.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    }
    case 'year': {
      return sales.filter(s => new Date(s.date).getFullYear() === now.getFullYear());
    }
    case 'all':
      return sales;
    default:
      return sales.filter(s => new Date(s.date).toDateString() === today);
  }
}

function getDashPeriodLabel() {
  switch(DASH_PERIOD) {
    case 'today': return "Ventes aujourd'hui";
    case 'week': return 'Ventes cette semaine';
    case 'month': return 'Ventes ce mois';
    case 'year': return 'Ventes cette année';
    case 'all': return 'Toutes les ventes';
    default: return "Ventes aujourd'hui";
  }
}

function renderDashboard() {
  const today = new Date().toDateString();
  const todaySales = getDashSales();
  const todayTotal = todaySales.reduce((sum, s) => sum + s.total, 0);

  document.getElementById('stat-today').textContent = fmt(todayTotal);
  document.getElementById('stat-today-count').textContent = `${todaySales.length} ${t('dash_transactions')}`;
  const labelEl = document.getElementById('stat-label-today');
  if (labelEl) labelEl.textContent = getDashPeriodLabel();
  // Compter les produits uniques (groupés par code ou nom)
  const uniqueProds = new Set(products.map(p => (p.code&&p.code.trim()) ? p.code.trim().toLowerCase() : p.name.trim().toLowerCase())).size;
  document.getElementById('stat-products').textContent = uniqueProds;
  document.getElementById('stat-low-stock').textContent = `${getAlerts().length} ${t('dash_alerts')}`;
  document.getElementById('stat-clients').textContent = clients.length;
  document.getElementById('stat-vip').textContent = `${clients.filter(c => sales.filter(s => s.clientId === c.id).reduce((sum, s) => sum + s.total, 0) >= 2000).length} ${t('vip')}`;

  const totalCredit = clients.reduce((sum, c) => sum + (c.creditUsed || 0), 0);
  const creditClients = clients.filter(c => c.creditUsed > 0).length;
  document.getElementById('stat-credit').textContent = fmt(totalCredit);
  document.getElementById('stat-credit-count').textContent = `${creditClients} ${t('dash_clients_label')}`;

  // Recent sales
  const recentSales = getDashSales().slice(0, 6);
  const salesDiv = document.getElementById('dashboard-sales-list');
  if (!recentSales.length) {
    salesDiv.innerHTML = `<div class="empty-state"><div class="emoji">🧾</div><p>${t('dash_no_sales')}</p></div>`;
  } else {
    salesDiv.innerHTML = `<table>
      <thead><tr><th>${t('dash_date')}</th><th>${t('dash_client')}</th><th>${t('dash_total')}</th><th>${t('dash_payment')}</th></tr></thead>
      <tbody>
        ${recentSales.map(s => `
          <tr>
            <td style="font-size:12px;color:var(--text2);">${new Date(s.date).toLocaleString('fr-FR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
            <td>${s.clientName && s.clientName !== 'undefined' ? escapeHTML(s.clientName) : s.clientId ? (clients.find(c => c.id === s.clientId)?.name || '—') : 'Client de passage'}</td>
            <td style="font-family:var(--font-mono),monospace;font-weight:700;">${s.total.toFixed(2)}</td>
            <td><span class="chip ${s.payment === 'Crédit' ? 'chip-gold' : s.payment === 'Carte' ? 'chip-purple' : 'chip-green'}">${s.payment === 'Espèces' ? t('pay_cash').replace('💵 ','') : s.payment === 'Carte' ? t('pay_card').replace('💳 ','') : t('pay_credit').replace('📋 ','')}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  }

  // Rapports
  initRapportMonthSelect();
  renderRapports();

  // Alerts in dashboard
  const alerts = getAlerts().slice(0, 5);
  const alertsDiv = document.getElementById('dashboard-alerts-list');
  if (!alerts.length) {
    alertsDiv.innerHTML = `<div class="empty-state"><div class="emoji">✅</div><p>${t('dash_stock_ok')}</p></div>`;
  } else {
    alertsDiv.innerHTML = alerts.map(p => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px;background:var(--surface2);border-radius:8px;margin-bottom:8px;">
        <span style="font-size:18px;">${p.stock === 0 ? '🔴' : '🟡'}</span>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;">${escapeHTML(p.name)}</div>
          <div style="font-size:11px;color:var(--text2);">Stock: ${p.stock} / Min: ${p.minStock}</div>
        </div>
        <span class="chip ${p.stock === 0 ? 'chip-red' : 'chip-orange'}">${p.stock === 0 ? t('stat_rupture') : t('stat_bas')}</span>
      </div>
    `).join('');
  }
}






// ╔══════════════════════════════════════════════════════════════╗
// ║                    GESTION DES DÉPENSES                      ║
// ╚══════════════════════════════════════════════════════════════╝

const DEP_CATS = {
  'Loyer':        '🏠', 'Électricité': '⚡', 'Eau':       '💧',
  'Internet':     '📶', 'Salaires':    '👨‍💼', 'Transport': '🚗',
  'Fournitures':  '📦', 'Marketing':   '📢', 'Maintenance':'🔧',
  'Impôts':       '🏛️', 'Autre':       '📋'
};
