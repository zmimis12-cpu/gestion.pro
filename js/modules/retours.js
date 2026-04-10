/* ================================================================
   GestionPro — modules/retours.js
   Gestion des retours produits v2.0

   FORMULE MÉTIER :
   Montant initial crédit = Σ(qté vendue × prix unitaire)
   Déduction conforme     = Σ(qté conforme × prix unitaire)
   Montant restant dû     = initial − déduction conforme
   Charge client          = endommagé + manquant (en MAD)

   RÈGLES :
   - Conforme  → stock réintégré + dette client réduite
   - Endommagé → pas de stock + dette maintenue
   - Manquant  → pas de stock + dette maintenue
================================================================ */

let retours = [];

/* ── Helper : prix unitaire depuis item vente ── */
function _getItemUnitPrice(item) {
  return item.sellPrice || item.price || 0;
}

/* ── Calcul résumé crédit d'une vente ── */
function calcCreditSummary(saleId) {
  const sale = sales.find(s => s.id === saleId);
  if (!sale) return { initial:0, conformeDeduit:0, restantDu:0, chargeDommagee:0, chargeManquante:0, chargeClient:0 };

  const initial     = sale.total || 0;
  const saleRetours = retours.filter(r => r.saleId === saleId);

  let conformeDeduit = 0, chargeDommagee = 0, chargeManquante = 0;

  saleRetours.forEach(r => {
    r.lines.forEach(line => {
      const item      = sale.items?.find(i => (i.productId || i.id) === line.productId);
      const unitPrice = line.unitPrice || (item ? _getItemUnitPrice(item) : 0);
      conformeDeduit  += (line.qteConforme  || 0) * unitPrice;
      chargeDommagee  += (line.qteDommagee  || 0) * unitPrice;
      chargeManquante += (line.qteManquante || 0) * unitPrice;
    });
  });

  return {
    initial,
    conformeDeduit,
    restantDu:   Math.max(0, initial - conformeDeduit),
    chargeDommagee,
    chargeManquante,
    chargeClient: chargeDommagee + chargeManquante,
  };
}

/* ── Quantités déjà retournées par produit pour une vente ── */
function _getAlreadyReturned(saleId) {
  const map = {};
  retours.filter(r => r.saleId === saleId).forEach(r => {
    r.lines.forEach(l => {
      const total = (l.qteConforme||0) + (l.qteDommagee||0) + (l.qteManquante||0);
      map[l.productId] = (map[l.productId] || 0) + total;
    });
  });
  return map;
}

/* ════════════════════════════════════════
   OUVRIR MODAL RETOUR
════════════════════════════════════════ */
function openRetourModal(saleId) {
  if (!isSuperAdmin() && !hasPermission('commandes', 'update')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  const sale = sales.find(s => s.id === saleId);
  if (!sale) { toast('Vente introuvable', 'error'); return; }
  if (!sale.items?.length) { toast('Aucun article dans cette vente', 'warn'); return; }

  const alreadyReturned = _getAlreadyReturned(saleId);
  const isCreditSale    = sale.payment === 'Crédit' || sale.isCreditSale;
  const saleNum         = 'ORD-' + String(sales.indexOf(sale) + 1).padStart(4, '0');
  const dateStr         = new Date(sale.date).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
  const clientLabel     = (sale.clientName && sale.clientName !== 'undefined')
    ? escapeHTML(sale.clientName)
    : sale.clientId ? (clients.find(c => c.id === sale.clientId)?.name || '—') : 'Client de passage';

  document.getElementById('retour-sale-ref').textContent    = saleNum;
  document.getElementById('retour-sale-date').textContent   = dateStr;
  document.getElementById('retour-sale-client').textContent = clientLabel;
  document.getElementById('retour-sale-id').value           = saleId;

  // Banner crédit
  const banner = document.getElementById('retour-credit-banner');
  if (banner) {
    if (isCreditSale) {
      const s = calcCreditSummary(saleId);
      banner.style.display = 'block';
      banner.innerHTML = `<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;padding:10px 14px;background:var(--accent-light);border-radius:var(--radius-sm);border:1px solid var(--accent-mid);">
        <div>💳 <strong>Vente crédit</strong></div>
        <div>Initial : <strong>${fmt(s.initial)}</strong></div>
        <div style="color:var(--green);">Déjà déduit : <strong>−${fmt(s.conformeDeduit)}</strong></div>
        <div style="color:var(--red);">Restant dû : <strong>${fmt(s.restantDu)}</strong></div>
      </div>`;
    } else {
      banner.style.display = 'none';
    }
  }

  // Lignes
  document.getElementById('retour-lines').innerHTML = sale.items.map((item, idx) => {
    const pid      = item.productId || item.id;
    const prod     = products.find(p => p.id === pid);
    const name     = prod?.name || item.name || 'Produit inconnu';
    const sold     = item.qty || 1;
    const returned = alreadyReturned[pid] || 0;
    const maxQty   = sold - returned;
    const price    = _getItemUnitPrice(item);

    if (maxQty <= 0) return `<div class="retour-line" style="opacity:0.5;">
      <div class="retour-line-name">${escapeHTML(name)}</div>
      <div style="font-size:11.5px;color:var(--green);font-weight:600;">✅ Déjà entièrement retourné</div>
    </div>`;

    return `<div class="retour-line" data-idx="${idx}" data-pid="${pid}" data-max="${maxQty}" data-price="${price}" data-is-credit="${isCreditSale?1:0}">
      <div class="retour-line-header">
        <div class="retour-line-name">${escapeHTML(name)}</div>
        <div class="retour-line-meta">
          Vendu : <strong>${sold}</strong>${returned>0?` · Retourné : <strong>${returned}</strong>`:''} · Disponible : <strong>${maxQty}</strong>${price>0?` · <span style="color:var(--accent);">${fmt(price)}/pcs</span>`:''}
        </div>
      </div>
      <div class="retour-line-inputs">
        <div class="retour-field"><label>✅ Conforme</label>
          <input type="number" class="retour-input" data-type="conforme" min="0" max="${maxQty}" value="0"
            oninput="validateRetourLine(this,${maxQty});_updateRetourTotalImpact();" placeholder="0">
        </div>
        <div class="retour-field"><label>💥 Endommagé</label>
          <input type="number" class="retour-input" data-type="dommagee" min="0" max="${maxQty}" value="0"
            oninput="validateRetourLine(this,${maxQty});_updateRetourTotalImpact();" placeholder="0">
        </div>
        <div class="retour-field"><label>❓ Manquant</label>
          <input type="number" class="retour-input" data-type="manquante" min="0" max="${maxQty}" value="0"
            oninput="validateRetourLine(this,${maxQty});_updateRetourTotalImpact();" placeholder="0">
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('retour-note').value = '';
  document.getElementById('retour-error').style.display = 'none';
  const impactEl = document.getElementById('retour-total-impact');
  if (impactEl) impactEl.style.display = 'none';
  openModal('modal-retour');
}

/* ── Validation ligne ── */
function validateRetourLine(input, maxQty) {
  const line = input.closest('.retour-line');
  if (!line) return;
  let total = 0;
  line.querySelectorAll('.retour-input').forEach(inp => { total += parseInt(inp.value)||0; });
  if (total > maxQty) {
    const excess = total - maxQty;
    input.value  = Math.max(0, (parseInt(input.value)||0) - excess);
    input.style.borderColor = 'var(--red)';
    input.style.boxShadow   = '0 0 0 3px rgba(220,38,38,0.12)';
    setTimeout(() => { input.style.borderColor=''; input.style.boxShadow=''; }, 1500);
    toast('Total retourné ne peut pas dépasser la quantité vendue', 'warn');
  }
}

/* ── Mise à jour impact total (crédit) ── */
function _updateRetourTotalImpact() {
  const saleId = document.getElementById('retour-sale-id')?.value;
  if (!saleId) return;
  const sale = sales.find(s => s.id === saleId);
  if (!sale || (sale.payment !== 'Crédit' && !sale.isCreditSale)) return;

  let totalDeduction = 0, totalCharge = 0;
  document.querySelectorAll('#retour-lines .retour-line[data-pid]').forEach(lineEl => {
    const price = parseFloat(lineEl.dataset.price) || 0;
    lineEl.querySelectorAll('.retour-input').forEach(inp => {
      const v = parseInt(inp.value)||0;
      if (inp.dataset.type === 'conforme')  totalDeduction += v * price;
      if (inp.dataset.type === 'dommagee')  totalCharge    += v * price;
      if (inp.dataset.type === 'manquante') totalCharge    += v * price;
    });
  });

  const summary       = calcCreditSummary(saleId);
  const nouveauRestant = Math.max(0, summary.restantDu - totalDeduction);
  const impactEl = document.getElementById('retour-total-impact');
  if (!impactEl) return;

  if (totalDeduction > 0 || totalCharge > 0) {
    impactEl.style.display = 'block';
    impactEl.innerHTML = `<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;padding:10px 14px;background:var(--surface2);border-radius:var(--radius-sm);border:1px solid var(--border);">
      ${totalDeduction>0?`<div style="color:var(--green);">✅ Déduction : <strong>−${fmt(totalDeduction)}</strong></div>`:''}
      ${totalCharge>0?`<div style="color:var(--red);">⚠️ Charge client : <strong>${fmt(totalCharge)}</strong></div>`:''}
      <div style="color:var(--accent);">💳 Nouveau solde dû : <strong>${fmt(nouveauRestant)}</strong></div>
    </div>`;
  } else {
    impactEl.style.display = 'none';
  }
}

/* ════════════════════════════════════════
   CONFIRMER RETOUR
════════════════════════════════════════ */
async function confirmRetour() {
  const saleId = document.getElementById('retour-sale-id').value;
  const note   = document.getElementById('retour-note').value.trim();
  const errEl  = document.getElementById('retour-error');
  const sale   = sales.find(s => s.id === saleId);
  if (!sale) return;

  const isCreditSale = sale.payment === 'Crédit' || sale.isCreditSale;

  // Collecter lignes
  const lines = [];
  let validErr = null;
  document.querySelectorAll('#retour-lines .retour-line[data-pid]').forEach(lineEl => {
    if (validErr) return;
    const pid    = lineEl.dataset.pid;
    const maxQty = parseInt(lineEl.dataset.max) || 0;
    const price  = parseFloat(lineEl.dataset.price) || 0;
    let conforme=0, dommagee=0, manquante=0;
    lineEl.querySelectorAll('.retour-input').forEach(inp => {
      const v = Math.max(0, parseInt(inp.value)||0);
      if (inp.dataset.type==='conforme')  conforme  = v;
      if (inp.dataset.type==='dommagee')  dommagee  = v;
      if (inp.dataset.type==='manquante') manquante = v;
    });
    const total = conforme + dommagee + manquante;
    if (total === 0) return;
    if (total > maxQty) { validErr = `Quantité invalide (max: ${maxQty})`; return; }
    lines.push({ productId:pid, qteConforme:conforme, qteDommagee:dommagee, qteManquante:manquante, unitPrice:price });
  });

  if (validErr) { errEl.textContent=validErr; errEl.style.display='block'; return; }
  if (!lines.length) { errEl.textContent='Saisissez au moins une quantité'; errEl.style.display='block'; return; }
  errEl.style.display='none';

  // Statut global
  const hasCon = lines.some(l=>l.qteConforme>0);
  const hasDmg = lines.some(l=>l.qteDommagee>0);
  const hasMnq = lines.some(l=>l.qteManquante>0);
  const statut = hasDmg ? 'endommage' : hasMnq ? 'manque' : 'conforme';

  const retourId = uid();
  const retour = {
    id:retourId, saleId, date:new Date().toISOString(),
    local_id:sale.local_id||getLocalId(), tenant_id:GP_TENANT?.id,
    clientId:sale.clientId||null, clientName:sale.clientName||'Client de passage',
    lines, note, statut, createdBy:GP_USER?.id||null,
  };

  const retourDB = {
    id:retourId, sale_id:saleId, date:retour.date,
    local_id:retour.local_id, tenant_id:retour.tenant_id,
    client_id:retour.clientId, client_name:retour.clientName,
    lines:JSON.stringify(lines), note:note||null, statut,
    created_by:retour.createdBy,
  };

  console.log('[Retour] Envoi gp_retours:', retourDB);

  // ══ IMPACT 1 : Stock (conformes uniquement) ══
  lines.forEach(line => {
    if (line.qteConforme<=0) return;
    const prod = products.find(p => p.id===line.productId);
    if (!prod) return;
    const before = prod.stock;
    prod.stock = (prod.stock||0) + line.qteConforme;
    console.log(`[Retour] Stock ${prod.name}: ${before} → ${prod.stock}`);
  });

  // ══ IMPACT 2 : Crédit client (conformes uniquement) ══
  let creditDeduction = 0;
  if (isCreditSale && sale.clientId) {
    const client = clients.find(c => c.id===sale.clientId);
    if (client) {
      lines.forEach(l => { creditDeduction += (l.qteConforme||0) * (l.unitPrice||0); });
      if (creditDeduction > 0) {
        const before = client.creditUsed || 0;
        client.creditUsed = Math.max(0, before - creditDeduction);
        if (!client.transactions) client.transactions = [];
        client.transactions.push({
          type:'retour_conforme', amount:creditDeduction,
          date:retour.date,
          note:`Retour conforme ${retourId.slice(-6)} — déduction ${fmt(creditDeduction)}`,
        });
        console.log(`[Retour] Dette client: ${before} → ${client.creditUsed} (déduction: ${creditDeduction})`);
      }
      // Log charge endommagé/manquant
      const charge = lines.reduce((s,l)=>s+((l.qteDommagee||0)+(l.qteManquante||0))*(l.unitPrice||0),0);
      if (charge > 0) {
        client.transactions.push({
          type:'charge_retour', amount:charge, date:retour.date,
          note:`Charge retour non conforme — ${fmt(charge)} à la charge du client`,
        });
        console.log(`[Retour] Charge client endommagé+manquant: ${charge}`);
      }
    }
  }

  // Sauvegarder
  retours.unshift(retour);
  save();
  const sIdx = sales.findIndex(s=>s.id===saleId);
  if (sIdx>=0) { sales[sIdx].hasRetour=true; sales[sIdx].retourIds=[...(sales[sIdx].retourIds||[]),retourId]; }

  // ═══ SYNC SUPABASE ═══
  let ok = true;

  // 1. gp_retours
  try {
    const {error} = await sb.from('gp_retours').upsert(retourDB,{onConflict:'id'});
    if (error) { console.error('[Retour] gp_retours:',error.message); ok=false; }
    else console.log('[Retour] gp_retours OK');
  } catch(e) { console.error('[Retour] gp_retours exception:',e); ok=false; }

  // 2. gp_products (UPDATE ciblé — pas upsert complet)
  for (const line of lines) {
    if (line.qteConforme<=0) continue;
    const prod = products.find(p=>p.id===line.productId);
    if (!prod) continue;
    try {
      const {error} = await sb.from('gp_products')
        .update({stock:prod.stock, updated_at:new Date().toISOString()})
        .eq('id',prod.id).eq('tenant_id',GP_TENANT?.id);
      if (error) { console.error('[Retour] gp_products:',error.message); ok=false; }
    } catch(e) { console.error('[Retour] gp_products exception:',e); ok=false; }
  }

  // 3. gp_clients (si crédit déduit)
  if (isCreditSale && sale.clientId && creditDeduction>0) {
    const client = clients.find(c=>c.id===sale.clientId);
    if (client) {
      try {
        const {error} = await sb.from('gp_clients')
          .update({
            credit_used:client.creditUsed,
            transactions:client.transactions,
            updated_at:new Date().toISOString(),
          })
          .eq('id',client.id).eq('tenant_id',GP_TENANT?.id);
        if (error) { console.error('[Retour] gp_clients:',error.message); ok=false; }
        else console.log('[Retour] Crédit client OK → solde:',client.creditUsed);
      } catch(e) { console.error('[Retour] gp_clients exception:',e); ok=false; }
    }
  }

  closeModal('modal-retour');

  // Toast
  const tCon = lines.reduce((s,l)=>s+l.qteConforme,0);
  const tDmg = lines.reduce((s,l)=>s+l.qteDommagee,0);
  const tMnq = lines.reduce((s,l)=>s+l.qteManquante,0);
  let msg = '↩️ Retour enregistré';
  if (tCon>0) msg+=` — ${tCon} pcs remis en stock`;
  if (creditDeduction>0) msg+=` · −${fmt(creditDeduction)} déduit de la dette`;
  if (tDmg>0) msg+=` · ${tDmg} endommagé(s) à charge`;
  if (tMnq>0) msg+=` · ${tMnq} manquant(s) à charge`;
  toast(msg, ok?'success':'warn');
  if (!ok) toast('⚠️ Erreur sync Supabase — vérifiez la console','warn');

  if (typeof renderCommandes  === 'function') renderCommandes(false);
  if (typeof renderStockTable === 'function') renderStockTable(false);
  if (typeof renderClients    === 'function') renderClients(false);
  if (typeof renderRetours    === 'function') renderRetours();
  if (typeof renderDashboard  === 'function') renderDashboard();
  updateAlertCount();
}

/* ════════════════════════════════════════
   AFFICHAGE PAGE RETOURS
════════════════════════════════════════ */
function renderRetours(resetPage) {
  if (resetPage!==false) _pages['retours']=1;
  const q     = (document.getElementById('retour-search')?.value||''). toLowerCase();
  const statF = document.getElementById('retour-filter-statut')?.value||'all';
  const tbody = document.getElementById('retours-table');
  if (!tbody) return;

  let filtered = [...retours];
  if (q) filtered=filtered.filter(r=>(r.clientName||''). toLowerCase().includes(q)||(r.note||''). toLowerCase().includes(q));
  if (statF!=='all') filtered=filtered.filter(r=>r.statut===statF);

  if (!filtered.length) {
    tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state"><div class="emoji">↩️</div><p>Aucun retour enregistré</p></div></td></tr>`;
    const pag=document.getElementById('retours-pagination'); if(pag) pag.innerHTML=''; return;
  }

  const page=getPage('retours');
  const pageData=filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const badge={conforme:'<span class="chip chip-green">✅ Conforme</span>',endommage:'<span class="chip chip-red">💥 Endommagé</span>',manque:'<span class="chip chip-orange">❓ Manquant</span>'};

  tbody.innerHTML=pageData.map(r=>{
    const sale=sales.find(s=>s.id===r.saleId);
    const dateStr=new Date(r.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'});
    const saleNum=sale?'ORD-'+String(sales.indexOf(sale)+1).padStart(4,'0'):'—';
    const isCred=sale&&(sale.payment==='Crédit'||sale.isCreditSale);
    const tCon=r.lines.reduce((s,l)=>s+(l.qteConforme||0),0);
    const tDmg=r.lines.reduce((s,l)=>s+(l.qteDommagee||0),0);
    const tMnq=r.lines.reduce((s,l)=>s+(l.qteManquante||0),0);
    const ded=r.lines.reduce((s,l)=>s+(l.qteConforme||0)*(l.unitPrice||0),0);
    const chg=r.lines.reduce((s,l)=>s+((l.qteDommagee||0)+(l.qteManquante||0))*(l.unitPrice||0),0);
    const clientLabel=(r.clientName&&r.clientName!=='undefined')?escapeHTML(r.clientName):'Client de passage';
    return `<tr>
      <td style="font-size:12px;">${dateStr}</td>
      <td style="font-family:var(--font-mono),monospace;font-size:11.5px;color:var(--accent);">${saleNum}</td>
      <td style="font-weight:600;">${clientLabel}</td>
      <td>${r.lines.map(l=>{const p=products.find(x=>x.id===l.productId);const t=(l.qteConforme||0)+(l.qteDommagee||0)+(l.qteManquante||0);return `<div style="font-size:12px;">${escapeHTML(p?.name||'?')}×${t}</div>`;}).join('')}</td>
      <td>
        ${tCon>0?`<div style="font-size:11.5px;color:var(--green);">✅ ${tCon} conforme(s)${ded>0?' (−'+fmt(ded)+')':''}</div>`:''}
        ${tDmg>0?`<div style="font-size:11.5px;color:var(--red);">💥 ${tDmg} endommagé(s)</div>`:''}
        ${tMnq>0?`<div style="font-size:11.5px;color:var(--gold);">❓ ${tMnq} manquant(s)</div>`:''}
        ${isCred&&chg>0?`<div style="font-size:11px;color:var(--red);">Charge : ${fmt(chg)}</div>`:''}
      </td>
      <td>${badge[r.statut]||r.statut}</td>
      <td style="font-size:11.5px;color:var(--text2);font-style:italic;">${r.note?escapeHTML(r.note):'—'}</td>
    </tr>`;
  }).join('');

  buildPagination('retours',filtered.length,'renderRetours','retours-pagination');
}

/* ── Résumé crédit+retours pour fiche client ── */
function getClientCreditRetourSummary(clientId) {
  const creditSales=sales.filter(s=>s.clientId===clientId&&(s.payment==='Crédit'||s.isCreditSale));
  if (!creditSales.length) return '';
  let totalInitial=0,totalDeduit=0,totalCharge=0;
  creditSales.forEach(sale=>{
    const s=calcCreditSummary(sale.id);
    totalInitial+=s.initial; totalDeduit+=s.conformeDeduit; totalCharge+=s.chargeClient;
  });
  const restantDu=Math.max(0,totalInitial-totalDeduit);
  return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-top:12px;">
    <div style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">📊 Crédit & Retours</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
      <div>💳 Crédit initial : <strong>${fmt(totalInitial)}</strong></div>
      <div style="color:var(--green);">✅ Déduit (retours conformes) : <strong>−${fmt(totalDeduit)}</strong></div>
      <div style="color:var(--red);">💰 Restant dû : <strong>${fmt(restantDu)}</strong></div>
      ${totalCharge>0?`<div style="color:var(--gold);">⚠️ Charge client : <strong>${fmt(totalCharge)}</strong></div>`:''}
    </div>
  </div>`;
}
