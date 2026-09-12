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

// Il n'y a plus de local "attaché" à un utilisateur — tout le monde voit
// toutes les données du tenant. Le local est choisi au moment de chaque
// opération (vente, ajout/transfert de stock), pas au niveau du compte.
function getLocalId() {
  return null; // plus de filtre par utilisateur
}

// Retourne tous les locaux de l'utilisateur (pour compat requêtes .in())
function getLocalIds() {
  return null; // plus de filtre par utilisateur
}

// Retourne le local_id pour sauvegarder — null si accès global
function getRequiredLocalId() {
  return getLocalId();
}

// Helper : upsert en masse avec gestion d'erreur silencieuse