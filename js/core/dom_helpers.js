/* ================================================================
   GestionPro — core/dom_helpers.js
   Helpers DOM : getUserLocalName, populateLocalSelect,
   populateProductLocalSelects, openTransfertFromProduct,
   openTransfertModal, updateTransfertQtyMax
================================================================ */

function getUserLocalName() {
  if (isSuperAdmin() || !GP_USER) return '';
  if (GP_USER.local_id) {
    const loc = GP_LOCAUX_ALL.find(l => l.id === GP_USER.local_id);
    return loc ? loc.nom : (GP_USER.local_nom || '');
  }
  return GP_USER.local_nom || GP_USER.local || '';
}

function populateLocalSelect(selId, addEmpty = true, curValue = '') {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const list = isSuperAdmin() ? GP_LOCAUX_ALL : GP_LOCAUX_ALL.filter(l => !GP_USER?.local_id || l.id === GP_USER.local_id);
  sel.innerHTML = (addEmpty ? '<option value="">— Sélectionner un local —</option>' : '') +
    list.map(l => `<option value="${l.nom}"${l.nom === curValue ? ' selected' : ''}>${escapeHTML(l.nom)}</option>`).join('');
}

function populateProductLocalSelects(curValue = '') {
  populateLocalSelect('prod-zone', true, curValue);
  if (!isSuperAdmin()) {
    const ul = getUserLocalName();
    if (ul) {
      const sel = document.getElementById('prod-zone');
      if (sel) { sel.value = ul; sel.disabled = true; }
    }
  }
}

function populateEditProductLocalSelects(curValue = '') {
  populateLocalSelect('edit-prod-zone', true, curValue);
  if (!isSuperAdmin()) {
    const ul = getUserLocalName();
    if (ul && !curValue) {
      const sel = document.getElementById('edit-prod-zone');
      if (sel) sel.value = ul;
    }
  }
}

// ─── TRANSFERT STOCK ────────────────────────────────────────────────────────

function openTransfertFromProduct(productId, destLid) {
  // Ouvrir le modal transfert pré-rempli avec le produit et la destination
  openTransfertModal();
  setTimeout(() => {
    const trProd = document.getElementById('tr-produit');
    const trTo   = document.getElementById('tr-to');
    // Chercher un variant avec du stock disponible
    const variants = products.filter(p => {
      const key = (products.find(x=>x.id===productId)?.code||'').toLowerCase() || products.find(x=>x.id===productId)?.name?.toLowerCase();
      const myKey = (p.code||'').toLowerCase() || p.name?.toLowerCase();
      return myKey === key && p.local_id !== destLid && p.stock > 0;
    });
    if (variants.length > 0 && trProd) {
      // Sélectionner le variant avec le plus de stock
      const best = variants.sort((a,b) => b.stock - a.stock)[0];
      trProd.value = best.id;
      document.getElementById('tr-from').value = best.local_id;
      if (trTo) trTo.value = destLid;
      updateTransfertQtyMax();
    }
  }, 100);
}

function openTransfertModal() {
  if (!isSuperAdmin() && !hasPermission('stock','update')) { toast('⛔ Permission refusée', 'error'); return; }

  const trProd = document.getElementById('tr-produit');
  if (trProd) {
    // Grouper par code/nom → 1 option par produit unique avec stock total
    const prodGroups = new Map();
    products.filter(p => p.stock > 0).forEach(p => {
      const key = (p.code&&p.code.trim()) ? p.code.trim().toLowerCase() : `${p.name.trim().toLowerCase()}||${(p.category||'').toLowerCase()}`;
      if (!prodGroups.has(key)) prodGroups.set(key, { ...p, _totalStock: p.stock, _variants: [p] });
      else { const g = prodGroups.get(key); g._totalStock += p.stock; g._variants.push(p); }
    });
    trProd.innerHTML = '<option value="">— Sélectionner un produit —</option>' +
      [...prodGroups.values()]
        .sort((a,b) => a.name.localeCompare(b.name))
        .map(g => {
          // Stocker l'id du premier variant avec du stock comme référence
          const stockInfo = g._variants.length > 1
            ? `stock total: ${g._totalStock} · ${g._variants.length} locaux`
            : (() => { const lNom = GP_LOCAUX_ALL.find(l=>l.id===g.local_id)?.nom||g.zone||'?'; return `${lNom} — stock: ${g._totalStock}`; })();
          return `<option value="${g.id}" data-key="${(g.code&&g.code.trim())?g.code.trim().toLowerCase():`${g.name.trim().toLowerCase()}||${(g.category||'').toLowerCase()}`}">${g.name} (${stockInfo})</option>`;
        })
        .join('');
  }

  const trFrom = document.getElementById('tr-from');
  if (trFrom) trFrom.innerHTML = '<option value="">— Local source —</option>' +
    GP_LOCAUX_ALL.filter(l=>l.actif!==false).map(l => `<option value="${l.id}">${escapeHTML(l.nom)}</option>`).join('');

  const trTo = document.getElementById('tr-to');
  if (trTo) trTo.innerHTML = '<option value="">— Local destination —</option>' +
    GP_LOCAUX_ALL.filter(l=>l.actif!==false).map(l => `<option value="${l.id}">${escapeHTML(l.nom)}</option>`).join('');

  const qEl = document.getElementById('tr-qty');
  const nEl = document.getElementById('tr-note');
  const iEl = document.getElementById('tr-qty-info');
  if (qEl) qEl.value = '';
  if (nEl) nEl.value = '';
  if (iEl) iEl.textContent = '';
  openModal('modal-transfert');
}

function updateTransfertQtyMax() {
  const prodId  = document.getElementById('tr-produit')?.value;
  const fromLid = document.getElementById('tr-from')?.value;
  if (!prodId) { const i = document.getElementById('tr-qty-info'); if (i) i.textContent=''; return; }
  // Récupérer le produit de référence puis chercher le variant dans le local source
  const refProd = products.find(x => x.id === prodId);
  if (!refProd) return;
  const key = (refProd.code&&refProd.code.trim()) ? refProd.code.trim().toLowerCase() : `${refProd.name.trim().toLowerCase()}||${(refProd.category||'').toLowerCase()}`;
  const variants = products.filter(p => {
    const pk = (p.code&&p.code.trim()) ? p.code.trim().toLowerCase() : `${p.name.trim().toLowerCase()}||${(p.category||'').toLowerCase()}`;
    return pk === key;
  });
  // Auto-select local source : celui avec le plus de stock
  const trFrom = document.getElementById('tr-from');
  if (!fromLid && trFrom) {
    const best = variants.sort((a,b)=>b.stock-a.stock)[0];
    if (best) trFrom.value = best.local_id;
  }
  const activeLid = document.getElementById('tr-from')?.value || refProd.local_id;
  const srcVariant = variants.find(v => v.local_id === activeLid) || variants[0];
  const localNom = GP_LOCAUX_ALL.find(l => l.id === activeLid)?.nom || srcVariant?.zone || '—';
  const info = document.getElementById('tr-qty-info');
  if (info) info.textContent = srcVariant ? `Stock dans "${localNom}": ${srcVariant.stock} ${srcVariant.unit||'unités'}` : '';
}
