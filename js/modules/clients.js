/* ================================================================
   GestionPro — modules/clients.js
   Gestion clients : saveClient, renderClients, viewClient,
   payCredit, saveCreditLimit
================================================================ */

function printReceipt() { printInvoice(); }

// ─── CLIENTS ───
function saveClient() {
  if (!isSuperAdmin() && !hasPermission('clients', 'create')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  const lid = getLocalId();
  const name = document.getElementById('cli-name').value.trim();
  if (!name) { toast(t('toast_name_required'), 'error'); return; }
  const client = {
    id: uid(),
    local_id: lid,
    name,
    phone: document.getElementById('cli-phone').value.trim(),
    city: document.getElementById('cli-city').value.trim(),
    notes: document.getElementById('cli-notes').value.trim(),
    creditLimit: parseFloat(document.getElementById('cli-limit').value) || 500,
    creditUsed: 0,
    transactions: [],
    createdAt: new Date().toISOString()
  };
  clients.push(client);
  save();
  closeModal('modal-add-client');
  toast(`${t('toast_client_added')} : "${name}"`);
  ['cli-name','cli-phone','cli-city','cli-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('cli-limit').value = '500';
  renderClients();
  populateClientSelect();
}

function renderClients(resetPage) {
  if (resetPage !== false) _pages['clients'] = 1;
  const q = document.getElementById('client-search')?.value?.toLowerCase() || '';
  const filtered = clients.filter(c => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q));
  const grid = document.getElementById('clients-grid');
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><div class="emoji">👥</div><p>${t('no_clients')}</p></div>`;
    buildPagination('clients', 0, 'renderClients', 'clients-pagination');
    return;
  }
  const page = getPage('clients');
  const pageData = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  grid.innerHTML = pageData.map(c => {
    const totalPurchases = sales.filter(s => s.clientId === c.id).reduce((sum, s) => sum + s.total, 0);
    const category = totalPurchases >= 2000 ? 'vip' : totalPurchases >= 500 ? 'fidele' : 'normal';
    const catLabel = category === 'vip' ? '⭐ VIP' : category === 'fidele' ? '🥈 Fidèle' : '🥉 Nouveau';
    const catChipClass = category === 'vip' ? 'chip-gold' : category === 'fidele' ? 'chip-purple' : 'chip-green';
    const creditUsed = c.creditUsed || 0;
    const creditLimit = c.creditLimit || 500;
    const creditPct = Math.min(100, (creditUsed / creditLimit) * 100);
    const overLimit = creditUsed >= creditLimit;

    return `
      <div class="client-card ${category}" onclick="viewClient('${c.id}')">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <div class="client-avatar">${c.name.charAt(0).toUpperCase()}</div>
          <div>
            <div class="client-name">${escapeHTML(c.name)}</div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <div class="client-phone">${c.phone || 'Pas de tél.'}</div>
              ${(c.creditUsed > 0) ? `<button onclick="sendWARappelCredit('${c.id}');event.stopPropagation();"
                style="padding:2px 8px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);color:#25D366;border-radius:20px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap;">
                💬 Rappel dette</button>` : ''}
            </div>
          </div>
          <span class="chip ${catChipClass}" style="margin-left:auto;">${catLabel}</span>
        </div>
        <div class="client-stats">
          <div class="client-stat">
            <div class="client-stat-val">${sales.filter(s => s.clientId === c.id).length}</div>
            <div class="client-stat-label">Achats</div>
          </div>
          <div class="client-stat">
            <div class="client-stat-val" style="font-size:12px;">${totalPurchases.toFixed(0)} MAD</div>
            <div class="client-stat-label">Total dépensé</div>
          </div>
          <div class="client-stat">
            <div class="client-stat-val" style="color:${creditUsed > 0 ? 'var(--gold)' : 'var(--text2)'};">${creditUsed.toFixed(0)} MAD</div>
            <div class="client-stat-label">Crédit dû</div>
          </div>
        </div>
        ${creditUsed > 0 ? `
          <div style="margin-top:8px;">
            <div class="credit-bar"><div class="credit-bar-fill" style="width:${creditPct}%;background:${overLimit ? 'var(--red)' : creditPct > 70 ? 'var(--gold)' : 'var(--accent)'};"></div></div>
          </div>
        ` : ''}
        ${overLimit ? `<div class="credit-alert">⚠️ Limite de crédit atteinte !</div>` : ''}
      </div>
    `;
  }).join('');
  buildPagination('clients', filtered.length, 'renderClients', 'clients-pagination');
}

function renderClients_resetPage() { _pages['clients']=1; renderClients(); }

function viewClient(id) {
  viewingClientId = id;
  const client = clients.find(c => c.id === id);
  if (!client) return;
  const totalPurchases = sales.filter(s => s.clientId === id).reduce((sum, s) => sum + s.total, 0);
  const clientSales = sales.filter(s => s.clientId === id).slice(0, 10);
  const creditUsed = client.creditUsed || 0;
  const creditLimit = client.creditLimit || 500;
  const creditPct = Math.min(100, (creditUsed / creditLimit) * 100);

  const txList = (client.transactions || []).slice().reverse().slice(0, 15);

  document.getElementById('client-detail-content').innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
      <div class="client-avatar" style="width:60px;height:60px;font-size:26px;">${client.name.charAt(0).toUpperCase()}</div>
      <div>
        <div style="font-size:20px;font-weight:800;">${escapeHTML(client.name)}</div>
        <div style="font-size:13px;color:var(--text2);">📞 ${client.phone || '—'} · 📍 ${client.city || '—'}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:3px;">Client depuis ${fmtDate(client.createdAt)}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;">
      <div style="background:var(--surface2);border-radius:var(--radius);padding:14px;text-align:center;">
        <div style="font-size:18px;font-weight:800;font-family:var(--font-mono),monospace;">${clientSales.length}</div>
        <div style="font-size:11px;color:var(--text2);">Achats</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius);padding:14px;text-align:center;">
        <div style="font-size:14px;font-weight:800;font-family:var(--font-mono),monospace;">${totalPurchases.toFixed(2)} MAD</div>
        <div style="font-size:11px;color:var(--text2);">Total dépensé</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius);padding:14px;text-align:center;">
        <div style="font-size:16px;font-weight:800;font-family:var(--font-mono),monospace;color:${creditUsed > 0 ? 'var(--gold)' : 'var(--accent)'};">${creditUsed.toFixed(2)} MAD</div>
        <div style="font-size:11px;color:var(--text2);">Crédit dû</div>
      </div>
    </div>

    <div style="background:var(--surface2);border-radius:var(--radius);padding:14px;margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px;">
        <span style="font-weight:600;">Limite de crédit</span>
        <span style="font-family:var(--font-mono),monospace;">${fmt(creditUsed)} / ${fmt(creditLimit)}</span>
      </div>
      <div class="credit-bar" style="height:10px;">
        <div class="credit-bar-fill" style="width:${creditPct}%;background:${creditPct > 80 ? 'var(--red)' : creditPct > 50 ? 'var(--gold)' : 'var(--accent)'};"></div>
      </div>
      <div style="font-size:11px;color:var(--text2);margin-top:6px;">Disponible: ${fmt(Math.max(0, creditLimit - creditUsed))}</div>
    </div>

    ${txList.length ? `
      <div style="font-size:13px;font-weight:700;margin-bottom:10px;">📋 Historique des transactions</div>
      <div class="transaction-list">
        ${txList.map(tx => `
          <div class="transaction-item">
            <span class="transaction-icon">${tx.type === 'debit' ? '🔴' : '🟢'}</span>
            <div class="transaction-info">
              <div>${escapeHTML(tx.note || (tx.type === 'debit' ? 'Achat à crédit' : 'Remboursement'))}</div>
              <div class="transaction-date">${fmtDate(tx.date)}</div>
            </div>
            <span class="transaction-amount ${tx.type === 'debit' ? 'debit' : 'credit-pay'}">${tx.type === 'debit' ? '−' : '+'}${fmt(tx.amount)}</span>
          </div>
        `).join('')}
      </div>
    ` : '<div style="text-align:center;color:var(--text2);padding:20px;">Aucune transaction</div>'}

    <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;">💵 Montant du paiement (MAD)</label>
        <input type="number" id="pay-amount" placeholder="Ex: 200" style="margin-top:6px;" min="0" max="${creditUsed}">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--purple);text-transform:uppercase;letter-spacing:.5px;">✏️ Nouvelle limite de crédit (MAD)</label>
        <input type="number" id="new-credit-limit" placeholder="Ex: 1000" style="margin-top:6px;border-color:rgba(108,99,255,0.4);" value="${creditLimit}">
      </div>
    </div>
  `;

  document.getElementById('btn-pay-credit').style.display = creditUsed > 0 ? 'flex' : 'none';
  openModal('modal-client-detail');
}

function payCredit() {
  const amount = parseFloat(document.getElementById('pay-amount')?.value);
  if (!amount || amount <= 0) { toast(t('toast_invalid_amount'), 'error'); return; }
  const client = clients.find(c => c.id === viewingClientId);
  if (!client) return;

  const actual = Math.min(amount, client.creditUsed || 0);

  // 1. Réduire la dette du client
  client.creditUsed = Math.max(0, (client.creditUsed || 0) - actual);
  if (!client.transactions) client.transactions = [];
  client.transactions.push({
    type: 'credit', amount: actual,
    date: new Date().toISOString(),
    note: `Règlement dette — ${fmt(actual)}`
  });

  // 2. Enregistrer dans caisseOps → augmente la Trésorerie
  const lid = getLocalId();
  caisseOps.unshift({
    id: uid(), local_id: lid,
    type: 'reglement_credit',
    amount: actual,
    label: `Règlement crédit — ${client.name}`,
    date: new Date().toISOString(),
    payment: 'Espèces'
  });

  // 3. Sync Supabase
  if (typeof sb !== 'undefined' && GP_TENANT?.id) {
    sb.from('gp_caisse_ops').insert({
      id: caisseOps[0].id,
      tenant_id: GP_TENANT.id,
      local_id: lid,
      type: 'reglement_credit',
      amount: actual,
      label: `Règlement crédit — ${client.name}`,
      date: new Date().toISOString(),
      payment: 'Espèces'
    }).then(({error}) => { if(error) console.warn('[payCredit]', error); });
  }

  save();
  toast(`✅ ${fmt(actual)} encaissé — dette ${client.name}: ${fmt(client.creditUsed)} MAD`);
  closeModal('modal-client-detail');
  renderClients();
  renderDashboard();
  renderFonds();
}

function saveCreditLimit() {
  if (!isSuperAdmin() && !hasPermission('clients', 'update')) { toast('⛔ Permission refusée', 'error'); return; }
  const newLimit = parseFloat(document.getElementById('new-credit-limit')?.value);
  if (!newLimit || newLimit <= 0) { toast('Limite invalide', 'error'); return; }
  const client = clients.find(c => c.id === viewingClientId);
  if (!client) return;
  const old = client.creditLimit || 500;
  client.creditLimit = newLimit;
  save();
  toast(`Limite modifiée : ${fmt(old)} → ${fmt(newLimit)}`);
  // Refresh modal
  viewClient(viewingClientId);
  renderClients();
}

