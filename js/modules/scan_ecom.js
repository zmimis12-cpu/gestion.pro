/* ================================================================
   GestionPro — modules/scan_ecom.js
   Phase 3 : Scanner E-commerce
   Logique : Scan tracking → Sortie (stock retour shop d'abord)
                           → Retour (incrément stock retour shop)
================================================================ */

// ── État du scanner ─────────────────────────────────────────────
let _scanMode          = 'sortie';  // 'sortie' | 'retour'
let _lastScanResult    = null;      // résultat du dernier scan
let _pendingMappings   = [];        // lignes sans mapping à résoudre

// ════════════════════════════════════════════════════════════════
// RENDER — Page scanner
// ════════════════════════════════════════════════════════════════
function renderScanEcom() {
  // Mettre à jour les compteurs
  const pending = ecomOrders.filter(o => o.scanStatut === 'non_scanne' || !o.scanStatut).length;
  const el = document.getElementById('scan-pending-count');
  if (el) el.textContent = pending;
  renderScanHistory();
}

// ════════════════════════════════════════════════════════════════
// MODE — Basculer sortie / retour
// ════════════════════════════════════════════════════════════════
function setScanMode(mode) {
  _scanMode = mode;
  document.getElementById('scan-mode-sortie').classList.toggle('active', mode === 'sortie');
  document.getElementById('scan-mode-retour').classList.toggle('active', mode === 'retour');
  document.getElementById('scan-mode-label').textContent =
    mode === 'sortie' ? '📤 Mode Sortie' : '↩️ Mode Retour';
  document.getElementById('scan-mode-label').style.color =
    mode === 'sortie' ? 'var(--green)' : 'var(--gold)';
  clearScanResult();
  document.getElementById('scan-tracking-input')?.focus();
}

// ════════════════════════════════════════════════════════════════
// SCAN — Point d'entrée principal
// ════════════════════════════════════════════════════════════════
async function processScan() {
  const input    = document.getElementById('scan-tracking-input');
  const tracking = (input?.value || '').trim();
  if (!tracking) return;

  // Feedback visuel immédiat
  input.value = '';
  input.focus();
  showScanLoading(tracking);

  if (_scanMode === 'sortie') {
    await _processScanSortie(tracking);
  } else {
    await _processScanRetour(tracking);
  }
}

// ════════════════════════════════════════════════════════════════
// SCAN SORTIE
// ════════════════════════════════════════════════════════════════
async function _processScanSortie(tracking) {
  // 1. Trouver la commande
  const order = ecomOrders.find(o => o.tracking === tracking || o.num === tracking);

  if (!order) {
    showScanError(tracking, 'Commande introuvable pour ce tracking');
    await _logScan({ tracking, action: 'not_found', note: 'Tracking non trouvé' });
    return;
  }

  // 2. Vérifier si déjà sorti
  if (order.scanStatut === 'sorti') {
    showScanWarning(tracking, order, 'Cette commande a déjà été scannée en sortie');
    await _logScan({ tracking, action: 'already_done', orderId: order.id,
      storeId: order.storeId, note: 'Déjà sorti' });
    return;
  }

  // 3. Récupérer les lignes de commande
  const lines = ecomOrderLines.filter(l => l.orderId === order.id);
  if (!lines.length) {
    showScanError(tracking, 'Aucune ligne produit pour cette commande');
    return;
  }

  // 4. Vérifier les mappings
  const unmapped = lines.filter(l => !l.productId || l.mappingError);
  if (unmapped.length > 0) {
    _pendingMappings = unmapped;
    showMappingModal(order, unmapped, () => _processScanSortie(tracking));
    return;
  }

  // 5. Calculer les déductions (shop return d'abord, puis stock normal)
  const deductions = _calculateDeductions(order.storeId, lines);

  // 6. Afficher le résumé avant confirmation
  showScanConfirm(tracking, order, lines, deductions, async () => {
    await _executeSortie(tracking, order, lines, deductions);
  });
}

// ════════════════════════════════════════════════════════════════
// CALCUL DÉDUCTIONS — Règle prioritaire
// ════════════════════════════════════════════════════════════════
function _calculateDeductions(storeId, lines) {
  return lines.map(line => {
    const productId  = line.productId;
    const qteNeeded  = line.qte;
    const product    = products.find(p => p.id === productId);
    const shopReturn = shopReturns.find(r => r.storeId === storeId && r.productId === productId);

    const qteRetour  = shopReturn?.qte || 0;
    const stockNormal = product?.stock || 0;

    let qteFromReturn = 0;
    let qteFromStock  = 0;
    let source        = 'stock_normal';

    if (qteRetour >= qteNeeded) {
      // Tout depuis le retour shop
      qteFromReturn = qteNeeded;
      qteFromStock  = 0;
      source        = 'shop_return';
    } else if (qteRetour > 0) {
      // Mixte : retour shop d'abord, stock normal en complément
      qteFromReturn = qteRetour;
      qteFromStock  = qteNeeded - qteRetour;
      source        = 'mixte';
    } else {
      // Tout depuis le stock normal
      qteFromReturn = 0;
      qteFromStock  = qteNeeded;
      source        = 'stock_normal';
    }

    return {
      lineId:         line.id,
      productId,
      nomExterne:     line.nomExterne,
      productName:    product?.name || line.nomExterne,
      qte:            qteNeeded,
      qteFromReturn,
      qteFromStock,
      source,
      stockAvant:     stockNormal,
      returnAvant:    qteRetour,
      stockInsuffisant: qteFromStock > stockNormal,
    };
  });
}

// ════════════════════════════════════════════════════════════════
// EXÉCUTER LA SORTIE
// ════════════════════════════════════════════════════════════════
async function _executeSortie(tracking, order, lines, deductions) {
  const tid = GP_TENANT?.id;
  try {
    // Pour chaque ligne — déduire dans l'ordre
    for (const d of deductions) {
      const product    = products.find(p => p.id === d.productId);
      const shopReturn = shopReturns.find(r => r.storeId === order.storeId && r.productId === d.productId);

      // A. Déduire du stock retour shop (via RPC atomique)
      if (d.qteFromReturn > 0) {
        const { data: newReturnQte } = await sb.rpc('gp_upsert_shop_return', {
          p_tenant_id:  tid,
          p_store_id:   order.storeId,
          p_product_id: d.productId,
          p_delta:      -d.qteFromReturn,
        });
        // Mettre à jour state local
        if (shopReturn) shopReturn.qte = newReturnQte ?? Math.max(0, (shopReturn.qte || 0) - d.qteFromReturn);
      }

      // B. Déduire du stock normal (via RPC atomique)
      if (d.qteFromStock > 0) {
        const { data: newStock } = await sb.rpc('gp_deduct_product_stock', {
          p_product_id: d.productId,
          p_qte:        d.qteFromStock,
        });
        // Mettre à jour state local
        if (product) product.stock = newStock ?? Math.max(0, (product.stock || 0) - d.qteFromStock);
      }

      // C. Mettre à jour la ligne de commande
      await sb.from('gp_ecom_order_lines').update({
        statut:           'sorti',
        deduction_source: d.source,
        qte_from_return:  d.qteFromReturn,
        qte_from_stock:   d.qteFromStock,
      }).eq('id', d.lineId);

      // D. Logger chaque ligne
      await _logScan({
        tracking,
        action:         'sortie',
        orderId:        order.id,
        storeId:        order.storeId,
        productId:      d.productId,
        nomExterne:     d.nomExterne,
        qte:            d.qte,
        qteFromReturn:  d.qteFromReturn,
        qteFromStock:   d.qteFromStock,
        stockAvant:     d.stockAvant,
        stockApres:     (d.stockAvant || 0) - d.qteFromStock,
        returnAvant:    d.returnAvant,
        returnApres:    (d.returnAvant || 0) - d.qteFromReturn,
      });
    }

    // E. Marquer la commande comme sortie
    const now = new Date().toISOString();
    await sb.from('gp_ecom_orders').update({
      scan_statut: 'sorti',
      scanned_at:  now,
      scanned_by:  GP_USER?.id || null,
      statut:      'prepare',
    }).eq('id', order.id);

    // Mettre à jour state local
    const localOrder = ecomOrders.find(o => o.id === order.id);
    if (localOrder) { localOrder.scanStatut = 'sorti'; localOrder.scannedAt = now; }

    showScanSuccess(tracking, order, deductions);
    renderScanHistory();
    toast('✅ Sortie confirmée — ' + tracking, 'success');

  } catch (e) {
    console.error('[ScanSortie]', e);
    showScanError(tracking, 'Erreur lors de la sortie : ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════════
// SCAN RETOUR
// ════════════════════════════════════════════════════════════════
async function _processScanRetour(tracking) {
  const order = ecomOrders.find(o => o.tracking === tracking || o.num === tracking);

  if (!order) {
    showScanError(tracking, 'Commande introuvable pour ce tracking');
    await _logScan({ tracking, action: 'not_found', note: 'Retour : tracking non trouvé' });
    return;
  }

  const lines = ecomOrderLines.filter(l => l.orderId === order.id && l.productId);
  if (!lines.length) {
    showScanError(tracking, 'Aucun produit mappé pour cette commande');
    return;
  }

  const tid = GP_TENANT?.id;
  try {
    for (const line of lines) {
      const product    = products.find(p => p.id === line.productId);
      const shopReturn = shopReturns.find(r => r.storeId === order.storeId && r.productId === line.productId);
      const returnAvant = shopReturn?.qte || 0;

      // Incrémenter le stock retour shop (UPSERT atomique)
      const { data: newQte } = await sb.rpc('gp_upsert_shop_return', {
        p_tenant_id:  tid,
        p_store_id:   order.storeId,
        p_product_id: line.productId,
        p_delta:      line.qte,
      });

      // Mettre à jour state local
      if (shopReturn) {
        shopReturn.qte = newQte ?? (returnAvant + line.qte);
      } else {
        shopReturns.push({
          id: null, tenantId: tid, storeId: order.storeId,
          productId: line.productId, qte: newQte ?? line.qte,
        });
      }

      // Logger
      await _logScan({
        tracking, action: 'retour',
        orderId:     order.id,
        storeId:     order.storeId,
        productId:   line.productId,
        nomExterne:  line.nomExterne,
        qte:         line.qte,
        returnAvant,
        returnApres: newQte ?? (returnAvant + line.qte),
      });
    }

    // Marquer la commande
    await sb.from('gp_ecom_orders').update({
      scan_statut: 'retour',
      scanned_at:  new Date().toISOString(),
    }).eq('id', order.id);

    const localOrder = ecomOrders.find(o => o.id === order.id);
    if (localOrder) localOrder.scanStatut = 'retour';

    showScanRetourSuccess(tracking, order, lines);
    renderScanHistory();
    toast('↩️ Retour enregistré — ' + tracking, 'success');

  } catch (e) {
    console.error('[ScanRetour]', e);
    showScanError(tracking, 'Erreur retour : ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════════
// UI — Affichage des résultats
// ════════════════════════════════════════════════════════════════
function showScanLoading(tracking) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);">⏳ Recherche de ' + escapeHTML(tracking) + '...</div>';
}

function clearScanResult() {
  const el = document.getElementById('scan-result-area');
  if (el) el.innerHTML = '';
}

function showScanError(tracking, msg) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  el.innerHTML =
    '<div style="background:rgba(220,38,38,0.07);border:1px solid rgba(220,38,38,0.2);border-radius:var(--radius-sm);padding:16px;">'
    + '<div style="font-size:15px;font-weight:700;color:var(--red);margin-bottom:6px;">❌ ' + escapeHTML(msg) + '</div>'
    + '<div style="font-size:12px;color:var(--text3);">Tracking : ' + escapeHTML(tracking) + '</div>'
    + '</div>';
}

function showScanWarning(tracking, order, msg) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  const store = ecomStores.find(s => s.id === order.storeId);
  el.innerHTML =
    '<div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:var(--radius-sm);padding:16px;">'
    + '<div style="font-size:15px;font-weight:700;color:var(--gold);margin-bottom:8px;">⚠️ ' + escapeHTML(msg) + '</div>'
    + '<div style="font-size:13px;"><strong>' + escapeHTML(order.clientNom) + '</strong> — ' + escapeHTML(order.clientVille) + '</div>'
    + '<div style="font-size:12px;color:var(--text3);margin-top:4px;">Shop : ' + escapeHTML(store?.nom || '—') + ' · ' + escapeHTML(order.num) + '</div>'
    + '</div>';
}

function showScanConfirm(tracking, order, lines, deductions, onConfirm) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  const store = ecomStores.find(s => s.id === order.storeId);

  const linesHTML = deductions.map(d => {
    const sourceLabel = {
      shop_return:  '<span style="color:var(--green);font-weight:700;">↩️ retour shop</span>',
      stock_normal: '<span style="color:var(--accent);">📦 stock normal</span>',
      mixte:        '<span style="color:var(--gold);">⚡ mixte</span>',
    }[d.source] || d.source;

    const insuffisant = d.stockInsuffisant
      ? '<div style="font-size:11px;color:var(--red);">⚠️ Stock insuffisant (' + d.stockAvant + ' disponible)</div>' : '';

    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">'
      + '<div>'
      + '<div style="font-size:13px;font-weight:600;">' + escapeHTML(d.productName) + '</div>'
      + '<div style="font-size:11px;color:var(--text3);">' + escapeHTML(d.nomExterne) + '</div>'
      + insuffisant
      + '</div>'
      + '<div style="text-align:right;">'
      + '<div style="font-weight:700;">×' + d.qte + '</div>'
      + '<div style="font-size:11px;">'
      + (d.qteFromReturn > 0 ? '↩️ ' + d.qteFromReturn + ' retour · ' : '')
      + (d.qteFromStock > 0  ? '📦 ' + d.qteFromStock + ' stock' : '')
      + '</div>'
      + '<div style="font-size:11px;">' + sourceLabel + '</div>'
      + '</div>'
      + '</div>';
  }).join('');

  el.innerHTML =
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;">'
    // Header
    + '<div style="background:var(--accent-light);padding:12px 16px;border-bottom:1px solid var(--border);">'
    + '<div style="font-size:14px;font-weight:700;color:var(--accent);">📦 Sortie — ' + escapeHTML(tracking) + '</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-top:2px;">'
    + escapeHTML(store?.nom || '—') + ' · ' + escapeHTML(order.clientNom) + ' · ' + escapeHTML(order.clientVille)
    + '</div>'
    + '</div>'
    // Lignes
    + '<div style="padding:0 16px;">' + linesHTML + '</div>'
    // Bouton confirm
    + '<div style="padding:12px 16px;">'
    + '<button class="btn btn-primary" style="width:100%;justify-content:center;font-size:14px;" onclick="_confirmScan()">✅ Confirmer la sortie</button>'
    + '</div>'
    + '</div>';

  // Stocker le callback
  window._currentScanConfirm = onConfirm;
}

function _confirmScan() {
  if (window._currentScanConfirm) {
    window._currentScanConfirm();
    window._currentScanConfirm = null;
  }
}

function showScanSuccess(tracking, order, deductions) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  const store = ecomStores.find(s => s.id === order.storeId);
  el.innerHTML =
    '<div style="background:rgba(5,150,105,0.07);border:1px solid rgba(5,150,105,0.2);border-radius:var(--radius-sm);padding:16px;">'
    + '<div style="font-size:16px;font-weight:800;color:var(--green);margin-bottom:6px;">✅ Sortie confirmée</div>'
    + '<div style="font-size:13px;font-weight:600;">' + escapeHTML(order.clientNom) + ' — ' + escapeHTML(order.clientVille) + '</div>'
    + '<div style="font-size:12px;color:var(--text3);margin-top:2px;">Shop : ' + escapeHTML(store?.nom || '—') + ' · ' + escapeHTML(order.num) + '</div>'
    + '<div style="margin-top:10px;font-size:12px;">'
    + deductions.map(d =>
        '<div>• ' + escapeHTML(d.productName) + ' ×' + d.qte
        + (d.qteFromReturn > 0 ? ' <span style="color:var(--green);">(↩️ ' + d.qteFromReturn + ' retour)</span>' : '')
        + (d.qteFromStock > 0  ? ' <span style="color:var(--accent);">(📦 ' + d.qteFromStock + ' stock)</span>' : '')
        + '</div>'
      ).join('')
    + '</div>'
    + '</div>';
}

function showScanRetourSuccess(tracking, order, lines) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  const store = ecomStores.find(s => s.id === order.storeId);
  el.innerHTML =
    '<div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:var(--radius-sm);padding:16px;">'
    + '<div style="font-size:16px;font-weight:800;color:var(--gold);margin-bottom:6px;">↩️ Retour enregistré</div>'
    + '<div style="font-size:13px;font-weight:600;">' + escapeHTML(order.clientNom) + '</div>'
    + '<div style="font-size:12px;color:var(--text3);margin-top:2px;">Shop : ' + escapeHTML(store?.nom || '—') + '</div>'
    + '<div style="margin-top:10px;font-size:12px;">'
    + lines.map(l => {
        const prod = products.find(p => p.id === l.productId);
        const sr   = shopReturns.find(r => r.storeId === order.storeId && r.productId === l.productId);
        return '<div>• ' + escapeHTML(prod?.name || l.nomExterne) + ' ×' + l.qte
          + ' → Stock retour shop : <strong>' + (sr?.qte || 0) + '</strong></div>';
      }).join('')
    + '</div>'
    + '</div>';
}

// ════════════════════════════════════════════════════════════════
// MAPPING MANQUANT — Modal inline
// ════════════════════════════════════════════════════════════════
function showMappingModal(order, unmappedLines, onComplete) {
  const store = ecomStores.find(s => s.id === order.storeId);
  const el    = document.getElementById('scan-result-area');
  if (!el) return;

  const lineHTML = unmappedLines.map((l, idx) =>
    '<div style="margin-bottom:10px;">'
    + '<label class="label" style="font-size:11px;">Produit externe : <strong>' + escapeHTML(l.nomExterne) + '</strong></label>'
    + '<select class="input" id="scan-map-prod-' + idx + '" style="margin-top:4px;">'
    + '<option value="">— Sélectionner un produit interne —</option>'
    + [...products].sort((a,b) => a.name.localeCompare(b.name))
        .map(p => '<option value="' + p.id + '">' + escapeHTML(p.name) + (p.code ? ' · ' + escapeHTML(p.code) : '') + '</option>')
        .join('')
    + '</select>'
    + '</div>'
  ).join('');

  el.innerHTML =
    '<div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:var(--radius-sm);padding:16px;">'
    + '<div style="font-size:14px;font-weight:700;color:var(--gold);margin-bottom:12px;">🔗 Mapping requis — ' + escapeHTML(store?.nom || '') + '</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-bottom:12px;">Ces produits ne sont pas mappés. Associez-les pour continuer.</div>'
    + lineHTML
    + '<button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:8px;" onclick="_saveScanMappings(' + order.id + ')">✅ Enregistrer et continuer</button>'
    + '</div>';

  window._pendingMappingCallback = onComplete;
  window._pendingMappingLines    = unmappedLines;
  window._pendingMappingOrder    = order;
}

async function _saveScanMappings(orderId) {
  const order = window._pendingMappingOrder;
  const lines = window._pendingMappingLines;
  const tid   = GP_TENANT?.id;
  let ok      = true;

  for (let i = 0; i < lines.length; i++) {
    const productId = document.getElementById('scan-map-prod-' + i)?.value;
    if (!productId) { toast('Sélectionnez un produit pour chaque ligne', 'error'); return; }

    const nomExterne   = lines[i].nomExterne;
    const nomNormalise = nomExterne.toLowerCase().trim();

    // Sauvegarder le mapping dans gp_store_mapping
    const { data: inserted, error } = await sb.from('gp_store_mapping')
      .insert({
        tenant_id:    tid,
        store_id:     order.storeId,
        product_id:   productId,
        nom_externe:  nomExterne,
        nom_normalise: nomNormalise,
        created_by:   GP_USER?.id || null,
      })
      .select('id').single();

    if (error && !error.message.includes('duplicate')) {
      toast('Erreur mapping : ' + error.message, 'error'); ok = false; continue;
    }

    // Mettre à jour state local
    ecomMappings.push({
      id: inserted?.id || null, storeId: order.storeId,
      productId, nomExterne, nomNormalise,
    });

    // Mettre à jour la ligne de commande en DB et en local
    await sb.from('gp_ecom_order_lines').update({
      product_id:    productId,
      mapping_auto:  false,
      mapping_error: false,
    }).eq('id', lines[i].id);

    const localLine = ecomOrderLines.find(l => l.id === lines[i].id);
    if (localLine) { localLine.productId = productId; localLine.mappingError = false; }
  }

  if (ok) {
    toast('✅ Mappings sauvegardés', 'success');
    if (window._pendingMappingCallback) window._pendingMappingCallback();
  }
}

// ════════════════════════════════════════════════════════════════
// HISTORIQUE DES SCANS
// ════════════════════════════════════════════════════════════════
function renderScanHistory() {
  const tbody = document.getElementById('scan-history-table');
  if (!tbody) return;

  const recent = [...scanLogs].slice(0, 20);
  if (!recent.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="emoji">📡</div><p>Aucun scan enregistré</p></div></td></tr>';
    return;
  }

  const actionBadge = {
    sortie:          '<span class="chip chip-green" style="font-size:10px;">📤 Sortie</span>',
    retour:          '<span class="chip chip-orange" style="font-size:10px;">↩️ Retour</span>',
    not_found:       '<span class="chip chip-red" style="font-size:10px;">❌ Introuvable</span>',
    already_done:    '<span class="chip chip-gold" style="font-size:10px;">⚠️ Déjà fait</span>',
    mapping_missing: '<span class="chip chip-blue" style="font-size:10px;">🔗 Mapping requis</span>',
    error:           '<span class="chip chip-red" style="font-size:10px;">💥 Erreur</span>',
  };

  tbody.innerHTML = recent.map(l => {
    const store   = ecomStores.find(s => s.id === l.storeId);
    const product = products.find(p => p.id === l.productId);
    const dateStr = new Date(l.scannedAt).toLocaleString('fr-FR', {
      day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'
    });
    const sourceStr = l.action === 'sortie'
      ? (l.qteFromReturn > 0 && l.qteFromStock > 0 ? '⚡ mixte'
        : l.qteFromReturn > 0 ? '↩️ retour shop' : '📦 stock')
      : '—';

    return '<tr>'
      + '<td style="font-size:11.5px;color:var(--text3);">' + dateStr + '</td>'
      + '<td style="font-family:var(--font-mono),monospace;font-size:11.5px;">' + escapeHTML(l.tracking || '—') + '</td>'
      + '<td>' + (actionBadge[l.action] || l.action) + '</td>'
      + '<td style="font-size:12px;">' + escapeHTML(store?.nom || '—') + '</td>'
      + '<td style="font-size:12px;">' + escapeHTML(product?.name || l.nomExterne || '—') + (l.qte > 1 ? ' ×' + l.qte : '') + '</td>'
      + '<td style="font-size:11px;color:var(--text3);">' + sourceStr + '</td>'
      + '</tr>';
  }).join('');
}

// ════════════════════════════════════════════════════════════════
// LOGGER UN SCAN
// ════════════════════════════════════════════════════════════════
async function _logScan(data) {
  const tid = GP_TENANT?.id;
  const log = {
    tenant_id:       tid,
    store_id:        data.storeId     || null,
    order_id:        data.orderId     || null,
    tracking:        data.tracking,
    action:          data.action,
    product_id:      data.productId   || null,
    nom_externe:     data.nomExterne  || null,
    qte:             data.qte         || 1,
    qte_from_return: data.qteFromReturn || 0,
    qte_from_stock:  data.qteFromStock  || 0,
    stock_avant:     data.stockAvant  ?? null,
    stock_apres:     data.stockApres  ?? null,
    return_avant:    data.returnAvant ?? null,
    return_apres:    data.returnApres ?? null,
    note:            data.note        || null,
    scanned_by:      GP_USER?.id      || null,
  };
  try {
    const { data: inserted } = await sb.from('gp_scan_logs').insert(log).select('id').single();
    scanLogs.unshift({ ...log, id: inserted?.id, scannedAt: new Date().toISOString() });
    if (scanLogs.length > 50) scanLogs.pop();
  } catch(e) {
    console.warn('[ScanLog]', e.message);
  }
}

// ════════════════════════════════════════════════════════════════
// PAGE RETOURS SHOP
// ════════════════════════════════════════════════════════════════
function renderShopReturns() {
  const tbody = document.getElementById('shop-returns-table');
  if (!tbody) return;

  const storeF = document.getElementById('shop-returns-filter-store')?.value || 'all';
  let list = shopReturns.filter(r => r.qte > 0);
  if (storeF !== 'all') list = list.filter(r => r.storeId === storeF);

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><div class="emoji">↩️</div><p>Aucun stock retour disponible</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = list.map(r => {
    const store   = ecomStores.find(s => s.id === r.storeId);
    const product = products.find(p => p.id === r.productId);
    return '<tr>'
      + '<td style="font-size:13px;font-weight:600;">' + escapeHTML(store?.nom || '—') + '</td>'
      + '<td style="font-size:13px;">' + escapeHTML(product?.name || r.productId) + '</td>'
      + '<td><span style="font-size:16px;font-weight:800;color:var(--green);">' + r.qte + '</span>'
      + '<span style="font-size:11px;color:var(--text3);margin-left:4px;">' + escapeHTML(product?.unit || 'unités') + '</span></td>'
      + '<td style="font-size:11px;color:var(--text3);">' + (r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('fr-FR') : '—') + '</td>'
      + '</tr>';
  }).join('');
}
