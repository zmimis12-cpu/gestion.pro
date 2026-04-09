/* ================================================================
   GestionPro — modules/retours.js
   Gestion des retours produits v1.0

   LOGIQUE :
   - Chaque retour est lié à une vente existante (saleId)
   - Par item retourné : qteConforme + qteDommagee + qteManquante
   - qteConforme → réintégrée au stock du local d'origine
   - qteDommagee + qteManquante → ne retournent PAS au stock
   - Validation : total retourné ≤ quantité vendue initialement
   - Stocké dans `retours[]` (localStorage + Supabase gp_retours)
================================================================ */

let retours = [];

/* ── Ouvrir le modal de retour depuis une vente ── */
function openRetourModal(saleId) {
  if (!isSuperAdmin() && !hasPermission('commandes', 'update')) {
    toast('⛔ Permission refusée', 'error'); return;
  }

  const sale = sales.find(s => s.id === saleId);
  if (!sale) { toast('Vente introuvable', 'error'); return; }
  if (!sale.items || !sale.items.length) { toast('Cette vente ne contient aucun article', 'warn'); return; }

  // Calculer les quantités déjà retournées pour cette vente
  const existingRetours = retours.filter(r => r.saleId === saleId);
  const alreadyReturned = {}; // productId → total déjà retourné
  existingRetours.forEach(r => {
    r.lines.forEach(l => {
      alreadyReturned[l.productId] = (alreadyReturned[l.productId] || 0) + l.qteConforme + l.qteDommagee + l.qteManquante;
    });
  });

  // Titre et infos vente
  const dateStr = new Date(sale.date).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
  const clientLabel = sale.clientName && sale.clientName !== 'undefined'
    ? escapeHTML(sale.clientName)
    : sale.clientId ? (clients.find(c => c.id === sale.clientId)?.name || '—') : 'Client de passage';
  const saleNum = 'ORD-' + String(sales.indexOf(sale) + 1).padStart(4, '0');

  document.getElementById('retour-sale-ref').textContent   = saleNum;
  document.getElementById('retour-sale-date').textContent  = dateStr;
  document.getElementById('retour-sale-client').textContent = clientLabel;
  document.getElementById('retour-sale-id').value = saleId;

  // Construire les lignes de retour
  const linesContainer = document.getElementById('retour-lines');
  linesContainer.innerHTML = sale.items.map((item, idx) => {
    const pid      = item.productId || item.id;
    const prod     = products.find(p => p.id === pid);
    const name     = prod?.name || item.name || 'Produit inconnu';
    const sold     = item.qty || 1;
    const returned = alreadyReturned[pid] || 0;
    const maxQty   = sold - returned;

    if (maxQty <= 0) {
      return `<div class="retour-line" style="opacity:0.45;">
        <div class="retour-line-name">${escapeHTML(name)}</div>
        <div style="font-size:11.5px;color:var(--green);font-weight:600;">✅ Déjà entièrement retourné</div>
      </div>`;
    }

    return `<div class="retour-line" data-idx="${idx}" data-pid="${pid}" data-max="${maxQty}">
      <div class="retour-line-header">
        <div class="retour-line-name">${escapeHTML(name)}</div>
        <div class="retour-line-meta">
          Vendu : <strong>${sold}</strong>
          ${returned > 0 ? `· Déjà retourné : <strong>${returned}</strong>` : ''}
          · Restant : <strong>${maxQty}</strong>
        </div>
      </div>
      <div class="retour-line-inputs">
        <div class="retour-field">
          <label>✅ Conforme</label>
          <input type="number" class="retour-input" data-type="conforme"
            min="0" max="${maxQty}" value="0"
            oninput="validateRetourLine(this, ${maxQty})" placeholder="0">
        </div>
        <div class="retour-field">
          <label>💥 Endommagé</label>
          <input type="number" class="retour-input" data-type="dommagee"
            min="0" max="${maxQty}" value="0"
            oninput="validateRetourLine(this, ${maxQty})" placeholder="0">
        </div>
        <div class="retour-field">
          <label>❓ Manquant</label>
          <input type="number" class="retour-input" data-type="manquante"
            min="0" max="${maxQty}" value="0"
            oninput="validateRetourLine(this, ${maxQty})" placeholder="0">
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('retour-note').value = '';
  document.getElementById('retour-error').style.display = 'none';
  openModal('modal-retour');
}

/* ── Valider une ligne : total ne dépasse pas maxQty ── */
function validateRetourLine(input, maxQty) {
  const line = input.closest('.retour-line');
  if (!line) return;

  const inputs = line.querySelectorAll('.retour-input');
  let total = 0;
  inputs.forEach(inp => { total += parseInt(inp.value) || 0; });

  if (total > maxQty) {
    // Réduire la valeur saisie pour rester dans la limite
    const excess = total - maxQty;
    const val = parseInt(input.value) || 0;
    input.value = Math.max(0, val - excess);
    input.style.borderColor = 'var(--red)';
    input.style.boxShadow   = '0 0 0 3px rgba(220,38,38,0.12)';
    setTimeout(() => {
      input.style.borderColor = '';
      input.style.boxShadow   = '';
    }, 1500);
    toast('Total retourné ne peut pas dépasser la quantité vendue', 'warn');
  }
}

/* ── Confirmer et enregistrer le retour ── */
async function confirmRetour() {
  const saleId = document.getElementById('retour-sale-id').value;
  const note   = document.getElementById('retour-note').value.trim();
  const errEl  = document.getElementById('retour-error');

  const sale = sales.find(s => s.id === saleId);
  if (!sale) return;

  // Collecter les lignes
  const lines = [];
  const lineEls = document.querySelectorAll('#retour-lines .retour-line[data-pid]');

  lineEls.forEach(lineEl => {
    const pid      = lineEl.dataset.pid;
    const maxQty   = parseInt(lineEl.dataset.max) || 0;
    const inputs   = lineEl.querySelectorAll('.retour-input');
    let conforme   = 0, dommagee = 0, manquante = 0;

    inputs.forEach(inp => {
      const val = Math.max(0, parseInt(inp.value) || 0);
      const type = inp.dataset.type;
      if (type === 'conforme')  conforme  = val;
      if (type === 'dommagee')  dommagee  = val;
      if (type === 'manquante') manquante = val;
    });

    const total = conforme + dommagee + manquante;
    if (total === 0) return; // Ligne non saisie → ignorer

    // Validation finale
    if (total > maxQty) {
      errEl.textContent = `Quantité invalide pour un article (max: ${maxQty})`;
      errEl.style.display = 'block';
      return;
    }

    lines.push({ productId: pid, qteConforme: conforme, qteDommagee: dommagee, qteManquante: manquante });
  });

  if (!lines.length) {
    errEl.textContent = 'Saisissez au moins une quantité à retourner';
    errEl.style.display = 'block';
    return;
  }

  errEl.style.display = 'none';

  // Déterminer le statut global
  const hasConforme  = lines.some(l => l.qteConforme > 0);
  const hasDommagee  = lines.some(l => l.qteDommagee > 0);
  const hasManquante = lines.some(l => l.qteManquante > 0);
  let statut = 'conforme';
  if (hasDommagee || hasManquante) statut = (hasConforme || hasDommagee || hasManquante) && hasDommagee ? 'endommage' : 'manque';
  if (hasDommagee && hasManquante) statut = 'endommage';
  if (!hasConforme && !hasDommagee && hasManquante) statut = 'manque';
  if (hasDommagee) statut = 'endommage';

  // Créer l'objet retour
  // Objet retour — snake_case pour Supabase
  const retourId = uid();
  const retour = {
    // Champs frontend (camelCase pour usage JS local)
    id:          retourId,
    saleId,
    date:        new Date().toISOString(),
    local_id:    sale.local_id || getLocalId(),
    tenant_id:   GP_TENANT?.id,
    clientId:    sale.clientId || null,
    clientName:  sale.clientName || 'Client de passage',
    lines,
    note,
    statut,
    createdBy:   GP_USER?.id || null,
  };

  // Objet Supabase — snake_case strict
  const retourDB = {
    id:          retourId,
    sale_id:     saleId,
    date:        retour.date,
    local_id:    retour.local_id,
    tenant_id:   retour.tenant_id,
    client_id:   retour.clientId,
    client_name: retour.clientName,
    lines:       JSON.stringify(lines),
    note:        note || null,
    statut:      statut,
    created_by:  retour.createdBy,
  };

  console.log('[Retour] Données envoyées à gp_retours:', retourDB);

  // Réintégrer stock pour les conformes
  let stockUpdated = 0;
  lines.forEach(line => {
    if (line.qteConforme <= 0) return;
    const prod = products.find(p => p.id === line.productId);
    if (!prod) return;
    prod.stock = (prod.stock || 0) + line.qteConforme;
    stockUpdated++;
  });

  // Sauvegarder
  retours.unshift(retour);
  save();

  // ── Sync Supabase ──
  let supabaseOk = true;

  // 1. Enregistrer le retour
  try {
    const { error: retourErr } = await sb.from('gp_retours').upsert(retourDB, { onConflict: 'id' });
    if (retourErr) {
      console.error('[Retour] Erreur gp_retours:', retourErr.message, '| Data:', retourDB);
      supabaseOk = false;
    } else {
      console.log('[Retour] gp_retours enregistré OK');
    }
  } catch(e) {
    console.error('[Retour] Exception gp_retours:', e);
    supabaseOk = false;
  }

  // 2. Mettre à jour le stock des produits conformes — UPDATE ciblé uniquement sur stock
  if (stockUpdated > 0) {
    for (const line of lines) {
      if (line.qteConforme <= 0) continue;
      const prod = products.find(p => p.id === line.productId);
      if (!prod) continue;

      console.log('[Retour] Update stock gp_products id:', prod.id, '| nouveau stock:', prod.stock);

      try {
        const { error: stockErr } = await sb
          .from('gp_products')
          .update({ stock: prod.stock, updated_at: new Date().toISOString() })
          .eq('id', prod.id)
          .eq('tenant_id', GP_TENANT?.id);

        if (stockErr) {
          console.error('[Retour] Erreur update stock produit', prod.id, ':', stockErr.message);
          supabaseOk = false;
        } else {
          console.log('[Retour] Stock produit', prod.id, 'mis à jour OK');
        }
      } catch(e) {
        console.error('[Retour] Exception update stock:', e);
        supabaseOk = false;
      }
    }
  }

  // Marquer la vente comme ayant un retour
  const saleIdx = sales.findIndex(s => s.id === saleId);
  if (saleIdx >= 0) {
    sales[saleIdx].hasRetour = true;
    sales[saleIdx].retourIds = [...(sales[saleIdx].retourIds || []), retour.id];
  }

  closeModal('modal-retour');

  const totalConforme  = lines.reduce((s, l) => s + l.qteConforme, 0);
  const totalDommagee  = lines.reduce((s, l) => s + l.qteDommagee, 0);
  const totalManquante = lines.reduce((s, l) => s + l.qteManquante, 0);

  if (supabaseOk) {
    toast(`✅ Retour enregistré — ${totalConforme} pcs remis en stock${totalDommagee > 0 ? ` · ${totalDommagee} endommagé(s)` : ''}${totalManquante > 0 ? ` · ${totalManquante} manquant(s)` : ''}`, 'success');
  } else {
    toast(`⚠️ Retour sauvegardé localement — erreur synchronisation Supabase (vérifiez la console)`, 'warn');
  }

  if (typeof renderCommandes === 'function') renderCommandes(false);
  if (typeof renderStockTable === 'function') renderStockTable(false);
  if (typeof renderRetours === 'function') renderRetours();
  updateAlertCount();
}

/* ── Rendre la liste des retours ── */
function renderRetours(resetPage) {
  if (resetPage !== false) _pages['retours'] = 1;

  const q      = (document.getElementById('retour-search')?.value || '').toLowerCase();
  const statF  = document.getElementById('retour-filter-statut')?.value || 'all';
  const tbody  = document.getElementById('retours-table');
  if (!tbody) return;

  let filtered = [...retours];
  if (q)            filtered = filtered.filter(r =>
    (r.clientName || '').toLowerCase().includes(q) ||
    (r.id || '').toLowerCase().includes(q) ||
    (r.note || '').toLowerCase().includes(q)
  );
  if (statF !== 'all') filtered = filtered.filter(r => r.statut === statF);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="emoji">↩️</div><p>Aucun retour enregistré</p></div></td></tr>`;
    document.getElementById('retours-pagination').innerHTML = '';
    return;
  }

  const page     = getPage('retours');
  const pageData = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const statutBadge = {
    conforme:  '<span class="chip chip-green">✅ Conforme</span>',
    endommage: '<span class="chip chip-red">💥 Endommagé</span>',
    manque:    '<span class="chip chip-orange">❓ Manquant</span>',
  };

  tbody.innerHTML = pageData.map(r => {
    const dateStr    = new Date(r.date).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'2-digit'});
    const sale       = sales.find(s => s.id === r.saleId);
    const saleNum    = sale ? 'ORD-' + String(sales.indexOf(sale) + 1).padStart(4,'0') : '—';
    const totalConf  = r.lines.reduce((s,l) => s + l.qteConforme, 0);
    const totalDmg   = r.lines.reduce((s,l) => s + l.qteDommagee, 0);
    const totalMnq   = r.lines.reduce((s,l) => s + l.qteManquante, 0);
    const clientLabel = r.clientName && r.clientName !== 'undefined' ? escapeHTML(r.clientName) : 'Client de passage';

    return `<tr>
      <td style="font-family:var(--font-mono),monospace;font-size:11.5px;font-weight:700;">${dateStr}</td>
      <td style="font-size:12px;color:var(--accent);font-family:var(--font-mono),monospace;">${saleNum}</td>
      <td style="font-weight:600;">${clientLabel}</td>
      <td>
        ${r.lines.map(l => {
          const p = products.find(x => x.id === l.productId);
          return `<div style="font-size:12px;">${escapeHTML(p?.name || '?')} ×${l.qteConforme+l.qteDommagee+l.qteManquante}</div>`;
        }).join('')}
      </td>
      <td>
        ${totalConf  > 0 ? `<div style="font-size:11.5px;color:var(--green);">✅ ${totalConf} conforme(s)</div>` : ''}
        ${totalDmg   > 0 ? `<div style="font-size:11.5px;color:var(--red);">💥 ${totalDmg} endommagé(s)</div>` : ''}
        ${totalMnq   > 0 ? `<div style="font-size:11.5px;color:var(--gold);">❓ ${totalMnq} manquant(s)</div>` : ''}
      </td>
      <td>${statutBadge[r.statut] || r.statut}</td>
      <td>
        ${r.note ? `<span style="font-size:11.5px;color:var(--text2);font-style:italic;">${escapeHTML(r.note)}</span>` : '—'}
      </td>
    </tr>`;
  }).join('');

  buildPagination('retours', filtered.length, 'renderRetours', 'retours-pagination');
}
