/* ================================================================
   GestionPro — core/state.js
   État global : save(), getLocalId(), onSALocalSwitch(),
   updateSALocalSwitcher(), SA_ACTIVE_LOCAL, _saveTimer
================================================================ */

function save(immediate) {
  _lastSaveTime = Date.now();
  // Mémoriser les IDs actuels pour ignorer nos propres events Realtime (3s)
  _lastSaveIds = new Set([...products, ...sales, ...clients, ...employes, ...caisseOps].map(x=>x?.id).filter(Boolean));
  setTimeout(() => { _lastSaveIds.clear(); }, 3000);
  if (immediate) { _doSave(); return; }
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_doSave, 400);
}

// ─── SAUVEGARDE SUPABASE ─────────────────────────────────────
// Local actif pour le Super Admin (null = accès global)
let SA_ACTIVE_LOCAL = null;

function getLocalId() {
  if (isSuperAdmin()) return SA_ACTIVE_LOCAL; // null = global, ou l'ID du local sélectionné
  return GP_USER?.local_id || null;
}

// Retourne le local_id pour sauvegarder — bloque si SA en accès global
function getRequiredLocalId() {
  // Retourne le local_id de l'user, ou null si SA en accès global (autorisé)
  return getLocalId();
}

function _showLocalPickerToast() {
  // Supprimer l'ancien picker si existe
  document.getElementById('_local-picker-toast')?.remove();
  const opts = GP_LOCAUX_ALL.filter(l => l.actif !== false)
    .map(l => `<button onclick="_pickLocalAndRetry('${l.id}')" style="display:block;width:100%;text-align:left;padding:8px 12px;background:var(--surface2);border:none;border-radius:6px;color:var(--text);cursor:pointer;font-size:13px;margin-bottom:4px;" onmouseover="this.style.background='var(--accent)';this.style.color='#0a0f1e'" onmouseout="this.style.background='var(--surface2)';this.style.color='var(--text)'">${l.nom}</button>`).join('');
  const div = document.createElement('div');
  div.id = '_local-picker-toast';
  div.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:var(--surface);border:1px solid var(--accent);border-radius:var(--radius-lg);padding:14px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.5);min-width:220px;';
  div.innerHTML = `<div style="font-size:13px;font-weight:700;color:var(--accent);margin-bottom:8px;">🏪 Choisir un local actif</div>${opts}<button onclick="this.closest('#_local-picker-toast').remove()" style="width:100%;padding:6px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text2);cursor:pointer;font-size:12px;margin-top:4px;">Annuler</button>`;
  document.body.appendChild(div);
  // Auto-fermer après 8s
  setTimeout(() => div.remove(), 8000);
}

let _pendingAction = null;
function _pickLocalAndRetry(localId) {
  document.getElementById('_local-picker-toast')?.remove();
  // Switcher le local SA
  const sel = document.getElementById('sa-active-local');
  if (sel) { sel.value = localId; onSALocalSwitch(); }
  else { SA_ACTIVE_LOCAL = localId; }
  toast(`🏪 Local actif : ${GP_LOCAUX_ALL.find(l=>l.id===localId)?.nom}`, 'success');
}

function onSALocalSwitch() {
  const sel = document.getElementById('sa-active-local');
  SA_ACTIVE_LOCAL = sel?.value || null;
  // Recharger données + relancer Realtime sur le bon local
  loadUserData().then(() => {
    renderDashboard();
    renderStockTable();
    renderProductGrid();        // ← mise à jour caisse immédiate
    if (typeof renderCategoryFilters === 'function') renderCategoryFilters(); // ← recalculer les catégories
    if (typeof renderVentes === 'function') renderVentes();
    if (typeof renderClients === 'function') renderClients();
    if (typeof renderEmployes === 'function') renderEmployes();
    if (typeof renderDepenses === 'function') renderDepenses();
    if (typeof renderLocaux === 'function') renderLocaux();
    populateClientSelect();
    updateAlertCount();
    setupRealtime(); // relancer sur le nouveau local_id
    const localName = SA_ACTIVE_LOCAL
      ? (GP_LOCAUX_ALL.find(l => l.id === SA_ACTIVE_LOCAL)?.nom || SA_ACTIVE_LOCAL)
      : 'Accès global';
    toast(`🏪 Local actif : ${localName}`, 'success');

    // Si on revient en accès global pendant qu'on est sur la caisse → forcer re-choix
    const caissePage = document.getElementById('page-caisse');
    if (!SA_ACTIVE_LOCAL && caissePage?.classList.contains('active') && isSuperAdmin()) {
      setTimeout(() => openCaisseLocalModal(), 400);
    }
  });
}

function updateSALocalSwitcher() {
  const switcher = document.getElementById('sa-local-switcher');
  const sel      = document.getElementById('sa-active-local');
  if (!switcher || !sel) return;

  if (isSuperAdmin()) {
    switcher.style.display = 'flex';
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Accès global —</option>' +
      GP_LOCAUX_ALL.filter(l => l.actif !== false).map(l =>
        `<option value="${l.id}" ${l.id === cur ? 'selected' : ''}>${escapeHTML(l.nom)}</option>`
      ).join('');
    if (SA_ACTIVE_LOCAL) sel.value = SA_ACTIVE_LOCAL;
  } else {
    switcher.style.display = 'none';
  }
}

// Helper : upsert en masse avec gestion d'erreur silencieuse