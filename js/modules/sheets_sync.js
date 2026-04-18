/* ================================================================
   GestionPro — modules/sheets_sync.js
   Synchronisation Google Sheets via Edge Function (Service Account)
   Le frontend déclenche uniquement — toute la logique est côté serveur
================================================================ */

// Email du service account — affiché dans le formulaire store
// À mettre à jour après création du service account Google
const SHEETS_SERVICE_ACCOUNT_EMAIL = 'gestionpro-sheets@our-audio-493710-b5.iam.gserviceaccount.com';

// URL de l'edge function Supabase
const SHEETS_SYNC_FUNCTION_URL = GP_SUPABASE_URL + '/functions/v1/sheets-sync';
const DIGYLOG_PROXY_FUNCTION_URL = GP_SUPABASE_URL + '/functions/v1/digylog-proxy';

// ════════════════════════════════════════════════════════════════
// MODAL SYNC — ouvrir la configuration d'un store
// ════════════════════════════════════════════════════════════════
function openSheetsSyncModal(storeId) {
  const s = ecomStores.find(x => x.id === storeId);
  if (!s) return;
  _currentSyncStoreId = storeId;

  document.getElementById('sync-store-name').textContent = s.nom;
  document.getElementById('sync-sheet-id-display').textContent = s.sheetsId || 'Non configuré';
  document.getElementById('sync-sheet-tab-display').textContent = s.sheetsTab || 'Sheet1';

  // Afficher le compte service à partager
  document.getElementById('sync-sa-email').textContent = SHEETS_SERVICE_ACCOUNT_EMAIL;

  // Dernier sync
  const lastEl = document.getElementById('sync-last-info');
  if (s.sheetsLastSync) {
    const d = new Date(s.sheetsLastSync).toLocaleString('fr-FR');
    lastEl.textContent = '🕐 Dernière sync : ' + d + (s.sheetsLastRow > 1 ? ' — ligne ' + s.sheetsLastRow : '');
    lastEl.style.display = '';
  } else {
    lastEl.style.display = 'none';
  }

  document.getElementById('sync-result').style.display = 'none';

  if (!s.sheetsId) {
    document.getElementById('sync-no-config-msg').style.display = '';
    document.getElementById('sync-launch-section').style.display = 'none';
  } else {
    document.getElementById('sync-no-config-msg').style.display = 'none';
    document.getElementById('sync-launch-section').style.display = '';
  }

  openModal('modal-sheets-sync');
}

let _currentSyncStoreId = null;

// ════════════════════════════════════════════════════════════════
// LANCER LA SYNC — appelle l'edge function
// ════════════════════════════════════════════════════════════════
async function launchSheetsSync() {
  const storeId  = _currentSyncStoreId;
  const syncMode = document.getElementById('sync-mode').value;
  const store    = ecomStores.find(x => x.id === storeId);
  const tid      = GP_TENANT?.id;

  if (!store?.sheetsId) { toast('Sheet non configuré pour ce store', 'error'); return; }

  const btn = document.getElementById('sync-launch-btn');
  btn.disabled = true; btn.textContent = '⏳ Synchronisation...';

  try {
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Session expirée — veuillez vous reconnecter');

    const resp = await fetch(SHEETS_SYNC_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey':        GP_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ store_id: storeId, tenant_id: tid, sync_mode: syncMode }),
    });

    const result = await resp.json();
    if (!result.ok) throw new Error(result.error || 'Erreur edge function');

    // Mettre à jour le state local
    if (store) {
      store.sheetsLastSync = new Date().toISOString();
      store.sheetsLastRow  = result.lastRow || store.sheetsLastRow;
    }

    _showSyncResult(result.importees, result.doublons, result.erreurs);
    if (result.importees > 0) { renderEcom(true); renderStores(); }
    toast('✅ Sync terminée — ' + result.importees + ' commande(s)', 'success');

  } catch (e) {
    console.error('[SheetsSync]', e);
    toast('Erreur sync : ' + e.message, 'error');
  }

  btn.disabled = false; btn.textContent = '🔄 Lancer la sync';
}

// ════════════════════════════════════════════════════════════════
// QUICK SYNC — bouton 🔄 dans la carte store
// ════════════════════════════════════════════════════════════════
async function quickSyncStore(storeId) {
  const s = ecomStores.find(x => x.id === storeId);
  if (!s?.sheetsId) {
    openSheetsSyncModal(storeId);
    return;
  }

  const btn = document.getElementById('quick-sync-btn-' + storeId);
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const { data: qSessionData } = await sb.auth.getSession();
    const token = qSessionData?.session?.access_token;
    if (!token) throw new Error('Session expirée');

    const resp = await fetch(SHEETS_SYNC_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey':        GP_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        store_id: storeId,
        tenant_id: GP_TENANT?.id,
        sync_mode: 'new',
      }),
    });

    const result = await resp.json();
    if (!result.ok) throw new Error(result.error);

    if (s) { s.sheetsLastSync = new Date().toISOString(); s.sheetsLastRow = result.lastRow; }
    if (result.importees > 0) { renderEcom(true); renderStores(); }
    toast('🔄 ' + s.nom + ' — ' + result.importees + ' importée(s), ' + result.doublons + ' doublon(s)', 'success');

  } catch (e) {
    console.error('[QuickSync]', e);
    toast('Erreur sync : ' + e.message, 'error');
  }

  if (btn) { btn.disabled = false; btn.textContent = '🔄'; }
}

// ════════════════════════════════════════════════════════════════
// DIGYLOG — créer commandes + envoyer
// ════════════════════════════════════════════════════════════════
async function sendOrdersToDigylog(orderIds) {
  if (!orderIds?.length) { toast('Aucune commande sélectionnée', 'error'); return; }
  const tid = GP_TENANT?.id;
  const btn = document.getElementById('btn-send-digylog');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi DIGYLOG...'; }

  try {
    const token = (await sb.auth.getSession())?.data?.session?.access_token;

    // Étape 1 : créer les commandes dans DIGYLOG
    const r1 = await fetch(DIGYLOG_PROXY_FUNCTION_URL + '?route=create-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': GP_SUPABASE_ANON_KEY },
      body: JSON.stringify({ order_ids: orderIds, tenant_id: tid }),
    });
    const res1 = await r1.json();
    if (!res1.ok) throw new Error(res1.error || 'Erreur création DIGYLOG');

    // Recharger les commandes pour avoir les tracking numbers
    const { data: orders } = await sb.from('gp_ecom_orders')
      .select('id,num,tracking,statut')
      .in('id', orderIds);

    const trackings = (orders || []).map(o => o.tracking).filter(Boolean);
    if (!trackings.length) throw new Error('Aucun tracking reçu de DIGYLOG');

    // Étape 2 : envoyer (créer le BL)
    const r2 = await fetch(DIGYLOG_PROXY_FUNCTION_URL + '?route=send-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': GP_SUPABASE_ANON_KEY },
      body: JSON.stringify({ tracking_numbers: trackings, tenant_id: tid }),
    });
    const res2 = await r2.json();
    if (!res2.ok) throw new Error(res2.error || 'Erreur envoi DIGYLOG');

    // Mettre à jour le state local
    (orders || []).forEach(o => {
      const local = ecomOrders.find(x => x.id === o.id);
      if (local) { local.statut = 'dispatche'; local.tracking = o.tracking; }
    });

    renderEcom(true);
    toast('✅ ' + orderIds.length + ' commande(s) envoyée(s) à DIGYLOG', 'success');

  } catch (e) {
    console.error('[DigylogSend]', e);
    toast('Erreur DIGYLOG : ' + e.message, 'error');
  }

  if (btn) { btn.disabled = false; btn.textContent = '🚚 Envoyer à DIGYLOG'; }
}

async function downloadBLPdf(dispatchId, blId) {
  const tid = GP_TENANT?.id;
  const token = (await sb.auth.getSession())?.data?.session?.access_token;
  const resp = await fetch(
    DIGYLOG_PROXY_FUNCTION_URL + '?route=bl-pdf&bl_id=' + blId + '&dispatch_id=' + dispatchId + '&tenant_id=' + tid,
    { headers: { 'Authorization': 'Bearer ' + token, 'apikey': GP_SUPABASE_ANON_KEY } }
  );
  const result = await resp.json();
  if (result.url) window.open(result.url, '_blank');
  else toast('Erreur téléchargement BL', 'error');
}

async function downloadLabels(dispatchId, trackings) {
  const tid = GP_TENANT?.id;
  const token = (await sb.auth.getSession())?.data?.session?.access_token;
  const resp = await fetch(DIGYLOG_PROXY_FUNCTION_URL + '?route=labels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': GP_SUPABASE_ANON_KEY },
    body: JSON.stringify({ tracking_numbers: trackings, dispatch_id: dispatchId, tenant_id: tid, format: 3 }),
  });
  const result = await resp.json();
  if (result.url) window.open(result.url, '_blank');
  else toast('Erreur téléchargement labels', 'error');
}

// ════════════════════════════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════════════════════════════
function _showSyncResult(importees, doublons, erreurs, msg) {
  const el = document.getElementById('sync-result');
  if (!el) return;
  el.style.display = '';
  el.innerHTML =
    '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:14px;">' +
    (msg ? '<div style="font-size:13px;color:var(--text2);margin-bottom:6px;">' + escapeHTML(msg) + '</div>' : '') +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;">' +
    _kpi(importees, 'Importées', 'var(--green)') +
    _kpi(doublons, 'Doublons ignorés', 'var(--gold)') +
    _kpi(erreurs, 'Mapping manquant', erreurs > 0 ? 'var(--red)' : 'var(--text3)') +
    '</div>' +
    (erreurs > 0
      ? '<div style="font-size:12px;color:var(--red);padding:8px 10px;background:rgba(220,38,38,0.06);border-radius:var(--radius-sm);">⚠️ ' + erreurs + ' commande(s) avec produits non mappés — allez dans <strong>Mapping</strong> pour corriger.</div>'
      : importees > 0 ? '<div style="font-size:12px;color:var(--green);">✅ Tous les produits mappés automatiquement.</div>' : '') +
    '</div>';
}

function _kpi(val, label, color) {
  return '<div style="text-align:center;background:var(--surface);border-radius:var(--radius-sm);padding:10px;">' +
    '<div style="font-size:22px;font-weight:800;color:' + color + ';">' + val + '</div>' +
    '<div style="font-size:10.5px;color:var(--text3);">' + label + '</div>' + '</div>';
}
