/* ================================================================
   GestionPro — modules/stock.js
   Gestion du stock : executeTransfert, saveProduct, editProduct,
   updateProduct, deleteProduct, renderStockTable, importCSV,
   openCaisseLocalModal, selectCaisseLocal
================================================================ */

function executeTransfert() {
  if (!isSuperAdmin() && !hasPermission('stock', 'update')) {
    toast('⛔ Permission refusée pour les transferts', 'error'); return;
  }
  const prodId  = document.getElementById('tr-produit')?.value;
  const qty     = parseFloat(document.getElementById('tr-qty')?.value);
  const fromLid = document.getElementById('tr-from')?.value;
  const toLid   = document.getElementById('tr-to')?.value;
  const note    = document.getElementById('tr-note')?.value?.trim() || '';

  if (!prodId) { toast('Sélectionnez un produit', 'error'); return; }
  if (!qty || qty <= 0 || !isFinite(qty)) { toast('Quantité invalide', 'error'); return; }
  if (!fromLid || !toLid) { toast('Sélectionnez les locaux source et destination', 'error'); return; }
  if (fromLid === toLid) { toast('Source et destination identiques', 'error'); return; }

  const fromNom = GP_LOCAUX_ALL.find(l => l.id === fromLid)?.nom || fromLid;
  const toNom   = GP_LOCAUX_ALL.find(l => l.id === toLid)?.nom   || toLid;

  // Produit source
  // Retrouver tous les variants de ce produit
  const refProd = products.find(x => x.id === prodId);
  if (!refProd) return;
  const prodKey = (refProd.code&&refProd.code.trim()) ? refProd.code.trim().toLowerCase() : `${refProd.name.trim().toLowerCase()}||${(refProd.category||'').toLowerCase()}`;
  // Tous les variants du produit dans le local source (agrégation multi-lignes)
  const srcVariants = products.filter(x => {
    const xk = (x.code&&x.code.trim()) ? x.code.trim().toLowerCase() : `${x.name.trim().toLowerCase()}||${(x.category||'').toLowerCase()}`;
    return xk === prodKey && x.local_id === fromLid;
  });
  const p = srcVariants[0] || refProd;
  if (!p) return;

  // Stock agrégé = somme de toutes les lignes source
  const srcStockTotal = srcVariants.reduce((s, x) => s + (x.stock || 0), 0);
  if (srcStockTotal < qty) {
    toast('Stock insuffisant dans "' + fromNom + '" (disponible: ' + srcStockTotal + ')', 'error');
    return;
  }

  // Déduire la quantité en vidant les lignes dans l'ordre (plus petites d'abord)
  let remaining = qty;
  const sortedSrc = [...srcVariants].sort((a, b) => a.stock - b.stock);
  for (const sv of sortedSrc) {
    if (remaining <= 0) break;
    const take = Math.min(sv.stock, remaining);
    sv.stock -= take;
    remaining -= take;
  }

  // Chercher produit existant dans le local destination
  // Priorité: même code → même nom+catégorie → même nom seul
  const destProd = products.find(x => {
    if (x.id === p.id) return false;
    if (x.local_id !== toLid) return false;
    // Même code (si les deux ont un code)
    if (x.code && x.code.trim() && p.code && p.code.trim()) {
      return x.code.trim().toLowerCase() === p.code.trim().toLowerCase();
    }
    // Même nom + même catégorie
    const sameName = x.name.trim().toLowerCase() === p.name.trim().toLowerCase();
    const sameCat  = (x.category||'').toLowerCase() === (p.category||'').toLowerCase();
    return sameName && sameCat;
  });

  if (destProd) {
    // Produit existe déjà dans la destination → juste augmenter le stock
    destProd.stock += qty;
    // Sauvegarder directement dans Supabase les 2 produits modifiés
    sbSync('gp_products', [
      { id: p.id, tenant_id: GP_TENANT?.id, local_id: p.local_id || fromLid, name: p.name, category: p.category,
        code: p.code||null, type: p.type||'unite', price: p.price, cost: p.cost||0,
        stock: p.stock, min_stock: p.minStock||5, unit: p.unit||'Pièce',
        zone: p.zone||null, sizes: p.sizes||{}, photo_url: p.photo||null,
        updated_at: new Date().toISOString() },
      { id: destProd.id, tenant_id: GP_TENANT?.id, local_id: destProd.local_id || toLid, name: destProd.name, category: destProd.category,
        code: destProd.code||null, type: destProd.type||'unite', price: destProd.price, cost: destProd.cost||0,
        stock: destProd.stock, min_stock: destProd.minStock||5, unit: destProd.unit||'Pièce',
        zone: destProd.zone||null, sizes: destProd.sizes||{}, photo_url: destProd.photo||null,
        updated_at: new Date().toISOString() }
    ]);
  } else {
    // Créer une copie dans le local destination avec le bon local_id
    const newP = {
      ...JSON.parse(JSON.stringify(p)),
      id: uid(),
      local_id: toLid,
      tenant_id: GP_TENANT?.id || p.tenant_id,
      stock: qty,
      zone: toNom,
      createdAt: new Date().toISOString()
    };
    products.push(newP);
    // Sauvegarder les 2 dans Supabase
    sbSync('gp_products', [
      { id: p.id, tenant_id: GP_TENANT?.id, local_id: p.local_id || fromLid, name: p.name, category: p.category,
        code: p.code||null, type: p.type||'unite', price: p.price, cost: p.cost||0,
        stock: p.stock, min_stock: p.minStock||5, unit: p.unit||'Pièce',
        zone: p.zone||null, sizes: p.sizes||{}, photo_url: p.photo||null,
        updated_at: new Date().toISOString() },
      { id: newP.id, tenant_id: GP_TENANT?.id, local_id: toLid, name: newP.name, category: newP.category,
        code: newP.code||null, type: newP.type||'unite', price: newP.price, cost: newP.cost||0,
        stock: newP.stock, min_stock: newP.minStock||5, unit: newP.unit||'Pièce',
        zone: toNom, sizes: newP.sizes||{}, photo_url: newP.photo||null,
        updated_at: new Date().toISOString() }
    ]);
  }

  renderStockTable();
  closeModal('modal-transfert');
  toast(`✅ ${qty} × "${p.name}" transféré : ${fromNom} → ${toNom}${note ? ` (${note})` : ''}`, 'success');
}

// ─── MODALS ───
function openModal(id) {
  document.getElementById(id).classList.add('open');
  // Peupler les selects de locaux pour les modals produit
  if (id === 'modal-add-product') {
    populateProductLocalSelects('');
  }
  // Init conteneur form on open
  if (id === 'modal-conteneur' && !currentConteneurId) {
    document.getElementById('refs-list').innerHTML = '';
    refLineCount = 0;
    document.getElementById('modal-conteneur-title').textContent = t('cont_modal_title_new');
    ['c-numero','c-fournisseur','c-pays','c-date-arrivee','c-date-limite',
     'c-poids','c-cbm','c-cartons','c-fdouane','c-fport','c-ftransit',
     'c-fautres','c-fretard-jour','c-jours-retard','c-fretard-total'].forEach(fid => {
      const el = document.getElementById(fid); if (el) el.value = '';
    });
    const tfd = document.getElementById('total-frais-display');
    if (tfd) tfd.textContent = '0,00 MAD';
    retardMode = 'auto'; setTimeout(() => setRetardMode('auto'), 0);
    addRefLine();
  }
  if (id !== 'modal-conteneur' && id !== 'modal-cont-detail') currentConteneurId = null;
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
});

// ─── TOAST ───
function toast(msg, type='success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success:'✅', error:'❌', warn:'⚠️', info:'ℹ️' };
  t.textContent = (icons[type] || '') + ' ' + msg;
  container.appendChild(t);
  // Max 4 toasts visibles
  while (container.children.length > 4) container.removeChild(container.firstChild);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(6px)';
    t.style.transition = 'all 0.2s';
    setTimeout(() => t.remove(), 200);
  }, 3000);
}

// ─── FORMAT ───
function fmt(n) { const loc = currentLang==='ar'?'ar-MA':'fr-FR'; return Number(n).toLocaleString(loc, { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' MAD'; }
function fmtDate(d) { return new Date(d).toLocaleDateString(currentLang==='ar'?'ar-MA':'fr-FR'); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2,4); }

// ─── PHOTO UPLOAD ───
function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    newProductPhoto = ev.target.result;
    const area = document.getElementById('photo-area');
    area.innerHTML = `<img src="${newProductPhoto}" alt="photo"><div class="photo-overlay">📷 Changer</div><input type="file" id="photo-input" accept="image/*" style="display:none" onchange="handlePhotoUpload(event)">`;
    area.onclick = () => document.getElementById('photo-input').click();
  };
  reader.readAsDataURL(file);
}

function handleEditPhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    editProductPhoto = ev.target.result;
    const area = document.getElementById('edit-photo-area');
    area.innerHTML = `<img src="${editProductPhoto}" alt="photo"><div class="photo-overlay">📷 Changer</div><input type="file" id="edit-photo-input" accept="image/*" style="display:none" onchange="handleEditPhotoUpload(event)">`;
    area.onclick = () => document.getElementById('edit-photo-input').click();
  };
  reader.readAsDataURL(file);
}

// ─── PRODUCTS ───
function toggleSizesSection(prefix) {
  const isProd = prefix === 'prod';
  const type = document.getElementById(isProd ? 'prod-type' : 'edit-prod-type').value;
  const sizeSec   = document.getElementById(isProd ? 'prod-sizes-section'   : 'edit-prod-sizes-section');
  const colorSec  = document.getElementById(isProd ? 'prod-colors-section'  : 'edit-prod-colors-section');
  const stockNormal = document.getElementById(isProd ? 'prod-stock-normal'  : 'edit-prod-stock-normal');
  const sizesGridId  = isProd ? 'prod-sizes-grid'  : 'edit-prod-sizes-grid';
  const colorsGridId = isProd ? 'prod-colors-grid' : 'edit-prod-colors-grid';

  // Tailles
  if (type === 'tailles') {
    sizeSec.style.display = 'block';
    if (colorSec) colorSec.style.display = 'none';
    if (stockNormal) stockNormal.style.display = 'none';
    const grid = document.getElementById(sizesGridId);
    if (grid && grid.querySelectorAll('div[data-size]').length === 0) {
      ['XS','S','M','L','XL','XXL'].forEach(sz => addSizeInput(sizesGridId, sz));
    }
  } else {
    if (sizeSec) sizeSec.style.display = 'none';
    if (colorSec) colorSec.style.display = 'none';
    if (stockNormal) stockNormal.style.display = '';
    if (type === 'kg') {
      const unitEl = document.getElementById(isProd ? 'prod-unit' : 'edit-prod-unit');
      if (unitEl) unitEl.value = 'Kg';
    }
  }
}

// ── Couleurs helpers ──
function addColorInput(gridId, colorName) {
  const grid = document.getElementById(gridId);
  if (!grid || grid.querySelector(`[data-color="${colorName}"]`)) return;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  div.dataset.color = colorName;
  div.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--accent);">${colorName}</div>
    <input type="number" min="0" step="1" placeholder="0"
      style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 8px;color:var(--text);font-family:var(--font-mono),monospace;font-size:13px;width:100%;"
      data-color="${colorName}">
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text3);font-size:10px;cursor:pointer;text-align:left;">✕ suppr.</button>
  `;
  grid.appendChild(div);
}

function addCustomColor(prefix) {
  const isProd = prefix === 'prod';
  const inputId  = isProd ? 'new-color-input' : 'edit-new-color-input';
  const gridId   = isProd ? 'prod-colors-grid' : 'edit-prod-colors-grid';
  const inp = document.getElementById(inputId);
  const val = inp?.value.trim();
  if (!val) return;
  addColorInput(gridId, val);
  inp.value = '';
}

function toggleColorSection(prefix) {
  const sec = document.getElementById(prefix + '-colors-section');
  const icon = document.getElementById(prefix + '-color-toggle-icon');
  if (!sec) return;
  const open = sec.style.display === 'none' || !sec.style.display;
  sec.style.display = open ? '' : 'none';
  if (icon) icon.textContent = open ? '▲ Masquer' : '▼ Ajouter';
}

function getColorsFromGrid(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return {};
  const result = {};
  grid.querySelectorAll('div[data-color]').forEach(div => {
    const col = div.dataset.color;
    if (!col) return;
    const inp = div.querySelector('input[type="number"]');
    const val = parseFloat(inp?.value);
    result[col] = isNaN(val) ? 0 : val;
  });
  return result;
}

function addSizeInput(gridId, sizeName) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  // Check not duplicate
  if (grid.querySelector(`[data-size="${sizeName}"]`)) return;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  div.dataset.size = sizeName;
  div.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;">${sizeName}</div>
    <input type="number" min="0" step="1" placeholder="0"
      style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 8px;color:var(--text);font-family:var(--font-mono),monospace;font-size:13px;width:100%;"
      data-size="${sizeName}">
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text3);font-size:10px;cursor:pointer;text-align:left;">✕ suppr.</button>
  `;
  grid.appendChild(div);
}

function addCustomSize(prefix) {
  const inputId = prefix === 'prod' ? 'new-size-input' : 'edit-new-size-input';
  const gridId  = prefix === 'prod' ? 'prod-sizes-grid' : 'edit-prod-sizes-grid';
  const inp = document.getElementById(inputId);
  const val = inp.value.trim().toUpperCase();
  if (!val) return;
  addSizeInput(gridId, val);
  inp.value = '';
}

function getSizesFromGrid(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return {};
  const result = {};
  // Sélectionner tous les divs avec data-size qui contiennent un input number
  grid.querySelectorAll('div[data-size]').forEach(div => {
    const sz = div.dataset.size;
    if (!sz) return;
    const inp = div.querySelector('input[type="number"]');
    const val = parseFloat(inp?.value);
    result[sz] = isNaN(val) ? 0 : val;
  });
  return result;
}

function saveProduct() {
  if (!isSuperAdmin() && !hasPermission('stock', 'create')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  const lid = getLocalId(); // null si SA accès global — autorisé
  const name = document.getElementById('prod-name').value.trim();
  const price = parseFloat(document.getElementById('prod-price').value);
  const type = document.getElementById('prod-type').value;
  if (!name || isNaN(price)) { toast(t('toast_required'), 'error'); return; }

  let stock = 0;
  let sizes = {};
  // Couleurs optionnelles — disponibles sur tous les types
  const colors = getColorsFromGrid('prod-colors-grid');
  if (type === 'tailles') {
    sizes = getSizesFromGrid('prod-sizes-grid');
    stock = Object.values(sizes).reduce((s, v) => s + v, 0);
  } else {
    stock = parseFloat(document.getElementById('prod-stock').value) || 0;
  }

  const prodZone = document.getElementById('prod-zone').value.trim() || '';
  // Si zone renseignée, trouver le local_id correspondant
  const prodLocalMatch = GP_LOCAUX_ALL.find(l => l.nom.trim() === prodZone.trim());
  const prodLocalId = prodLocalMatch ? prodLocalMatch.id : lid;
  const product = {
    id: uid(),
    local_id: prodLocalId,
    name,
    category: document.getElementById('prod-cat').value.trim() || 'Général',
    price,
    cost: parseFloat(document.getElementById('prod-cost').value) || 0,
    stock,
    minStock: parseFloat(document.getElementById('prod-min').value) || 5,
    unit: document.getElementById('prod-unit').value.trim() || (type === 'kg' ? 'Kg' : 'Pièce'),
    code: document.getElementById('prod-code').value.trim(),
    zone: prodZone,
    photo: newProductPhoto || null,
    type: type,
    sizes: type === 'tailles' ? sizes : {},
    colors,
    createdAt: new Date().toISOString()
  };

  products.push(product);
  save();
  closeModal('modal-add-product');
  toast(`"${name}" ${t('toast_product_added_to')}`);
  newProductPhoto = null;
  ['prod-name','prod-cat','prod-price','prod-cost','prod-stock','prod-min','prod-unit','prod-code','prod-zone'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('prod-type').value = 'unite';
  document.getElementById('prod-sizes-section').style.display = 'none';
  document.getElementById('prod-stock-normal').style.display = '';
  const grid = document.getElementById('prod-sizes-grid');
  grid.innerHTML = ''; grid.dataset.initialized = '';
  const area = document.getElementById('photo-area');
  area.innerHTML = `<div style="font-size:32px;">📷</div><div style="font-size:13px;color:var(--text2);">${t('prod_click_photo2')}</div><input type="file" id="photo-input" accept="image/*" style="display:none" onchange="handlePhotoUpload(event)"><div class="photo-overlay">${t('prod_change_photo2')}</div>`;
  area.onclick = () => document.getElementById('photo-input').click();
  renderStockTable(); updateAlertCount();
}

function editProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  editingProductId = id;
  editProductPhoto = p.photo;
  document.getElementById('edit-prod-name').value = p.name;
  document.getElementById('edit-prod-cat').value = p.category;
  document.getElementById('edit-prod-price').value = p.price;
  document.getElementById('edit-prod-cost').value = p.cost || '';
  document.getElementById('edit-prod-stock').value = p.stock;
  document.getElementById('edit-prod-min').value = p.minStock || 5;
  document.getElementById('edit-prod-unit').value = p.unit || '';
  document.getElementById('edit-prod-code').value = p.code || '';
  document.getElementById('edit-prod-zone').value = p.zone || '';
  document.getElementById('edit-prod-id').value = id;
  document.getElementById('edit-prod-type').value = p.type || 'unite';

  // Sizes + Colors
  const sizeSec   = document.getElementById('edit-prod-sizes-section');
  const colorSec  = document.getElementById('edit-prod-colors-section');
  const stockNormal = document.getElementById('edit-prod-stock-normal');
  const grid = document.getElementById('edit-prod-sizes-grid');
  const colorGrid = document.getElementById('edit-prod-colors-grid');
  grid.innerHTML = ''; if (colorGrid) colorGrid.innerHTML = '';

  if (p.type === 'tailles') {
    if (sizeSec) sizeSec.style.display = 'block';
    if (colorSec) colorSec.style.display = 'none';
    if (stockNormal) stockNormal.style.display = 'none';
    const sizes = p.sizes || {};
    const allSizes = Object.keys(sizes).length > 0 ? Object.keys(sizes) : ['XS','S','M','L','XL','XXL'];
    allSizes.forEach(sz => {
      addSizeInput('edit-prod-sizes-grid', sz);
      const inp = grid.querySelector(`[data-size="${sz}"] input`);
      if (inp) inp.value = sizes[sz] || 0;
    });
  } else {
    if (sizeSec) sizeSec.style.display = 'none';
    if (stockNormal) stockNormal.style.display = '';
  }
  // Couleurs optionnelles : afficher si le produit en a
  if (colorGrid) colorGrid.innerHTML = '';
  const colorsData = p.colors || {};
  if (Object.keys(colorsData).length > 0) {
    if (colorSec) colorSec.style.display = '';
    const icon = document.getElementById('edit-prod-color-toggle-icon');
    if (icon) icon.textContent = '▲ Masquer';
    Object.keys(colorsData).forEach(col => {
      addColorInput('edit-prod-colors-grid', col);
      const inp = colorGrid?.querySelector(`[data-color="${col}"] input`);
      if (inp) inp.value = colorsData[col] || 0;
    });
  } else {
    if (colorSec) colorSec.style.display = 'none';
    const icon = document.getElementById('edit-prod-color-toggle-icon');
    if (icon) icon.textContent = '▼ Ajouter';
  }

  const area = document.getElementById('edit-photo-area');
  if (p.photo) {
    area.innerHTML = `<img src="${p.photo}" alt="photo"><div class="photo-overlay">📷 Changer</div><input type="file" id="edit-photo-input" accept="image/*" style="display:none" onchange="handleEditPhotoUpload(event)">`;
  } else {
    area.innerHTML = `<div style="font-size:32px;">📷</div><div style="font-size:13px;color:var(--text2);">${t('prod_click_change')}</div><input type="file" id="edit-photo-input" accept="image/*" style="display:none" onchange="handleEditPhotoUpload(event)"><div class="photo-overlay">${t('prod_change_photo2')}</div>`;
  }
  area.onclick = () => document.getElementById('edit-photo-input').click();
  populateEditProductLocalSelects(p.zone || '');
  openModal('modal-edit-product');
}

function updateProduct() {
  if (!isSuperAdmin() && !hasPermission('stock', 'update')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  const id = document.getElementById('edit-prod-id').value;
  const idx = products.findIndex(x => x.id === id);
  if (idx < 0) return;
  const name = document.getElementById('edit-prod-name').value.trim();
  const price = parseFloat(document.getElementById('edit-prod-price').value);
  const type = document.getElementById('edit-prod-type').value;
  if (!name || isNaN(price)) { toast(t('toast_required'), 'error'); return; }

  let stock = 0;
  let sizes = {};
  const colors = getColorsFromGrid('edit-prod-colors-grid');
  if (type === 'tailles') {
    sizes = getSizesFromGrid('edit-prod-sizes-grid');
    stock = Object.values(sizes).reduce((s, v) => s + v, 0);
  } else {
    stock = parseFloat(document.getElementById('edit-prod-stock').value) || 0;
  }

  const newZone = document.getElementById('edit-prod-zone').value.trim() || '';
  // Sync local_id avec la zone choisie
  const matchedLocal = GP_LOCAUX_ALL.find(l => l.nom.trim() === newZone.trim());
  const newLocalId = matchedLocal ? matchedLocal.id : (products[idx].local_id || null);
  products[idx] = { ...products[idx], name,
    category: document.getElementById('edit-prod-cat').value.trim() || 'Général',
    price, cost: parseFloat(document.getElementById('edit-prod-cost').value) || 0,
    stock, minStock: parseFloat(document.getElementById('edit-prod-min').value) || 5,
    unit: document.getElementById('edit-prod-unit').value.trim() || (type === 'kg' ? 'Kg' : 'Pièce'),
    code: document.getElementById('edit-prod-code').value.trim(),
    zone: newZone,
    local_id: newLocalId,
    photo: editProductPhoto !== undefined ? editProductPhoto : products[idx].photo,
    type, sizes, colors
  };
  save(); closeModal('modal-edit-product');
  toast(`"${name}" ${t('toast_product_updated')}`);
  renderStockTable(); updateAlertCount();
}

function deleteProduct(id) {
  if (!isSuperAdmin() && !hasPermission('stock', 'delete')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  if (!confirm('Supprimer ce produit ?')) return;
  products = products.filter(x => x.id !== id);
  sbDelete('gp_products', id);
  renderStockTable(); updateAlertCount();
  toast(t('toast_product_deleted'), 'warn');
}

const debouncedRenderStock = debounce(renderStockTable);

function populateStockFilters() {
  // ─── Filtre par local ───────────────────────────────────────
  // Filtre local supprimé — tous voient tout, la colonne ZONE indique où est le stock
  const localSel = document.getElementById('stock-filter-local');
  if (localSel) localSel.style.display = 'none';

  const catSel = document.getElementById('stock-filter-cat');
  if (catSel) {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    const cur = catSel.value;
    catSel.innerHTML = '<option value="">Toutes catégories</option>' +
      cats.map(cat => `<option value="${cat}"${cat===cur?' selected':''}>${cat}</option>`).join('');
  }
  const contSel = document.getElementById('stock-filter-cont');
  if (contSel) {
    const cur = contSel.value;
    contSel.innerHTML = '<option value="">Tous conteneurs</option>' +
      conteneurs.map(cont => `<option value="${cont.id}"${cont.id===cur?' selected':''}>${cont.numero}</option>`).join('');
  }
  const zoneSel = document.getElementById('stock-filter-zone');
  if (zoneSel) {
    const zones = [...new Set(products.map(p => p.zone).filter(Boolean))].sort();
    const cur = zoneSel.value;
    zoneSel.innerHTML = '<option value="">Toutes les zones</option>' +
      zones.map(z => `<option value="${z}"${z===cur?' selected':''}>${z}</option>`).join('');
  }
}


/* ── Stock endommagé + manquant par produit (depuis retours[]) ── */
function _getDamagedStockByProduct() {
  const map = {};
  retours.forEach(r => r.lines.forEach(line => {
    if ((line.qteDommagee || 0) > 0)
      map[line.productId] = (map[line.productId] || 0) + line.qteDommagee;
  }));
  return map;
}

function _getMissingStockByProduct() {
  const map = {};
  retours.forEach(r => r.lines.forEach(line => {
    if ((line.qteManquante || 0) > 0)
      map[line.productId] = (map[line.productId] || 0) + line.qteManquante;
  }));
  return map;
}

function renderStockTable(resetPage) {
  if (resetPage !== false) _pages['stock'] = 1;
  populateStockFilters();
  const q       = (document.getElementById('stock-search')?.value || '').toLowerCase();
  const catF    = document.getElementById('stock-filter-cat')?.value || '';
  const contF   = document.getElementById('stock-filter-cont')?.value || '';
  const statutF = document.getElementById('stock-filter-statut')?.value || '';
  const zoneF   = document.getElementById('stock-filter-zone')?.value || '';

  const localF = ''; // Pas de filtre par local — tous les produits visibles

  let contRefs = null;
  if (contF) {
    const cont = conteneurs.find(x => x.id === contF);
    if (cont) contRefs = new Set(cont.refs.map(r => r.refCode));
  }

  // ── GROUPER les produits identiques (même code ou même nom) ──────────────────
  // 1 groupe = même produit présent dans plusieurs locaux → 1 seule ligne avec détail
  // Calcul du stock endommagé et manquant depuis les retours
  const _damagedMap = typeof _getDamagedStockByProduct === 'function' ? _getDamagedStockByProduct() : {};
  const _missingMap = typeof _getMissingStockByProduct === 'function' ? _getMissingStockByProduct() : {};

  const groupMap = new Map();
  products.forEach(p => {
    const key = (p.code && p.code.trim()) ? p.code.trim().toLowerCase() : `${p.name.trim().toLowerCase()}||${(p.category||'').toLowerCase()}`;
    if (!groupMap.has(key)) {
      const g = { ...p, _variants: [p], _totalStock: p.stock, _renderStockMap: {} };
      if (p.type === 'tailles' && p.sizes) g.sizes = { ...p.sizes };
      if (p.type === 'couleurs' && p.colors) g.colors = { ...p.colors };
      groupMap.set(key, g);
    } else {
      const g = groupMap.get(key);
      // Chercher si ce local_id est déjà représenté dans les variants du groupe
      const existingIdx = g._variants.findIndex(v => (v.local_id || null) === (p.local_id || null));
      if (existingIdx >= 0) {
        // Même produit, même local : consolider dans renderStockMap (JAMAIS dans products[])
        const vid = g._variants[existingIdx].id;
        g._renderStockMap[vid] = (g._renderStockMap[vid] || g._variants[existingIdx].stock) + p.stock;
        g._totalStock += p.stock;
      } else {
        // Nouveau local : ajouter le produit (par référence, mais renderStockMap isole les valeurs)
        g._variants.push(p);
        g._totalStock += p.stock;
        if (p.type === 'tailles' && p.sizes) {
          Object.entries(p.sizes).forEach(([s, v]) => { g.sizes[s] = (g.sizes[s] || 0) + v; });
        }
      }
    }
  });

  // Filtres appliqués sur les groupes
  let filtered = [...groupMap.values()].filter(g => {
    if (q && !g.name.toLowerCase().includes(q) && !(g.code||'').toLowerCase().includes(q) && !(g.category||'').toLowerCase().includes(q)) return false;
    if (catF && g.category !== catF) return false;
    if (contRefs && !contRefs.has(g.code)) return false;
    if (localF === '__sans__') { if (g._variants.some(v => v.local_id)) return false; }
    else if (localF) { if (!g._variants.some(v => v.local_id === localF)) return false; }
    // Statut basé sur le stock total du groupe
    const ts = g._totalStock;
    if (statutF === 'ok'      && !(ts > 0 && ts >= g.minStock)) return false;
    if (statutF === 'bas'     && !(ts > 0 && ts < g.minStock))  return false;
    if (statutF === 'rupture' && ts !== 0) return false;
    return true;
  });

  document.getElementById('stock-count').textContent =
    `${filtered.length} produit${filtered.length !== 1 ? 's' : ''}${contF ? ' · conteneur filtré' : ''}`;

  // ── TRI
  const sortV = document.getElementById('stock-sort')?.value || 'recent';
  filtered.sort((a, b) => {
    if (sortV === 'name')       return (a.name||'').localeCompare(b.name||'');
    if (sortV === 'stock_asc')  return a._totalStock - b._totalStock;
    if (sortV === 'stock_desc') return b._totalStock - a._totalStock;
    if (sortV === 'price_desc') return (b.price||0) - (a.price||0);
    return new Date(b.createdAt||0) - new Date(a.createdAt||0);
  });

  const tbody = document.getElementById('stock-table-body');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><div class="emoji">📦</div><p>${t('no_products')}</p></div></td></tr>`;
    document.getElementById('stock-pagination').innerHTML = '';
    return;
  }

  const page  = getPage('stock');
  const start = (page - 1) * PAGE_SIZE;
  const pageData = filtered.slice(start, start + PAGE_SIZE);
  tbody.innerHTML = pageData.map(g => {
    const variants   = g._variants;
    const totalStock = g._totalStock;

    // Afficher le stock total (toutes zones)
    const displayStock = totalStock;

    // Stock endommagé cumulé sur tous les variants de ce groupe
    const damagedQty = variants.reduce((sum, v) => sum + (_damagedMap[v.id] || 0), 0);

    // Statut basé sur stock total
    const statusClass = totalStock === 0 ? 'chip-red' : totalStock < g.minStock ? 'chip-orange' : 'chip-green';
    const statusText  = totalStock === 0 ? `🔴 ${t('stat_rupture')}` : totalStock < g.minStock ? `🟡 ${t('stat_bas')}` : `🟢 ${t('stat_ok')}`;

    const refPhoto = g.photo;
    const photo = refPhoto
      ? `<img src="${refPhoto}" onclick="openLightbox('${refPhoto}','${g.name.replace(/'/g,"\'")}');event.stopPropagation();" style="width:38px;height:38px;object-fit:cover;border-radius:7px;cursor:zoom-in;" alt="">`
      : `<div style="width:38px;height:38px;border-radius:7px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:18px;">📦</div>`;

    const cost        = g.cost || 0;
    const profit      = g.price - cost;
    // Marge = bénéfice / prix_vente × 100  (définition correcte)
    const margin      = g.price > 0 ? (profit / g.price * 100) : 0;
    const profitColor = profit > 0 ? 'var(--accent)' : profit < 0 ? 'var(--red)' : 'var(--text2)';
    const contSrc     = conteneurs.find(c => c.refs?.some(r => r.refCode === g.code));

    // ── Affichage stock avec détail par local ──
    // Stock manquant cumulé sur tous les variants de ce groupe
    const missingQty = variants.reduce((sum, v) => sum + (_missingMap[v.id] || 0), 0);

    // ── Construction du bloc stock ──
    // ── Construire la map locaux (dédupliquée) ──
    const localMap = new Map();
    variants.forEach(v => {
      const lid   = v.local_id || v.zone || null;
      if (!lid) return; // Pas de local — ignorer
      const lName = GP_LOCAUX_ALL.find(l => l.id === v.local_id)?.nom || v.zone || null;
      if (!lName || lName === '—') return; // Local fantôme — ignorer
      // Utiliser _renderStockMap si une consolidation a eu lieu, sinon v.stock
      const renderStock = (g._renderStockMap && g._renderStockMap[v.id] !== undefined)
        ? g._renderStockMap[v.id]
        : v.stock;
      if (localMap.has(lid)) {
        localMap.get(lid).stock += renderStock;
      } else {
        localMap.set(lid, { lName, stock: renderStock, minStock: v.minStock || 0 });
      }
    });

    // ── Colonne Stock : chiffre principal + métadonnées ──
    // ── Chiffre principal + label Disponible ──
    let stockHtml = '<div class="stock-cell">'
      + '<div class="stock-cell-main">'
      + '<span class="stock-cell-qty">' + displayStock + (g.type==='kg' ? ' kg' : '') + '</span>'
      + '<span class="stock-cell-unit">' + (g.type==='kg' ? '' : (g.unit || 'pcs')) + '</span>'
      + '</div>'
      + '<div class="stock-cell-label-dispo">Disponible</div>';

    // ── Badges endommagé + manquant ──
    if (damagedQty > 0 || missingQty > 0) {
      stockHtml += '<div class="stock-cell-issues">';
      if (damagedQty > 0) {
        stockHtml += '<span class="stock-badge-damaged">'
          + '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0;"><path d="M12 2L1 21h22L12 2zm0 3.5l8.5 15h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>'
          + ' ' + damagedQty + ' end.</span>';
      }
      if (missingQty > 0) {
        stockHtml += '<span class="stock-badge-missing">'
          + '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
          + ' ' + missingQty + ' manq.</span>';
      }
      stockHtml += '</div>';
    }

    // ── Répartition par local ──
    if (localMap.size > 1) {
      // Plusieurs locaux : afficher nom: stock compact
      const localParts = Array.from(localMap.values()).map(e => {
        const cls = e.stock === 0 ? 'stock-loc-zero' : e.stock < e.minStock ? 'stock-loc-low' : 'stock-loc-ok';
        return '<span class="stock-loc-badge ' + cls + '">'
          + '<b>' + e.stock + '</b>'
          + '<span class="stock-loc-name">' + escapeHTML(e.lName) + '</span>'
          + '</span>';
      }).join('');
      stockHtml += '<div class="stock-cell-locals">' + localParts + '</div>';
    } else if (localMap.size === 1) {
      const e = Array.from(localMap.values())[0];
      if (e.lName && e.lName !== '—') {
        stockHtml += '<div class="stock-cell-local-single">📍 ' + escapeHTML(e.lName) + '</div>';
      }
    }

    stockHtml += '</div>';
    if (g.type==='tailles' && g.sizes) {
      stockHtml += `<div style="font-size:10px;color:var(--text2);margin-top:2px;">${Object.entries(g.sizes).filter(([,v])=>v>0).map(([k,v])=>`<span style="background:rgba(108,99,255,0.12);color:var(--purple);border-radius:4px;padding:1px 4px;margin:1px;">${k}:${v}</span>`).join('')}</div>`;
    }
    if (g.type==='couleurs' && g.colors) {
      stockHtml += `<div style="font-size:10px;color:var(--text2);margin-top:2px;">${Object.entries(g.colors).filter(([,v])=>v>0).map(([k,v])=>`<span style="background:rgba(37,99,235,0.1);color:var(--accent);border-radius:4px;padding:1px 4px;margin:1px;">🎨${k}:${v}</span>`).join('')}</div>`;
    }
    if (g.type==='kg') stockHtml += `<div style="font-size:10px;color:var(--accent);margin-top:2px;">⚖️ Vente au poids</div>`;

    // ── Zones affichées ──
    const zonesHtml = variants.length === 1
      ? (g.zone ? `<span style="background:rgba(108,99,255,0.15);color:var(--purple);padding:3px 8px;border-radius:var(--radius-lg);font-weight:600;">${g.zone}</span>` : '<span style="color:var(--text2);">—</span>')
      : (() => {
          // Dédupliquer les zones par local_id
          const seen = new Set();
          return variants.map(v => {
            const lName = GP_LOCAUX_ALL.find(l => l.id === v.local_id)?.nom || v.zone || '?';
            const key   = v.local_id || lName;
            if (seen.has(key)) return '';
            seen.add(key);
            return `<span style="background:rgba(108,99,255,0.12);color:var(--purple);padding:2px 6px;border-radius:var(--radius);font-size:11px;margin:1px;display:inline-block;">${lName}</span>`;
          }).join('');
        })();

    const transferBtn = ''; // Bouton demande transfert supprimé

    const editId = variants[0].id;

    return `<tr>
      <td>${photo}</td>
      <td>
        <div style="font-weight:600;font-size:13px;">${escapeHTML(g.name)}</div>
        <div style="font-size:11px;color:var(--text2);">${g.code||'—'}${contSrc?` · <span style="color:var(--purple);cursor:pointer;" onclick="document.getElementById('stock-filter-cont').value='${contSrc.id}';renderStockTable()">📦${contSrc.numero}</span>`:''}
        </div>
      </td>
      <td><span class="chip chip-purple" style="font-size:11px;">${g.category}</span></td>
      <td>${stockHtml}</td>
      <td style="color:var(--text2);font-size:12px;">${g.minStock}</td>
      <td style="font-family:var(--font-mono),monospace;font-weight:600;font-size:12px;">${g.price.toFixed(2)}</td>

      <td style="font-family:var(--font-mono),monospace;font-size:12px;color:var(--text2);">${cost > 0 ? cost.toFixed(2) : '—'}</td>
      <td style="font-family:var(--font-mono),monospace;font-weight:700;font-size:12px;color:${profitColor};">${cost > 0 ? (profit>=0?'+':'')+profit.toFixed(2) : '—'}</td>
      <td style="font-size:12px;font-weight:700;color:${profitColor};">${cost > 0 ? margin.toFixed(1)+'%' : '—'}</td>
      <td>
        <span class="chip ${statusClass}">${statusText}</span>
        ${transferBtn}
      </td>
      <td style="white-space:nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="viewStockDetail('${editId}')" title="Voir détail stock">🔍</button>
        ${(isSuperAdmin()||hasPermission('stock','update')) ? `<button class="btn btn-secondary btn-sm" onclick="editProduct('${editId}')">✏️</button>` : ''}
        ${(isSuperAdmin()||hasPermission('stock','delete')) ? `<button class="btn btn-danger btn-sm" onclick="deleteProduct('${editId}')">🗑️</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  buildPagination('stock', filtered.length, 'renderStockTable', 'stock-pagination');
}

// ─── CSV IMPORT ───
function importCSV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    const lines = ev.target.result.split('\n').filter(l => l.trim());
    let added = 0;
    const newProducts = [];

    for (let i = 1; i < lines.length; i++) {
      // Smart CSV split: handles commas inside quotes
      const cols = parseCSVLine(lines[i]);
      if (!cols[0]) continue;
      const photoUrl = cols[8] ? cols[8].trim() : null;
      newProducts.push({
        id: uid(),
        name: cols[0] || 'Produit',
        category: cols[1] || 'Général',
        price: parseFloat(cols[2]) || 0,
        cost: parseFloat(cols[3]) || 0,
        stock: parseInt(cols[4]) || 0,
        minStock: parseInt(cols[5]) || 5,
        unit: cols[6] || 'Pièce',
        code: cols[7] || '',
        photo: null,
        zone: cols[9] ? cols[9].trim() : '',
        photoUrl: photoUrl || null,
        createdAt: new Date().toISOString()
      });
      added++;
    }

    // Load photos from URLs
    const withPhotos = newProducts.filter(p => p.photoUrl);
    if (withPhotos.length > 0) {
      toast(`${withPhotos.length} ${t('toast_loading_photos')}`, 'warn');
      await Promise.all(withPhotos.map(p => loadPhotoFromUrl(p)));
    }

    products.push(...newProducts);
    save(); renderStockTable(); updateAlertCount();
    const photosLoaded = newProducts.filter(p => p.photo).length;
    toast(`✅ ${added} produit(s) importé(s)${photosLoaded > 0 ? ` avec ${photosLoaded} photo(s)` : ''}`);
    e.target.value = '';
  };
  reader.readAsText(file);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

async function loadPhotoFromUrl(product) {
  try {
    const url = product.photoUrl;
    if (!url || !url.startsWith('http')) return;
    const response = await fetch(url);
    if (!response.ok) return;
    const blob = await response.blob();
    const base64 = await new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
    product.photo = base64;
  } catch (err) {
    // URL inaccessible, skip silently
  }
}

// ─── CAISSE ───
const debouncedRenderGrid = debounce(() => { _pages['caisse'] = 1; renderProductGrid(); });

// ── Sélection obligatoire du local pour la caisse ────────────────
function openCaisseLocalModal() {
  const container = document.getElementById('caisse-local-choices');
  if (!container) return;

  const locaux_actifs = GP_LOCAUX_ALL.filter(l => l.actif !== false);

  if (!locaux_actifs.length) {
    toast('Aucun local configuré. Créez un local d\'abord.', 'warn');
    navigate('locaux');
    return;
  }

  container.innerHTML = locaux_actifs.map(l => {
    const prodsCount = products.filter(p => p.local_id === l.id).length;
    const stockTotal = products.filter(p => p.local_id === l.id).reduce((s,p) => s + (p.stock||0), 0);
    return `<button onclick="selectCaisseLocal('${l.id}')" style="
      width:100%;padding:12px 18px;border-radius:8px;
      border:1.5px solid #e5e7eb;background:#fff;
      cursor:pointer;text-align:left;transition:all 0.12s;
      display:flex;align-items:center;justify-content:space-between;gap:10px;
      font-family:var(--font);
    "
    onmouseover="this.style.borderColor='#2563eb';this.style.background='#eff6ff'"
    onmouseout="this.style.borderColor='#e5e7eb';this.style.background='#fff'">
      <div>
        <div style="font-size:14px;font-weight:650;color:#111827;">🏪 ${escapeHTML(l.nom)}</div>
        ${l.desc ? `<div style="font-size:11.5px;color:#6b7280;margin-top:2px;">${escapeHTML(l.desc)}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:13px;font-weight:700;color:#2563eb;">${stockTotal.toLocaleString('fr-FR')}</div>
        <div style="font-size:10.5px;color:#9ca3af;">${prodsCount} réf.</div>
      </div>
    </button>`;
  }).join('');

  document.getElementById('modal-caisse-local').classList.add('open');
}

function selectCaisseLocal(localId) {
  // Fermer le modal
  document.getElementById('modal-caisse-local').classList.remove('open');

  // Appliquer le local sélectionné
  SA_ACTIVE_LOCAL = localId;
  const sel = document.getElementById('sa-active-local');
  if (sel) sel.value = localId;

  // Mettre à jour la topbar
  const localName = GP_LOCAUX_ALL.find(l => l.id === localId)?.nom || localId;
  const info = document.getElementById('sb-local-info');
  if (info) { info.textContent = '📍 ' + localName; info.style.display = ''; }

  // Recharger la grille produits avec le bon local
  renderProductGrid();
  if (typeof renderCategoryFilters === 'function') renderCategoryFilters();
  updateAlertCount();
  toast(`🏪 Local de vente : ${localName}`, 'success');
}


/* ════════════════════════════════════════
   DÉTAIL STOCK — Modal complet par produit
════════════════════════════════════════ */
function viewStockDetail(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod) return;

  const key = (prod.code && prod.code.trim())
    ? prod.code.trim().toLowerCase()
    : prod.name.trim().toLowerCase() + '||' + (prod.category||'').toLowerCase();

  const grp = products.filter(p => {
    const k = (p.code && p.code.trim())
      ? p.code.trim().toLowerCase()
      : p.name.trim().toLowerCase() + '||' + (p.category||'').toLowerCase();
    return k === key;
  });

  const totalStock = grp.reduce((s, v) => s + (v.stock||0), 0);
  const dMap = typeof _getDamagedStockByProduct === 'function' ? _getDamagedStockByProduct() : {};
  const mMap = typeof _getMissingStockByProduct === 'function' ? _getMissingStockByProduct() : {};
  const damagedQty = grp.reduce((s, v) => s + (dMap[v.id]||0), 0);
  const missingQty = grp.reduce((s, v) => s + (mMap[v.id]||0), 0);

  // Map locaux
  const lm = new Map();
  grp.forEach(v => {
    const lid   = v.local_id || v.zone || null;
    if (!lid) return; // Ignorer produits sans local
    const lName = GP_LOCAUX_ALL.find(l => l.id === v.local_id)?.nom || v.zone || null;
    if (!lName) return; // Ignorer locaux fantômes sans nom
    if (lm.has(lid)) lm.get(lid).stock += v.stock;
    else lm.set(lid, { lName, stock: v.stock, minStock: v.minStock || 0 });
  });

  // Retours récents
  const prodRetours = retours.filter(r => r.lines.some(l => grp.some(v => v.id === l.productId))).slice(0, 8);
  const recentSales = sales.filter(s => s.items && s.items.some(i => grp.some(v => v.id === (i.productId||i.id)))).slice(0, 8);

  const statusColor = totalStock === 0 ? 'var(--red)' : totalStock < prod.minStock ? 'var(--gold)' : 'var(--green)';
  const statusText  = totalStock === 0 ? 'Rupture' : totalStock < prod.minStock ? 'Stock bas' : 'En stock';

  // Photo
  let photoHtml;
  if (prod.photo) {
    photoHtml = '<img src="' + escapeHTML(prod.photo) + '" style="width:80px;height:80px;object-fit:cover;border-radius:var(--radius);flex-shrink:0;">';
  } else {
    photoHtml = '<div style="width:80px;height:80px;background:var(--surface2);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0;">📦</div>';
  }

  // Locaux
  const locauxHtml = Array.from(lm.values()).map(e => {
    const pct = totalStock > 0 ? Math.round(e.stock / totalStock * 100) : 0;
    const col = e.stock === 0 ? 'var(--red)' : e.stock < e.minStock ? 'var(--gold)' : 'var(--accent)';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:5px;">'
      + '<span style="font-size:13px;font-weight:600;">' + escapeHTML(e.lName) + '</span>'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<div style="width:80px;height:5px;background:var(--border);border-radius:3px;overflow:hidden;">'
      + '<div style="height:100%;width:' + pct + '%;background:' + col + ';border-radius:3px;"></div>'
      + '</div>'
      + '<span style="font-family:var(--font-mono),monospace;font-weight:700;color:' + col + ';min-width:30px;text-align:right;">' + e.stock + '</span>'
      + '</div></div>';
  }).join('');

  // Retours
  const retoursHtml = prodRetours.length === 0
    ? '<div style="padding:12px;text-align:center;font-size:12.5px;color:var(--text3);">Aucun retour</div>'
    : prodRetours.map(r => {
        const line = r.lines.find(l => grp.some(v => v.id === l.productId));
        if (!line) return '';
        const d = new Date(r.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'});
        const c = (r.clientName && r.clientName !== 'undefined') ? escapeHTML(r.clientName) : 'Client de passage';
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-bottom:1px solid var(--border);font-size:12px;">'
          + '<span style="color:var(--text3);">' + d + '</span>'
          + '<span style="font-weight:600;">' + c + '</span>'
          + '<span>'
          + ((line.qteConforme||0)  > 0 ? '<span style="color:var(--green);margin-right:4px;">✅' + line.qteConforme  + '</span>' : '')
          + ((line.qteDommagee||0)  > 0 ? '<span style="color:var(--red);margin-right:4px;">💥'  + line.qteDommagee  + '</span>' : '')
          + ((line.qteManquante||0) > 0 ? '<span style="color:var(--gold);">❓'                   + line.qteManquante + '</span>' : '')
          + '</span></div>';
      }).join('');

  // Ventes
  const ventesHtml = recentSales.length === 0
    ? '<div style="padding:12px;text-align:center;font-size:12.5px;color:var(--text3);">Aucune vente récente</div>'
    : recentSales.map(s => {
        const item = s.items.find(i => grp.some(v => v.id === (i.productId||i.id)));
        if (!item) return '';
        const d = new Date(s.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'});
        const c = (s.clientName && s.clientName !== 'undefined') ? escapeHTML(s.clientName) : 'Client de passage';
        const pc = s.payment === 'Crédit' ? 'var(--gold)' : 'var(--green)';
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-bottom:1px solid var(--border);font-size:12px;">'
          + '<span style="color:var(--text3);">' + d + '</span>'
          + '<span style="font-weight:600;">' + c + '</span>'
          + '<span style="font-family:var(--font-mono),monospace;">x' + (item.qty||1) + '</span>'
          + '<span style="color:' + pc + ';font-size:11px;font-weight:600;">' + s.payment + '</span>'
          + '</div>';
      }).join('');

  // Tailles
  const taillesHtml = (prod.type === 'tailles' && prod.sizes)
    ? '<div style="margin-top:14px;">'
      + '<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Par taille</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
      + Object.entries(prod.sizes).filter(([,v]) => v > 0).map(([k,v]) =>
          '<span style="background:rgba(108,99,255,0.1);color:var(--purple);border:1px solid rgba(108,99,255,0.2);border-radius:var(--radius-sm);padding:4px 10px;font-weight:700;font-size:13px;">' + k + ': ' + v + '</span>'
        ).join('')
      + '</div></div>'
    : '';

  const el = document.getElementById('stock-detail-content');
  if (!el) return;

  el.innerHTML =
    // En-tête
    '<div style="display:flex;gap:16px;margin-bottom:20px;align-items:flex-start;">'
    + photoHtml
    + '<div style="flex:1;">'
    + '<div style="font-size:16px;font-weight:700;margin-bottom:2px;">' + escapeHTML(prod.name) + '</div>'
    + '<div style="font-size:12px;color:var(--text3);margin-bottom:10px;">Réf : ' + escapeHTML(prod.code||'—') + ' · ' + escapeHTML(prod.category||'—') + '</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
    + '<span style="background:var(--surface2);border-radius:var(--radius-sm);padding:3px 8px;font-size:12px;">Prix : <strong>' + fmt(prod.price) + '</strong></span>'
    + '<span style="background:var(--surface2);border-radius:var(--radius-sm);padding:3px 8px;font-size:12px;">Min : <strong>' + (prod.minStock||0) + '</strong></span>'
    + '</div>'
    + '</div></div>'

    // KPI
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">'
    + '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;text-align:center;border-top:3px solid ' + statusColor + ';">'
    + '<div style="font-size:10px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Disponible</div>'
    + '<div style="font-size:22px;font-weight:800;color:' + statusColor + ';">' + totalStock + '</div>'
    + '<div style="font-size:10.5px;color:' + statusColor + ';font-weight:600;">' + statusText + '</div>'
    + '</div>'
    + '<div style="background:rgba(220,38,38,0.06);border-radius:var(--radius-sm);padding:12px;text-align:center;border-top:3px solid rgba(220,38,38,0.4);">'
    + '<div style="font-size:10px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Endommagé</div>'
    + '<div style="font-size:22px;font-weight:800;color:var(--red);">' + damagedQty + '</div>'
    + '<div style="font-size:10.5px;color:var(--red);">Non vendable</div>'
    + '</div>'
    + '<div style="background:rgba(245,158,11,0.06);border-radius:var(--radius-sm);padding:12px;text-align:center;border-top:3px solid rgba(245,158,11,0.4);">'
    + '<div style="font-size:10px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Manquant</div>'
    + '<div style="font-size:22px;font-weight:800;color:var(--gold);">' + missingQty + '</div>'
    + '<div style="font-size:10.5px;color:var(--gold);">En litige</div>'
    + '</div>'
    + '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;text-align:center;border-top:3px solid var(--border2);">'
    + '<div style="font-size:10px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Locaux</div>'
    + '<div style="font-size:22px;font-weight:800;">' + lm.size + '</div>'
    + '<div style="font-size:10.5px;color:var(--text3);">zone(s)</div>'
    + '</div></div>'

    // Locaux
    + '<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Répartition par local</div>'
    + locauxHtml
    + taillesHtml

    // Retours
    + '<div style="margin-top:18px;">'
    + '<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Retours récents</div>'
    + '<div style="background:var(--surface2);border-radius:var(--radius-sm);overflow:hidden;">' + retoursHtml + '</div>'
    + '</div>'

    // Ventes
    + '<div style="margin-top:18px;">'
    + '<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Ventes récentes</div>'
    + '<div style="background:var(--surface2);border-radius:var(--radius-sm);overflow:hidden;">' + ventesHtml + '</div>'
    + '</div>';

  openModal('modal-stock-detail');
}
