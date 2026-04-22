/* ================================================================
   GestionPro — modules/stores.js
   Phase 1 E-commerce : Gestion des Stores
   Fonctions : renderStores, saveStore, deleteStore,
               openNewStore, openEditStore,
               renderMappingList, saveMapping, deleteMapping
================================================================ */

// ════════════════════════════════════════════════════════════════
// RENDER — Liste des stores
// ════════════════════════════════════════════════════════════════
function renderStores() {
  const q    = (document.getElementById('stores-search')?.value || '').toLowerCase();
  const grid = document.getElementById('stores-grid');
  if (!grid) return;

  let list = [...ecomStores];
  if (q) list = list.filter(s =>
    (s.nom || '').toLowerCase().includes(q) ||
    (s.clientNom || '').toLowerCase().includes(q)
  );

  if (!list.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">'
      + '<div class="emoji">🏪</div>'
      + '<p>Aucun store configuré</p>'
      + '<p style="font-size:12px;color:var(--text3);">Créez votre premier store pour commencer à importer des commandes</p>'
      + '</div>';
    return;
  }

  // Synchroniser le select ecom-filter-store avec la liste actuelle
  const ecomStoreSelect = document.getElementById('ecom-filter-store');
  if (ecomStoreSelect) {
    const curVal = ecomStoreSelect.value;
    ecomStoreSelect.innerHTML = '<option value="all">Tous les stores</option>'
      + ecomStores.map(s => '<option value="' + s.id + '"' + (s.id === curVal ? ' selected' : '') + '>'
        + escapeHTML(s.nom) + '</option>').join('');
  }

  grid.innerHTML = list.map(s => {
    const ordersCount   = ecomOrders.filter(o => o.storeId === s.id).length;
    const pendingCount  = ecomOrders.filter(o => o.storeId === s.id && o.statut === 'importe').length;
    const mappingCount  = ecomMappings.filter(m => m.storeId === s.id).length;
    const errorCount    = ecomOrders.filter(o => o.storeId === s.id && o.hasMappingError).length;
    const accentColor   = s.actif ? 'var(--accent)' : 'var(--text3)';

    return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;position:relative;">'
      // Header
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;">'
      + '<div>'
      + '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px;">' + escapeHTML(s.nom) + '</div>'
      + '<div style="font-size:12px;color:var(--text3);">' + (s.clientNom ? '👤 ' + escapeHTML(s.clientNom) : 'Aucun client renseigné') + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;align-items:center;">'
      + '<span class="chip ' + (s.actif ? 'chip-green' : 'chip-red') + '" style="font-size:10px;">' + (s.actif ? '✅ Actif' : '⛔ Inactif') + '</span>'
      + '</div>'
      + '</div>'

      // KPIs
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">'
      + '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:8px;text-align:center;">'
      + '<div style="font-size:18px;font-weight:800;color:var(--accent);">' + ordersCount + '</div>'
      + '<div style="font-size:10px;color:var(--text3);">Commandes</div>'
      + '</div>'
      + '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:8px;text-align:center;">'
      + '<div style="font-size:18px;font-weight:800;color:var(--green);">' + mappingCount + '</div>'
      + '<div style="font-size:10px;color:var(--text3);">Mappings</div>'
      + '</div>'
      + '<div style="background:' + (errorCount > 0 ? 'rgba(220,38,38,0.07)' : 'var(--surface2)') + ';border-radius:var(--radius-sm);padding:8px;text-align:center;">'
      + '<div style="font-size:18px;font-weight:800;color:' + (errorCount > 0 ? 'var(--red)' : 'var(--text3)') + ';">' + errorCount + '</div>'
      + '<div style="font-size:10px;color:var(--text3);">Erreurs</div>'
      + '</div>'
      + '</div>'

      // Config rapide
      + '<div style="font-size:11.5px;color:var(--text2);margin-bottom:12px;display:flex;flex-wrap:wrap;gap:6px;">'
      + '<span style="background:var(--surface2);border-radius:var(--radius-sm);padding:2px 8px;">💰 ' + fmt(s.fulfillmentFee || 0) + ' DH/cmd</span>'
      + '<span style="background:var(--surface2);border-radius:var(--radius-sm);padding:2px 8px;">🚚 ' + (s.shippingCompany || 'digylog').toUpperCase() + '</span>'
      + (s.sheetsEnabled ? '<span style="background:rgba(5,150,105,0.1);color:var(--green);border-radius:var(--radius-sm);padding:2px 8px;">📊 Sheets</span>' : '')
      + (pendingCount > 0 ? '<span style="background:rgba(245,158,11,0.1);color:var(--gold);border-radius:var(--radius-sm);padding:2px 8px;">⏳ ' + pendingCount + ' en attente</span>' : '')
      + '</div>'

      // Actions
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'      + '<button class="btn btn-secondary btn-sm" onclick="openEditStore(\'' + s.id + '\')">✏️ Modifier</button>'      + '<button class="btn btn-secondary btn-sm" onclick="openStoreMappingModal(\'' + s.id + '\')">🔗 Mapping</button>'      + '<button class="btn btn-secondary btn-sm" onclick="navigate(\'ecom\')" title="Voir commandes">📋</button>'      + (s.sheetsEnabled        ? '<button class="btn btn-primary btn-sm" id="quick-sync-btn-' + s.id + '" onclick="quickSyncStore(\'' + s.id + '\')" title="Sync rapide">🔄 Sync</button>'          + '<button class="btn btn-secondary btn-sm" onclick="openSheetsSyncModal(\'' + s.id + '\')" title="Config Sheets">📊</button>'        : '<button class="btn btn-secondary btn-sm" onclick="openSheetsSyncModal(\'' + s.id + '\')" title="Connecter Google Sheets">📊 Sheets</button>')      + '<button class="btn btn-danger btn-sm" onclick="deleteStore(\'' + s.id + '\')" title="Supprimer">🗑️</button>'      + '</div>'
      + '</div>';
  }).join('');
}

// ════════════════════════════════════════════════════════════════
// MODAL — Ouvrir / Fermer
// ════════════════════════════════════════════════════════════════
function openNewStore() {
  document.getElementById('store-edit-id').value = '';
  document.getElementById('store-nom').value = '';
  document.getElementById('store-client-nom').value = '';
  document.getElementById('store-notes').value = '';
  document.getElementById('store-fulfillment-fee').value = '0';
  document.getElementById('store-port-type').value = '1';
  document.getElementById('store-shipping').value = 'digylog';
  document.getElementById('store-actif').checked = true;
  document.getElementById('store-sheets-enabled').checked = false;
  document.getElementById('store-sheets-id').value = '';
  document.getElementById('store-sheets-tab').value = 'Sheet1';
  document.getElementById('store-digylog-name').value = '';
  document.getElementById('store-digylog-network').value = '';
  document.getElementById('store-sheets-row-start').value = '2';
  document.getElementById('modal-store-title').textContent = '🏪 Nouveau Store';
  toggleSheetsConfig();
  openModal('modal-store');
  setTimeout(() => document.getElementById('store-nom')?.focus(), 100);
}

function openEditStore(id) {
  const s = ecomStores.find(x => x.id === id);
  if (!s) return;
  document.getElementById('store-edit-id').value = s.id;
  document.getElementById('store-nom').value = s.nom || '';
  document.getElementById('store-client-nom').value = s.clientNom || '';
  document.getElementById('store-notes').value = s.notes || '';
  document.getElementById('store-fulfillment-fee').value = s.fulfillmentFee || 0;
  document.getElementById('store-port-type').value = s.portType || 1;
  document.getElementById('store-shipping').value = s.shippingCompany || 'digylog';
  document.getElementById('store-actif').checked = s.actif !== false;
  document.getElementById('store-sheets-enabled').checked = s.sheetsEnabled || false;
  document.getElementById('store-sheets-id').value = s.sheetsId || '';
  document.getElementById('store-sheets-tab').value = s.sheetsTab || 'Sheet1';
  document.getElementById('store-digylog-name').value    = s.digylogStoreName || '';
  document.getElementById('store-digylog-network').value  = s.digylogNetworkId || '';
  document.getElementById('store-sheets-row-start').value = s.sheetsRowStart || 2;
  document.getElementById('modal-store-title').textContent = '✏️ Modifier Store';
  toggleSheetsConfig();
  openModal('modal-store');
}

function toggleSheetsConfig() {
  const enabled = document.getElementById('store-sheets-enabled')?.checked;
  const block   = document.getElementById('sheets-config-block');
  if (block) block.style.display = enabled ? '' : 'none';
}

// ════════════════════════════════════════════════════════════════
// SAVE — Créer ou modifier un store
// ════════════════════════════════════════════════════════════════
async function saveStore() {
  if (!isSuperAdmin() && !hasPermission('stores', 'create')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  const nom = document.getElementById('store-nom').value.trim();
  if (!nom) { toast('Le nom du store est obligatoire', 'error'); return; }

  const editId = document.getElementById('store-edit-id').value.trim();
  const tid    = GP_TENANT?.id;

  const payload = {
    tenant_id:        tid,
    nom:              nom,
    client_nom:       document.getElementById('store-client-nom').value.trim() || null,
    notes:            document.getElementById('store-notes').value.trim() || null,
    fulfillment_fee:  parseFloat(document.getElementById('store-fulfillment-fee').value) || 0,
    port_type:        parseInt(document.getElementById('store-port-type').value) || 1,
    shipping_company: document.getElementById('store-shipping').value || 'digylog',
    actif:            document.getElementById('store-actif').checked,
    sheets_enabled:   document.getElementById('store-sheets-enabled').checked,
    sheets_id:        document.getElementById('store-sheets-id').value.trim() || null,
    sheets_tab:       document.getElementById('store-sheets-tab').value.trim() || 'Sheet1',
    digylog_store_name: document.getElementById('store-digylog-name').value.trim() || null,
    digylog_network_id: parseInt(document.getElementById('store-digylog-network').value) || null,
    sheets_row_start:   parseInt(document.getElementById('store-sheets-row-start').value) || 2,
    updated_at:       new Date().toISOString(),
  };

  try {
    let savedId = editId;

    if (editId) {
      // MODIFICATION : UPDATE ciblé par id + tenant_id
      const { error } = await sb.from('gp_stores')
        .update(payload)
        .eq('id', editId)
        .eq('tenant_id', tid);
      if (error) {
        console.error('[saveStore] UPDATE error:', error);
        toast('Erreur: ' + error.message, 'error');
        return;
      }
    } else {
      // CRÉATION : INSERT, laisser Supabase générer l'UUID
      const { data: inserted, error } = await sb.from('gp_stores')
        .insert(payload)
        .select('id')
        .single();
      if (error) {
        console.error('[saveStore] INSERT error:', error);
        toast('Erreur: ' + error.message, 'error');
        return;
      }
      savedId = inserted.id;
    }

    // Mettre à jour le state local
    const localStore = {
      id: savedId, tenantId: tid, nom: payload.nom,
      clientNom: payload.client_nom, notes: payload.notes,
      fulfillmentFee: payload.fulfillment_fee, portType: payload.port_type,
      shippingCompany: payload.shipping_company, actif: payload.actif,
      sheetsEnabled: payload.sheets_enabled, sheetsId: payload.sheets_id,
      sheetsTab: payload.sheets_tab, webhookUrl: payload.webhook_url,
    };
    const existing = ecomStores.findIndex(x => x.id === savedId);
    if (existing >= 0) ecomStores[existing] = localStore;
    else ecomStores.push(localStore);

    closeModal('modal-store');
    renderStores();
    toast('✅ Store "' + nom + '" sauvegardé', 'success');
  } catch (e) {
    console.error('[saveStore] Exception:', e);
    toast('Erreur inattendue: ' + e.message, 'error');
  }
}

// ════════════════════════════════════════════════════════════════
// DELETE — Supprimer un store
// ════════════════════════════════════════════════════════════════
async function deleteStore(id) {
  const s = ecomStores.find(x => x.id === id);
  if (!s) return;
  const orderCount = ecomOrders.filter(o => o.storeId === id).length;
  if (orderCount > 0) {
    if (!confirm('Ce store a ' + orderCount + ' commande(s). Supprimer quand même ?')) return;
  } else {
    if (!confirm('Supprimer le store "' + s.nom + '" ?')) return;
  }
  try {
    const { error } = await sb.from('gp_stores').delete().eq('id', id).eq('tenant_id', GP_TENANT?.id);
    if (error) { toast('Erreur: ' + error.message, 'error'); return; }
    ecomStores = ecomStores.filter(x => x.id !== id);
    ecomMappings = ecomMappings.filter(x => x.storeId !== id);
    renderStores();
    toast('Store supprimé', 'warn');
  } catch (e) {
    toast('Erreur: ' + e.message, 'error');
  }
}

// ════════════════════════════════════════════════════════════════
// MAPPING PRODUITS
// ════════════════════════════════════════════════════════════════
let _currentMappingStoreId = null;

function openStoreMappingModal(storeId) {
  _currentMappingStoreId = storeId;
  const s = ecomStores.find(x => x.id === storeId);
  document.getElementById('mapping-store-title').textContent =
    '🔗 Mapping produits — ' + (s?.nom || storeId);
  // Vider les champs
  document.getElementById('mapping-nom-externe').value = '';
  document.getElementById('mapping-search').value = '';
  // Pré-charger le select des produits internes
  populateMappingProductSelect();
  renderMappingList();
  openModal('modal-store-mapping');
  setTimeout(() => document.getElementById('mapping-nom-externe')?.focus(), 150);
}

function renderMappingList() {
  const storeId = _currentMappingStoreId;
  const q       = (document.getElementById('mapping-search')?.value || '').toLowerCase();
  const tbody   = document.getElementById('mapping-table');
  if (!tbody || !storeId) return;

  let list = ecomMappings.filter(m => m.storeId === storeId);
  if (q) list = list.filter(m =>
    m.nomExterne.toLowerCase().includes(q) ||
    (products.find(p => p.id === m.productId)?.name || '').toLowerCase().includes(q)
  );

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text3);">'
      + (q ? 'Aucun mapping trouvé pour "' + escapeHTML(q) + '"' : 'Aucun mapping pour ce store')
      + '</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(m => {
    const prod = products.find(p => p.id === m.productId);
    return '<tr>'
      + '<td style="font-size:13px;font-weight:600;">' + escapeHTML(m.nomExterne) + '</td>'
      + '<td style="font-size:12px;color:var(--text2);">' + escapeHTML(m.nomNormalise) + '</td>'
      + '<td>'
      + (prod
        ? '<span style="font-weight:600;">' + escapeHTML(prod.name) + '</span>'
          + (prod.code ? '<span style="color:var(--text3);font-size:11px;"> · ' + escapeHTML(prod.code) + '</span>' : '')
        : '<span style="color:var(--red);font-size:12px;">⚠️ Produit introuvable</span>')
      + '</td>'
      + '<td style="white-space:nowrap;">'
      + '<button class="btn btn-danger btn-sm" onclick="deleteMapping(\'' + m.id + '\')">🗑️</button>'
      + '</td>'
      + '</tr>';
  }).join('');
}

function populateMappingProductSelect() {
  const sel = document.getElementById('mapping-product-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sélectionner un produit interne —</option>'
    + [...products]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(p => '<option value="' + p.id + '">'
        + escapeHTML(p.name)
        + (p.code ? ' (' + escapeHTML(p.code) + ')' : '')
        + '</option>')
      .join('');
}

function _mappingKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const nom = document.getElementById('mapping-nom-externe').value.trim();
    if (!nom) { document.getElementById('mapping-nom-externe').focus(); return; }
    const sel = document.getElementById('mapping-product-select');
    if (!sel.value) { sel.focus(); return; }
    saveMapping();
  }
}

async function saveMapping() {
  const storeId    = _currentMappingStoreId;
  const nomExterne = document.getElementById('mapping-nom-externe').value.trim();
  const productId  = document.getElementById('mapping-product-select').value;
  const tid        = GP_TENANT?.id;

  if (!nomExterne) { toast('Entrez le nom produit du store', 'error'); return; }
  if (!productId)  { toast('Sélectionnez un produit interne', 'error'); return; }
  if (!storeId)    { toast('Aucun store sélectionné', 'error'); return; }

  const nomNormalise = normalizeName(nomExterne);
  console.log('[saveMapping] nomExterne:', JSON.stringify(nomExterne), '→ normalisé:', JSON.stringify(nomNormalise));

  // Vérifier doublon en state local
  const existing = ecomMappings.find(m => m.storeId === storeId && m.nomNormalise === nomNormalise);
  if (existing) { toast('Ce nom externe est déjà mappé pour ce store', 'warn'); return; }

  const prod = products.find(p => p.id === productId);

  // Payload SANS id — Supabase génère l'UUID (gp_store_mapping.id = uuid)
  const payload = {
    tenant_id:           tid,
    store_id:            storeId,
    product_id:          productId,
    nom_externe:         nomExterne,
    nom_normalise:       nomNormalise,
    designation_digylog: prod?.name || null,
    created_by:          GP_USER?.id || null,
  };

  console.log('[saveMapping] payload:', JSON.stringify(payload));

  try {
    const { data: inserted, error } = await sb.from('gp_store_mapping')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      console.error('[saveMapping] error:', error);
      toast('Erreur: ' + error.message, 'error');
      return;
    }

    // Mettre à jour le state local avec l'UUID réel retourné
    ecomMappings.push({
      id:                  inserted.id,
      storeId,
      productId,
      nomExterne,
      nomNormalise,
      designationDigylog:  prod?.name || null,
    });

    document.getElementById('mapping-nom-externe').value = '';
    document.getElementById('mapping-product-select').value = '';
    renderMappingList();
    toast('✅ Mapping sauvegardé', 'success');
  } catch (e) {
    console.error('[saveMapping] exception:', e);
    toast('Erreur: ' + e.message, 'error');
  }
}

async function deleteMapping(id) {
  if (!confirm('Supprimer ce mapping ?')) return;
  try {
    const { error } = await sb.from('gp_store_mapping').delete().eq('id', id);
    if (error) { toast('Erreur: ' + error.message, 'error'); return; }
    ecomMappings = ecomMappings.filter(m => m.id !== id);
    renderMappingList();
    toast('Mapping supprimé', 'warn');
  } catch (e) {
    toast('Erreur: ' + e.message, 'error');
  }
}

// Résolution mapping (utilisée par import CSV et futur scan)
function resolveMappingProduct(storeId, nomExterne) {
  const nomNormalise = normalizeName(nomExterne);
  const mapping = ecomMappings.find(m => m.storeId === storeId && m.nomNormalise === nomNormalise);
  console.log('[resolveMapping]', JSON.stringify(nomExterne), '→', JSON.stringify(nomNormalise),
    '→', mapping ? '✅ trouvé: ' + mapping.productId : '❌ non trouvé');
  if (mapping) {
    const prod = products.find(p => p.id === mapping.productId);
    return { found: true, productId: mapping.productId, product: prod, auto: true };
  }
  return { found: false, productId: null, product: null, auto: false };
}
