/* ================================================================
   GestionPro — core/state.js
   État global : save(), getLocalId(), getLocalIds(), _saveTimer
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

// Chaque utilisateur a une liste de locaux AUTORISÉS (GP_USER.local_ids),
// affectée par l'admin — pas de "local actif" ni de switch en session.
// Liste vide/absente = pas de restriction (voit tout, comme le super admin).
function getLocalIds() {
  if (isSuperAdmin()) return null;
  if (Array.isArray(GP_USER?.local_ids) && GP_USER.local_ids.length > 0) return GP_USER.local_ids;
  return null;
}

// Local unique — utile seulement pour pré-remplir un formulaire quand
// l'utilisateur n'a accès qu'à un seul local. Ne filtre rien à lui seul.
function getLocalId() {
  const lids = getLocalIds();
  return (lids && lids.length === 1) ? lids[0] : null;
}

// Retourne le local_id pour sauvegarder — null si accès non restreint
function getRequiredLocalId() {
  return getLocalId();
}

// Helper : upsert en masse avec gestion d'erreur silencieuse