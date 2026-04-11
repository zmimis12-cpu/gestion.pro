/* ================================================================
   GestionPro — modules/locaux.js
   Locaux/Zones, Fonds de caisse :
   getLocalProducts, getUniqueLocalProducts,
   openNewLocal, editLocal, saveLocal, deleteLocal,
   viewLocal, renderLocaux, renderFonds
================================================================ */

// ════════════════════════════════════════════════════════
// LOCAUX / ZONES
// ════════════════════════════════════════════════════════
const LOCAL_COLORS = {
  accent:  { bg: 'rgba(37,99,235,0.12)',  border: 'rgba(37,99,235,0.4)',  text: 'var(--accent)',  dot: '#2563eb' },
  blue:    { bg: 'rgba(66,153,225,0.12)', border: 'rgba(66,153,225,0.4)', text: '#4299e1',         dot: '#4299e1' },
  orange:  { bg: 'rgba(255,153,0,0.12)',  border: 'rgba(255,153,0,0.4)',  text: '#ff9900',         dot: '#ff9900' },
  purple:  { bg: 'rgba(108,99,255,0.12)', border: 'rgba(108,99,255,0.4)', text: 'var(--purple)',  dot: '#6c63ff' },
  red:     { bg: 'rgba(229,62,62,0.12)',  border: 'rgba(229,62,62,0.4)',  text: 'var(--red)',      dot: '#e53e3e' },
  gold:    { bg: 'rgba(237,200,50,0.12)', border: 'rgba(237,200,50,0.4)', text: '#edc832',         dot: '#edc832' },
};

function getLocalProducts(localNom) {
  // Chercher par local_id OU zone (les deux) pour couvrir tous les cas
  const localObj = GP_LOCAUX_ALL.find(l => l.nom === localNom);
  const localId  = localObj?.id;
  const result   = products.filter(p =>
    (localId && p.local_id === localId) ||
    (!p.local_id && (p.zone || '').trim().toLowerCase() === localNom.trim().toLowerCase())
  );
  console.log('[getLocalProducts]', localNom, '(id:', localId, ') →', result.length, 'produits, stock total:',
    result.reduce((s,p) => s+(p.stock||0), 0));
  return result;
}

function getUniqueLocalProducts(localNom) {
  // Produits uniques (dédupliqués) dans ce local
  const prods = getLocalProducts(localNom);
  const seen = new Set();
  return prods.filter(p => {
    const key = (p.code&&p.code.trim()) ? p.code.trim().toLowerCase() : p.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function openNewLocal() {
  document.getElementById('local-edit-id').value = '';
  document.getElementById('modal-local-title').textContent = t('local_modal_title_new');
  ['local-nom','local-desc','local-responsable'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('local-couleur').value = 'accent';
  openModal('modal-local');
}

function editLocalFromDetail() {
  const id = document.getElementById('local-edit-id').value;
  if (id) {
    closeModal('modal-local-detail');
    editLocal(id);
  }
}

function editLocal(id) {
  const l = locaux.find(x => x.id === id);
  if (!l) return;
  document.getElementById('local-edit-id').value = id;
  document.getElementById('modal-local-title').textContent = '✏️ Modifier Local';
  document.getElementById('local-nom').value = l.nom || '';
  document.getElementById('local-desc').value = l.desc || '';
  document.getElementById('local-responsable').value = l.responsable || '';
  document.getElementById('local-couleur').value = l.couleur || 'accent';
  openModal('modal-local');
}

function saveLocal() {
  if (!isSuperAdmin() && !hasPermission('locaux', 'create')) { toast('⛔ Permission refusée', 'error'); return; }
  const nom = document.getElementById('local-nom').value.trim();
  if (!nom) { toast(t('toast_name_required'), 'error'); return; }
  const editId = document.getElementById('local-edit-id').value;
  const local = {
    id: editId || uid(),
    nom,
    desc: document.getElementById('local-desc').value.trim(),
    responsable: document.getElementById('local-responsable').value.trim(),
    couleur: document.getElementById('local-couleur').value || 'accent',
    createdAt: editId ? (GP_LOCAUX_ALL.find(x=>x.id===editId)?.createdAt || new Date().toISOString()) : new Date().toISOString()
  };
  if (editId) {
    const idx = GP_LOCAUX_ALL.findIndex(x => x.id === editId);
    const oldNom = idx >= 0 ? GP_LOCAUX_ALL[idx].nom : null;
    if (idx >= 0) GP_LOCAUX_ALL[idx] = local; else GP_LOCAUX_ALL.push(local);
    // ── Mettre à jour zone dans tous les produits qui avaient l'ancien nom ──
    if (oldNom && oldNom !== nom) {
      products.forEach(p => {
        if ((p.zone || '').trim() === oldNom.trim()) p.zone = nom;
        if (p.local_id === editId) p.zone = nom; // sync aussi par local_id
      });
    }
  } else {
    GP_LOCAUX_ALL.push(local);
  }
  locaux = GP_LOCAUX_ALL; // garder l'alias synchronisé
  console.log('[saveLocal] GP_LOCAUX_ALL après ajout:', GP_LOCAUX_ALL.map(l => l.nom));

  // Sauvegarder PUIS recharger depuis Supabase pour confirmer la persistance
  closeModal('modal-local');
  toast('⏳ Sauvegarde en cours...', 'info');

  saveGPLocaux().then(() => {
    // Recharger les locaux depuis Supabase pour confirmer
    return loadSAData();
  }).then(() => {
    console.log('[saveLocal] Locaux rechargés depuis Supabase:', GP_LOCAUX_ALL.map(l => l.nom));
    renderLocaux();
    toast(`✅ "${nom}" ${t('toast_local_saved')}`);
  }).catch(e => {
    console.error('[saveLocal] Erreur:', e);
    renderLocaux(); // Afficher quand même l'état local
    toast(`⚠️ "${nom}" sauvegardé localement — erreur sync`, 'warn');
  });
}

function deleteLocal(id) {
  if (!isSuperAdmin() && !hasPermission('locaux', 'delete')) { toast('⛔ Permission refusée', 'error'); return; }
  const l = GP_LOCAUX_ALL.find(x => x.id === id);
  if (!l) return;
  const prods = getLocalProducts(l.nom);
  if (prods.length > 0) {
    if (!confirm(`Ce local contient ${prods.length} produit(s). Supprimer quand même ? (les produits restent mais sans zone assignée)`)) return;
    prods.forEach(p => { p.zone = ''; });
    // Mettre à jour les produits sans zone dans Supabase
    sbUpsert('gp_products', prods.map(p => ({
      id: p.id, local_id: getLocalId() || p.local_id,
      name: p.name, category: p.category, code: p.code || null,
      type: p.type || 'unite', price: p.price, cost: p.cost || 0,
      stock: p.stock, min_stock: p.minStock || 5,
      unit: p.unit || 'Pièce', zone: null,
      sizes: p.sizes || {}, photo_url: p.photo || null,
      updated_at: new Date().toISOString()
    })));
  } else {
    if (!confirm(`Supprimer le local "${l.nom}" ?`)) return;
  }
  GP_LOCAUX_ALL = GP_LOCAUX_ALL.filter(x => x.id !== id);
  locaux = GP_LOCAUX_ALL;

  // Supprimer en Supabase avec tenant guard
  sb.from('gp_locaux')
    .delete()
    .eq('id', id)
    .eq('tenant_id', GP_TENANT?.id)
    .then(({ error }) => {
      if (error) {
        console.error('[deleteLocal] Erreur Supabase:', error.message);
        toast('⚠️ Erreur suppression Supabase', 'error');
      } else {
        console.log('[deleteLocal] Local supprimé OK:', id);
      }
    });

  renderLocaux();
  toast(t('toast_local_deleted'), 'warn');
}

function viewLocal(id) {
  const l = locaux.find(x => x.id === id);
  if (!l) return;
  document.getElementById('local-edit-id').value = id; // for editLocalFromDetail
  const col = LOCAL_COLORS[l.couleur] || LOCAL_COLORS.accent;
  const prods = getLocalProducts(l.nom);
  const totalStock = prods.reduce((s,p) => s + (p.stock||0), 0);
  const totalValeur = prods.reduce((s,p) => s + (p.stock||0) * (p.cost||p.price||0), 0);
  const totalVente = prods.reduce((s,p) => s + (p.stock||0) * (p.price||0), 0);
  const ruptures = prods.filter(p => p.stock === 0).length;
  const basSt = prods.filter(p => p.stock > 0 && p.stock < p.minStock).length;
  const totalBenef = prods.reduce((s,p) => { const cost=p.cost||0; return s + (p.stock||0)*(p.price-cost); }, 0);

  // Group by category
  const byCat = {};
  prods.forEach(p => {
    const cat = p.category || 'Sans catégorie';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(p);
  });

  const tableRows = prods.slice(0, 200).map((p,i) => {
    const cost = p.cost||0;
    const benef = p.price - cost;
    const statusCls = p.stock===0?'chip-red':p.stock<p.minStock?'chip-orange':'chip-green';
    return `<tr style="background:${i%2===0?'var(--surface)':'var(--surface2)'}">
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-weight:600;font-size:12px;">${escapeHTML(p.name)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text2);">${p.code||'—'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:11px;"><span class="chip chip-purple">${p.category||'—'}</span></td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center;font-weight:700;font-family:var(--font-mono),monospace;">${p.stock} ${p.unit||''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:right;font-family:var(--font-mono),monospace;font-size:12px;">${p.price.toFixed(2)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:right;font-family:var(--font-mono),monospace;font-size:12px;color:var(--text2);">${cost>0?cost.toFixed(2):'—'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:right;font-family:var(--font-mono),monospace;font-size:12px;color:${benef>0?'var(--accent)':'var(--red)'};">${cost>0?(benef>=0?'+':'')+benef.toFixed(2):'—'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);"><span class="chip ${statusCls}" style="font-size:10px;">${p.stock===0?t('stat_rupture'):p.stock<p.minStock?t('stat_bas'):t('stat_ok')}</span></td>
    </tr>`;
  }).join('');

  document.getElementById('local-detail-title').textContent = `🏪 ${l.nom}`;
  document.getElementById('local-detail-content').innerHTML = `
    <!-- Header info -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;">
      <div style="background:${col.bg};border:1px solid ${col.border};border-radius:var(--radius);padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:${col.text};">${prods.length}</div>
        <div style="font-size:11px;color:var(--text2);">Références</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius);padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:700;font-family:var(--font-mono),monospace;">${totalStock.toLocaleString('fr-FR')}</div>
        <div style="font-size:11px;color:var(--text2);">Pièces totales</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius);padding:14px;text-align:center;">
        <div style="font-size:17px;font-weight:900;font-family:var(--font-mono),monospace;color:var(--text2);">${totalValeur.toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:0})}</div>
        <div style="font-size:11px;color:var(--text2);">Valeur achat (MAD)</div>
      </div>
      <div style="background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.2);border-radius:var(--radius);padding:14px;text-align:center;">
        <div style="font-size:17px;font-weight:900;font-family:var(--font-mono),monospace;color:var(--accent);">${totalBenef.toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:0})}</div>
        <div style="font-size:11px;color:var(--text2);">Bénéfice potentiel</div>
      </div>
    </div>
    <!-- Alertes -->
    ${ruptures>0||basSt>0?`<div style="background:rgba(229,62,62,0.08);border:1px solid rgba(229,62,62,0.25);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;">
      ⚠️ <strong>${ruptures} rupture(s)</strong> et <strong>${basSt} stock(s) bas</strong> dans ce local
    </div>`:''}
    <!-- Info -->
    ${l.desc||l.responsable?`<div style="display:flex;gap:10px;margin-bottom:14px;font-size:12px;color:var(--text2);">
      ${l.desc?`<span>📍 ${l.desc}</span>`:''}
      ${l.responsable?`<span>👤 Responsable : <strong style="color:var(--text);">${l.responsable}</strong></span>`:''}
    </div>`:''}
    <!-- Table -->
    ${prods.length===0?`<div class="empty-state"><div class="emoji">📦</div><p>Aucun produit dans ce local</p><p style="font-size:12px;color:var(--text2);">Assignez des produits via Stock → champ "Zone"</p></div>`:`
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:var(--surface2);">
        <th style="padding:9px 10px;text-align:left;border-bottom:2px solid var(--border);">Produit</th>
        <th style="padding:9px 10px;text-align:left;border-bottom:2px solid var(--border);">Code</th>
        <th style="padding:9px 10px;text-align:left;border-bottom:2px solid var(--border);">Catégorie</th>
        <th style="padding:9px 10px;text-align:center;border-bottom:2px solid var(--border);">Stock</th>
        <th style="padding:9px 10px;text-align:right;border-bottom:2px solid var(--border);">Prix vente</th>
        <th style="padding:9px 10px;text-align:right;border-bottom:2px solid var(--border);">Prix achat</th>
        <th style="padding:9px 10px;text-align:right;border-bottom:2px solid var(--border);">Bénéfice/pcs</th>
        <th style="padding:9px 10px;text-align:left;border-bottom:2px solid var(--border);">Statut</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
      <tfoot><tr style="background:var(--surface2);font-weight:800;">
        <td colspan="3" style="padding:9px 10px;border-top:2px solid var(--border);">TOTAUX (${prods.length} réf.)</td>
        <td style="padding:9px 10px;border-top:2px solid var(--border);text-align:center;font-family:var(--font-mono),monospace;">${totalStock.toLocaleString('fr-FR')}</td>
        <td style="padding:9px 10px;border-top:2px solid var(--border);text-align:right;font-family:var(--font-mono),monospace;">${totalVente.toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
        <td style="padding:9px 10px;border-top:2px solid var(--border);text-align:right;font-family:var(--font-mono),monospace;">${totalValeur.toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
        <td style="padding:9px 10px;border-top:2px solid var(--border);text-align:right;font-family:var(--font-mono),monospace;color:var(--accent);">+${totalBenef.toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
        <td style="padding:9px 10px;border-top:2px solid var(--border);"></td>
      </tfoot>
    </table>
    ${prods.length>200?`<div style="padding:10px;font-size:12px;color:var(--text2);text-align:center;">Affichage limité aux 200 premiers produits. Total réel : ${prods.length}</div>`:''}
    `}
  `;
  openModal('modal-local-detail');
}

function renderLocaux() {
  console.log('[renderLocaux] GP_LOCAUX_ALL:', GP_LOCAUX_ALL.length, 'locaux —', GP_LOCAUX_ALL.map(l => l.nom).join(', '));
  const q = (document.getElementById('local-search')?.value || '').toLowerCase();

  // Stats globales
  const statsEl = document.getElementById('locaux-stats');
  if (statsEl) {
    const totalProd = products.length;
    const avecZone = products.filter(p =>
      (p.local_id && GP_LOCAUX_ALL.find(l => l.id === p.local_id)) ||
      (!p.local_id && p.zone && p.zone.trim())
    ).length;
    const sansZone = totalProd - avecZone;
    const totalValeurGlobal = products.reduce((s,p)=>s+(p.stock||0)*(p.cost||p.price||0),0);
    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">🏪</div>
        <div class="stat-value">${locaux.length}</div>
        <div class="stat-label">Locaux configurés</div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon">📦</div>
        <div class="stat-value">${avecZone.toLocaleString('fr-FR')}</div>
        <div class="stat-label">Produits assignés</div>
        <div class="stat-sub">${totalProd} total</div>
      </div>
      <div class="stat-card" style="${sansZone>0?'--card-color:var(--red)':''}">
        <div class="stat-icon">${sansZone>0?'⚠️':'✅'}</div>
        <div class="stat-value">${sansZone.toLocaleString('fr-FR')}</div>
        <div class="stat-label">Sans zone assignée</div>
        ${sansZone>0?`<div class="stat-sub" style="cursor:pointer;color:var(--accent);" onclick="document.getElementById('stock-filter-zone').value='';document.getElementById('stock-filter-statut').value='';navigate('stock')">→ Voir dans Stock</div>`:''}
      </div>
      <div class="stat-card gold">
        <div class="stat-icon">💰</div>
        <div class="stat-value">${(totalValeurGlobal/1000).toFixed(0)}K</div>
        <div class="stat-label">Valeur totale (MAD)</div>
        <div class="stat-sub">${totalValeurGlobal.toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:0})} MAD</div>
      </div>
    `;
  }

  const grid = document.getElementById('locaux-grid');
  if (!grid) return;

  // Toujours partir de GP_LOCAUX_ALL (source de vérité depuis Supabase)
  // locaux[] est un alias de GP_LOCAUX_ALL — les deux sont synchronisés
  let displayLocaux = [...GP_LOCAUX_ALL];
  if (q) displayLocaux = displayLocaux.filter(l =>
    (l.nom || '').toLowerCase().includes(q) ||
    (l.desc || '').toLowerCase().includes(q)
  );
  console.log('[renderLocaux] displayLocaux après filtre:', displayLocaux.length, displayLocaux.map(l => l.nom));

  // Also create virtual "local" for products without zone
  const sansZoneProds = products.filter(p => !p.zone || !p.zone.trim());

  if (!displayLocaux.length && !sansZoneProds.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="emoji">🏪</div><p>${t('local_no_local')}</p><p style="font-size:12px;color:var(--text2);">${t('local_no_local_hint')}</p></div>`;
    return;
  }

  const locPage = getPage('locaux');
  const locPageData = displayLocaux.slice((locPage-1)*PAGE_SIZE, locPage*PAGE_SIZE);
  let html = locPageData.map(l => {
    const col = LOCAL_COLORS[l.couleur] || LOCAL_COLORS.accent;
    const prods = getLocalProducts(l.nom);
    const totalStock = prods.reduce((s,p)=>s+(p.stock||0),0);
    const totalValeur = prods.reduce((s,p)=>s+(p.stock||0)*(p.cost||p.price||0),0);
    const ruptures = prods.filter(p=>p.stock===0).length;
    const basSt = prods.filter(p=>p.stock>0&&p.stock<p.minStock).length;
    const totalBenef = prods.reduce((s,p)=>{const c=p.cost||0;return s+(p.stock||0)*(p.price-c);},0);

    // Top 3 categories
    const catCount = {};
    prods.forEach(p=>{ catCount[p.category||'—']=(catCount[p.category||'—']||0)+1; });
    const topCats = Object.entries(catCount).sort((a,b)=>b[1]-a[1]).slice(0,3);

    return `
    <div style="background:var(--surface);border:1px solid ${col.border};border-radius:16px;overflow:hidden;transition:box-shadow 0.2s;cursor:pointer;" onclick="viewLocal('${l.id}')" onmouseover="this.style.boxShadow='0 4px 20px rgba(0,0,0,0.3)'" onmouseout="this.style.boxShadow='none'">
      <!-- Header -->
      <div style="background:${col.bg};padding:16px 18px;border-bottom:1px solid ${col.border};display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:18px;font-weight:800;color:${col.text};">🏪 ${escapeHTML(l.nom)}</div>
          ${l.desc?`<div style="font-size:12px;color:var(--text2);margin-top:2px;">📍 ${l.desc}</div>`:''}
          ${l.responsable?`<div style="font-size:11px;color:var(--text2);">👤 ${l.responsable}</div>`:''}
        </div>
        <div style="text-align:right;">
          <div style="font-size:28px;font-weight:900;color:${col.text};">${getUniqueLocalProducts(l.nom).length}</div>
          <div style="font-size:11px;color:var(--text2);">références</div>
        </div>
      </div>
      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;padding:0;">
        <div style="padding:12px;text-align:center;border-right:1px solid var(--border);">
          <div style="font-size:16px;font-weight:800;font-family:var(--font-mono),monospace;">${totalStock.toLocaleString('fr-FR')}</div>
          <div style="font-size:10px;color:var(--text2);">pièces</div>
        </div>
        <div style="padding:12px;text-align:center;border-right:1px solid var(--border);">
          <div style="font-size:13px;font-weight:800;font-family:var(--font-mono),monospace;color:var(--text2);">${totalValeur>=1000?(totalValeur/1000).toFixed(1)+'K':totalValeur.toFixed(0)}</div>
          <div style="font-size:10px;color:var(--text2);">valeur achat</div>
        </div>
        <div style="padding:12px;text-align:center;">
          <div style="font-size:13px;font-weight:800;font-family:var(--font-mono),monospace;color:var(--accent);">+${totalBenef>=1000?(totalBenef/1000).toFixed(1)+'K':totalBenef.toFixed(0)}</div>
          <div style="font-size:10px;color:var(--text2);">bénéfice pot.</div>
        </div>
      </div>
      <!-- Alertes + Catégories -->
      <div style="padding:10px 14px;border-top:1px solid var(--border);">
        ${ruptures>0||basSt>0?`<div style="font-size:11px;color:var(--red);margin-bottom:6px;">⚠️ ${ruptures} rupture(s) · ${basSt} stock bas</div>`:''}
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${topCats.map(([cat,n])=>`<span style="font-size:10px;background:var(--surface2);padding:2px 7px;border-radius:var(--radius);color:var(--text2);">${cat} (${n})</span>`).join('')}
        </div>
      </div>
      <!-- Actions -->
      <div style="padding:8px 14px;border-top:1px solid var(--border);display:flex;gap:6px;" onclick="event.stopPropagation()">
        <button class="btn btn-secondary btn-sm" onclick="editLocal('${l.id}')">✏️ Modifier</button>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('stock-filter-zone').value='${l.nom}';navigate('stock')" style="border-color:${col.border};color:${col.text};">📦 Voir stock</button>
        <button class="btn btn-danger btn-sm" onclick="deleteLocal('${l.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');

  // Produits sans zone
  if (sansZoneProds.length > 0 && !q) {
    const ts = sansZoneProds.reduce((s,p)=>s+(p.stock||0),0);
    html += `
    <div style="background:var(--surface);border:1px dashed rgba(229,62,62,0.4);border-radius:16px;overflow:hidden;opacity:0.85;">
      <div style="background:rgba(229,62,62,0.08);padding:14px 18px;border-bottom:1px solid rgba(229,62,62,0.2);display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--red);">${t('local_no_zone')}</div>
          <div style="font-size:12px;color:var(--text2);">${t('local_no_zone_desc')}</div>
        </div>
        <div style="font-size:26px;font-weight:900;color:var(--red);">${sansZoneProds.length}</div>
      </div>
      <div style="padding:12px 16px;display:flex;gap:20px;font-size:12px;">
        <span>📦 <strong>${ts.toLocaleString('fr-FR')}</strong> pièces</span>
      </div>
      <div style="padding:8px 14px;border-top:1px solid var(--border);">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('stock-filter-zone').value='';navigate('stock')" style="border-color:rgba(229,62,62,0.4);color:var(--red);">📦 Voir & assigner</button>
      </div>
    </div>`;
  }

  grid.innerHTML = html;
  buildPagination('locaux', displayLocaux.length, 'renderLocaux', 'locaux-pagination');
}

function renderFonds() {
  const filter = document.getElementById('fonds-filter')?.value || 'all';
  const today = new Date().toDateString();

  // ── Peupler le sélecteur de local ──
  const localSel = document.getElementById('fonds-local-filter');
  if (localSel) {
    const cur = localSel.value;
    localSel.innerHTML = '<option value="">🌐 Tous les locaux</option>' +
      GP_LOCAUX_ALL.map(l => `<option value="${l.id}"${l.id===cur?' selected':''}>${escapeHTML(l.nom)}</option>`).join('');
    if (cur) localSel.value = cur;
    // Si user a un local assigné, filtrer dessus par défaut
    if (!cur && GP_USER?.local_id) localSel.value = GP_USER.local_id;
  }
  const selectedLocal = localSel?.value || '';

  // ── Filtrer les ops par local ──
  const allOps = selectedLocal
    ? caisseOps.filter(o => o.local_id === selectedLocal)
    : caisseOps;

  // Compute running balance (oldest first) — basé sur les ops filtrées
  // Seules les ventes EN ESPÈCES entrent dans le solde physique de la caisse
  const sorted = [...allOps].reverse();
  let running = 0;
  const withBalance = sorted.map(op => {
    if (op.type === 'depot') running += op.amount;
    else if (op.type === 'vente' && (op.payment === 'Espèces' || !op.payment)) running += op.amount;
    else if (op.type === 'retrait' || op.type === 'charge') running -= op.amount;
    else if (op.type === 'cloture') running = op.amount;
    return { ...op, balance: running };
  }).reverse();

  // Current solde
  const soldeTotal = withBalance.length > 0 ? withBalance[0].balance : 0;

  // Today stats
  const todayOps = allOps.filter(o => new Date(o.date).toDateString() === today);
  const todayVentes = todayOps.filter(o => o.type==='vente').reduce((s,o)=>s+o.amount,0);
  const todayVentesEsp = todayOps.filter(o => o.type==='vente' && o.payment==='Espèces').reduce((s,o)=>s+o.amount,0);
  const todayCharges = todayOps.filter(o => o.type==='charge').reduce((s,o)=>s+o.amount,0);
  const todayRetraits = todayOps.filter(o => o.type==='retrait').reduce((s,o)=>s+o.amount,0);
  const todayDepots = todayOps.filter(o => o.type==='depot').reduce((s,o)=>s+o.amount,0);
  const todayVentesCarte = todayOps.filter(o => o.type==='vente' && o.payment==='Carte').reduce((s,o)=>s+o.amount,0);
  const todayVentesCredit = todayOps.filter(o => o.type==='vente' && o.payment==='Crédit').reduce((s,o)=>s+o.amount,0);
  const todayVentesTotal = todayOps.filter(o => o.type==='vente').reduce((s,o)=>s+o.amount,0);

  // Stats cards
  const statsEl = document.getElementById('fonds-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="stat-card green">
        <div class="stat-icon">💵</div>
        <div class="stat-value" style="font-size:20px;">${soldeTotal.toFixed(2)}</div>
        <div class="stat-label">Solde caisse (MAD)</div>
        <div class="stat-sub">Espèces disponibles</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-icon">🧾</div>
        <div class="stat-value" style="font-size:20px;">${todayVentesEsp.toFixed(2)}</div>
        <div class="stat-label">Ventes Espèces</div>
        <div class="stat-sub">${todayOps.filter(o=>o.type==='vente'&&o.payment==='Espèces').length} ventes</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-icon">💳</div>
        <div class="stat-value" style="font-size:20px;">${todayVentesCarte.toFixed(2)}</div>
        <div class="stat-label">Ventes Carte</div>
        <div class="stat-sub">${todayOps.filter(o=>o.type==='vente'&&o.payment==='Carte').length} ventes</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-icon">📋</div>
        <div class="stat-value" style="font-size:20px;">${todayVentesCredit.toFixed(2)}</div>
        <div class="stat-label">Ventes Crédit</div>
        <div class="stat-sub">${todayOps.filter(o=>o.type==='vente'&&o.payment==='Crédit').length} ventes · à encaisser</div>
      </div>
    `;
  }

  // Today summary
  const todaySummary = document.getElementById('fonds-today-summary');
  if (todaySummary) {
    const rows = [
      [`💵 Espèces`, todayVentesEsp, 'green'],
      [`💳 Carte`, todayVentesCarte, 'purple'],
      [`📋 Crédit`, todayVentesCredit, 'gold'],
      [`➕ ${t('fonds_depots')}`, todayDepots, 'green'],
      [`💸 ${t('fonds_retraits')}`, -todayRetraits, 'red'],
      [`📋 ${t('fonds_charges')}`, -todayCharges, 'red'],
      [`📊 Total ventes`, todayVentesTotal, 'accent'],
    ];
    todaySummary.innerHTML = rows.map(([lbl, val, color]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span>${lbl}</span>
        <span style="font-family:var(--font-mono),monospace;font-weight:700;color:var(--${color==='green'?'accent':color==='red'?'red':'accent3'});">
          ${val >= 0 ? '+' : ''}${val.toFixed(2)} MAD
        </span>
      </div>
    `).join('') + `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;font-size:14px;font-weight:800;">
        <span>${currentLang==='ar'?'صافي اليوم':'Net du jour'}</span>
        <span style="font-family:var(--font-mono),monospace;color:${(todayVentesEsp+todayDepots-todayRetraits-todayCharges)>=0?'var(--accent)':'var(--red)'};">
          ${(todayVentesEsp+todayDepots-todayRetraits-todayCharges)>=0?'+':''}${(todayVentesEsp+todayDepots-todayRetraits-todayCharges).toFixed(2)} MAD
        </span>
      </div>
    `;
  }

  // Table
  const filtered = filter === 'all' ? withBalance : withBalance.filter(o => o.type === filter);

  // Badge solde par local si filtre actif
  const badge = document.getElementById('fonds-local-solde-badge');
  if (badge) {
    if (selectedLocal) {
      badge.textContent = `💵 Solde: ${soldeTotal.toFixed(2)} MAD`;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }
  const tbody = document.getElementById('fonds-table');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="emoji">📋</div><p>${t('ord_no_orders')}</p></div></td></tr>`;
    return;
  }

  const typeConfig = {
    vente:   { label:t('fonds_ventes'),   chip:'chip-green',  icon:'🧾', entree: true  },
    depot:   { label:t('fonds_depots'),   chip:'chip-green',  icon:'➕', entree: true  },
    retrait: { label:t('fonds_retraits'), chip:'chip-red',    icon:'💸', entree: false },
    charge:  { label:t('fonds_charges'),  chip:'chip-orange', icon:'📋', entree: false },
    cloture: { label:t('fonds_close').replace('🔒 ',''),   chip:'chip-purple', icon:'🔒', entree: null  },
  };

  tbody.innerHTML = filtered.map(op => {
    const cfg = typeConfig[op.type] || { label: op.type, chip: 'chip-purple', icon: '•', entree: null };
    const dateStr = new Date(op.date).toLocaleString('fr-FR', {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});

    // Pour les ventes : seules espèces = entrée caisse. Carte/Crédit = info seulement (pas dans solde)
    let entree = '—', sortie = '—';
    if (op.type === 'vente') {
      const isCash = op.payment === 'Espèces' || !op.payment;
      if (isCash) {
        entree = `<span style="color:var(--accent);font-family:var(--font-mono),monospace;font-weight:700;">+${op.amount.toFixed(2)}</span>`;
      } else {
        // Carte ou Crédit : montrer en gris informatif, pas dans le solde espèces
        const col = op.payment === 'Carte' ? 'var(--purple)' : 'var(--gold)';
        entree = `<span style="color:${col};font-family:var(--font-mono),monospace;font-size:11px;opacity:0.7;">${op.amount.toFixed(2)} ℹ</span>`;
      }
    } else if (cfg.entree === true) {
      entree = `<span style="color:var(--accent);font-family:var(--font-mono),monospace;font-weight:700;">+${op.amount.toFixed(2)}</span>`;
    } else if (cfg.entree === false) {
      sortie = `<span style="color:var(--red);font-family:var(--font-mono),monospace;font-weight:700;">-${op.amount.toFixed(2)}</span>`;
    } else if (cfg.entree === null) {
      sortie = `<span style="font-family:var(--font-mono),monospace;">${op.amount.toFixed(2)}</span>`;
    }

    const balColor = op.balance >= 0 ? 'var(--accent)' : 'var(--red)';
    // Chip paiement pour les ventes
    const payBadge = op.type === 'vente' && op.payment
      ? ` <span class="chip ${op.payment==='Espèces'?'chip-green':op.payment==='Carte'?'chip-purple':'chip-gold'}" style="font-size:10px;padding:1px 6px;">${op.payment}</span>`
      : '';
    return `<tr>
      <td style="font-size:12px;color:var(--text2);">${dateStr}</td>
      <td><span class="chip ${cfg.chip}">${cfg.icon} ${cfg.label}</span>${payBadge}</td>
      <td style="font-size:13px;max-width:220px;">${op.label}</td>
      <td style="text-align:right;">${entree}</td>
      <td style="text-align:right;">${sortie}</td>
      <td style="text-align:right;font-family:var(--font-mono),monospace;font-weight:700;color:${balColor};">${op.balance.toFixed(2)}</td>
      <td>${op.type !== 'vente' && op.type !== 'cloture' ? `<button class="btn btn-danger btn-sm" onclick="deleteCaisseOp('${op.id}')">🗑️</button>` : ''}</td>
    </tr>`;
  }).join('');
}
