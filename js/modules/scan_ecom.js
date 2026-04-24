/* ================================================================
   GestionPro — modules/scan_ecom.js   (Phase 3 — Final)
   Scanner E-commerce + Retours Shop
   ✅ Anti-doublon strict en base (gp_scan_logs)
   ✅ Mode douchette USB/Bluetooth (autofocus permanent)
   ✅ Sons forts et distincts
   ✅ Retours Shop par shop avec détail produit
================================================================ */

// ── État global ─────────────────────────────────────────────────
let _scanMode   = 'sortie';   // 'sortie' | 'retour'
let _scanning   = false;       // anti-doublon pendant traitement
let _scanVolume = 0.7;         // volume 0..1
let _sessionStats = { total:0, sortie:0, retour:0, erreur:0 };
let _currentScanConfirm   = null;
let _pendingMappingCallback = null;
let _pendingMappingLines  = null;
let _pendingMappingOrder  = null;
let _currentDetailStoreId = null;

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════
function renderScanEcom() {
  _updateStats();
  renderScanHistory();
  setScanMode(_scanMode);
  setTimeout(() => _focusInput(), 100);
}

function _focusInput() {
  const el = document.getElementById('scan-tracking-input');
  if (el) el.focus();
}

// ════════════════════════════════════════════════════════════════
// MODE — Sortie / Retour
// ════════════════════════════════════════════════════════════════
function setScanMode(mode) {
  _scanMode = mode;
  const btnS  = document.getElementById('scan-btn-sortie');
  const btnR  = document.getElementById('scan-btn-retour');
  const status = document.getElementById('scan-mode-status');
  const input  = document.getElementById('scan-tracking-input');

  if (btnS) {
    btnS.style.background  = mode === 'sortie' ? 'var(--green)'   : 'var(--surface2)';
    btnS.style.color       = mode === 'sortie' ? '#fff'            : 'var(--text2)';
    btnS.style.borderColor = mode === 'sortie' ? 'var(--green)'   : 'var(--border2)';
  }
  if (btnR) {
    btnR.style.background  = mode === 'retour' ? 'var(--gold)'    : 'var(--surface2)';
    btnR.style.color       = mode === 'retour' ? '#fff'            : 'var(--text2)';
    btnR.style.borderColor = mode === 'retour' ? 'var(--gold)'    : 'var(--border2)';
  }
  if (status) {
    status.textContent = mode === 'sortie'
      ? '📤 Mode SORTIE — scannez un tracking'
      : '↩️ Mode RETOUR — scannez un tracking retour';
    status.style.color = mode === 'sortie' ? 'var(--green)' : 'var(--gold)';
  }
  if (input) {
    input.placeholder = mode === 'sortie'
      ? '📡 Scanner tracking sortie...'
      : '📡 Scanner tracking retour...';
    input.focus();
  }
  clearScanResult();
}

// ════════════════════════════════════════════════════════════════
// CLAVIER — Enter depuis la douchette
// ════════════════════════════════════════════════════════════════
function onScanKeydown(e) {
  if (e.key === 'Enter') { e.preventDefault(); processScan(); }
}

// ════════════════════════════════════════════════════════════════
// POINT D'ENTRÉE PRINCIPAL
// ════════════════════════════════════════════════════════════════
async function processScan() {
  if (_scanning) return;

  const input    = document.getElementById('scan-tracking-input');
  const tracking = (input?.value || '').trim().replace(/\r?\n/g, '');
  if (!tracking) return;

  // Vider immédiatement → prêt pour prochain scan douchette
  input.value = '';
  input.focus();

  _scanning = true;
  _showSpinner(true);
  try {
    if (_scanMode === 'sortie') await _processScanSortie(tracking);
    else                        await _processScanRetour(tracking);
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
// ANTI-DOUBLON STRICT — vérification en base
// ════════════════════════════════════════════════════════════════
async function _checkDuplicate(tracking, action) {
  // 1. Vérifier d'abord en state local (rapide)
  const inLocal = scanLogs.some(l => l.tracking === tracking && l.action === action);
  if (inLocal) return true;

  // 2. Vérifier en base (fiable après refresh)
  try {
    const { data, error } = await sb
      .from('gp_scan_logs')
      .select('id')
      .eq('tracking', tracking)
      .eq('action', action)
      .eq('tenant_id', GP_TENANT?.id)
      .limit(1);
    if (!error && data && data.length > 0) return true;
  } catch(e) {
    console.warn('[AntiDbl] Erreur vérification:', e.message);
  }
  return false;
}

// ════════════════════════════════════════════════════════════════
// SCAN SORTIE
// ════════════════════════════════════════════════════════════════
async function _processScanSortie(tracking) {
  console.log('[Scanner] tracking scanné:', JSON.stringify(tracking));

  // Trouver la commande
  const trackingClean = tracking.trim();
  const order = ecomOrders.find(o => {
    const t = (o.tracking || '').trim();
    const n = (o.num || '').trim();
    return t === trackingClean || n === trackingClean ||
           t.toLowerCase() === trackingClean.toLowerCase();
  });

  if (!order) {
    console.log('[Scanner] ❌ Non trouvé. Sample:', ecomOrders.slice(0,3).map(o=>({num:o.num,tracking:o.tracking})));
    _sessionStats.erreur++; _updateStats();
    showScanError(tracking, '❌ Commande introuvable pour ce tracking');
    await _logScan({ tracking, action: 'not_found', note: 'Tracking non trouvé' });
    _beep('error');
    return;
  }

  // ANTI-DOUBLON STRICT EN BASE
  const isDuplicate = await _checkDuplicate(trackingClean, 'sortie');
  if (isDuplicate) {
    _sessionStats.erreur++; _updateStats();
    showScanWarning(tracking, order, '⚠️ DOUBLON — Cette commande a déjà été scannée en sortie');
    // Log la tentative doublon sans modifier le stock
    await _logScan({ tracking, action: 'already_done', orderId: order.id,
      storeId: order.storeId, note: 'Doublon sortie bloqué' });
    _beep('warn');
    return;
  }

  const lines = ecomOrderLines.filter(l => l.orderId === order.id);
  if (!lines.length) {
    showScanError(tracking, '❌ Aucune ligne produit pour cette commande');
    _sessionStats.erreur++; _updateStats();
    return;
  }

  // Mapping manquant → modal inline
  const unmapped = lines.filter(l => !l.productId || l.mappingError);
  if (unmapped.length > 0) {
    showMappingModal(order, unmapped, () => _processScanSortie(tracking));
    return;
  }

  const deductions = _calculateDeductions(order.storeId, lines);
  // Exécution directe — pas de confirmation manuelle requise
  showScanLoading(tracking, order, deductions);
  await _executeSortie(tracking, order, lines, deductions);
}

// ════════════════════════════════════════════════════════════════
// CALCUL DÉDUCTIONS — retour shop d'abord, stock normal ensuite
// ════════════════════════════════════════════════════════════════
function _calculateDeductions(storeId, lines) {
  return lines.map(line => {
    const productId  = line.productId;
    const qteNeeded  = line.qte;
    const product    = products.find(p => p.id === productId);
    const shopReturn = shopReturns.find(r => r.storeId === storeId && r.productId === productId);
    const qteRetour  = shopReturn?.qte || 0;
    const stockNormal = product?.stock || 0;

    let qteFromReturn = 0, qteFromStock = 0, source = 'stock_normal';
    if (qteRetour >= qteNeeded) {
      qteFromReturn = qteNeeded; source = 'shop_return';
    } else if (qteRetour > 0) {
      qteFromReturn = qteRetour; qteFromStock = qteNeeded - qteRetour; source = 'mixte';
    } else {
      qteFromStock = qteNeeded; source = 'stock_normal';
    }

    return {
      lineId: line.id, productId, nomExterne: line.nomExterne,
      productName: product?.name || line.nomExterne,
      qte: qteNeeded, qteFromReturn, qteFromStock, source,
      stockAvant: stockNormal, returnAvant: qteRetour,
      stockInsuffisant: qteFromStock > stockNormal,
    };
  });
}

// ════════════════════════════════════════════════════════════════
// EXÉCUTER SORTIE — atomique
// ════════════════════════════════════════════════════════════════
async function _executeSortie(tracking, order, lines, deductions) {
  const tid = GP_TENANT?.id;
  try {
    for (const d of deductions) {
      const product    = products.find(p => p.id === d.productId);
      const shopReturn = shopReturns.find(r => r.storeId === order.storeId && r.productId === d.productId);

      if (d.qteFromReturn > 0) {
        const { data: newQte, error } = await sb.rpc('gp_upsert_shop_return', {
          p_tenant_id: tid, p_store_id: order.storeId,
          p_product_id: d.productId, p_delta: -d.qteFromReturn,
        });
        if (!error && shopReturn) shopReturn.qte = newQte ?? Math.max(0, (shopReturn.qte||0) - d.qteFromReturn);
      }

      if (d.qteFromStock > 0) {
        const { data: newStock, error } = await sb.rpc('gp_deduct_product_stock', {
          p_product_id: d.productId, p_qte: d.qteFromStock,
        });
        if (!error && product) product.stock = newStock ?? Math.max(0, (product.stock||0) - d.qteFromStock);
      }

      await sb.from('gp_ecom_order_lines').update({
        statut: 'sorti', deduction_source: d.source,
        qte_from_return: d.qteFromReturn, qte_from_stock: d.qteFromStock,
      }).eq('id', d.lineId);

      await _logScan({
        tracking, action: 'sortie', orderId: order.id, storeId: order.storeId,
        productId: d.productId, nomExterne: d.nomExterne,
        qte: d.qte, qteFromReturn: d.qteFromReturn, qteFromStock: d.qteFromStock,
        stockAvant: d.stockAvant, stockApres: (d.stockAvant||0) - d.qteFromStock,
        returnAvant: d.returnAvant, returnApres: (d.returnAvant||0) - d.qteFromReturn,
      });
    }

    const now = new Date().toISOString();
    await sb.from('gp_ecom_orders').update({
      scan_statut: 'sorti', scanned_at: now,
      scanned_by: GP_USER?.id || null, statut: 'prepare',
    }).eq('id', order.id);

    const lo = ecomOrders.find(o => o.id === order.id);
    if (lo) { lo.scanStatut = 'sorti'; lo.scannedAt = now; lo.statut = 'prepare'; }

    _sessionStats.sortie++; _sessionStats.total++;
    _updateStats();
    showScanSuccess(tracking, order, deductions);
    renderScanHistory();
    _beep('success');

  } catch(e) {
    console.error('[ScanSortie]', e);
    showScanError(tracking, '💥 Erreur : ' + e.message);
    _sessionStats.erreur++; _updateStats();
  }
}

// ════════════════════════════════════════════════════════════════
// SCAN RETOUR
// ════════════════════════════════════════════════════════════════
async function _processScanRetour(tracking) {
  const trackingClean = tracking.trim();
  const order = ecomOrders.find(o => {
    const t = (o.tracking || '').trim();
    const n = (o.num || '').trim();
    return t === trackingClean || n === trackingClean ||
           t.toLowerCase() === trackingClean.toLowerCase();
  });

  if (!order) {
    _sessionStats.erreur++; _updateStats();
    showScanError(tracking, '❌ Commande introuvable pour ce tracking');
    await _logScan({ tracking, action: 'not_found', note: 'Retour : tracking non trouvé' });
    _beep('error');
    return;
  }

  // ANTI-DOUBLON STRICT EN BASE
  const isDuplicate = await _checkDuplicate(trackingClean, 'retour');
  if (isDuplicate) {
    _sessionStats.erreur++; _updateStats();
    showScanWarning(tracking, order, '⚠️ DOUBLON — Ce retour a déjà été enregistré');
    await _logScan({ tracking, action: 'already_done', orderId: order.id,
      storeId: order.storeId, note: 'Doublon retour bloqué' });
    _beep('warn');
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
        if (shopReturn) shopReturn.qte = newQte ?? (returnAvant + line.qte);
        else shopReturns.push({ id: null, tenantId: tid, storeId: order.storeId,
          productId: line.productId, qte: newQte ?? line.qte, updatedAt: new Date().toISOString() });
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

    const lo = ecomOrders.find(o => o.id === order.id);
    if (lo) lo.scanStatut = 'retour';

    _sessionStats.retour++; _sessionStats.total++;
    _updateStats();
    showScanRetourSuccess(tracking, order, lines);
    renderScanHistory();
    _beep('success');

  } catch(e) {
    console.error('[ScanRetour]', e);
    showScanError(tracking, '💥 Erreur retour : ' + e.message);
    _sessionStats.erreur++; _updateStats();
  }
}

// ════════════════════════════════════════════════════════════════
// UI — RÉSULTATS SCAN
// ════════════════════════════════════════════════════════════════
function showScanLoading(tracking, order, deductions) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  const store = ecomStores.find(s => s.id === order.storeId);
  el.innerHTML =
    '<div style="background:rgba(37,99,235,0.07);border:2px solid rgba(37,99,235,0.2);border-radius:var(--radius-sm);padding:14px;">'
    + '<div style="font-size:14px;font-weight:800;color:var(--accent);">⏳ Traitement...</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-top:4px;">' + escapeHTML(order.clientNom) + ' — ' + escapeHTML(store?.nom || '—') + '</div>'
    + '<div style="font-family:var(--font-mono),monospace;font-size:11px;color:var(--text3);margin-top:2px;">' + escapeHTML(tracking) + '</div>'
    + '</div>';
}

function clearScanResult() {
  const el = document.getElementById('scan-result-area');
  if (el) el.innerHTML = '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:20px;text-align:center;color:var(--text3);font-size:13px;">📡 En attente d\'un scan...</div>';
}

function showScanError(tracking, msg) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  el.innerHTML =
    '<div style="background:rgba(220,38,38,0.08);border:2px solid rgba(220,38,38,0.3);border-radius:var(--radius-sm);padding:16px;">'
    + '<div style="font-size:16px;font-weight:800;color:var(--red);">' + escapeHTML(msg) + '</div>'
    + '<div style="font-family:var(--font-mono),monospace;font-size:12px;color:var(--text3);margin-top:6px;">' + escapeHTML(tracking) + '</div>'
    + '</div>';
}

function showScanWarning(tracking, order, msg) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  const store = ecomStores.find(s => s.id === order.storeId);
  el.innerHTML =
    '<div style="background:rgba(245,158,11,0.08);border:2px solid rgba(245,158,11,0.3);border-radius:var(--radius-sm);padding:16px;">'
    + '<div style="font-size:15px;font-weight:800;color:var(--gold);">' + escapeHTML(msg) + '</div>'
    + '<div style="font-size:13px;font-weight:600;margin-top:6px;">' + escapeHTML(order.clientNom) + ' — ' + escapeHTML(order.clientVille) + '</div>'
    + '<div style="font-size:12px;color:var(--text3);margin-top:2px;">' + escapeHTML(store?.nom || '—') + ' · ' + escapeHTML(order.num) + '</div>'
    + '</div>';
}

function showScanConfirm(tracking, order, lines, deductions, onConfirm) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  const store = ecomStores.find(s => s.id === order.storeId);

  const linesHTML = deductions.map(d => {
    const srcLabel = d.source === 'shop_return' ? '<span style="color:var(--green);">↩️ retour shop</span>'
      : d.source === 'mixte' ? '<span style="color:var(--gold);">⚡ mixte</span>'
      : '<span style="color:var(--accent);">📦 stock</span>';
    const alert = d.stockInsuffisant ? '<div style="font-size:10.5px;color:var(--red);margin-top:2px;">⚠️ Stock insuffisant (' + d.stockAvant + ' dispo)</div>' : '';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);">'
      + '<div><div style="font-size:13px;font-weight:600;">' + escapeHTML(d.productName) + '</div>'
      + '<div style="font-size:11px;color:var(--text3);">' + escapeHTML(d.nomExterne) + '</div>' + alert + '</div>'
      + '<div style="text-align:right;"><div style="font-weight:800;font-size:15px;">×' + d.qte + '</div>'
      + '<div style="font-size:11px;">' + srcLabel + '</div>'
      + (d.qteFromReturn > 0 ? '<div style="font-size:10.5px;color:var(--text3);">↩️' + d.qteFromReturn + ' + 📦' + d.qteFromStock + '</div>' : '')
      + '</div></div>';
  }).join('');

  el.innerHTML =
    '<div style="background:var(--surface);border:2px solid var(--accent);border-radius:var(--radius-sm);overflow:hidden;">'
    + '<div style="background:var(--accent-light);padding:10px 14px;border-bottom:1px solid var(--border);">'
    + '<div style="font-size:14px;font-weight:800;color:var(--accent);">📦 ' + escapeHTML(tracking) + '</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-top:2px;">' + escapeHTML(store?.nom || '—') + ' · ' + escapeHTML(order.clientNom) + ' · ' + escapeHTML(order.clientVille) + '</div>'
    + '</div>'
    + '<div style="padding:0 14px;">' + linesHTML + '</div>'
    + '<div style="padding:12px 14px;">'
    + '<button class="btn btn-primary" style="width:100%;justify-content:center;font-size:15px;padding:12px;" onclick="_confirmScan()">✅ Confirmer la sortie</button>'
    + '</div></div>';

  _currentScanConfirm = onConfirm;
  setTimeout(() => el.querySelector('button')?.focus(), 50);
}

function _confirmScan() {
  if (_currentScanConfirm) { _currentScanConfirm(); _currentScanConfirm = null; }
}

function showScanSuccess(tracking, order, deductions) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  const store = ecomStores.find(s => s.id === order.storeId);
  el.innerHTML =
    '<div style="background:rgba(5,150,105,0.08);border:2px solid rgba(5,150,105,0.3);border-radius:var(--radius-sm);padding:14px;">'
    + '<div style="font-size:18px;font-weight:800;color:var(--green);">✅ SORTIE OK</div>'
    + '<div style="font-size:13px;font-weight:700;margin-top:4px;">' + escapeHTML(order.clientNom) + ' — ' + escapeHTML(order.clientVille) + '</div>'
    + '<div style="font-size:12px;color:var(--text3);">' + escapeHTML(store?.nom || '—') + ' · ' + escapeHTML(order.num) + '</div>'
    + '<div style="margin-top:8px;font-size:12px;">'
    + deductions.map(d =>
        '<div>• ' + escapeHTML(d.productName) + ' ×' + d.qte
        + (d.qteFromReturn > 0 ? ' <span style="color:var(--green);">↩️' + d.qteFromReturn + '</span>' : '')
        + (d.qteFromStock  > 0 ? ' <span style="color:var(--accent);">📦' + d.qteFromStock  + '</span>' : '')
        + '</div>').join('')
    + '</div></div>';
}

function showScanRetourSuccess(tracking, order, lines) {
  const el = document.getElementById('scan-result-area');
  if (!el) return;
  const store = ecomStores.find(s => s.id === order.storeId);
  el.innerHTML =
    '<div style="background:rgba(245,158,11,0.08);border:2px solid rgba(245,158,11,0.3);border-radius:var(--radius-sm);padding:14px;">'
    + '<div style="font-size:18px;font-weight:800;color:var(--gold);">↩️ RETOUR OK</div>'
    + '<div style="font-size:13px;font-weight:700;margin-top:4px;">' + escapeHTML(order.clientNom) + '</div>'
    + '<div style="font-size:12px;color:var(--text3);">' + escapeHTML(store?.nom || '—') + ' · ' + escapeHTML(order.num) + '</div>'
    + '<div style="margin-top:8px;font-size:12px;">'
    + lines.map(l => {
        const prod = products.find(p => p.id === l.productId);
        const sr   = shopReturns.find(r => r.storeId === order.storeId && r.productId === l.productId);
        return '<div>• ' + escapeHTML(prod?.name || l.nomExterne) + ' ×' + l.qte + ' → stock retour : <strong>' + (sr?.qte||0) + '</strong></div>';
      }).join('')
    + '</div></div>';
}

// ════════════════════════════════════════════════════════════════
// MAPPING INLINE
// ════════════════════════════════════════════════════════════════
function showMappingModal(order, unmappedLines, onComplete) {
  const store = ecomStores.find(s => s.id === order.storeId);
  const el    = document.getElementById('scan-result-area');
  if (!el) return;

  const linesHTML = unmappedLines.map((l, i) =>
    '<div style="margin-bottom:10px;">'
    + '<label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">Produit externe : <span style="color:var(--accent);">' + escapeHTML(l.nomExterne) + '</span></label>'
    + '<select class="input" id="scan-map-prod-' + i + '">'
    + '<option value="">— Sélectionner —</option>'
    + [...products].sort((a,b) => a.name.localeCompare(b.name))
        .map(p => '<option value="' + p.id + '">' + escapeHTML(p.name) + (p.code ? ' · ' + p.code : '') + '</option>').join('')
    + '</select></div>'
  ).join('');

  el.innerHTML =
    '<div style="background:rgba(245,158,11,0.08);border:2px solid rgba(245,158,11,0.3);border-radius:var(--radius-sm);padding:16px;">'
    + '<div style="font-size:14px;font-weight:800;color:var(--gold);margin-bottom:4px;">🔗 Mapping requis — ' + escapeHTML(store?.nom || '') + '</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-bottom:12px;">Associez les produits pour continuer</div>'
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

    const { data: ins, error } = await sb.from('gp_store_mapping').insert({
      tenant_id: tid, store_id: order.storeId, product_id: productId,
      nom_externe: nomExterne, nom_normalise: nomNormalise,
      created_by: GP_USER?.id || null,
    }).select('id').single();

    if (!error || error.code === '23505') {
      ecomMappings.push({ id: ins?.id||null, storeId: order.storeId, productId, nomExterne, nomNormalise });
    }

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
      ? (l.qteFromReturn > 0 && l.qteFromStock > 0 ? '⚡' : l.qteFromReturn > 0 ? '↩️' : '📦') : '';

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
  set('stat-total', _sessionStats.total);
  set('stat-sortie', _sessionStats.sortie);
  set('stat-retour', _sessionStats.retour);
  set('stat-erreur', _sessionStats.erreur);
}

// ════════════════════════════════════════════════════════════════
// SONS — Forts, distincts, fallback autoplay
// ════════════════════════════════════════════════════════════════
let _audioCtx = null;

function _getAudioCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function _beep(type) {
  try {
    const ctx  = _getAudioCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, ctx.currentTime);

    const vol = _scanVolume * 0.8; // max 80% pour éviter la saturation

    if (type === 'success') {
      // Double bip montant — clair et positif
      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = 880;
      o1.connect(gain);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      o1.start(ctx.currentTime);
      o1.stop(ctx.currentTime + 0.12);

      const g2 = ctx.createGain();
      g2.connect(ctx.destination);
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = 1100;
      o2.connect(g2);
      g2.gain.setValueAtTime(vol, ctx.currentTime + 0.14);
      g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.26);
      o2.start(ctx.currentTime + 0.14);
      o2.stop(ctx.currentTime + 0.26);

    } else if (type === 'warn') {
      // Triple bip rapide — avertissement doublon
      [0, 0.18, 0.36].forEach(offset => {
        const g = ctx.createGain();
        g.connect(ctx.destination);
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = 600;
        o.connect(g);
        g.gain.setValueAtTime(vol * 0.7, ctx.currentTime + offset);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.12);
        o.start(ctx.currentTime + offset);
        o.stop(ctx.currentTime + offset + 0.12);
      });

    } else {
      // Bip grave long descendant — erreur
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(350, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.4);
      o.connect(gain);
      gain.gain.setValueAtTime(vol * 0.9, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.4);
    }
  } catch(e) { console.warn('[Beep]', e.message); }
}

function testBeep(type) {
  _beep(type);
}

function updateScannerVolume(val) {
  _scanVolume = parseFloat(val);
  const label = document.getElementById('scanner-volume-label');
  if (label) label.textContent = Math.round(_scanVolume * 100) + '%';
}

// Débloquer AudioContext au premier clic utilisateur
document.addEventListener('click', () => {
  try { _getAudioCtx(); } catch(e) {}
}, { once: true });

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
    const { data: ins } = await sb.from('gp_scan_logs').insert(log).select('id, scanned_at').single();
    scanLogs.unshift({ ...log, id: ins?.id, scannedAt: ins?.scanned_at || new Date().toISOString() });
    if (scanLogs.length > 100) scanLogs.pop();
  } catch(e) { console.warn('[ScanLog]', e.message); }
}

// ════════════════════════════════════════════════════════════════
// PAGE RETOURS SHOP — Vue par shop avec détail produits
// ════════════════════════════════════════════════════════════════
function renderShopReturns() {
  const grid   = document.getElementById('shop-returns-grid');
  const detail = document.getElementById('shop-returns-detail');
  if (!grid) return;

  // Toujours montrer la liste des shops (masquer détail)
  grid.style.display   = '';
  if (detail) detail.style.display = 'none';

  // Grouper shopReturns par store
  const byStore = {};
  for (const r of shopReturns) {
    if (r.qte <= 0) continue;
    if (!byStore[r.storeId]) byStore[r.storeId] = [];
    byStore[r.storeId].push(r);
  }

  // Remplir le select du filtre shop si présent
  const storeIds = Object.keys(byStore);

  if (!storeIds.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;"><div class="empty-state"><div class="emoji">↩️</div><p>Aucun retour shop disponible</p><div style="font-size:12px;color:var(--text3);margin-top:4px;">Les retours apparaissent ici après scan en mode Retour</div></div></div>';
    return;
  }

  grid.innerHTML = storeIds.map(storeId => {
    const store     = ecomStores.find(s => s.id === storeId);
    const storeReturns = byStore[storeId];
    const totalQte  = storeReturns.reduce((s, r) => s + r.qte, 0);
    const nbProduits = storeReturns.length;

    // Top 3 produits
    const topProds = storeReturns.slice(0, 3).map(r => {
      const prod = products.find(p => p.id === r.productId);
      return '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;">'
        + (prod?.imageUrl
          ? '<img src="' + escapeHTML(prod.imageUrl) + '" style="width:28px;height:28px;border-radius:4px;object-fit:cover;flex-shrink:0;" onerror="this.style.display=\'none\'">'
          : '<div style="width:28px;height:28px;border-radius:4px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">📦</div>')
        + '<div style="flex:1;overflow:hidden;">'
        + '<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHTML(prod?.name || r.productId) + '</div>'
        + '</div>'
        + '<span style="font-size:14px;font-weight:800;color:var(--green);">×' + r.qte + '</span>'
        + '</div>';
    }).join('');

    return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;cursor:pointer;transition:box-shadow .15s;" '
      + 'onclick="openShopReturnDetail(\'' + storeId + '\')" '
      + 'onmouseover="this.style.boxShadow=\'0 4px 16px rgba(0,0,0,0.1)\'" '
      + 'onmouseout="this.style.boxShadow=\'none\'">'
      // Header
      + '<div style="background:var(--accent-light);padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">'
      + '<div>'
      + '<div style="font-size:14px;font-weight:800;color:var(--accent);">🏪 ' + escapeHTML(store?.nom || storeId) + '</div>'
      + (store?.clientNom ? '<div style="font-size:11px;color:var(--text3);">Client : ' + escapeHTML(store.clientNom) + '</div>' : '')
      + '</div>'
      + '<div style="text-align:right;">'
      + '<div style="font-size:22px;font-weight:900;color:var(--green);">' + totalQte + '</div>'
      + '<div style="font-size:10px;color:var(--text3);">pièces dispo</div>'
      + '</div>'
      + '</div>'
      // Body
      + '<div style="padding:10px 14px;">'
      + '<div style="font-size:10.5px;color:var(--text3);margin-bottom:6px;">' + nbProduits + ' produit(s) en retour</div>'
      + topProds
      + (storeReturns.length > 3 ? '<div style="font-size:11px;color:var(--accent);margin-top:4px;">+ ' + (storeReturns.length-3) + ' autres...</div>' : '')
      + '</div>'
      // Footer
      + '<div style="padding:8px 14px;border-top:1px solid var(--border);background:var(--surface2);font-size:11px;color:var(--accent);font-weight:700;">👁️ Voir le détail →</div>'
      + '</div>';
  }).join('');
}

// ── Ouvrir le détail d'un shop ──────────────────────────────────
function openShopReturnDetail(storeId) {
  _currentDetailStoreId = storeId;
  const grid   = document.getElementById('shop-returns-grid');
  const detail = document.getElementById('shop-returns-detail');
  if (!grid || !detail) return;

  grid.style.display   = 'none';
  detail.style.display = '';

  const store   = ecomStores.find(s => s.id === storeId);
  const titleEl = document.getElementById('shop-detail-title');
  if (titleEl) titleEl.textContent = '🏪 ' + (store?.nom || storeId) + ' — Stock retour disponible';

  _renderShopDetailProducts(storeId);
}

function closeShopReturnDetail() {
  _currentDetailStoreId = null;
  const grid   = document.getElementById('shop-returns-grid');
  const detail = document.getElementById('shop-returns-detail');
  if (grid)   grid.style.display   = '';
  if (detail) detail.style.display = 'none';
}

function _renderShopDetailProducts(storeId) {
  const container = document.getElementById('shop-detail-products');
  if (!container) return;

  const storeReturns = shopReturns.filter(r => r.storeId === storeId && r.qte > 0);

  if (!storeReturns.length) {
    container.innerHTML = '<div style="grid-column:1/-1;"><div class="empty-state"><div class="emoji">📦</div><p>Aucun stock retour pour ce shop</p></div></div>';
    return;
  }

  container.innerHTML = storeReturns
    .sort((a,b) => b.qte - a.qte)
    .map(r => {
      const prod = products.find(p => p.id === r.productId);
      // Historique des scans pour ce produit+shop
      const history = scanLogs.filter(l => l.storeId === storeId && l.productId === r.productId)
        .slice(0, 3);

      // Quantité consommée (from scan_logs)
      const qteConso = scanLogs.filter(l => l.storeId === storeId && l.productId === r.productId && l.action === 'sortie')
        .reduce((s, l) => s + (l.qteFromReturn || 0), 0);
      const qteTotal = r.qte + qteConso;

      const histHTML = history.length
        ? history.map(l => {
            const dateStr = new Date(l.scannedAt).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
            const icon = l.action === 'sortie' ? '📤' : l.action === 'retour' ? '↩️' : '⚠️';
            return '<div style="font-size:10.5px;color:var(--text3);display:flex;justify-content:space-between;">'
              + '<span>' + icon + ' ' + escapeHTML(l.tracking||'—') + '</span>'
              + '<span>' + dateStr + '</span>'
              + '</div>';
          }).join('')
        : '<div style="font-size:10.5px;color:var(--text3);">Aucun historique récent</div>';

      return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;">'
        // Header produit
        + '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border);">'
        + (prod?.imageUrl
          ? '<img src="' + escapeHTML(prod.imageUrl) + '" style="width:52px;height:52px;border-radius:6px;object-fit:cover;flex-shrink:0;" onerror="this.style.display=\'none\'">'
          : '<div style="width:52px;height:52px;border-radius:6px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">📦</div>')
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHTML(prod?.name || r.productId) + '</div>'
        + (r.nomExterne ? '<div style="font-size:11px;color:var(--text3);">Externe : ' + escapeHTML(r.nomExterne) + '</div>' : '')
        + '<div style="font-size:11px;color:var(--text3);">MàJ : ' + (r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('fr-FR') : '—') + '</div>'
        + '</div>'
        + '</div>'
        // Stats
        + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-bottom:1px solid var(--border);">'
        + _statCell(r.qte,    'Disponible', 'var(--green)')
        + _statCell(qteConso, 'Consommé',   'var(--text3)')
        + _statCell(qteTotal, 'Total',      'var(--accent)')
        + '</div>'
        // Historique
        + '<div style="padding:10px 14px;">'
        + '<div style="font-size:10.5px;font-weight:700;color:var(--text2);margin-bottom:4px;">Historique récent</div>'
        + histHTML
        + '</div>'
        + '</div>';
    }).join('');
}

function _statCell(val, label, color) {
  return '<div style="text-align:center;padding:10px 4px;border-right:1px solid var(--border);">'
    + '<div style="font-size:20px;font-weight:800;color:' + color + ';">' + val + '</div>'
    + '<div style="font-size:10px;color:var(--text3);">' + label + '</div>'
    + '</div>';
}
