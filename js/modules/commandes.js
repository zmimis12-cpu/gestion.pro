/* ================================================================
   GestionPro — modules/commandes.js
   Commandes / Ordres ventes : renderCommandes, showSaleDoc,
   printRapport, ouvrirCaisse, cloturerCaisse, deleteCaisseOp
================================================================ */

// ════════════════════════════════════════════
// COMMANDES / ORDRES VENTES
// ════════════════════════════════════════════
function renderCommandes(resetPage) {
  if (resetPage !== false) _pages['commandes'] = 1;
  const q      = (document.getElementById('cmd-search')?.value || '').toLowerCase();
  const payF   = document.getElementById('cmd-filter-pay')?.value || 'all';
  const from   = document.getElementById('cmd-date-from')?.value;
  const to     = document.getElementById('cmd-date-to')?.value;

  let filtered = [...sales];
  if (q)    filtered = filtered.filter(s => s.clientName?.toLowerCase().includes(q) || s.id?.toLowerCase().includes(q));
  if (payF !== 'all') filtered = filtered.filter(s => s.payment === payF);
  if (from) filtered = filtered.filter(s => new Date(s.date) >= new Date(from));
  if (to)   filtered = filtered.filter(s => new Date(s.date) <= new Date(to + 'T23:59:59'));

  // Stats
  const statsEl = document.getElementById('cmd-stats');
  if (statsEl) {
    const totalCA   = filtered.reduce((s,v) => s + v.total, 0);
    const totalEsp  = filtered.filter(v => v.payment === 'Espèces').reduce((s,v) => s + v.total, 0);
    const totalCrt  = filtered.filter(v => v.payment === 'Carte').reduce((s,v) => s + v.total, 0);
    const totalCred = filtered.filter(v => v.payment === 'Crédit').reduce((s,v) => s + v.total, 0);
    statsEl.innerHTML = `
      <div class="stat-card green">
        <div class="stat-icon">📋</div>
        <div class="stat-value">${filtered.length}</div>
        <div class="stat-label">Ordres affichés</div>
        <div class="stat-sub">CA : ${totalCA.toFixed(2)} MAD</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💵</div>
        <div class="stat-value">${totalEsp.toFixed(0)}</div>
        <div class="stat-label">Espèces (MAD)</div>
        <div class="stat-sub">${filtered.filter(v=>v.payment==='Espèces').length} ordres</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-icon">💳</div>
        <div class="stat-value">${totalCrt.toFixed(0)}</div>
        <div class="stat-label">Carte (MAD)</div>
        <div class="stat-sub">${filtered.filter(v=>v.payment==='Carte').length} ordres</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-icon">📋</div>
        <div class="stat-value">${totalCred.toFixed(0)}</div>
        <div class="stat-label">Crédit (MAD)</div>
        <div class="stat-sub">${filtered.filter(v=>v.payment==='Crédit').length} ordres</div>
      </div>
    `;
  }

  // Count label
  const lbl = document.getElementById('cmd-count-label');
  if (lbl) lbl.textContent = `${filtered.length} ordre(s) trouvé(s)`;

  const tbody = document.getElementById('commandes-table');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="emoji">📋</div><p>${t('ord_no_orders')}</p></div></td></tr>`;
    document.getElementById('commandes-pagination').innerHTML = '';
    return;
  }

  // Pagination
  const cmdPage = getPage('commandes');
  const cmdStart = (cmdPage - 1) * PAGE_SIZE;
  const pageData = filtered.slice(cmdStart, cmdStart + PAGE_SIZE);

  tbody.innerHTML = pageData.map(s => {
    const date = new Date(s.date);
    const dateStr = date.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'2-digit'});
    const timeStr = date.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});
    const ht = (s.totalHT || s.total).toFixed(2);
    const tva = s.tvaAmount > 0 ? s.tvaAmount.toFixed(2) : '—';
    const ttc = s.total.toFixed(2);
    const payChip = s.payment === 'Espèces' ? 'chip-green' : s.payment === 'Carte' ? 'chip-purple' : 'chip-gold';
    const num = 'ORD-' + String(sales.indexOf(s) + 1).padStart(4,'0');
    return `<tr>
      <td style="font-family:var(--font-mono),monospace;font-weight:700;font-size:12px;">${num}</td>
      <td style="font-size:12px;color:var(--text2);">${dateStr}<br><span style="font-size:11px;">${timeStr}</span></td>
      <td style="font-weight:600;">${s.clientName}</td>
      <td style="font-size:12px;color:var(--text2);">${s.items.length} art. • ${s.items.reduce((a,i)=>a+i.qty,0)} pcs</td>
      <td style="text-align:right;font-family:var(--font-mono),monospace;">${ht}</td>
      <td style="text-align:right;font-family:var(--font-mono),monospace;color:var(--text2);">${tva !== '—' ? s.tva+'% ('+tva+')' : '—'}</td>
      <td style="text-align:right;font-family:var(--font-mono),monospace;font-weight:800;color:var(--accent);">${ttc} MAD</td>
      <td><span class="chip ${payChip}">${s.payment === 'Espèces' ? t('pay_cash').replace('💵 ','') : s.payment === 'Carte' ? t('pay_card').replace('💳 ','') : t('pay_credit').replace('📋 ','')}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn btn-secondary btn-sm" title="Reçu caisse" onclick="showSaleDoc('${s.id}','recu')">🧾</button>
        <button class="btn btn-primary btn-sm" title="Facture A4" onclick="showSaleDoc('${s.id}','facture')">📄</button>
      </td>
    </tr>`;
  }).join('');

  buildPagination('commandes', filtered.length, 'renderCommandes', 'commandes-pagination');
}

function showSaleDoc(saleId, docType) {
  const sale = sales.find(s => s.id === saleId);
  if (!sale) return;
  currentSale = sale;
  currentDocType = docType;
  renderDocPreview();
  openModal('modal-receipt');
}

function printRapport() {
  const content = document.getElementById('rapport-content').innerHTML;
  const htmlStr = `<html><head><title>Rapport Clôture</title>
    <style>
      @page { size: A4; margin: 20mm; }
      body { font-family: Arial, sans-serif; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    </style>
  </head><body>${content}</body></html>`;
  const blob = new Blob([htmlStr], {type:'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.addEventListener('load', () => { win.print(); });
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
}

function ouvrirCaisse() {
  const montant = prompt('💵 Montant de départ en caisse (MAD) :', '0');
  if (montant === null) return;
  const val = parseFloat(montant);
  if (isNaN(val) || val < 0) { toast(t('toast_invalid_amount'), 'error'); return; }
  caisseOps.unshift({
    id: uid(), local_id: getFondsLocalId(), type: 'depot',
    amount: val,
    label: `🔓 Ouverture de caisse — ${new Date().toLocaleDateString('fr-FR')}`,
    date: new Date().toISOString(),
    payment: 'Espèces'
  });
  save();
  toast(`✅ Caisse ouverte avec ${fmt(val)}`);
  renderFonds();
}

function cloturerCaisse() {
  const today = new Date().toDateString();
  const todayOps = caisseOps.filter(o => new Date(o.date).toDateString() === today);

  // Calculate stats
  const ventesEsp   = todayOps.filter(o=>o.type==='vente'&&o.payment==='Espèces').reduce((s,o)=>s+o.amount,0);
  const ventesCarte = todayOps.filter(o=>o.type==='vente'&&o.payment==='Carte').reduce((s,o)=>s+o.amount,0);
  const ventesCredit= todayOps.filter(o=>o.type==='vente'&&o.payment==='Crédit').reduce((s,o)=>s+o.amount,0);
  const depots      = todayOps.filter(o=>o.type==='depot'&&!o.label.includes('Ouverture')).reduce((s,o)=>s+o.amount,0);
  const ouverture   = todayOps.filter(o=>o.type==='depot'&&o.label.includes('Ouverture')).reduce((s,o)=>s+o.amount,0);
  const retraits    = todayOps.filter(o=>o.type==='retrait').reduce((s,o)=>s+o.amount,0);
  const charges     = todayOps.filter(o=>o.type==='charge').reduce((s,o)=>s+o.amount,0);
  const soldeFinal  = ouverture + ventesEsp + depots - retraits - charges;
  const totalVentes = ventesEsp + ventesCarte + ventesCredit;
  const dateStr     = new Date().toLocaleDateString('fr-FR', {weekday:'long',day:'2-digit',month:'long',year:'numeric'});

  // Show rapport modal
  const rapport = `
    <div style="font-family:var(--font),sans-serif;color:#222;padding:8px;">
      <div style="text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #1a3a6b;">
        <div style="font-size:22px;font-weight:700;color:#1a3a6b;">🔒 Rapport de Clôture</div>
        <div style="font-size:13px;color:#888;margin-top:4px;text-transform:capitalize;">${dateStr}</div>
        <div style="font-size:13px;font-weight:700;color:#222;margin-top:2px;">${settings.storeName || 'GestionPro'}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px;">
        <div style="background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.25);border-radius:8px;padding:12px;">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Fond d'ouverture</div>
          <div style="font-size:18px;font-weight:800;color:var(--accent);margin-top:2px;">${ouverture.toFixed(2)} MAD</div>
        </div>
        <div style="background:rgba(108,99,255,0.08);border:1px solid rgba(108,99,255,0.25);border-radius:8px;padding:12px;">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Total ventes</div>
          <div style="font-size:18px;font-weight:800;color:#1a3a6b;margin-top:2px;">${totalVentes.toFixed(2)} MAD</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
        <tr style="background:var(--surface2);">
          <td style="padding:8px 12px;border:1px solid var(--border);">🧾 Ventes espèces</td>
          <td style="padding:8px 12px;border:1px solid var(--border);text-align:right;font-weight:700;color:var(--accent);">+${ventesEsp.toFixed(2)} MAD</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border:1px solid var(--border);">💳 Ventes carte</td>
          <td style="padding:8px 12px;border:1px solid var(--border);text-align:right;font-weight:700;color:var(--purple);">+${ventesCarte.toFixed(2)} MAD</td>
        </tr>
        <tr style="background:var(--surface2);">
          <td style="padding:8px 12px;border:1px solid var(--border);">📋 Ventes crédit</td>
          <td style="padding:8px 12px;border:1px solid var(--border);text-align:right;font-weight:700;color:var(--gold);">+${ventesCredit.toFixed(2)} MAD</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border:1px solid var(--border);">➕ Dépôts</td>
          <td style="padding:8px 12px;border:1px solid var(--border);text-align:right;font-weight:700;color:var(--accent);">+${depots.toFixed(2)} MAD</td>
        </tr>
        <tr style="background:var(--surface2);">
          <td style="padding:8px 12px;border:1px solid var(--border);">💸 Retraits</td>
          <td style="padding:8px 12px;border:1px solid var(--border);text-align:right;font-weight:700;color:#e53e3e;">-${retraits.toFixed(2)} MAD</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border:1px solid var(--border);">📋 Charges</td>
          <td style="padding:8px 12px;border:1px solid var(--border);text-align:right;font-weight:700;color:#e53e3e;">-${charges.toFixed(2)} MAD</td>
        </tr>
        <tr style="background:var(--accent);color:#ffffff;">
          <td style="padding:11px 12px;font-size:15px;font-weight:800;">💵 SOLDE FINAL ESPÈCES</td>
          <td style="padding:11px 12px;text-align:right;font-size:16px;font-weight:900;color:#7ec8e3;">${soldeFinal.toFixed(2)} MAD</td>
        </tr>
      </table>

      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px;font-size:12px;color:var(--gold);">
        ℹ️ <strong>La clôture est uniquement un rapport.</strong> Vous pouvez continuer à travailler normalement après.
      </div>
    </div>
  `;

  // Show in modal
  document.getElementById('rapport-content').innerHTML = rapport;
  document.getElementById('modal-rapport').style.display = 'flex';

  // Save cloture entry
  caisseOps.unshift({
    id: uid(), local_id: getFondsLocalId(), type: 'cloture',
    amount: soldeFinal,
    label: `Clôture du ${new Date().toLocaleDateString('fr-FR')} — Solde: ${soldeFinal.toFixed(2)} MAD`,
    date: new Date().toISOString(),
    payment: ''
  });
  save();
  renderFonds();
}

function deleteCaisseOp(id) {
  if (!isSuperAdmin() && !hasPermission('fonds', 'delete')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  if (!confirm('Supprimer cette opération ?')) return;
  caisseOps = caisseOps.filter(o => o.id !== id);
  sbDelete('gp_caisse_ops', id);
  renderFonds();
  toast('Opération supprimée', 'warn');
}
