/* ================================================================
   GestionPro — app.js
   Point d'entrée principal
   Ordre de chargement des scripts (dans index.html) :
     1. Supabase CDN
     2. css/main.css
     3. js/config.js
     4. js/i18n.js
     5. js/utils.js
     6. js/core/state.js
     7. js/core/api.js
     8. js/core/router.js
     9. js/core/dom_helpers.js
    10. js/core/auth.js
    11. js/core/realtime.js
    12. js/modules/dashboard.js
    13. js/modules/stock.js
    14. js/modules/caisse.js
    15. js/modules/clients.js
    16. js/modules/depenses.js
    17. js/modules/conteneurs.js
    18. js/modules/commandes.js
    19. js/modules/locaux.js
    20. js/modules/employes.js
    21. js/modules/settings.js
    22. js/modules/owner_admin.js
    23. js/modules/superadmin.js
    24. js/app.js  ← ce fichier
================================================================ */

/**
 * Initialisation principale de l'application.
 * Appelé au chargement du DOM.
 */
document.addEventListener('DOMContentLoaded', () => {
  // ── 1. Appliquer la langue sauvegardée
  applyLang();

  // ── 2. Mettre à jour la date dans la topbar
  updateDate();

  // ── 3. Charger les paramètres locaux (nom boutique, etc.)
  if (typeof loadSettings === 'function') loadSettings();

  // ── 4. Démarrer l'authentification Supabase
  // startApp() vérifie la session, charge les données, affiche l'UI
  startApp();
});

/**
 * Mise à jour de la date toutes les 60 secondes
 */
setInterval(() => {
  if (typeof updateDate === 'function') updateDate();
}, 60000);

/**
 * Gestion des erreurs globales non catchées
 */
window.addEventListener('unhandledrejection', (event) => {
  console.error('[GP] Promesse non gérée:', event.reason);
});

window.addEventListener('error', (event) => {
  console.error('[GP] Erreur globale:', event.message, event.filename, event.lineno);
});
