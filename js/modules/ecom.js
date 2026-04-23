/* ================================================================
   GestionPro — modules/ecom.js
   Phase 1 E-commerce : Commandes e-com + Import CSV + Mapping
   Fonctions : renderEcom, importCSV, resolveOrderMapping,
               updateOrderStatus, deleteOrder
================================================================ */

// ════════════════════════════════════════════════════════════════
// RENDER — Tableau des commandes e-com
// ════════════════════════════════════════════════════════════════
function renderEcom(resetPage) {
  if (resetPage !== false) _pages['ecom'] = 1;

  const q       = (document.getElementById('ecom-search')?.value || '').toLowerCase();
  const storeF  = document.getElementById('ecom-filter-store')?.value || 'all';
  const statutF = document.getElementById('ecom-filter-statut')?.value || 'all';
  const tbody   = document.getElementById('ecom-table');
  if (!tbody) return;

  // Toujours reconstruire le select stores (peut changer après un ajout)
  const storeSelect = document.getElementById('ecom-filter-store');
  if (storeSelect) {
    const curStoreVal = storeSelect.value;
    storeSelect.innerHTML = '<option value="all">Tous les stores</option>'
      + ecomStores.map(s => '<option value="' + s.id + '"' + (s.id === curStoreVal ? ' selected' : '') + '>'
        + escapeHTML(s.nom) + '</option>').join('');
  }

  // KPIs
  _renderEcomKpis();

  let filtered = [...ecomOrders];
  if (q) filtered = filtered.filter(o =>
    (o.num || '').toLowerCase().includes(q) ||
    (o.clientNom || '').toLowerCase().includes(q) ||
    (o.clientTel || '').includes(q) ||
    (o.tracking || '').toLowerCase().includes(q)
  );
  if (storeF !== 'all') filtered = filtered.filter(o => o.storeId === storeF);
  if (statutF !== 'all') filtered = filtered.filter(o => o.statut === statutF);

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="emoji">📋</div>'
      + '<p>' + (ecomOrders.length === 0 ? 'Aucune commande importée' : 'Aucun résultat') + '</p>'
      + (ecomOrders.length === 0 ? '<p style="font-size:12px;color:var(--text3);">Importez un fichier CSV pour commencer</p>' : '')
      + '</div></td></tr>';
    buildPagination('ecom', 0, 'renderEcom', 'ecom-pagination');
    return;
  }

  const page     = getPage('ecom');
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statutBadge = {
    importe:       '<span class="chip chip-blue" style="font-size:10px;">📥 Importé</span>',
    mapping_ok:    '<span class="chip chip-green" style="font-size:10px;">✅ Mappé</span>',
    prepare:       '<span class="chip chip-purple" style="font-size:10px;">📦 Préparé</span>',
    dispatche:     '<span class="chip chip-teal" style="font-size:10px;">🚚 Dispatché</span>',
    en_livraison:  '<span class="chip chip-blue" style="font-size:10px;">🏃 En cours</span>',
    livre:         '<span class="chip chip-green" style="font-size:10px;">✅ Livré</span>',
    retour:        '<span class="chip chip-orange" style="font-size:10px;">↩️ Retour</span>',
    annule:        '<span class="chip chip-red" style="font-size:10px;">❌ Annulé</span>',
  };

  tbody.innerHTML = pageData.map(o => {
    const store   = ecomStores.find(s => s.id === o.storeId);
    const dateStr = new Date(o.createdAt).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'2-digit'});
    const lines   = ecomOrderLines.filter(l => l.orderId === o.id);
    const itemsHtml = lines.slice(0, 2).map(l => {
      const prod = products.find(p => p.id === l.productId);
      return '<div style="font-size:11px;' + (l.mappingError ? 'color:var(--red);' : 'color:var(--text2);') + '">'
        + (l.mappingError ? '⚠️ ' : '') + escapeHTML(l.nomExterne) + ' ×' + l.qte
        + '</div>';
    }).join('') + (lines.length > 2 ? '<div style="font-size:10px;color:var(--text3);">+' + (lines.length - 2) + ' autres</div>' : '');

    return '<tr>'
      + '<td style="font-family:var(--font-mono),monospace;font-size:12px;color:var(--accent);font-weight:700;">'
      + escapeHTML(o.num) + '</td>'
      + '<td style="font-size:12px;">'
      + '<span style="background:var(--accent-light);color:var(--accent);border-radius:var(--radius-sm);padding:1px 6px;font-size:11px;font-weight:600;">'
      + escapeHTML(store?.nom || '—') + '</span>'
      + '</td>'
      + '<td>'
      + '<div style="font-weight:600;font-size:13px;">' + escapeHTML(o.clientNom || '—') + '</div>'
      + '<div style="font-size:11px;color:var(--text3);">' + escapeHTML(o.clientTel || '') + '</div>'
      + '</td>'
      + '<td style="font-size:12px;color:var(--text2);">' + escapeHTML(o.clientVille || '—') + '</td>'
      + '<td>' + itemsHtml + '</td>'
      + '<td style="font-family:var(--font-mono),monospace;font-weight:700;">'
      + fmt(o.montant || 0) + ' DH</td>'
      + '<td>'
      + (o.hasMappingError
        ? '<div style="display:flex;flex-direction:column;gap:3px;">'
          + (statutBadge[o.statut] || o.statut)
          + '<span style="font-size:10px;color:var(--red);">⚠️ Mapping manquant</span>'
          + '</div>'
        : (statutBadge[o.statut] || o.statut))
      + '</td>'
      + '<td style="font-size:12px;color:var(--text2);">' + dateStr + '</td>'
      + '<td style="white-space:nowrap;">'
      + '<button class="btn btn-secondary btn-sm" onclick="viewEcomOrder(\'' + o.id + '\')" title="Voir détail">🔍</button>'
      + (o.hasMappingError
        ? '<button class="btn btn-secondary btn-sm" onclick="openStoreMappingModal(\'' + o.storeId + '\')" title="Corriger mapping">🔗</button>'
        : '')
      + '<button class="btn btn-danger btn-sm" onclick="deleteOrder(\'' + o.id + '\')" title="Supprimer">🗑️</button>'
      + '</td>'
      + '</tr>';
  }).join('');

  buildPagination('ecom', filtered.length, 'renderEcom', 'ecom-pagination');
}

function _renderEcomKpis() {
  const el = document.getElementById('ecom-kpis');
  if (!el) return;
  const total    = ecomOrders.length;
  const erreurs  = ecomOrders.filter(o => o.hasMappingError).length;
  const prepare  = ecomOrders.filter(o => o.statut === 'prepare').length;
  const livre    = ecomOrders.filter(o => o.statut === 'livre').length;

  el.innerHTML = [
    { label:'Total commandes', value: total, color:'var(--accent)' },
    { label:'Erreurs mapping', value: erreurs, color: erreurs > 0 ? 'var(--red)' : 'var(--text3)' },
    { label:'Prêtes', value: prepare, color:'var(--purple)' },
    { label:'Livrées', value: livre, color:'var(--green)' },
  ].map(k =>
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;text-align:center;">'
    + '<div style="font-size:20px;font-weight:800;color:' + k.color + ';">' + k.value + '</div>'
    + '<div style="font-size:10.5px;color:var(--text3);">' + k.label + '</div>'
    + '</div>'
  ).join('');
}

// ════════════════════════════════════════════════════════════════
// DÉTAIL COMMANDE
// ════════════════════════════════════════════════════════════════
function viewEcomOrder(orderId) {
  const o     = ecomOrders.find(x => x.id === orderId);
  if (!o) return;
  const store = ecomStores.find(s => s.id === o.storeId);
  const lines = ecomOrderLines.filter(l => l.orderId === orderId);
  const el    = document.getElementById('ecom-order-detail-content');
  if (!el) return;

  const dateStr = new Date(o.createdAt).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});

  el.innerHTML =
    // En-tête
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">'
    + '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px;">'
    + '<div style="font-size:10px;color:var(--text3);margin-bottom:2px;">Commande</div>'
    + '<div style="font-weight:700;color:var(--accent);font-family:var(--font-mono),monospace;">' + escapeHTML(o.num) + '</div>'
    + '</div>'
    + '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px;">'
    + '<div style="font-size:10px;color:var(--text3);margin-bottom:2px;">Store</div>'
    + '<div style="font-weight:600;">' + escapeHTML(store?.nom || '—') + '</div>'
    + '</div>'
    + '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px;">'
    + '<div style="font-size:10px;color:var(--text3);margin-bottom:2px;">Date</div>'
    + '<div style="font-size:12px;">' + dateStr + '</div>'
    + '</div>'
    + '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px;">'
    + '<div style="font-size:10px;color:var(--text3);margin-bottom:2px;">Client</div>'
    + '<div style="font-weight:600;">' + escapeHTML(o.clientNom || '—') + '</div>'
    + '<div style="font-size:11px;color:var(--text3);">' + escapeHTML(o.clientTel || '') + '</div>'
    + '</div>'
    + '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px;">'
    + '<div style="font-size:10px;color:var(--text3);margin-bottom:2px;">Ville</div>'
    + '<div style="font-size:13px;">' + escapeHTML(o.clientVille || '—') + '</div>'
    + '</div>'
    + '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px;">'
    + '<div style="font-size:10px;color:var(--text3);margin-bottom:2px;">Montant COD</div>'
    + '<div style="font-weight:800;color:var(--green);">' + fmt(o.montant || 0) + ' DH</div>'
    + '</div>'
    + '</div>'

    // Lignes produits
    + '<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Articles</div>'
    + '<div style="background:var(--surface2);border-radius:var(--radius-sm);overflow:hidden;">'
    + lines.map(l => {
        const prod = products.find(p => p.id === l.productId);
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid var(--border);">'
          + '<div>'
          + '<div style="font-size:13px;font-weight:600;">' + escapeHTML(l.nomExterne) + '</div>'
          + (prod
            ? '<div style="font-size:11px;color:var(--green);">→ ' + escapeHTML(prod.name) + (prod.code ? ' · ' + escapeHTML(prod.code) : '') + '</div>'
            : '<div style="font-size:11px;color:var(--red);">⚠️ Produit non mappé</div>')
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:10px;">'
          + '<span style="font-family:var(--font-mono),monospace;font-weight:700;">×' + l.qte + '</span>'
          + (l.prixUnitaire > 0 ? '<span style="font-size:12px;color:var(--text2);">' + fmt(l.prixUnitaire) + ' DH</span>' : '')
          + '</div>'
          + '</div>';
      }).join('')
    + '</div>'

    // Notes
    + (o.notes ? '<div style="margin-top:12px;padding:10px;background:var(--surface2);border-radius:var(--radius-sm);font-size:12px;color:var(--text2);">📝 ' + escapeHTML(o.notes) + '</div>' : '');

  openModal('modal-ecom-order-detail');
}

// ════════════════════════════════════════════════════════════════
// IMPORT CSV
// ════════════════════════════════════════════════════════════════
function openImportCSVModal() {
  const storeSelect = document.getElementById('csv-store-select');
  if (storeSelect) {
    storeSelect.innerHTML = '<option value="">— Sélectionner un store —</option>'
      + ecomStores.filter(s => s.actif !== false)
        .map(s => '<option value="' + s.id + '">' + escapeHTML(s.nom) + '</option>')
        .join('');
  }
  document.getElementById('csv-file-input').value = '';
  document.getElementById('csv-import-result').style.display = 'none';
  document.getElementById('csv-preview').innerHTML = '';
  openModal('modal-import-csv');
}

function previewCSV() {
  const file = document.getElementById('csv-file-input').files[0];
  if (!file) return;
  _readCSVFile(file, text => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    // Auto-détecter le séparateur pour l'aperçu
    const firstLine = lines[0] || '';
    const tabCount   = (firstLine.match(/\t/g) || []).length;
    const semicCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const sep = tabCount > semicCount && tabCount > commaCount ? '\t'
      : semicCount > commaCount ? ';' : ',';
    // Mettre à jour le select séparateur dans le modal
    const sepEl = document.getElementById('csv-separator');
    if (sepEl) sepEl.value = sep;
    console.log('[CSV Preview] Séparateur détecté:', JSON.stringify(sep));
    const preview = document.getElementById('csv-preview');
    if (!lines.length) { preview.innerHTML = '<p style="color:var(--red);">Fichier vide</p>'; return; }

    const headers = _parseCSVLine(lines[0], sep).map(h => h.trim());
    preview.innerHTML = '<div style="font-size:12px;color:var(--text3);margin-bottom:8px;">Aperçu — ' + Math.min(3, lines.length-1) + ' premières lignes :</div>'
      + '<div style="overflow-x:auto;">'
      + '<table style="width:100%;font-size:11px;border-collapse:collapse;">'
      + '<thead><tr>' + headers.map(h => '<th style="text-align:left;padding:4px 8px;background:var(--surface2);font-weight:600;">' + escapeHTML(h) + '</th>').join('') + '</tr></thead>'
      + '<tbody>'
      + lines.slice(1, 4).map(l => {
          const cols = _parseCSVLine(l, sep);
          return '<tr>' + cols.map(c => '<td style="padding:4px 8px;border-bottom:1px solid var(--border);">' + escapeHTML(c.slice(0, 40)) + '</td>').join('') + '</tr>';
        }).join('')
      + '</tbody></table></div>'
      + '<div style="margin-top:8px;font-size:11px;color:var(--text3);">'
      + (lines.length - 1) + ' ligne(s) au total</div>';

    _autoDetectColumns(headers);
  });
}

function _autoDetectColumns(headers) {
  // Correspondances : header CSV → input ID
  // Ordre de priorité : exact match d'abord, puis includes
  const map = {
    'ecom-col-num':         ['order reference', 'order ref', 'reference', 'order id', 'num', 'numero', 'commande', 'ref'],
    'ecom-col-client':      ['name', 'customer name', 'client', 'nom client', 'destinataire', 'customer'],
    'ecom-col-tel':         ['phone', 'telephone', 'mobile', 'gsm', 'tel'],
    'ecom-col-adresse':     ['address', 'adresse', 'delivery address', 'rue'],
    'ecom-col-ville':       ['city', 'ville', 'wilaya'],
    'ecom-col-montant':     ['cod amount', 'cod', 'montant', 'amount', 'prix', 'total'],
    'ecom-col-produits':    ['produits', 'product', 'article', 'sku', 'items'],
    'ecom-col-qte':         ['quantity', 'qty', 'qte', 'quantite'],
    'ecom-col-notes':       ['notes', 'note', 'remarque', 'commentaire'],
    'ecom-col-tracking':    ['tracking number', 'tracking', 'track', 'tracking_number', 'trackingnumber'],
    'ecom-col-statut-ext':  ['status', 'statut', 'etat', 'state'],
  };

  headers.forEach((h, i) => {
    const key = normalizeName(h);
    for (const [inputId, synonyms] of Object.entries(map)) {
      const el = document.getElementById(inputId);
      if (!el) continue;
      // Exact match d'abord
      if (synonyms.includes(key)) { el.value = i; break; }
      // Puis includes
      if (synonyms.some(s => key.includes(s) || s.includes(key) && key.length > 2)) {
        el.value = i; break;
      }
    }
  });

  console.log('[CSV autoDetect] headers:', headers);
  console.log('[CSV autoDetect] colonnes détectées:',
    Object.fromEntries(['num','client','tel','adresse','ville','montant','produits','qte','notes','tracking','statut-ext']
      .map(f => [f, document.getElementById('ecom-col-'+f)?.value])));
}

async function launchCSVImport() {
  const storeId = document.getElementById('csv-store-select').value;
  const file    = document.getElementById('csv-file-input').files[0];
  if (!storeId) { toast('Sélectionnez un store', 'error'); return; }
  if (!file)    { toast('Sélectionnez un fichier CSV', 'error'); return; }

  const colNum      = parseInt(document.getElementById('ecom-col-num').value);
  const colClient   = parseInt(document.getElementById('ecom-col-client').value);
  const colTel      = parseInt(document.getElementById('ecom-col-tel').value);
  const colAdresse  = parseInt(document.getElementById('ecom-col-adresse').value);
  const colVille    = parseInt(document.getElementById('ecom-col-ville').value);
  const colProduits = parseInt(document.getElementById('ecom-col-produits').value);
  const colMontant   = parseInt(document.getElementById('ecom-col-montant').value);
  const colQte       = parseInt(document.getElementById('ecom-col-qte')?.value ?? '7');
  const colNotes     = parseInt(document.getElementById('ecom-col-notes')?.value ?? '8');
  const colTracking  = parseInt(document.getElementById('ecom-col-tracking')?.value ?? '9');
  const colStatutExt = parseInt(document.getElementById('ecom-col-statut-ext')?.value ?? '10');

  console.log('[CSV Import] Colonnes:', { colNum, colClient, colTel, colAdresse, colVille, colMontant, colProduits, colQte, colNotes, colTracking });
  const separator   = document.getElementById('csv-separator').value || ',';
  const prodSep     = document.getElementById('csv-prod-separator').value || ';';
  const hasHeader   = document.getElementById('csv-has-header').checked;

  const tid = GP_TENANT?.id;
  const btn = document.getElementById('csv-import-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Importation...'; }

  async function processCSVText(text) {
    const rawLines  = text.split(/\r?\n/).filter(l => l.trim());
    const dataLines = hasHeader ? rawLines.slice(1) : rawLines;

    // ── Auto-détection du séparateur réel depuis la 1ère ligne ──────────
    // Ignorer le séparateur choisi dans le modal si le fichier utilise autre chose
    const firstLine = rawLines[0] || '';
    const tabCount   = (firstLine.match(/\t/g) || []).length;
    const semicCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    // Choisir le séparateur qui produit le plus de colonnes
    const detectedSep = tabCount > semicCount && tabCount > commaCount ? '\t'
      : semicCount > commaCount ? ';'
      : ',';
    if (detectedSep !== separator) {
      console.warn('[CSV Import] Séparateur auto-corrigé:', JSON.stringify(separator),
        '→', JSON.stringify(detectedSep),
        '(tab:', tabCount, 'semi:', semicCount, 'comma:', commaCount, ')');
    }
    const effectiveSep = detectedSep;

    // Vérifier que les colonnes détectées correspondent à la structure attendue
    if (hasHeader && rawLines[0]) {
      const headerCols = _parseCSVLine(rawLines[0], effectiveSep);
      console.log('[CSV Import] Headers détectés:', headerCols);
      console.log('[CSV Import] Séparateur:', JSON.stringify(effectiveSep), '→', headerCols.length, 'colonnes');
      // Re-détecter les colonnes automatiquement avec le bon séparateur
      _autoDetectColumns(headerCols);
      // Relire les valeurs après auto-détection
      Object.assign(window._csvCols = window._csvCols || {}, {
        num:      parseInt(document.getElementById('ecom-col-num')?.value) || 0,
        client:   parseInt(document.getElementById('ecom-col-client')?.value) || 1,
        tel:      parseInt(document.getElementById('ecom-col-tel')?.value) || 2,
        adresse:  parseInt(document.getElementById('ecom-col-adresse')?.value) || 3,
        ville:    parseInt(document.getElementById('ecom-col-ville')?.value) || 4,
        montant:  parseInt(document.getElementById('ecom-col-montant')?.value) || 5,
        produits: parseInt(document.getElementById('ecom-col-produits')?.value) || 6,
        qte:      parseInt(document.getElementById('ecom-col-qte')?.value ?? 7) || 7,
        notes:    parseInt(document.getElementById('ecom-col-notes')?.value ?? 8),
        tracking: parseInt(document.getElementById('ecom-col-tracking')?.value ?? 9),
      });
      console.log('[CSV Import] Colonnes finales:', window._csvCols);
    }

    let nbImportees = 0, nbDoublons = 0, nbErreurs = 0;

    // ── Étape 1 : Parser les lignes du CSV ──────────────────────
    const ordersToInsert = []; // { orderPayload, pendingLines[] }

    // Utiliser les colonnes et séparateur finaux (après auto-détection)
    const finalCols = window._csvCols || {
      num:0, client:1, tel:2, adresse:3, ville:4,
      montant:5, produits:6, qte:7, notes:8, tracking:9
    };
    const colNumF      = finalCols.num;
    const colClientF   = finalCols.client;
    const colTelF      = finalCols.tel;
    const colAdresseF  = finalCols.adresse;
    const colVilleF    = finalCols.ville;
    const colMontantF  = finalCols.montant;
    const colProduitsF = finalCols.produits;
    const colQteF      = finalCols.qte;
    const colNotesF    = finalCols.notes;
    const colTrackingF = finalCols.tracking;

    for (const rawLine of dataLines) {
      const cols        = _parseCSVLine(rawLine, effectiveSep);
      const num         = (cols[colNumF] || '').trim();
      if (!num) continue;
      const clientName  = (cols[colClientF] || '').trim();
      const produitsRaw = (cols[colProduitsF] || '').trim();

      // GUARD : si produitsStr = clientName → décalage de colonnes → stopper
      if (produitsRaw && normalizeName(produitsRaw) === normalizeName(clientName)) {
        console.error('[CSV Import] ⚠️ DÉCALAGE COLONNES DÉTECTÉ :',
          'produits=', JSON.stringify(produitsRaw), '= clientName=', JSON.stringify(clientName),
          '| cols=', cols.slice(0, 12));
      }

      console.log('[CSV Import] ligne:', num,
        '| client:', JSON.stringify(clientName),
        '| produit col', colProduitsF, ':', JSON.stringify(produitsRaw),
        '| tracking col', colTrackingF, ':', JSON.stringify(cols[colTrackingF]));

      // Vérifier doublon en state local
      if (ecomOrders.find(o => o.storeId === storeId && o.num === num)) {
        nbDoublons++;
        continue;
      }

      let hasMappingError = false;
      const pendingLines  = [];
      // produitsRaw déjà calculé dans le log ci-dessus
      const produitsStr = produitsRaw;
      const entries     = produitsStr ? produitsStr.split(prodSep) : [];

      for (const entry of entries) {
        // Support format "nom:qte" (inline) OU nom seul + colonne Quantity dédiée
        const parts       = entry.trim().split(':');
        const hasInlineQte = parts.length > 1 && /^\d+$/.test((parts[parts.length - 1] || '').trim());
        const nomExterne  = hasInlineQte ? parts.slice(0, -1).join(':').trim() : entry.trim();
        const qteFromCol  = (colQte >= 0 && cols[colQte]) ? parseInt(cols[colQte]) || 1 : 1;
        const qte         = hasInlineQte ? parseInt(parts[parts.length - 1]) || 1 : qteFromCol;

        if (!nomExterne) continue;

        const nomExterneClean = normalizeName(nomExterne);
        console.log('[CSV Import] produit brut:', JSON.stringify(nomExterne),
          '→ normalisé:', JSON.stringify(nomExterneClean), '| qte:', qte);

        const resolved = resolveMappingProduct(storeId, nomExterneClean);
        console.log('[CSV Import] mapping:', resolved.found
          ? '✅ productId=' + resolved.productId
          : '❌ non trouvé pour clé: ' + JSON.stringify(nomExterneClean));

        pendingLines.push({
          nom_externe:   nomExterneClean,
          product_id:    resolved.found ? resolved.productId : null,
          qte:           Math.max(1, qte),
          prix_unitaire: 0,
          statut:        'en_attente',
          mapping_auto:  resolved.auto,
          mapping_error: !resolved.found,
        });
        if (!resolved.found) hasMappingError = true;
      }

      // Payload order sans id — Supabase génère l'UUID
      ordersToInsert.push({
        orderPayload: {
          tenant_id:        tid,
          store_id:         storeId,
          num:              num,
          source:           'csv',
          client_nom:       clientName,
          client_tel:       (cols[colTelF]     || '').trim(),
          client_adresse:   (cols[colAdresseF] || '').trim(),
          client_ville:     (cols[colVilleF]   || '').trim(),
          montant:          parseFloat((cols[colMontantF] || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0,
          tracking:         colTrackingF >= 0 ? (cols[colTrackingF] || '').trim() || null : null,
          statut:           hasMappingError ? 'importe' : 'mapping_ok',
          has_mapping_error: hasMappingError,
          notes:            colNotesF >= 0 ? (cols[colNotesF] || '').trim() || null : null,
        },
        pendingLines,
      });
      console.log('[CSV Import] order prêt:', num,
        '| tracking:', orderPayload.tracking,
        '| produits:', pendingLines.map(l => l.nom_externe + ' x' + l.qte),
        '| mapping erreur:', hasMappingError);
      if (hasMappingError) nbErreurs++;
    }

    // ── Étape 2 : Insérer les orders et récupérer les UUIDs ─────
    if (ordersToInsert.length > 0) {
      try {
        const allInserted = [];

        for (let i = 0; i < ordersToInsert.length; i += 50) {
          const batch = ordersToInsert.slice(i, i + 50).map(x => x.orderPayload);
          const { data: inserted, error } = await sb.from('gp_ecom_orders')
            .insert(batch)
            .select('id, num, store_id, statut, has_mapping_error, client_nom, client_tel, client_adresse, client_ville, montant, notes, source, tracking');
          if (error) {
            console.error('[CSV Import] orders insert error:', error);
            throw error;
          }
          allInserted.push(...(inserted || []));
        }

        // ── Étape 3 : Insérer les lignes avec les vrais UUIDs ───
        const allLines = [];
        for (const item of ordersToInsert) {
          const ins = allInserted.find(x => x.num === item.orderPayload.num);
          if (!ins) continue;
          for (const l of item.pendingLines) {
            allLines.push({ order_id: ins.id, ...l });
          }
        }

        for (let i = 0; i < allLines.length; i += 100) {
          const batch = allLines.slice(i, i + 100);
          const { error } = await sb.from('gp_ecom_order_lines').insert(batch);
          if (error) {
            console.error('[CSV Import] lines insert error:', error);
            throw error;
          }
        }

        // ── Étape 4 : Mettre à jour le state local ────────────────
        allInserted.forEach(ins => {
          ecomOrders.push({
            id: ins.id, storeId: ins.store_id, num: ins.num,
            source: ins.source || 'csv',
            clientNom: ins.client_nom, clientTel: ins.client_tel,
            clientAdresse: ins.client_adresse, clientVille: ins.client_ville,
            montant: ins.montant, statut: ins.statut,
            hasMappingError: ins.has_mapping_error, notes: ins.notes,
            tracking: ins.tracking || null,
            createdAt: new Date().toISOString(),
          });
          const item = ordersToInsert.find(x => x.orderPayload.num === ins.num);
          if (item) {
            item.pendingLines.forEach(l => {
              ecomOrderLines.push({
                id: null, orderId: ins.id, nomExterne: l.nom_externe,
                productId: l.product_id, qte: l.qte, prixUnitaire: l.prix_unitaire,
                statut: l.statut, mappingAuto: l.mapping_auto, mappingError: l.mapping_error,
              });
            });
          }
        });

        nbImportees = allInserted.length;
      } catch (err) {
        toast('Erreur insertion: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '📥 Lancer l\'import'; }
        return;
      }
    }

    // ── Étape 5 : Afficher le rapport ────────────────────────────
    const resultEl = document.getElementById('csv-import-result');
    resultEl.style.display = '';
    resultEl.innerHTML =
      '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:14px;">'
      + '<div style="font-weight:700;margin-bottom:10px;font-size:13px;">📊 Rapport d\'import</div>'
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;">'
      + '<div style="text-align:center;background:var(--surface);border-radius:var(--radius-sm);padding:10px;">'
      + '<div style="font-size:22px;font-weight:800;color:var(--green);">' + nbImportees + '</div>'
      + '<div style="font-size:10.5px;color:var(--text3);">Importées</div></div>'
      + '<div style="text-align:center;background:var(--surface);border-radius:var(--radius-sm);padding:10px;">'
      + '<div style="font-size:22px;font-weight:800;color:var(--gold);">' + nbDoublons + '</div>'
      + '<div style="font-size:10.5px;color:var(--text3);">Doublons ignorés</div></div>'
      + '<div style="text-align:center;background:var(--surface);border-radius:var(--radius-sm);padding:10px;">'
      + '<div style="font-size:22px;font-weight:800;color:' + (nbErreurs > 0 ? 'var(--red)' : 'var(--text3)') + ';">' + nbErreurs + '</div>'
      + '<div style="font-size:10.5px;color:var(--text3);">Mapping manquant</div></div>'
      + '</div>'
      + (nbErreurs > 0
        ? '<div style="font-size:12px;color:var(--red);padding:8px 10px;background:rgba(220,38,38,0.06);border-radius:var(--radius-sm);">⚠️ '
          + nbErreurs + ' commande(s) avec produits non mappés — allez dans <strong>Stores → Mapping</strong> pour corriger.</div>'
        : '<div style="font-size:12px;color:var(--green);">✅ Tous les produits ont été mappés automatiquement.</div>')
      + '</div>';

    if (btn) { btn.disabled = false; btn.textContent = '📥 Lancer l\'import'; }
    // Rafraîchir l'UI — forcer la navigation vers la page ecom
    renderStores();

    if (nbImportees > 0) {
      // Fermer le modal
      closeModal('modal-import-csv');
      // Naviguer vers la page commandes pour que l'user voie immédiatement
      setTimeout(() => {
        navigate('ecom');       // active la page + appelle renderEcom via router
      }, 200);
      toast('✅ ' + nbImportees + ' commande(s) importée(s) !', 'success');
    } else {
      renderEcom(true);         // juste rafraîchir sans naviguer
      toast('ℹ️ Import terminé — ' + nbImportees + ' importée(s)', 'warn');
    }
  }
  _readCSVFile(file, processCSVText);
}



// ════════════════════════════════════════════════════════════════
// LECTURE FICHIER CSV — gestion encodage UTF-8 / UTF-8 BOM / Windows-1256
// ════════════════════════════════════════════════════════════════
function _readCSVFile(file, callback) {
  const encodingSel = document.getElementById('csv-encoding');
  const forcedEnc   = encodingSel ? encodingSel.value : 'auto';

  function _strip(text) {
    // Supprimer BOM UTF-8 (\uFEFF) — Excel Windows en ajoute souvent
    return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  }

  if (forcedEnc !== 'auto') {
    // Encodage choisi manuellement par l'utilisateur
    const r = new FileReader();
    r.onload = e => {
      console.info('[CSV] Encodage forcé :', forcedEnc);
      callback(_strip(e.target.result));
    };
    r.onerror = () => toast('Erreur de lecture du fichier', 'error');
    r.readAsText(file, forcedEnc);
    return;
  }

  // Mode auto : lire en UTF-8, détecter mojibake, retenter en windows-1256
  const r1 = new FileReader();
  r1.onload = e => {
    const text = _strip(e.target.result);

    // Mojibake = caractères de remplacement Unicode ou séquences ANSI invalides
    const hasMojibake = text.includes('\uFFFD');

    if (hasMojibake) {
      // Retenter en Windows-1256 (arabe Excel Windows)
      const r2 = new FileReader();
      r2.onload = e2 => {
        console.info('[CSV] Encodage auto-détecté : windows-1256');
        callback(_strip(e2.target.result));
      };
      r2.onerror = () => {
        console.warn('[CSV] Échec windows-1256, retour UTF-8');
        callback(text);
      };
      r2.readAsText(file, 'windows-1256');
    } else {
      console.info('[CSV] Encodage : UTF-8');
      callback(text);
    }
  };
  r1.onerror = () => toast('Erreur de lecture du fichier', 'error');
  r1.readAsText(file, 'UTF-8');
}

function _parseCSVLine(line, sep = ',') {
  // Supprimer le \r final (fichiers Windows CRLF)
  if (line.endsWith('\r')) line = line.slice(0, -1);

  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      // Guillemets doublés "" dans une chaîne entre guillemets = guillemet littéral
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === sep && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

// ════════════════════════════════════════════════════════════════
// ACTIONS
// ════════════════════════════════════════════════════════════════
async function deleteOrder(id) {
  if (!confirm('Supprimer cette commande ?')) return;
  try {
    await sb.from('gp_ecom_order_lines').delete().eq('order_id', id);
    const { error } = await sb.from('gp_ecom_orders').delete().eq('id', id).eq('tenant_id', GP_TENANT?.id);
    if (error) { toast('Erreur: ' + error.message, 'error'); return; }
    ecomOrders      = ecomOrders.filter(o => o.id !== id);
    ecomOrderLines  = ecomOrderLines.filter(l => l.orderId !== id);
    renderEcom();
    toast('Commande supprimée', 'warn');
  } catch (e) {
    toast('Erreur: ' + e.message, 'error');
  }
}
