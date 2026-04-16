/* ================================================================
   GestionPro — modules/sheets_sync.js
   Synchronisation Google Sheets → Commandes E-commerce
   Sans CSV, sans sélection d'index, sans problème d'encodage
   Détection automatique des colonnes par nom (FR/AR/EN)
================================================================ */

// ════════════════════════════════════════════════════════════════
// DICTIONNAIRE DE DÉTECTION DES COLONNES
// Noms reconnus par colonne — case insensitive, trim
// ════════════════════════════════════════════════════════════════
const SHEETS_COL_SYNONYMS = {
  num:      ['order reference','order ref','reference','ref','num','numero','n° commande',
              'order id','order number','commande','رقم الطلب','رقم الاوردر','رقم'],
  client:   ['name','nom','client','destinataire','customer','nom client','customer name',
              'الاسم','اسم العميل','الاسم الكامل'],
  tel:      ['phone','tel','telephone','mobile','gsm','num tel','téléphone','phone number',
              'الهاتف','رقم الهاتف','هاتف'],
  adresse:  ['address','adresse','rue','domicile','delivery address','العنوان','عنوان','الحي'],
  ville:    ['city','ville','wilaya','المدينة','المنطقة','مدينة'],
  montant:  ['cod','cod amount','montant','prix','amount','total','cod (dh)','المبلغ',
              'مبلغ الدفع','القيمة','cod amount (dh)'],
  produits: ['product sku','product','produit','sku','article','items','المنتج',
              'المنتجات','اسم المنتج','product name'],
  qte:      ['quantity','qty','qte','quantite','قطع','الكمية','كمية'],
  notes:    ['notes','note','remarque','commentaire','observation','ملاحظات','ملاحظة'],
};

// ════════════════════════════════════════════════════════════════
// MOTEUR DE DÉTECTION DES COLONNES
// Prend la ligne 1 (headers) et retourne un map {champ: index}
// ════════════════════════════════════════════════════════════════
function _detectSheetColumns(headers) {
  const map = {}; // { num: 0, client: 1, ... }
  const normalized = headers.map(h => (h || '').toString().toLowerCase().trim());

  for (const [field, synonyms] of Object.entries(SHEETS_COL_SYNONYMS)) {
    for (let i = 0; i < normalized.length; i++) {
      if (synonyms.some(s => normalized[i].includes(s) || s.includes(normalized[i]) && normalized[i].length > 2)) {
        if (map[field] === undefined) map[field] = i; // premier match gagne
      }
    }
  }
  return map;
}

// ════════════════════════════════════════════════════════════════
// VALIDATION : vérifier que le sheet est utilisable
// ════════════════════════════════════════════════════════════════
function _validateColumnMap(map) {
  const required = ['num', 'client']; // minimum pour importer
  const missing  = required.filter(f => map[f] === undefined);
  return { valid: missing.length === 0, missing };
}

// ════════════════════════════════════════════════════════════════
// MODAL SYNC SHEETS
// ════════════════════════════════════════════════════════════════
function openSheetsSyncModal(storeId) {
  const s = ecomStores.find(x => x.id === storeId);
  if (!s) return;

  _currentSyncStoreId = storeId;

  // Remplir les infos du store
  document.getElementById('sync-store-name').textContent = s.nom;
  document.getElementById('sync-sheet-id').value    = s.sheetsId    || '';
  document.getElementById('sync-sheet-tab').value   = s.sheetsTab   || 'Sheet1';
  document.getElementById('sync-api-key').value     = s.sheetsApiKey || '';

  // État dernier sync
  const lastSync = document.getElementById('sync-last-info');
  if (s.sheetsLastSync) {
    const d = new Date(s.sheetsLastSync).toLocaleString('fr-FR');
    lastSync.textContent = '🕐 Dernière sync : ' + d + (s.sheetsLastRow > 1 ? ' (ligne ' + s.sheetsLastRow + ')' : '');
    lastSync.style.display = '';
  } else {
    lastSync.style.display = 'none';
  }

  // Reset UI
  document.getElementById('sync-result').style.display  = 'none';
  document.getElementById('sync-preview').style.display = 'none';
  document.getElementById('sync-col-map').style.display = 'none';
  document.getElementById('sync-detect-btn').style.display = '';

  openModal('modal-sheets-sync');
}

let _currentSyncStoreId = null;
let _currentColMap      = null;
let _currentSheetRows   = null;

// ════════════════════════════════════════════════════════════════
// ÉTAPE 1 — Récupérer les headers et détecter les colonnes
// ════════════════════════════════════════════════════════════════
async function detectSheetColumns() {
  const sheetId = document.getElementById('sync-sheet-id').value.trim();
  const tab     = document.getElementById('sync-sheet-tab').value.trim() || 'Sheet1';
  const apiKey  = document.getElementById('sync-api-key').value.trim();

  if (!sheetId) { toast('Entrez l\'ID du Google Sheet', 'error'); return; }
  if (!apiKey)  { toast('Entrez votre API Key Google', 'error'); return; }

  const btn = document.getElementById('sync-detect-btn');
  btn.disabled = true; btn.textContent = '⏳ Lecture...';

  try {
    // Lire uniquement la première ligne (headers) — très rapide
    const rows = await _fetchSheetData(sheetId, tab, apiKey, '1:1');
    if (!rows || rows.length === 0) {
      toast('Sheet vide ou inaccessible', 'error');
      btn.disabled = false; btn.textContent = '🔍 Détecter colonnes';
      return;
    }

    const headers   = rows[0] || [];
    _currentColMap  = _detectSheetColumns(headers);
    const validation = _validateColumnMap(_currentColMap);

    // Afficher le résultat de la détection
    _renderColumnMap(headers, _currentColMap, validation);
    document.getElementById('sync-col-map').style.display   = '';
    document.getElementById('sync-detect-btn').style.display = 'none';

    if (validation.valid) {
      document.getElementById('sync-launch-btn').style.display = '';
    }

    btn.disabled = false; btn.textContent = '🔍 Détecter colonnes';
  } catch (e) {
    console.error('[SheetsSync] detect error:', e);
    toast('Erreur : ' + e.message, 'error');
    btn.disabled = false; btn.textContent = '🔍 Détecter colonnes';
  }
}

function _renderColumnMap(headers, map, validation) {
  const el = document.getElementById('sync-col-map');
  const fieldLabels = {
    num: 'N° Commande', client: 'Nom client', tel: 'Téléphone',
    adresse: 'Adresse', ville: 'Ville', montant: 'Montant COD',
    produits: 'Produit/SKU', qte: 'Quantité', notes: 'Notes',
  };

  let html = '<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:8px;">📊 Colonnes détectées</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;">';

  for (const [field, label] of Object.entries(fieldLabels)) {
    const idx = map[field];
    const found = idx !== undefined;
    const colName = found ? (headers[idx] || 'col ' + idx) : null;
    const required = ['num','client'].includes(field);
    html += '<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:var(--radius-sm);background:'
      + (found ? 'rgba(5,150,105,0.07)' : required ? 'rgba(220,38,38,0.07)' : 'var(--surface2)') + ';">'
      + '<span>' + (found ? '✅' : required ? '❌' : '⚪') + '</span>'
      + '<div>'
      + '<div style="font-size:11px;font-weight:700;color:var(--text);">' + label + (required ? ' *' : '') + '</div>'
      + '<div style="font-size:10px;color:var(--text3);">'
      + (found ? '"' + escapeHTML(colName) + '" (col ' + (idx + 1) + ')' : 'Non trouvée')
      + '</div>'
      + '</div></div>';
  }
  html += '</div>';

  if (!validation.valid) {
    html += '<div style="margin-top:8px;padding:8px 10px;background:rgba(220,38,38,0.07);border-radius:var(--radius-sm);font-size:12px;color:var(--red);">'
      + '⚠️ Colonnes obligatoires manquantes : ' + validation.missing.map(f => fieldLabels[f]).join(', ')
      + '. Vérifiez que la ligne 1 contient bien les en-têtes.</div>';
  }

  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════
// ÉTAPE 2 — Lancer la synchronisation
// ════════════════════════════════════════════════════════════════
async function launchSheetsSync() {
  const storeId  = _currentSyncStoreId;
  const sheetId  = document.getElementById('sync-sheet-id').value.trim();
  const tab      = document.getElementById('sync-sheet-tab').value.trim() || 'Sheet1';
  const apiKey   = document.getElementById('sync-api-key').value.trim();
  const syncMode = document.getElementById('sync-mode').value; // 'new' | 'all'
  const store    = ecomStores.find(x => x.id === storeId);

  if (!_currentColMap || !_validateColumnMap(_currentColMap).valid) {
    toast('Détectez d\'abord les colonnes', 'error'); return;
  }

  const btn = document.getElementById('sync-launch-btn');
  btn.disabled = true; btn.textContent = '⏳ Synchronisation...';

  try {
    // Déterminer la plage à lire
    const startRow  = syncMode === 'new' && store?.sheetsLastRow > 1
      ? store.sheetsLastRow + 1
      : 2; // Toujours ignorer la ligne 1 (headers)

    const rows = await _fetchSheetData(sheetId, tab, apiKey, startRow + ':5000');

    if (!rows || rows.length === 0) {
      _showSyncResult(0, 0, 0, 'Aucune nouvelle ligne dans le Sheet.');
      btn.disabled = false; btn.textContent = '🔄 Lancer la sync';
      return;
    }

    // Sauvegarder API key + config dans le store si modifiée
    await _saveSheetConfig(storeId, sheetId, tab, apiKey);

    // Parser et insérer
    const { nbImportees, nbDoublons, nbErreurs, lastRow } =
      await _parseAndInsertRows(rows, storeId, startRow, store);

    // Mettre à jour last_row + last_sync dans gp_stores
    const newLastRow = startRow + rows.length - 1;
    await sb.from('gp_stores').update({
      sheets_last_row:  newLastRow,
      sheets_last_sync: new Date().toISOString(),
    }).eq('id', storeId).eq('tenant_id', GP_TENANT?.id);

    // Mettre à jour le state local
    const s = ecomStores.find(x => x.id === storeId);
    if (s) {
      s.sheetsLastRow  = newLastRow;
      s.sheetsLastSync = new Date().toISOString();
    }

    _showSyncResult(nbImportees, nbDoublons, nbErreurs);
    if (nbImportees > 0) { renderEcom(true); renderStores(); }

    toast('✅ Sync terminée — ' + nbImportees + ' commande(s)', 'success');
  } catch (e) {
    console.error('[SheetsSync] launch error:', e);
    toast('Erreur sync : ' + e.message, 'error');
  }
  btn.disabled = false; btn.textContent = '🔄 Lancer la sync';
}

// ════════════════════════════════════════════════════════════════
// FETCH — Récupérer les données du sheet via Google Sheets API v4
// ════════════════════════════════════════════════════════════════
async function _fetchSheetData(sheetId, tab, apiKey, range) {
  // Encoder le nom de l'onglet pour les espaces et caractères spéciaux
  const tabEncoded = encodeURIComponent(tab);
  const rangeEncoded = encodeURIComponent(tab + '!' + range);
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/'
    + encodeURIComponent(sheetId)
    + '/values/' + rangeEncoded
    + '?key=' + encodeURIComponent(apiKey)
    + '&valueRenderOption=FORMATTED_VALUE'
    + '&dateTimeRenderOption=FORMATTED_STRING';

  const resp = await fetch(url);

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg = err?.error?.message || resp.statusText;

    // Messages d'erreur explicites
    if (resp.status === 403) throw new Error('API Key invalide ou Sheet non partagé publiquement. Vérifiez : Partage → "Tout le monde avec le lien peut consulter".');
    if (resp.status === 404) throw new Error('Sheet introuvable. Vérifiez l\'ID du Sheet et le nom de l\'onglet.');
    if (resp.status === 400) throw new Error('Plage invalide : ' + msg);
    throw new Error('Erreur API Google (' + resp.status + ') : ' + msg);
  }

  const data = await resp.json();
  return data.values || [];
}

// ════════════════════════════════════════════════════════════════
// PARSING + INSERTION des lignes
// ════════════════════════════════════════════════════════════════
async function _parseAndInsertRows(rows, storeId, startRow, store) {
  const tid      = GP_TENANT?.id;
  const colMap   = _currentColMap;
  const prodSep  = /[;|,\/]/; // séparateurs produits courants

  const ordersToInsert = [];
  let nbDoublons = 0, nbErreurs = 0;

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const get = (field) => {
      const idx = colMap[field];
      return idx !== undefined ? ((row[idx] || '').toString().trim()) : '';
    };

    const num = get('num');
    if (!num) continue; // ligne vide

    // Doublon check
    if (ecomOrders.find(o => o.storeId === storeId && o.num === num)) {
      nbDoublons++; continue;
    }

    let hasMappingError = false;
    const pendingLines  = [];

    // Parser les produits — format: "SKU1:2;SKU2:1" ou "SKU1" ou "SKU1,SKU2"
    const produitsRaw = get('produits');
    const qteRaw      = get('qte');

    if (produitsRaw) {
      const entries = produitsRaw.split(prodSep).map(s => s.trim()).filter(Boolean);
      for (const entry of entries) {
        // Essayer format "SKU:QTE" d'abord
        const colonIdx  = entry.lastIndexOf(':');
        let nomExterne, qte;
        if (colonIdx > 0 && colonIdx < entry.length - 1) {
          const afterColon = entry.slice(colonIdx + 1).trim();
          if (/^\d+$/.test(afterColon)) {
            nomExterne = entry.slice(0, colonIdx).trim();
            qte = parseInt(afterColon) || 1;
          } else {
            nomExterne = entry;
            qte = parseInt(qteRaw) || 1;
          }
        } else {
          nomExterne = entry;
          qte = parseInt(qteRaw) || 1;
        }

        if (!nomExterne) continue;
        const resolved = resolveMappingProduct(storeId, nomExterne);
        pendingLines.push({
          nom_externe:   nomExterne,
          product_id:    resolved.found ? resolved.productId : null,
          qte:           Math.max(1, qte),
          prix_unitaire: 0,
          statut:        'en_attente',
          mapping_auto:  resolved.auto,
          mapping_error: !resolved.found,
        });
        if (!resolved.found) hasMappingError = true;
      }
    }

    // Montant : nettoyer les espaces, virgules, symboles monnaie
    const montantRaw = get('montant').replace(/[^\d.,]/g, '').replace(',', '.');
    const montant    = parseFloat(montantRaw) || 0;

    ordersToInsert.push({
      orderPayload: {
        tenant_id:        tid,
        store_id:         storeId,
        num,
        source:           'sheets',
        client_nom:       get('client'),
        client_tel:       get('tel'),
        client_adresse:   get('adresse'),
        client_ville:     get('ville'),
        montant,
        statut:           hasMappingError ? 'importe' : 'mapping_ok',
        has_mapping_error: hasMappingError,
        notes:            get('notes') || null,
      },
      pendingLines,
    });
    if (hasMappingError) nbErreurs++;
  }

  // INSERT batch orders → récupérer UUIDs → INSERT lignes
  let nbImportees = 0;
  if (ordersToInsert.length > 0) {
    const allInserted = [];
    for (let i = 0; i < ordersToInsert.length; i += 50) {
      const batch = ordersToInsert.slice(i, i + 50).map(x => x.orderPayload);
      const { data: ins, error } = await sb.from('gp_ecom_orders')
        .insert(batch)
        .select('id, num, store_id, statut, has_mapping_error, client_nom, client_tel, client_adresse, client_ville, montant, notes, source');
      if (error) { console.error('[SheetsSync] orders insert:', error); throw error; }
      allInserted.push(...(ins || []));
    }

    // Construire lignes avec vrais UUIDs
    const allLines = [];
    for (const item of ordersToInsert) {
      const ins = allInserted.find(x => x.num === item.orderPayload.num);
      if (!ins) continue;
      for (const l of item.pendingLines) {
        allLines.push({ order_id: ins.id, ...l });
      }
    }
    for (let i = 0; i < allLines.length; i += 100) {
      const { error } = await sb.from('gp_ecom_order_lines').insert(allLines.slice(i, i + 100));
      if (error) { console.error('[SheetsSync] lines insert:', error); throw error; }
    }

    // Mettre à jour state local
    allInserted.forEach(ins => {
      ecomOrders.push({
        id: ins.id, storeId: ins.store_id, num: ins.num,
        source: 'sheets',
        clientNom: ins.client_nom, clientTel: ins.client_tel,
        clientAdresse: ins.client_adresse, clientVille: ins.client_ville,
        montant: ins.montant, statut: ins.statut,
        hasMappingError: ins.has_mapping_error, notes: ins.notes,
        createdAt: new Date().toISOString(), tracking: null,
      });
      const item = ordersToInsert.find(x => x.orderPayload.num === ins.num);
      if (item) item.pendingLines.forEach(l => ecomOrderLines.push({
        id: null, orderId: ins.id, nomExterne: l.nom_externe,
        productId: l.product_id, qte: l.qte, prixUnitaire: l.prix_unitaire,
        statut: l.statut, mappingAuto: l.mapping_auto, mappingError: l.mapping_error,
      }));
    });

    nbImportees = allInserted.length;
  }

  return { nbImportees, nbDoublons, nbErreurs };
}

// ════════════════════════════════════════════════════════════════
// SAUVEGARDER LA CONFIG SHEETS dans gp_stores
// ════════════════════════════════════════════════════════════════
async function _saveSheetConfig(storeId, sheetId, tab, apiKey) {
  const s = ecomStores.find(x => x.id === storeId);
  // Sauvegarder seulement si changement
  if (s && s.sheetsId === sheetId && s.sheetsTab === tab && s.sheetsApiKey === apiKey) return;

  await sb.from('gp_stores').update({
    sheets_id:      sheetId,
    sheets_tab:     tab,
    sheets_api_key: apiKey,
    sheets_enabled: true,
  }).eq('id', storeId).eq('tenant_id', GP_TENANT?.id);

  if (s) { s.sheetsId = sheetId; s.sheetsTab = tab; s.sheetsApiKey = apiKey; s.sheetsEnabled = true; }
}

// ════════════════════════════════════════════════════════════════
// UI — Rapport de synchronisation
// ════════════════════════════════════════════════════════════════
function _showSyncResult(nbImportees, nbDoublons, nbErreurs, msg) {
  const el = document.getElementById('sync-result');
  el.style.display = '';
  el.innerHTML =
    '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:14px;">'
    + (msg ? '<div style="font-size:13px;color:var(--text2);margin-bottom:6px;">' + escapeHTML(msg) + '</div>' : '')
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;">'
    + _kpi(nbImportees, 'Importées',        'var(--green)')
    + _kpi(nbDoublons,  'Doublons ignorés', 'var(--gold)')
    + _kpi(nbErreurs,   'Mapping manquant', nbErreurs > 0 ? 'var(--red)' : 'var(--text3)')
    + '</div>'
    + (nbErreurs > 0
      ? '<div style="font-size:12px;color:var(--red);padding:8px 10px;background:rgba(220,38,38,0.06);border-radius:var(--radius-sm);">⚠️ '
        + nbErreurs + ' commande(s) avec produits non mappés — allez dans <strong>Mapping</strong> pour corriger.</div>'
      : nbImportees > 0
        ? '<div style="font-size:12px;color:var(--green);">✅ Tous les produits mappés automatiquement.</div>'
        : '')
    + '</div>';
}

function _kpi(val, label, color) {
  return '<div style="text-align:center;background:var(--surface);border-radius:var(--radius-sm);padding:10px;">'
    + '<div style="font-size:22px;font-weight:800;color:' + color + ';">' + val + '</div>'
    + '<div style="font-size:10.5px;color:var(--text3);">' + label + '</div>'
    + '</div>';
}

// ════════════════════════════════════════════════════════════════
// QUICK SYNC — depuis la carte store (sans rouvrir le modal)
// ════════════════════════════════════════════════════════════════
async function quickSyncStore(storeId) {
  const s = ecomStores.find(x => x.id === storeId);
  if (!s?.sheetsId || !s?.sheetsApiKey) {
    // Pas encore configuré → ouvrir le modal complet
    openSheetsSyncModal(storeId);
    return;
  }

  const btn = document.getElementById('quick-sync-btn-' + storeId);
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    // Lire headers pour détecter les colonnes
    const headerRows = await _fetchSheetData(s.sheetsId, s.sheetsTab || 'Sheet1', s.sheetsApiKey, '1:1');
    if (!headerRows?.[0]) throw new Error('Sheet vide ou inaccessible');

    _currentSyncStoreId = storeId;
    _currentColMap = _detectSheetColumns(headerRows[0]);
    const validation = _validateColumnMap(_currentColMap);
    if (!validation.valid) throw new Error('Colonnes manquantes : ' + validation.missing.join(', '));

    // Lire depuis la dernière ligne synchronisée
    const startRow = s.sheetsLastRow > 1 ? s.sheetsLastRow + 1 : 2;
    const rows = await _fetchSheetData(s.sheetsId, s.sheetsTab || 'Sheet1', s.sheetsApiKey, startRow + ':5000');

    if (!rows?.length) {
      toast('✅ ' + s.nom + ' — aucune nouvelle commande', 'success');
      if (btn) { btn.disabled = false; btn.textContent = '🔄'; }
      return;
    }

    const { nbImportees, nbDoublons, nbErreurs } = await _parseAndInsertRows(rows, storeId, startRow, s);

    // Mettre à jour last_row + last_sync
    const newLastRow = startRow + rows.length - 1;
    await sb.from('gp_stores').update({
      sheets_last_row: newLastRow, sheets_last_sync: new Date().toISOString(),
    }).eq('id', storeId).eq('tenant_id', GP_TENANT?.id);
    s.sheetsLastRow = newLastRow; s.sheetsLastSync = new Date().toISOString();

    if (nbImportees > 0) { renderEcom(true); renderStores(); }
    toast('🔄 ' + s.nom + ' — ' + nbImportees + ' importée(s), ' + nbDoublons + ' doublon(s)', 'success');
  } catch (e) {
    console.error('[QuickSync]', e);
    toast('Erreur sync : ' + e.message, 'error');
  }

  if (btn) { btn.disabled = false; btn.textContent = '🔄'; }
}
