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

// Un utilisateur a soit UN local assigné, soit un accès global (acces_global=true ou super admin).
// Plus de notion de "local actif" / switch — l'accès est fixe, pas de sélection en session.
function getLocalId() {
  if (hasGlobalAccess()) return null; // Accès global : pas de filtre local
  return GP_USER?.local_id || null;
}

// Retourne tous les locaux de l'utilisateur (pour compat requêtes .in())
function getLocalIds() {
  if (hasGlobalAccess()) return null; // Pas de filtre local
  if (GP_USER?.local_id) return [GP_USER.local_id];
  return null;
}

// Retourne le local_id pour sauvegarder — null si accès global
function getRequiredLocalId() {
  return getLocalId();
}

// Helper : upsert en masse avec gestion d'erreur silencieuse