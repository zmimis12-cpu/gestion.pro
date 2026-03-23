/* ================================================================
   GestionPro — modules/depenses.js
   Dépenses, Rapports, WhatsApp :
   renderDepenses, saveDep, editDep, deleteDep,
   renderVentes, sendWARappelCredit, sendWhatsAppCredit,
   setRapportPeriod, calcFinancialKPIs, renderRapports, renderMonthChart
================================================================ */

function initDepMonthFilter() {
  const sel = document.getElementById('dep-filter-month');
  if (!sel) return;
  const now = new Date();
  sel.innerHTML = '<option value="">Tous les mois</option>';
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = label;
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
  // Initialiser la date du formulaire
  const depDate = document.getElementById('dep-date');
  if (depDate) depDate.value = new Date().toISOString().split('T')[0];
}

function getFilteredDepenses() {
  const cat   = document.getElementById('dep-filter-cat')?.value || '';
  const month = document.getElementById('dep-filter-month')?.value || '';
  return depenses.filter(d => {
    if (cat && d.cat !== cat) return false;
    if (month) {
      const dm = d.date?.substring(0, 7);
      if (dm !== month) return false;
    }
    return true;
  });
}

function renderDepenses() {
  initDepMonthFilter();
  const filtered = getFilteredDepenses();

  // ── KPIs ──
  const total = filtered.reduce((s, d) => s + (d.montant || 0), 0);
  const byMonth = depenses.filter(d => {
    const now = new Date();
    return d.date?.startsWith(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  }).reduce((s, d) => s + (d.montant || 0), 0);
  const byCat = {};
  filtered.forEach(d => { byCat[d.cat] = (byCat[d.cat] || 0) + d.montant; });
  const topCat = Object.entries(byCat).sort((a,b) => b[1]-a[1])[0];

  const statsEl = document.getElementById('dep-stats');
  if (statsEl) statsEl.innerHTML = `
    <div style="background:linear-gradient(135deg,rgba(255,71,87,0.12),rgba(255,71,87,0.04));border:1px solid rgba(255,71,87,0.25);border-radius:var(--radius-lg);padding:16px 18px;">
      <div style="font-size:10px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">💸 Total période</div>
      <div style="font-size:24px;font-weight:900;font-family:var(--font-mono),monospace;">${fmt(total)}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:3px;">${filtered.length} dépenses</div>
    </div>
    <div style="background:linear-gradient(135deg,rgba(245,166,35,0.12),rgba(245,166,35,0.04));border:1px solid rgba(245,166,35,0.25);border-radius:var(--radius-lg);padding:16px 18px;">
      <div style="font-size:10px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">📅 Ce mois</div>
      <div style="font-size:24px;font-weight:900;font-family:var(--font-mono),monospace;">${fmt(byMonth)}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:3px;">mois courant</div>
    </div>
    <div style="background:linear-gradient(135deg,rgba(108,99,255,0.12),rgba(108,99,255,0.04));border:1px solid rgba(108,99,255,0.25);border-radius:var(--radius-lg);padding:16px 18px;">
      <div style="font-size:10px;font-weight:700;color:var(--purple);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">🏆 Top catégorie</div>
      <div style="font-size:20px;font-weight:700;">${topCat ? DEP_CATS[topCat[0]] + ' ' + topCat[0] : '—'}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:3px;">${topCat ? fmt(topCat[1]) : '0 MAD'}</div>
    </div>
  `;

  // ── Liste ──
  const listEl = document.getElementById('dep-list');
  if (!listEl) return;
  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="emoji">💸</div><p>Aucune dépense enregistrée</p></div>`;
    buildPagination('dep', 0, 'renderDepenses', 'dep-pagination');
    return;
  }
  const depPage = getPage('dep');
  const depPageData = filtered.slice((depPage-1)*PAGE_SIZE, depPage*PAGE_SIZE);

  listEl.innerHTML = depPageData.map(d => {
    const icon = DEP_CATS[d.cat] || '📋';
    const dateStr = d.date ? new Date(d.date).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
    const recIcon = d.recurrence === 'monthly' ? '🔁 Mensuel' : d.recurrence === 'yearly' ? '🔁 Annuel' : '';
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);transition:background 0.1s;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="width:40px;height:40px;border-radius:var(--radius);background:rgba(255,71,87,0.1);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${icon}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:700;">${d.label || d.cat}</div>
        <div style="font-size:11px;color:var(--text2);">${d.cat} · ${dateStr} ${recIcon ? '· ' + recIcon : ''}</div>
        ${d.notes ? `<div style="font-size:11px;color:var(--text2);font-style:italic;">${escapeHTML(d.notes)}</div>` : ''}
      </div>
      <div style="font-family:var(--font-mono),monospace;font-weight:800;font-size:15px;color:var(--red);flex-shrink:0;">- ${fmt(d.montant)}</div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button onclick="editDep('${d.id}')" style="padding:5px 10px;border-radius:7px;border:1px solid var(--border);background:transparent;color:var(--text2);font-size:12px;cursor:pointer;">✏️</button>
        <button onclick="deleteDep('${d.id}')" style="padding:5px 10px;border-radius:7px;border:1px solid rgba(255,71,87,0.3);background:transparent;color:var(--red);font-size:12px;cursor:pointer;">🗑️</button>
      </div>
    </div>`;
  }).join('');
  buildPagination('dep', filtered.length, 'renderDepenses', 'dep-pagination');
}

async function saveDep() {
  if (!isSuperAdmin() && !hasPermission('depenses', 'create')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  if (!isSuperAdmin() && !hasPermission('depenses', 'create')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  const tid     = GP_TENANT?.id;
  const id      = document.getElementById('dep-edit-id').value;
  const cat     = document.getElementById('dep-cat').value;
  const label   = document.getElementById('dep-label').value.trim();
  const montant = parseFloat(document.getElementById('dep-montant').value) || 0;
  const date    = document.getElementById('dep-date').value || new Date().toISOString().split('T')[0];
  const recurrence = document.getElementById('dep-recurrence').value;
  const notes   = document.getElementById('dep-notes').value.trim();

  if (!montant) { toast('Montant obligatoire', 'error'); return; }

  const localId = id || uid();
  const dep = { id: localId, tenant_id: tid, cat, label, montant, date, recurrence, notes };

  try {
    if (id) {
      const { error } = await sb.from('gp_depenses').update({ cat, label, montant, date, recurrence, notes }).eq('id', id);
      if (error) throw error;
      const idx = depenses.findIndex(d => d.id === id);
      if (idx >= 0) depenses[idx] = dep;
      toast('Dépense modifiée ✅');
    } else {
      // Laisser Supabase générer l'UUID — évite les conflits de format
      const { data, error } = await sb.from('gp_depenses')
        .insert({ tenant_id: tid, cat, label, montant, date, recurrence, notes })
        .select('id')
        .single();
      if (error) throw error;
      dep.id = data.id; // Utiliser l'UUID généré par Supabase
      depenses.unshift(dep);
      toast('Dépense ajoutée ✅');
    }
    resetDepForm();
    renderDepenses();
    renderDashboard(); // Mettre à jour bénéfice net dashboard
  } catch(e) {
    toast('Erreur: ' + e.message, 'error');
  }
}

function editDep(id) {
  const d = depenses.find(x => x.id === id);
  if (!d) return;
  document.getElementById('dep-edit-id').value = d.id;
  document.getElementById('dep-cat').value = d.cat;
  document.getElementById('dep-label').value = d.label || '';
  document.getElementById('dep-montant').value = d.montant;
  document.getElementById('dep-date').value = d.date || '';
  document.getElementById('dep-recurrence').value = d.recurrence || 'once';
  document.getElementById('dep-notes').value = d.notes || '';
  document.getElementById('dep-form-title').textContent = 'Modifier dépense';
  document.getElementById('dep-cancel-btn').style.display = '';
  document.getElementById('dep-montant').focus();
  document.getElementById('dep-montant').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteDep(id) {
  if (!isSuperAdmin() && !hasPermission('depenses', 'delete')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  if (!confirm('Supprimer cette dépense ?')) return;
  try {
    await sb.from('gp_depenses').delete().eq('id', id);
    depenses = depenses.filter(d => d.id !== id);
    toast('Dépense supprimée');
    renderDepenses();
    renderDashboard();
  } catch(e) { toast('Erreur: ' + e.message, 'error'); }
}

function resetDepForm() {
  document.getElementById('dep-edit-id').value = '';
  document.getElementById('dep-cat').value = 'Loyer';
  document.getElementById('dep-label').value = '';
  document.getElementById('dep-montant').value = '';
  document.getElementById('dep-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('dep-recurrence').value = 'once';
  document.getElementById('dep-notes').value = '';
  document.getElementById('dep-form-title').textContent = 'Nouvelle dépense';
  document.getElementById('dep-cancel-btn').style.display = 'none';
}

// Stub renderVentes (appelé par realtime sync — page ventes non implémentée séparément)
function renderVentes() { /* Ventes affichées dans dashboard + historique caisse */ }

// ╔══════════════════════════════════════════════════════════════╗
// ║              WHATSAPP NOTIFICATION CRÉDIT                    ║
// ╚══════════════════════════════════════════════════════════════╝

function buildWhatsAppCreditMsg(sale, client) {
  const store    = settings.storeName || 'GestionPro';
  const date     = new Date(sale.date).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
  const heure    = new Date(sale.date).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});
  const montant  = sale.total ? sale.total.toFixed(2) : '0.00';
  const detteTot = client ? ((client.creditUsed || 0)).toFixed(2) : montant;

  // Détail articles
  const items = (sale.items || []).map(i => {
    const qty  = i.qty || 1;
    const pv   = i.sellPrice || i.price || 0;
    return `  • ${i.name} × ${qty}  →  ${(pv * qty).toFixed(2)} MAD`;
  }).join('\n');

  const msg = [
    `🏪 *${store}*`,
    `📋 *Vente à crédit confirmée*`,
    ``,
    `👤 Client : *${client?.name || sale.clientName}*`,
    `📅 Date   : ${date} à ${heure}`,
    ``,
    `🛒 *Articles :*`,
    items,
    ``,
    `💰 Montant cette vente : *${montant} MAD*`,
    `📊 Votre dette totale  : *${detteTot} MAD*`,
    ``,
    `Merci pour votre confiance ! 🙏`,
  ].join('\n');

  return msg;
}


function sendWARappelCredit(clientId) {
  const client = clients.find(c => c.id === clientId);
  if (!client) return;

  const store = settings.storeName || 'GestionPro';
  const dette = (client.creditUsed || 0).toFixed(2);
  const phone = client.phone || '';

  // Historique des achats à crédit du client
  const creditSales = sales.filter(s => s.clientId === clientId && s.isCreditSale)
    .slice(0, 5); // derniers 5

  const histLines = creditSales.map(s => {
    const d = new Date(s.date).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
    return `  • ${d} : ${(s.total||0).toFixed(2)} MAD`;
  }).join('\n');

  const msg = [
    `🏪 *${store}*`,
    ``,
    `Bonjour *${client.name}* 👋`,
    ``,
    `Nous vous rappelons qu'il reste une dette en cours :`,
    `💳 *Montant dû : ${dette} MAD*`,
    ``,
    creditSales.length > 0 ? `📋 *Derniers achats à crédit :*\n${histLines}` : null,
    ``,
    `Merci de régler votre solde dès que possible 🙏`,
  ].filter(Boolean).join('\n');

  const encoded = encodeURIComponent(msg);

  if (phone) {
    const cleaned = phone.replace(/[^0-9+]/g,'');
    const intl = cleaned.startsWith('0') ? '212' + cleaned.slice(1) : cleaned;
    window.open(`https://wa.me/${intl}?text=${encoded}`, '_blank');
  } else {
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
    toast('Pas de numéro — message sans destinataire', 'warn');
  }
}

function sendWhatsAppCredit(sale, client) {
  const phone = client?.phone || '';
  if (!phone) {
    toast('⚠️ Pas de numéro pour ce client — WA non envoyé', 'warn');
    return;
  }
  const msg     = buildWhatsAppCreditMsg(sale, client);
  const encoded = encodeURIComponent(msg);
  const cleaned = phone.replace(/[^0-9+]/g,'');
  const intl    = cleaned.startsWith('0') ? '212' + cleaned.slice(1) : cleaned;
  window.open(`https://wa.me/${intl}?text=${encoded}`, '_blank');
}


function showWACreditPopup(sale, client) {
  // Supprimer popup précédent si existe
  const existing = document.getElementById('wa-credit-popup');
  if (existing) existing.remove();

  const phone   = client?.phone || '';
  const montant = sale.total ? sale.total.toFixed(2) : '0.00';
  const dette   = client ? ((client.creditUsed || 0)).toFixed(2) : montant;
  const hasPhone = phone && phone.length > 5;

  const popup = document.createElement('div');
  popup.id = 'wa-credit-popup';
  popup.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:var(--surface);border:1px solid rgba(37,211,102,0.4);
    border-radius:16px;padding:20px 22px;width:320px;
    box-shadow:0 8px 40px rgba(0,0,0,0.3);
    animation:slideInRight 0.3s ease;
  `;
  popup.innerHTML = `
    <style>
      @keyframes slideInRight {
        from { transform:translateX(120%); opacity:0; }
        to   { transform:translateX(0);   opacity:1; }
      }
    </style>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="width:40px;height:40px;background:rgba(37,211,102,0.15);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">💬</div>
      <div>
        <div style="font-weight:800;font-size:14px;">Notifier le client</div>
        <div style="font-size:11px;color:var(--text2);">Vente à crédit — ${montant} MAD</div>
      </div>
      <button onclick="document.getElementById('wa-credit-popup').remove()"
        style="margin-left:auto;background:transparent;border:none;color:var(--text2);font-size:18px;cursor:pointer;line-height:1;">✕</button>
    </div>
    <div style="background:rgba(37,211,102,0.08);border-radius:var(--radius);padding:10px 12px;margin-bottom:14px;font-size:12px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="color:var(--text2);">Client</span>
        <span style="font-weight:700;">${escapeHTML(client?.name || sale.clientName)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="color:var(--text2);">Cette vente</span>
        <span style="font-weight:700;color:var(--accent);">${montant} MAD</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:var(--text2);">Dette totale</span>
        <span style="font-weight:700;color:var(--red);">${dette} MAD</span>
      </div>
    </div>
    ${!hasPhone ? `<div style="font-size:11px;color:var(--gold);margin-bottom:10px;">⚠️ Pas de numéro enregistré pour ce client</div>` : `<div style="font-size:11px;color:var(--text2);margin-bottom:10px;">📱 Client : ${phone}</div>`}
    ${settings.storePhone ? `<div style="font-size:11px;color:#25D366;margin-bottom:10px;">🔗 Lien de paiement : wa.me/${(settings.storePhone||'').replace(/[^0-9+]/g,'').replace(/^0/,'212')}</div>` : `<div style="font-size:11px;color:var(--gold);margin-bottom:10px;">⚠️ Ajoutez votre numéro dans Paramètres pour activer le lien de paiement</div>`}
    <div style="display:flex;gap:8px;">
      <button onclick="sendWhatsAppCredit(window._lastCreditSale, window._lastCreditClient)"
        style="flex:1;padding:10px;background:rgba(37,211,102,0.1);color:#fff;border:none;border-radius:var(--radius);font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.122 1.533 5.855L0 24l6.335-1.514A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.79 9.79 0 01-4.988-1.369l-.358-.213-3.76.899.957-3.67-.233-.376A9.786 9.786 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
        Envoyer WA
      </button>
      <button onclick="document.getElementById('wa-credit-popup').remove()"
        style="padding:10px 14px;background:var(--surface2);color:var(--text2);border:1px solid var(--border);border-radius:var(--radius);font-size:13px;cursor:pointer;">
        Ignorer
      </button>
    </div>
  `;

  // Sauvegarder pour le bouton onclick
  window._lastCreditSale   = sale;
  window._lastCreditClient = client;

  document.body.appendChild(popup);

  // Auto-fermer après 15 secondes
  setTimeout(() => {
    const p = document.getElementById('wa-credit-popup');
    if (p) p.style.animation = 'none', p.style.transition = 'opacity 0.4s', p.style.opacity = '0';
    setTimeout(() => { const pp = document.getElementById('wa-credit-popup'); if(pp) pp.remove(); }, 400);
  }, 15000);
}

// ╔══════════════════════════════════════════════════════════════╗
// ║                    RAPPORTS DASHBOARD                        ║
// ╚══════════════════════════════════════════════════════════════╝

let RAPPORT_PERIOD = 'month'; // month | year | all

function setRapportPeriod(period) {
  RAPPORT_PERIOD = period;
  ['month','year','all'].forEach(p => {
    const btn = document.getElementById('rp-' + p);
    if (!btn) return;
    if (p === period) {
      btn.style.background = 'rgba(37,99,235,0.12)';
      btn.style.borderColor = 'rgba(37,99,235,0.4)';
      btn.style.color = 'var(--accent)';
    } else {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'var(--border)';
      btn.style.color = 'var(--text2)';
    }
  });
  renderRapports();
}

let RAPPORT_MONTH = null; // null = mois courant, 'YYYY-MM' pour mois précis

function initRapportMonthSelect() {
  const sel = document.getElementById('rp-month-select');
  if (!sel) return;
  sel.innerHTML = '';
  const now = new Date();
  // Générer les 24 derniers mois
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
  RAPPORT_MONTH = sel.value;
}

function setRapportMonth() {
  const sel = document.getElementById('rp-month-select');
  RAPPORT_MONTH = sel?.value || null;
  // Activer le bouton "mois"
  setRapportPeriod('month');
}

function getRapportSales() {
  const now = new Date();
  switch(RAPPORT_PERIOD) {
    case 'month': {
      const [yr, mo] = RAPPORT_MONTH ? RAPPORT_MONTH.split('-').map(Number) : [now.getFullYear(), now.getMonth()+1];
      return sales.filter(s => {
        const d = new Date(s.date);
        return d.getFullYear() === yr && d.getMonth() === mo - 1;
      });
    }
    case 'year':
      return sales.filter(s => new Date(s.date).getFullYear() === now.getFullYear());
    case 'all':
    default:
      return sales;
  }
}

function getRapportPeriodLabel() {
  if (RAPPORT_PERIOD === 'month' && RAPPORT_MONTH) {
    const [yr, mo] = RAPPORT_MONTH.split('-').map(Number);
    return new Date(yr, mo-1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }
  switch(RAPPORT_PERIOD) {
    case 'month': return 'Ce mois';
    case 'year':  return 'Cette année';
    default:      return 'Tout';
  }
}

function calcFinancialKPIs(filteredSales) {
  // ── Agrégation ventes ──
  let caHT = 0, cogsTotal = 0, tvaTotal = 0, creditTotal = 0, cashTotal = 0;

  filteredSales.forEach(s => {
    // CA HT après remise
    const ht = s.caHT !== undefined ? s.caHT : (s.totalHT || s.total || 0);
    caHT += ht;

    // COGS
    if (s.cogs !== undefined) {
      cogsTotal += s.cogs;
    } else {
      (s.items || []).forEach(item => {
        const prod = products.find(p => p.id === (item.productId||item.id) || p.name === item.name);
        const pa = item.buyPrice || prod?.cost || prod?.buyPrice || prod?.prixAchat || 0;
        cogsTotal += pa * (item.qty || 1);
      });
    }

    // TVA (séparée du bénéfice)
    tvaTotal += s.tvaAmount || 0;

    // Crédit = CA mais PAS trésorerie
    if (s.isCreditSale || s.payment === 'Crédit') {
      creditTotal += ht;
    } else {
      // Cash ou Carte → trésorerie réelle (TTC encaissé)
      cashTotal += s.total || (ht + (s.tvaAmount || 0));
    }
  });

  // ── Calculs ──
  const beneficeBrut = caHT - cogsTotal;
  const marge        = caHT > 0 ? Math.round((beneficeBrut / caHT) * 100) : 0;
  const panier       = filteredSales.length > 0 ? caHT / filteredSales.length : 0;

  // ── Dépenses de la période ──
  const depPeriod = depenses.filter(d => {
    if (!d.date) return false;
    if (RAPPORT_PERIOD === 'month' && RAPPORT_MONTH) return d.date.startsWith(RAPPORT_MONTH);
    if (RAPPORT_PERIOD === 'month') {
      const now = new Date();
      return d.date.startsWith(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
    }
    if (RAPPORT_PERIOD === 'year') return d.date.startsWith(new Date().getFullYear()+'');
    return true;
  });
  const totalDep = depPeriod.reduce((s, d) => s + (d.montant || 0), 0);

  // ── Bénéfice net & Trésorerie ──
  // Ajouter les règlements de crédit encaissés dans la période
  const reglPeriod = caisseOps.filter(o => {
    if (o.type !== 'reglement_credit') return false;
    if (!o.date) return false;
    const d = o.date.substring(0, 10);
    if (RAPPORT_PERIOD === 'month' && RAPPORT_MONTH) return d.startsWith(RAPPORT_MONTH);
    if (RAPPORT_PERIOD === 'month') { const now=new Date(); return d.startsWith(now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')); }
    if (RAPPORT_PERIOD === 'year') return d.startsWith(new Date().getFullYear()+'');
    return true;
  }).reduce((s, o) => s + (o.amount || 0), 0);

  const beneficeNet = beneficeBrut - totalDep;
  const tresorerie  = cashTotal + reglPeriod - totalDep; // Cash + Règlements crédit - Dépenses

  return {
    caHT, cogsTotal, beneficeBrut, marge, panier,
    tvaTotal, creditTotal, cashTotal,
    totalDep, beneficeNet, tresorerie,
    nbVentes: filteredSales.length
  };
}

function renderRapports() {
  const filteredSales = getRapportSales();
  const label = getRapportPeriodLabel();
  const K = calcFinancialKPIs(filteredSales);

  const el  = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
  const col = (id, positive) => {
    const e = document.getElementById(id);
    if (e) e.style.color = positive ? 'var(--accent)' : 'var(--red)';
  };

  // 1. CA HT
  el('rpt-ca',         fmt(K.caHT));
  el('rpt-ca-count',   `${K.nbVentes} vente${K.nbVentes>1?'s':''}`);

  // 2. COGS
  el('rpt-cogs',       fmt(K.cogsTotal));
  el('rpt-cogs-sub',   `prix d'achat vendus`);

  // 3. Bénéfice brut
  el('rpt-benef-brut', fmt(K.beneficeBrut));
  el('rpt-marge',      `Marge: ${K.marge}%`);
  col('rpt-benef-brut', K.beneficeBrut >= 0);

  // 4. Dépenses
  el('rpt-dep',        fmt(K.totalDep));
  el('rpt-dep-sub',    `${depenses.filter(d => {
    if (!d.date) return false;
    if (RAPPORT_PERIOD === 'month' && RAPPORT_MONTH) return d.date.startsWith(RAPPORT_MONTH);
    if (RAPPORT_PERIOD === 'month') { const now=new Date(); return d.date.startsWith(now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')); }
    if (RAPPORT_PERIOD === 'year') return d.date.startsWith(new Date().getFullYear()+'');
    return true;
  }).length} charge(s)`);

  // 5. Bénéfice net
  el('rpt-benefice',   fmt(K.beneficeNet));
  col('rpt-benefice',  K.beneficeNet >= 0);
  el('rpt-panier-sub', `Brut ${fmt(K.beneficeBrut)} − Dép ${fmt(K.totalDep)}`);

  // 6. TVA collectée
  el('rpt-tva',        fmt(K.tvaTotal));
  el('rpt-tva-sub',    `hors bénéfice`);

  // 7. Crédit clients
  // Dette ACTUELLE = somme creditUsed de tous les clients (pas le CA crédit historique)
  const detteActuelle = clients.reduce((s, c) => s + (c.creditUsed || 0), 0);
  el('rpt-credit',     fmt(detteActuelle));
  el('rpt-credit-sub', detteActuelle === 0 ? '✅ Tout encaissé' : `${clients.filter(c=>c.creditUsed>0).length} client(s) débiteur(s)`);

  // 8. Trésorerie réelle
  el('rpt-tresor',     fmt(K.tresorerie));
  el('rpt-tresor-sub', `encaissé: ${fmt(K.cashTotal)} − dép: ${fmt(K.totalDep)}`);
  col('rpt-tresor',    K.tresorerie >= 0);

  // ── Graphe CA + Bénéfice par mois (12 derniers mois) ──
  renderMonthChart();

  // ── Top produits — bénéfice avec snapshot prix achat ──
  const prodMap = {};
  filteredSales.forEach(sale => {
    // Ratio remise vente pour redistribuer sur les lignes
    const subtot = (sale.items||[]).reduce((s,i) => s + (i.sellPrice||i.price||0)*(i.qty||1), 0);
    const remiseRatio = subtot > 0 ? (1 - (sale.caHT || subtot) / subtot) : 0;

    (sale.items || []).forEach(item => {
      const key = item.name || item.id;
      if (!prodMap[key]) prodMap[key] = { name: key, qty: 0, caHT: 0, cogs: 0, benefice: 0 };
      const qty   = item.qty || item.quantity || 1;
      const pv    = item.sellPrice || item.price || 0;
      const pa    = item.buyPrice || (()=>{
        const prod = products.find(p => p.id === (item.productId||item.id) || p.name === item.name);
        return prod?.cost || prod?.buyPrice || prod?.prixAchat || 0;
      })();
      const ligneHT   = pv * qty * (1 - remiseRatio); // après remise proportionnelle
      const ligneCOGS = pa * qty;
      prodMap[key].qty      += qty;
      prodMap[key].caHT     += ligneHT;
      prodMap[key].cogs     += ligneCOGS;
      prodMap[key].benefice += (ligneHT - ligneCOGS);
    });
  });
  const topProds = Object.values(prodMap).sort((a,b) => b.caHT - a.caHT).slice(0, 7);
  const topProdsEl = document.getElementById('rpt-top-products');
  const topProdPeriodEl = document.getElementById('rpt-top-prod-period');
  if (topProdPeriodEl) topProdPeriodEl.textContent = label;
  if (topProdsEl) {
    if (!topProds.length) {
      topProdsEl.innerHTML = `<div class="empty-state"><div class="emoji">📦</div><p>Aucune vente</p></div>`;
    } else {
      const maxCA = topProds[0].caHT || 1;
      topProdsEl.innerHTML = topProds.map((p, i) => {
        const bar = Math.round((p.caHT / maxCA) * 100);
        const medals = ['🥇','🥈','🥉'];
        const icon = medals[i] || `<span style="font-size:12px;color:var(--text2);font-weight:700;">${i+1}</span>`;
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);">
          <div style="width:24px;text-align:center;font-size:16px;">${icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(p.name)}</div>
            <div style="height:5px;background:var(--surface2);border-radius:3px;margin-top:5px;overflow:hidden;">
              <div style="height:100%;width:${bar}%;background:linear-gradient(90deg,var(--accent),rgba(37,99,235,0.5));border-radius:3px;transition:width 0.4s;"></div>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:12px;font-weight:800;font-family:var(--font-mono),monospace;">${fmt(p.caHT)}</div>
            <div style="font-size:10px;color:${p.benefice>=0?'#64dc96':'var(--red)'};">${p.benefice>=0?'+':''}${fmt(p.benefice)}</div>
            <div style="font-size:10px;color:var(--text2);">${p.qty} unités</div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // ── Meilleurs clients ──
  const clientMap = {};
  filteredSales.forEach(sale => {
    const cid = sale.clientId || sale.clientName || 'Anonyme';
    const cname = sale.clientName || 'Client anonyme';
    if (!clientMap[cid]) clientMap[cid] = { name: cname, total: 0, count: 0 };
    clientMap[cid].total += sale.total || 0;
    clientMap[cid].count++;
  });
  const topClients = Object.values(clientMap).sort((a,b) => b.total - a.total).slice(0, 7);
  const topClientsEl = document.getElementById('rpt-top-clients');
  const topClientPeriodEl = document.getElementById('rpt-top-clients-period');
  if (topClientPeriodEl) topClientPeriodEl.textContent = label;
  if (topClientsEl) {
    if (!topClients.length) {
      topClientsEl.innerHTML = `<div class="empty-state"><div class="emoji">👥</div><p>Aucune vente</p></div>`;
    } else {
      const maxTotal = topClients[0].total || 1;
      topClientsEl.innerHTML = topClients.map((c, i) => {
        const bar = Math.round((c.total / maxTotal) * 100);
        const medals = ['🥇','🥈','🥉'];
        const icon = medals[i] || `<span style="font-size:12px;color:var(--text2);font-weight:700;">${i+1}</span>`;
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);">
          <div style="width:24px;text-align:center;font-size:16px;">${icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(c.name)}</div>
            <div style="height:5px;background:var(--surface2);border-radius:3px;margin-top:5px;overflow:hidden;">
              <div style="height:100%;width:${bar}%;background:linear-gradient(90deg,var(--gold),rgba(245,166,35,0.5));border-radius:3px;transition:width 0.4s;"></div>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:12px;font-weight:800;font-family:var(--font-mono),monospace;">${fmt(c.total)}</div>
            <div style="font-size:10px;color:var(--text2);">${c.count} achat${c.count>1?'s':''}</div>
          </div>
        </div>`;
      }).join('');
    }
  }
}

function renderMonthChart() {
  const el = document.getElementById('rpt-chart-months');
  if (!el) return;

  // Construire les 12 derniers mois
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('fr-FR', { month: 'short' }) });
  }

  // Calculer CA HT et bénéfice brut par mois — logique professionnelle
  months.forEach(m => {
    const mSales = sales.filter(s => {
      const d = new Date(s.date);
      return d.getFullYear() === m.year && d.getMonth() === m.month;
    });
    m.ca = 0; m.cogs = 0; m.dep = 0;
    mSales.forEach(s => {
      const ht = s.caHT !== undefined ? s.caHT : (s.totalHT || s.total || 0);
      m.ca += ht;
      if (s.cogs !== undefined) {
        m.cogs += s.cogs;
      } else {
        (s.items || []).forEach(item => {
          const prod = products.find(p => p.id === (item.productId||item.id) || p.name === item.name);
          const pa = item.buyPrice || prod?.cost || prod?.buyPrice || prod?.prixAchat || 0;
          m.cogs += pa * (item.qty || 1);
        });
      }
    });
    // Dépenses du mois
    const mKey = `${m.year}-${String(m.month+1).padStart(2,'0')}`;
    m.dep = depenses.filter(d => d.date?.startsWith(mKey)).reduce((s,d) => s+(d.montant||0), 0);
    m.beneficeBrut = m.ca - m.cogs;
    m.benefice = m.beneficeBrut - m.dep; // Bénéfice net par mois
  });

  const maxCA = Math.max(...months.map(m => m.ca), 1);

  el.innerHTML = months.map(m => {
    const hCA = Math.round((m.ca / maxCA) * 110);
    const hBen = m.ca > 0 ? Math.round((Math.max(m.benefice, 0) / maxCA) * 110) : 0;
    const isCurrentMonth = m.year === now.getFullYear() && m.month === now.getMonth();
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;min-width:36px;cursor:pointer;"
      title="CA: ${fmt(m.ca)}\nBrut: ${fmt(m.beneficeBrut)}\nDép: -${fmt(m.dep)}\nNet: ${fmt(m.benefice)}">
      <div style="font-size:9px;color:var(--text2);font-family:var(--font-mono),monospace;white-space:nowrap;">${m.ca > 0 ? (m.ca >= 1000 ? Math.round(m.ca/1000)+'k' : Math.round(m.ca)) : ''}</div>
      <div style="display:flex;align-items:flex-end;gap:2px;height:110px;">
        <div style="width:12px;background:linear-gradient(180deg,var(--accent),rgba(37,99,235,0.4));border-radius:4px 4px 0 0;height:${hCA}px;transition:height 0.4s ease;opacity:${isCurrentMonth?1:0.75};"></div>
        <div style="width:10px;background:linear-gradient(180deg,#64dc96,rgba(100,220,150,0.3));border-radius:4px 4px 0 0;height:${hBen}px;transition:height 0.4s ease;opacity:${isCurrentMonth?1:0.6};"></div>
      </div>
      <div style="font-size:9px;color:${isCurrentMonth?'var(--accent)':'var(--text2)'};font-weight:${isCurrentMonth?'800':'400'};margin-top:2px;">${m.label}</div>
    </div>`;
  }).join('');

  // Légende (déjà dans le HTML)
}

// ╔══════════════════════════════════════════════════════════════╗
// ║              GESTION DES PLANS (Starter/Business/Premium)   ║
// ╚══════════════════════════════════════════════════════════════╝
const PLAN_MODULES = {
  starter: [
    'dashboard', 'caisse', 'stock', 'clients', 'alerts', 'settings', 'depenses'
  ],
  business: [
    'dashboard', 'caisse', 'stock', 'clients', 'alerts', 'settings',
    'locaux', 'employes', 'conges', 'fonds', 'commandes', 'depenses'
  ],
  premium: [
    'dashboard', 'caisse', 'stock', 'clients', 'alerts', 'settings',
    'locaux', 'employes', 'conges', 'fonds', 'commandes',
    'conteneurs', 'docscont', 'livraisons', 'docs-rh', 'docs_rh', 'docs-admin', 'docs_admin', 'superadmin', 'depenses'
  ]
};
