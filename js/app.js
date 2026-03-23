/* ================================================================
   GestionPro — app.js
   Point d'entrée principal de l'application
   
   ORDRE DE CHARGEMENT (voir index.html) :
   1. Librairies externes (Supabase, Chart.js)
   2. js/config.js         — constantes & Supabase client
   3. js/i18n.js           — traductions
   4. js/utils.js          — utilitaires généraux
   5. js/core/state.js     — état global & save()
   6. js/core/api.js       — helpers Supabase
   7. js/core/auth.js      — auth, session, permissions, RBAC
   8. js/core/router.js    — navigation
   9. js/core/dom_helpers.js
   10. js/core/realtime.js
   11. js/modules/*.js     — modules métier
   12. js/app.js           — initialisation finale (CE FICHIER)

   Ce fichier déclenche le démarrage de l'application
   après que tous les modules sont chargés.
================================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ── 1. Initialiser la langue ──
  if (typeof applyLang === 'function') applyLang();

  // ── 2. Mettre à jour la date dans la topbar ──
  if (typeof updateDate === 'function') updateDate();

  // ── 3. Démarrer l'application (auth check + session restore) ──
  if (typeof startApp === 'function') {
    startApp();
  } else {
    console.error('[GestionPro] startApp() introuvable — vérifiez l\'ordre de chargement des scripts.');
  }

  // ── 4. Listener changement de langue ──
  const langBtn = document.getElementById('lang-toggle');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      const newLang = currentLang === 'fr' ? 'ar' : 'fr';
      if (typeof setLang === 'function') setLang(newLang);
    });
  }

  // ── 5. Fermer les modals en cliquant sur le backdrop ──
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      // Ne pas fermer modal-caisse-local (obligatoire)
      if (overlay.id === 'modal-caisse-local') return;
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  });

  // ── 6. Raccourcis clavier ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Fermer le premier modal ouvert (sauf modal-caisse-local)
      const openModal = document.querySelector('.modal-overlay.open:not(#modal-caisse-local)');
      if (openModal) openModal.classList.remove('open');
    }
  });

  // ── 7. Mise à jour date toutes les minutes ──
  setInterval(() => {
    if (typeof updateDate === 'function') updateDate();
  }, 60000);

  console.log('[GestionPro] App initialisée v' + (typeof GP_APP_VERSION !== 'undefined' ? GP_APP_VERSION : '?'));
});
