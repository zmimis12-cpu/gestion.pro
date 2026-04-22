/* ================================================================
   GestionPro — modules/scan_ecom.js   (Phase 3 — Étape 2)
   Scanner E-commerce optimisé code-barres USB/Bluetooth
   Logique : tracking → commande → mapping → déduction stock
             Priorité : retour shop d'abord, stock normal en complément
================================================================ */

// ── État global du scanner ──────────────────────────────────────
let _scanMode = 'sortie';      // 'sortie' | 'retour'
let _scanning = false;          // empêche les doubles scans simultanés
let _sessionStats = { total: 0, sortie: 0, retour: 0, erreur: 0 };
let _currentScanConfirm  = null;
let _pendingMappingCallback = null;
let _pendingMappingLines  = null;
let _pendingMappingOrder  = null;

// ════════════════════════════════════════════════════════════════
// INIT — appelé par renderScanEcom() au navigate()
// ════════════════════════════════════════════════════════════════
function renderScanEcom() {
  // Réinitialiser les stats visuelles
  _updateStats();
  renderScanHistory();
  // Appliquer le mode courant visuellement
  setScanMode(_scanMode);
  // Focus immédiat sur le champ
  setTimeout(() => document.getElementById('scan-tracking-input')?.focus(), 100);
}

// ════════════════════════════════════════════════════════════════
// MODE — Sortie / Retour
// ════════════════════════════════════════════════════════════════
function setScanMode(mode) {
  _scanMode = mode;

  const btnS = document.getElementById('scan-btn-sortie');
  const btnR = document.getElementById('scan-btn-retour');
  const status = document.getElementById('scan-mode-status');
  const input  = document.getElementById('scan-tracking-input');

  if (btnS) {
    btnS.style.background   = mode === 'sortie' ? 'var(--green)'   : 'var(--surface2)';
    btnS.style.color        = mode === 'sortie' ? '#fff'            : 'var(--text2)';
    btnS.style.borderColor  = mode === 'sortie' ? 'var(--green)'   : 'var(--border2)';
  }
  if (btnR) {
    btnR.style.background   = mode === 'retour' ? 'var(--gold)'    : 'var(--surface2)';
    btnR.style.color        = mode === 'retour' ? '#fff'            : 'var(--text2)';
    btnR.style.borderColor  = mode === 'retour' ? 'var(--gold)'    : 'var(--border2)';
  }
  if (status) {
    status.textContent = mode === 'sortie'
      ? '📤 Mode SORTIE actif — scannez un code-barres'
      : '↩️ Mode RETOUR actif — scannez un code-barres de retour';
    status.style.color = mode === 'sortie' ? 'var(--green)' : 'var(--gold)';
  }
  if (input) {
    input.placeholder = mode === 'sortie'
      ? '📡 Scanner le code-barres de sortie...'
      : '📡 Scanner le code-barres de retour...';
    input.focus();
  }

  clearScanResult();
}

// ════════════════════════════════════════════════════════════════
// KEYDOWN — Déclenché par code-barres (Enter automatique)
// ════════════════════════════════════════════════════════════════
function onScanKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    processScan();
  }
}

// ════════════════════════════════════════════════════════════════
// POINT D'ENTRÉE PRINCIPAL
// ════════════════════════════════════════════════════════════════
async function processScan() {
  if (_scanning) return; // anti-doublon

  const input    = document.getElementById('scan-tracking-input');
  const tracking = (input?.value || '').trim().replace(/\r?\n/g, '');

  if (!tracking) return;

  // Vider immédiatement + focus → prêt pour le prochain scan
  input.value = '';
  input.focus();

  _scanning = true;
  _showSpinner(true);

  try {
    if (_scanMode === 'sortie') {
      await _processScanSortie(tracking);
    } else {
      await _processScanRetour(tracking);
    }
  } finally {
    _scanning = false;
    _showSpinner(false);
  }
}

function _showSpinner(show) {
  const s = document.getElementById('scan-spinner');
  if (s) s.style.display = show ? 'block' : 'none';
}

// ════════════════════════════════════════════════════════════════
// SCAN SORTIE
// ════════════════════════════════════════════════════════════════
async function _processScanSortie(tracking) {
  // 1. Trouver la commande par tracking OU numéro de commande
  const order = ecomOrders.find(o =>
    o.tracking === tracking ||
    o.num === tracking ||
    (o.tracking || '').toLowerCase() === tracking.toLowerCase()
  );

  if (!order) {
    _sessionStats.erreur++;
    _updateStats();
    showScanError(tracking, '❌ Commande introuvable pour ce tracking');
    await _logScan({ tracking, action: 'not_found', note: 'Tracking non trouvé' });
    _beep('error');
    return;
  }

  // 2. Déjà sorti ?
  if (order.scanStatut === 'sorti') {
    _sessionStats.erreur++;
    _updateStats();
    showScanWarning(tracking, order, '⚠️ Cette commande a déjà été scannée en sortie');
    await _logScan({ tracking, action: 'already_done', orderId: order.id, storeId: order.storeId });
    _beep('warn');
    return;
  }

  // 3. Lignes de commande
  const lines = ecomOrderLines.filter(l => l.orderId === order.id);
  if (!lines.length) {
    showScanError(tracking, '❌ Aucune ligne produit pour cette commande');
    _sessionStats.erreur++; _updateStats();
    return;
  }

  // 4. Mapping manquant → modal inline
  const unmapped = lines.filter(l => !l.productId || l.mappingError);
  if (unmapped.length > 0) {
    showMappingModal(order, unmapped, () => _processScanSortie(tracking));
    return;
  }

  // 5. Calculer les déductions
  const deductions = _calculateDeductions(order.storeId, lines);

  // 6. Afficher résumé + bouton confirmer
  showScanConfirm(tracking, order, lines, deductions, async () => {
    await _executeSortie(tracking, order, lines, deductions);
  });
}

// ════════════════════════════════════════════════════════════════
// CALCUL DÉDUCTIONS — Règle prioritaire
// ════════════════════════════════════════════════════════════════
function _calculateDeductions(storeId, lines) {
  return lines.map(line => {
    const productId   = line.productId;
    const qteNeeded   = line.qte;
    const product     = products.find(p => p.id === productId);
    const shopReturn  = shopReturns.find(r => r.storeId === storeId && r.productId === productId);

    const qteRetour   = shopReturn?.qte || 0;
    const stockNormal = product?.stock   || 0;

    let qteFromReturn = 0, qteFromStock = 0, source = 'stock_normal';

    if (qteRetour >= qteNeeded) {
      qteFromReturn = qteNeeded; qteFromStock = 0;       source = 'shop_return';
    } else if (qteRetour > 0) {
      qteFromReturn = qteRetour; qteFromStock = qteNeeded - qteRetour; source = 'mixte';
    } else {
      qteFromReturn = 0;         qteFromStock = qteNeeded;             source = 'stock_normal';
    }

    return {
      lineId: line.id, productId,
      nomExterne:  line.nomExterne,
      productName: product?.name || line.nomExterne,
      qte: qteNeeded, qteFromReturn, qteFromStock, source,
      stockAvant:  stockNormal, returnAvant: qteRetour,
      stockInsuffisant: qteFromStock > stockNormal,
    };
  });
}

// ════════════════════════════════════════════════════════════════
// EXÉCUTER SORTIE
// ════════════════════════════════════════════════════════════════
async function _executeSortie(tracking, order, lines, deductions) {
  const tid = GP_TENANT?.id;
  try {
    for (const d of deductions) {
      const product    = products.find(p => p.id === d.productId);
      const shopReturn = shopReturns.find(r => r.storeId === order.storeId && r.productId === d.productId);

      // A. Déduire du stock retour shop (RPC atomique)
      if (d.qteFromReturn > 0) {
        const { data: newQte, error } = await sb.rpc('gp_upsert_shop_return', {
          p_tenant_id: tid, p_store_id: order.storeId,
          p_product_id: d.productId, p_delta: -d.qteFromReturn,
        });
        if (!error && shopReturn) shopReturn.qte = newQte ?? Math.max(0, (shopReturn.qte||0) - d.qteFromReturn);
      }

      // B. Déduire du stock normal (RPC atomique)
      if (d.qteFromStock > 0) {
        const { data: newStock, error } = await sb.rpc('gp_deduct_product_stock', {
          p_product_id: d.productId, p_qte: d.qteFromStock,
        });
        if (!error && product) product.stock = newStock ?? Math.max(0, (product.stock||0) - d.qteFromStock);
      }

      // C. Mettre à jour la ligne commande
      await sb.from('gp_ecom_order_lines').update({
        statut: 'sorti', deduction_source: d.source,
        qte_from_return: d.qteFromReturn, qte_from_stock: d.qteFromStock,
      }).eq('id', d.lineId);

      // D. Logger
      await _logScan({
        tracking, action: 'sortie', orderId: order.id, storeId: order.storeId,
        productId: d.productId, nomExterne: d.nomExterne,
        qte: d.qte, qteFromReturn: d.qteFromReturn, qteFromStock: d.qteFromStock,
        stockAvant: d.stockAvant, stockApres: (d.stockAvant||0) - d.qteFromStock,
        returnAvant: d.returnAvant, returnApres: (d.returnAvant||0) - d.qteFromReturn,
      });
    }

    // E. Marquer commande comme sortie
    const now = new Date().toISOString();
    await sb.from('gp_ecom_orders').update({
      scan_statut: 'sorti', scanned_at: now,
      scanned_by: GP_USER?.id || null, statut: 'prepare',
    }).eq('id', order.id);

    const localOrder = ecomOrders.find(o => o.id === order.id);
    if (localOrder) { localOrder.scanStatut = 'sorti'; localOrder.scannedAt = now; localOrder.statut = 'prepare'; }

    _sessionStats.sortie++; _sessionStats.total++;
    _updateStats();
    showScanSuccess(tracking, order, deductions);
    renderScanHistory();
    _beep('success');

  } catch (e) {
    console.error('[ScanSortie]', e);
    showScanError(tracking, '💥 Erreur : ' + e.message);
    _sessionStats.erreur++; _updateStats();
  }
}

// ════════════════════════════════════════════════════════════════
// SCAN RETOUR
// ════════════════════════════════════════════════════════════════
async function _processScanRetour(tracking) {
  const order = ecomOrders.find(o =>
    o.tracking === tracking ||
    o.num === tracking ||
    (o.tracking || '').toLowerCase() === tracking.toLowerCase()
  );

  if (!order) {
    _sessionStats.erreur++; _updateStats();
    showScanError(tracking, '❌ Commande introuvable pour ce tracking');
    await _logScan({ tracking, action: 'not_found', note: 'Retour : tracking non trouvé' });
    _beep('error');
    return;
  }

  const lines = ecomOrderLines.filter(l => l.orderId === order.id && l.productId);
  if (!lines.length) {
    showScanError(tracking, '❌ Aucun produit mappé pour cette commande');
    _sessionStats.erreur++; _updateStats();
    return;
  }

  const tid = GP_TENANT?.id;
  try {
    for (const line of lines) {
      const shopReturn = shopReturns.find(r => r.storeId === order.storeId && r.productId === line.productId);
      const returnAvant = shopReturn?.qte || 0;

      const { data: newQte, error } = await sb.rpc('gp_upsert_shop_return', {
        p_tenant_id: tid, p_store_id: order.storeId,
        p_product_id: line.productId, p_delta: line.qte,
      });

      if (!error) {
        if (shopReturn) {
          shopReturn.qte = newQte ?? (returnAvant + line.qte);
        } else {
          shopReturns.push({ id: null, tenantId: tid, storeId: order.storeId,
            productId: line.productId, qte: newQte ?? line.qte });
        }
      }

      await _logScan({
        tracking, action: 'retour', orderId: order.id, storeId: order.storeId,
        productId: line.productId, nomExterne: line.nomExterne, qte: line.qte,
        returnAvant, returnApres: newQte ?? (returnAvant + line.qte),
      });
    }

    await sb.from('gp_ecom_orders').update({
      scan_statut: 'retour', scanned_at: new Date().toISOString(),
    }).eq('id', order.id);

    const localOrder = ecomOrders.find(o => o.id === order.id);
    if (localOrder) localOrder.scanStatut = 'retour';

    _sessionStats.retour++; _sessionStats.total++;
    _updateStats();
    showScanRetourSuccess(tracking, order, lines);
    renderScanHistory();
    _beep('success');

  } catch (e) {
    console.error('[ScanRetour]', e);
    showScanError(tracking, '💥 Erreur retour : ' + e.message);
    _sessionStats.erreur++; _updateStats();
  }
}

// ════════════════════════════════════════════════════════════════
// UI — Résultats scan
// ════════════════════════════════════════════════════════════════
function clearScanResult() {
  const el = document.getElementById('scan-result-area');
  if (el) el.innerHTML = '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:20px;text-align:center;color:var(--text3);font-size:13px;">📡 En attente d\'un scan...</div>';
}

function showScanError(tracking, msg) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  el.innerHTML =
    '<div style="background:rgba(220,38,38,0.08);border:2px solid rgba(220,38,38,0.3);border-radius:var(--radius-sm);padding:16px;">'
    + '<div style="font-size:16px;font-weight:800;color:var(--red);margin-bottom:6px;">' + escapeHTML(msg) + '</div>'
    + '<div style="font-family:var(--font-mono),monospace;font-size:12px;color:var(--text3);">' + escapeHTML(tracking) + '</div>'
    + '</div>';
}

function showScanWarning(tracking, order, msg) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  const store = ecomStores.find(s => s.id === order.storeId);
  el.innerHTML =
    '<div style="background:rgba(245,158,11,0.08);border:2px solid rgba(245,158,11,0.3);border-radius:var(--radius-sm);padding:16px;">'
    + '<div style="font-size:15px;font-weight:800;color:var(--gold);margin-bottom:8px;">' + escapeHTML(msg) + '</div>'
    + '<div style="font-size:13px;font-weight:600;">' + escapeHTML(order.clientNom) + ' — ' + escapeHTML(order.clientVille) + '</div>'
    + '<div style="font-size:12px;color:var(--text3);margin-top:2px;">' + escapeHTML(store?.nom || '—') + ' · ' + escapeHTML(order.num) + '</div>'
    + '</div>';
}

function showScanConfirm(tracking, order, lines, deductions, onConfirm) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  const store = ecomStores.find(s => s.id === order.storeId);

  const linesHTML = deductions.map(d => {
    const srcIcon = d.source === 'shop_return' ? '↩️' : d.source === 'mixte' ? '⚡' : '📦';
    const srcColor = d.source === 'shop_return' ? 'var(--green)' : d.source === 'mixte' ? 'var(--gold)' : 'var(--accent)';
    const alert = d.stockInsuffisant
      ? '<div style="font-size:10.5px;color:var(--red);margin-top:2px;">⚠️ Stock insuffisant (' + d.stockAvant + ' dispo)</div>' : '';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">'
      + '<div><div style="font-size:13px;font-weight:600;">' + escapeHTML(d.productName) + '</div>'
      + '<div style="font-size:11px;color:var(--text3);">' + escapeHTML(d.nomExterne) + '</div>' + alert + '</div>'
      + '<div style="text-align:right;">'
      + '<div style="font-weight:800;font-size:15px;">×' + d.qte + '</div>'
      + '<div style="font-size:11px;color:' + srcColor + ';">' + srcIcon + ' '
      + (d.qteFromReturn > 0 ? d.qteFromReturn + ' retour' : '')
      + (d.qteFromReturn > 0 && d.qteFromStock > 0 ? ' + ' : '')
      + (d.qteFromStock > 0 ? d.qteFromStock + ' stock' : '')
      + '</div></div></div>';
  }).join('');

  el.innerHTML =
    '<div style="background:var(--surface);border:2px solid var(--accent);border-radius:var(--radius-sm);overflow:hidden;">'
    + '<div style="background:var(--accent-light);padding:10px 14px;border-bottom:1px solid var(--border);">'
    + '<div style="font-size:14px;font-weight:800;color:var(--accent);">📦 ' + escapeHTML(tracking) + '</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-top:2px;">'
    + escapeHTML(store?.nom || '—') + ' · ' + escapeHTML(order.clientNom) + ' · ' + escapeHTML(order.clientVille)
    + '</div></div>'
    + '<div style="padding:0 14px;">' + linesHTML + '</div>'
    + '<div style="padding:12px 14px;">'
    + '<button class="btn btn-primary" style="width:100%;justify-content:center;font-size:15px;padding:12px;" onclick="_confirmScan()">✅ Confirmer la sortie</button>'
    + '</div></div>';

  _currentScanConfirm = onConfirm;
  // Focus sur le bouton confirmer pour valider aussi par Enter
  setTimeout(() => el.querySelector('button')?.focus(), 50);
}

function _confirmScan() {
  if (_currentScanConfirm) {
    _currentScanConfirm();
    _currentScanConfirm = null;
  }
}

function showScanSuccess(tracking, order, deductions) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  const store = ecomStores.find(s => s.id === order.storeId);
  el.innerHTML =
    '<div style="background:rgba(5,150,105,0.08);border:2px solid rgba(5,150,105,0.3);border-radius:var(--radius-sm);padding:14px;">'
    + '<div style="font-size:18px;font-weight:800;color:var(--green);margin-bottom:6px;">✅ SORTIE OK</div>'
    + '<div style="font-size:13px;font-weight:700;">' + escapeHTML(order.clientNom) + ' — ' + escapeHTML(order.clientVille) + '</div>'
    + '<div style="font-size:12px;color:var(--text3);">' + escapeHTML(store?.nom || '—') + ' · ' + escapeHTML(order.num) + '</div>'
    + '<div style="margin-top:8px;font-size:12px;">'
    + deductions.map(d =>
        '<div>• ' + escapeHTML(d.productName) + ' ×' + d.qte
        + (d.qteFromReturn > 0 ? ' <span style="color:var(--green);">↩️' + d.qteFromReturn + '</span>' : '')
        + (d.qteFromStock > 0  ? ' <span style="color:var(--accent);">📦' + d.qteFromStock + '</span>' : '')
        + '</div>'
      ).join('')
    + '</div></div>';
}

function showScanRetourSuccess(tracking, order, lines) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  const store = ecomStores.find(s => s.id === order.storeId);
  el.innerHTML =
    '<div style="background:rgba(245,158,11,0.08);border:2px solid rgba(245,158,11,0.3);border-radius:var(--radius-sm);padding:14px;">'
    + '<div style="font-size:18px;font-weight:800;color:var(--gold);margin-bottom:6px;">↩️ RETOUR OK</div>'
    + '<div style="font-size:13px;font-weight:700;">' + escapeHTML(order.clientNom) + '</div>'
    + '<div style="font-size:12px;color:var(--text3);">' + escapeHTML(store?.nom || '—') + ' · ' + escapeHTML(order.num) + '</div>'
    + '<div style="margin-top:8px;font-size:12px;">'
    + lines.map(l => {
        const prod = products.find(p => p.id === l.productId);
        const sr   = shopReturns.find(r => r.storeId === order.storeId && r.productId === l.productId);
        return '<div>• ' + escapeHTML(prod?.name || l.nomExterne) + ' ×' + l.qte
          + ' → <strong>stock retour : ' + (sr?.qte || 0) + '</strong></div>';
      }).join('')
    + '</div></div>';
}

// ════════════════════════════════════════════════════════════════
// MAPPING INLINE — si produit non mappé au moment du scan
// ════════════════════════════════════════════════════════════════
function showMappingModal(order, unmappedLines, onComplete) {
  const store = ecomStores.find(s => s.id === order.storeId);
  const el    = document.getElementById('scan-result-area');
  if (!el) return;

  const linesHTML = unmappedLines.map((l, i) =>
    '<div style="margin-bottom:10px;">'
    + '<label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">Produit externe : <span style="color:var(--accent);">' + escapeHTML(l.nomExterne) + '</span></label>'
    + '<select class="input" id="scan-map-prod-' + i + '">'
    + '<option value="">— Sélectionner un produit interne —</option>'
    + [...products].sort((a,b) => a.name.localeCompare(b.name))
        .map(p => '<option value="' + p.id + '">' + escapeHTML(p.name) + (p.code ? ' · ' + p.code : '') + '</option>')
        .join('')
    + '</select></div>'
  ).join('');

  el.innerHTML =
    '<div style="background:rgba(245,158,11,0.08);border:2px solid rgba(245,158,11,0.3);border-radius:var(--radius-sm);padding:16px;">'
    + '<div style="font-size:14px;font-weight:800;color:var(--gold);margin-bottom:4px;">🔗 Mapping requis</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-bottom:12px;">Shop : ' + escapeHTML(store?.nom || '') + ' — associez les produits pour continuer</div>'
    + linesHTML
    + '<button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="_saveScanMappings()">✅ Enregistrer et continuer</button>'
    + '</div>';

  _pendingMappingCallback = onComplete;
  _pendingMappingLines    = unmappedLines;
  _pendingMappingOrder    = order;
}

async function _saveScanMappings() {
  const order = _pendingMappingOrder;
  const lines = _pendingMappingLines;
  const tid   = GP_TENANT?.id;

  for (let i = 0; i < lines.length; i++) {
    const productId = document.getElementById('scan-map-prod-' + i)?.value;
    if (!productId) { toast('Sélectionnez un produit pour chaque ligne', 'error'); return; }

    const nomExterne   = lines[i].nomExterne;
    const nomNormalise = normalizeName(nomExterne);
    console.log('[scanMapping]', JSON.stringify(nomExterne), '→', JSON.stringify(nomNormalise));

    // Insérer le mapping
    const { data: ins, error } = await sb.from('gp_store_mapping').insert({
      tenant_id: tid, store_id: order.storeId, product_id: productId,
      nom_externe: nomExterne, nom_normalise: nomNormalise,
      created_by: GP_USER?.id || null,
    }).select('id').single();

    if (!error || error.code === '23505') { // 23505 = duplicate → déjà mappé
      ecomMappings.push({ id: ins?.id || null, storeId: order.storeId,
        productId, nomExterne, nomNormalise });
    }

    // Mettre à jour la ligne en DB
    await sb.from('gp_ecom_order_lines').update({
      product_id: productId, mapping_auto: false, mapping_error: false,
    }).eq('id', lines[i].id);

    const localLine = ecomOrderLines.find(l => l.id === lines[i].id);
    if (localLine) { localLine.productId = productId; localLine.mappingError = false; }
  }

  toast('✅ Mappings sauvegardés', 'success');
  if (_pendingMappingCallback) _pendingMappingCallback();
}

// ════════════════════════════════════════════════════════════════
// HISTORIQUE SESSION
// ════════════════════════════════════════════════════════════════
function renderScanHistory() {
  const el = document.getElementById('scan-history-list');
  if (!el) return;

  const recent = [...scanLogs].slice(0, 30);
  if (!recent.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:12px;">Aucun scan cette session</div>';
    return;
  }

  const actionIcon  = { sortie:'📤', retour:'↩️', not_found:'❌', already_done:'⚠️', error:'💥', mapping_missing:'🔗' };
  const actionColor = { sortie:'var(--green)', retour:'var(--gold)', not_found:'var(--red)', already_done:'var(--gold)', error:'var(--red)' };

  el.innerHTML = recent.map(l => {
    const store   = ecomStores.find(s => s.id === l.storeId);
    const product = products.find(p => p.id === l.productId);
    const time    = new Date(l.scannedAt).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const src     = l.action === 'sortie'
      ? (l.qteFromReturn > 0 && l.qteFromStock > 0 ? '⚡'
        : l.qteFromReturn > 0 ? '↩️' : '📦') : '';

    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11.5px;">'
      + '<span style="color:var(--text3);font-size:10px;white-space:nowrap;min-width:52px;">' + time + '</span>'
      + '<span style="font-size:13px;color:' + (actionColor[l.action]||'var(--text)') + ';">' + (actionIcon[l.action]||'?') + '</span>'
      + '<span style="font-family:var(--font-mono),monospace;font-size:10.5px;color:var(--accent);flex-shrink:0;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHTML(l.tracking||'—') + '</span>'
      + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;">' + escapeHTML(product?.name || l.nomExterne || '—') + (l.qte > 1 ? ' ×'+l.qte : '') + '</span>'
      + (src ? '<span style="font-size:11px;color:var(--text3);">' + src + '</span>' : '')
      + '</div>';
  }).join('');
}

// ════════════════════════════════════════════════════════════════
// STATS SESSION
// ════════════════════════════════════════════════════════════════
function _updateStats() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('stat-total',  _sessionStats.total);
  set('stat-sortie', _sessionStats.sortie);
  set('stat-retour', _sessionStats.retour);
  set('stat-erreur', _sessionStats.erreur);
}

// ════════════════════════════════════════════════════════════════
// BIPS — Feedback sonore (Web Audio API — pas de fichier externe)
// ════════════════════════════════════════════════════════════════
function _beep(type) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);

    if (type === 'success') {
      osc.frequency.value = 880; gain.gain.value = 0.15;
      osc.start(); osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'warn') {
      osc.frequency.value = 440; gain.gain.value = 0.1;
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    } else {
      osc.frequency.value = 220; gain.gain.value = 0.1;
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    }
  } catch(e) { /* Web Audio non dispo — silencieux */ }
}

// ════════════════════════════════════════════════════════════════
// PAGE RETOURS SHOP
// ════════════════════════════════════════════════════════════════
function renderShopReturns() {
  const tbody  = document.getElementById('shop-returns-table');
  if (!tbody) return;
  const storeF = document.getElementById('shop-returns-filter-store')?.value || 'all';

  let list = shopReturns.filter(r => r.qte > 0);
  if (storeF !== 'all') list = list.filter(r => r.storeId === storeF);

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><div class="emoji">↩️</div><p>Aucun stock retour disponible</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = list
    .sort((a,b) => b.qte - a.qte)
    .map(r => {
      const store   = ecomStores.find(s => s.id === r.storeId);
      const product = products.find(p => p.id === r.productId);
      return '<tr>'
        + '<td style="font-size:13px;font-weight:600;">' + escapeHTML(store?.nom || '—') + '</td>'
        + '<td style="font-size:13px;">' + escapeHTML(product?.name || r.productId) + '</td>'
        + '<td><span style="font-size:18px;font-weight:800;color:var(--green);">' + r.qte + '</span>'
        + ' <span style="font-size:11px;color:var(--text3);">' + escapeHTML(product?.unit || 'unités') + '</span></td>'
        + '<td style="font-size:11px;color:var(--text3);">'
        + (r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('fr-FR') : '—') + '</td>'
        + '</tr>';
    }).join('');
}

// ════════════════════════════════════════════════════════════════
// LOGGER
// ════════════════════════════════════════════════════════════════
async function _logScan(data) {
  const tid = GP_TENANT?.id;
  const log = {
    tenant_id: tid, store_id: data.storeId||null, order_id: data.orderId||null,
    tracking: data.tracking, action: data.action,
    product_id: data.productId||null, nom_externe: data.nomExterne||null,
    qte: data.qte||1, qte_from_return: data.qteFromReturn||0,
    qte_from_stock: data.qteFromStock||0,
    stock_avant: data.stockAvant??null, stock_apres: data.stockApres??null,
    return_avant: data.returnAvant??null, return_apres: data.returnApres??null,
    note: data.note||null, scanned_by: GP_USER?.id||null,
  };
  try {
    const { data: ins } = await sb.from('gp_scan_logs').insert(log).select('id').single();
    scanLogs.unshift({ ...log, id: ins?.id, scannedAt: new Date().toISOString() });
    if (scanLogs.length > 100) scanLogs.pop();
  } catch(e) { console.warn('[ScanLog]', e.message); }
}
