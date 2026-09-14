/* ================================================================
   GestionPro — core/state.js
   État global : save(), getLocalId(), getLocalIds(), _saveTimer
================================================================ */

let _pendingDirty = {}; // { products: Set(ids), ... } — accumulé entre appels debouncés

function save(immediate, dirty) {
  _lastSaveTime = Date.now();
  // Accumuler les ids modifiés pour ce cycle de sauvegarde (permet un sync ciblé
  // au lieu de renvoyer TOUTE la table — critical avec 2000+ produits)
  if (dirty) {
    for (const table in dirty) {
      if (!_pendingDirty[table]) _pendingDirty[table] = new Set();
      dirty[table].forEach(id => _pendingDirty[table].add(id));
    }
  }
  // Mémoriser les IDs concernés pour ignorer nos propres events Realtime (3s).
  // Si on sait précisément ce qui a changé, on ne marque que ça (rapide) ;
  // sinon fallback complet (plus lent mais correct).
  const dirtyProducts = _pendingDirty.products;
  _lastSaveIds = (dirtyProducts && dirtyProducts.size > 0)
    ? new Set([...dirtyProducts, ...sales.map(x=>x.id), ...clients.map(x=>x.id), ...employes.map(x=>x.id), ...caisseOps.map(x=>x.id)].filter(Boolean))
    : new Set([...products, ...sales, ...clients, ...employes, ...caisseOps].map(x=>x?.id).filter(Boolean));
  setTimeout(() => { _lastSaveIds.clear(); }, 3000);
  if (immediate) { const d = _pendingDirty; _pendingDirty = {}; _doSave(d); return; }
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { const d = _pendingDirty; _pendingDirty = {}; _doSave(d); }, 400);
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