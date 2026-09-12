/* ================================================================
   GestionPro — app.js
   Point d'entrée principal de l'application

   FLUX DE DÉMARRAGE :
   1. DOM prêt
   2. applyLang() + loadSettings() + updateDate()
   3. Vérifier session Supabase (sb.auth.getSession)
      → Session valide  → restaurer GP_USER/GP_TENANT → startApp()
      → Pas de session  → afficher écran login
   4. onAuthStateChange surveille les changements de session
================================================================ */

document.addEventListener('DOMContentLoaded', async () => {

  console.log('[GP] DOMContentLoaded — démarrage v' + (typeof GP_APP_VERSION !== 'undefined' ? GP_APP_VERSION : '?'));

  // ── 1. Initialisation UI de base ──
  if (typeof applyLang    === 'function') applyLang();
  if (typeof updateDate   === 'function') updateDate();
  if (typeof loadSettings === 'function') loadSettings();

  // ── 2. Mise à jour date toutes les 60s ──
  setInterval(() => {
    if (typeof updateDate === 'function') updateDate();
  }, 60000);

  // ── 3. Vérifier session Supabase existante ──
  try {
    console.log('[GP] Vérification session Supabase...');

    const { data: sessionData, error: sessionErr } = await sb.auth.getSession();

    if (sessionErr) {
      console.warn('[GP] Erreur lecture session:', sessionErr.message);
      _showLoginScreen();
      return;
    }

    if (!sessionData?.session?.user) {
      console.log('[GP] Pas de session active → écran login');
      _showLoginScreen();
      return;
    }

    // Session valide — restaurer le contexte utilisateur
    console.log('[GP] Session trouvée — restauration profil...');
    await _restoreUserContext(sessionData.session.user);

  } catch(e) {
    console.error('[GP] Erreur critique au démarrage:', e);
    _showLoginScreen();
  }
});

/* ── Restaurer GP_USER + GP_TENANT depuis Supabase ── */
async function _restoreUserContext(authUser) {
  try {
    console.log('[GP] Chargement profil pour auth_id:', authUser.id);

    // Charger gp_users
    const { data: userRows, error: userErr } = await sb
      .from('gp_users')
      .select('id,nom,prenom,email,role,local_id,telephone,actif,tenant_id,auth_id,created_at')
      .eq('auth_id', authUser.id)
      .eq('actif', true)
      .limit(1);

    if (userErr) throw userErr;

    const foundUser = userRows && userRows.length > 0 ? userRows[0] : null;

    if (!foundUser) {
      console.warn('[GP] Profil introuvable pour cet auth_id — déconnexion');
      await sb.auth.signOut();
      localStorage.removeItem('gp_session');
      _showLoginScreen();
      return;
    }

    console.log('[GP] GP_USER chargé:', foundUser.nom, '| role:', foundUser.role, '| tenant_id:', foundUser.tenant_id);
    GP_USER = foundUser;

    // Charger tenant
    if (foundUser.tenant_id) {
      const { data: tenantRows } = await sb
        .from('gp_tenants')
        .select('id,nom,code,actif,plan,expire_at,is_owner')
        .eq('id', foundUser.tenant_id)
        .limit(1);

      GP_TENANT = tenantRows && tenantRows.length > 0 ? tenantRows[0] : null;
      console.log('[GP] GP_TENANT chargé:', GP_TENANT?.nom, '| plan:', GP_TENANT?.plan);
    } else {
      console.warn('[GP] tenant_id manquant dans le profil utilisateur');
      GP_TENANT = null;
    }

    // Mettre à jour gp_session localStorage
    localStorage.setItem('gp_session', JSON.stringify({
      user: {
        id: GP_USER.id,
        nom: GP_USER.nom,
        email: GP_USER.email,
        role: GP_USER.role,
        local_id: GP_USER.local_id,
        actif: GP_USER.actif,
        tenant_id: GP_USER.tenant_id,
        auth_id: GP_USER.auth_id
      },
      tenant: GP_TENANT ? {
        id: GP_TENANT.id,
        nom: GP_TENANT.nom,
        code: GP_TENANT.code,
        plan: GP_TENANT.plan,
        expire_at: GP_TENANT.expire_at,
        is_owner: GP_TENANT.is_owner
      } : null
    }));

    console.log('[GP] Contexte restauré → startApp()');
    await startApp();

  } catch(e) {
    console.error('[GP] Erreur restauration contexte:', e);
    localStorage.removeItem('gp_session');
    _showLoginScreen();
  }
}

/* ── Afficher écran login proprement ── */
function _showLoginScreen() {
  const loginScreen = document.getElementById('login-screen');
  const appWrapper  = document.getElementById('app-wrapper');
  const loader      = document.getElementById('app-loader');
  if (loginScreen) loginScreen.classList.remove('hidden');
  if (appWrapper)  appWrapper.style.display = 'none';
  if (loader)      loader.style.display = 'none';
  GP_USER   = null;
  GP_TENANT = null;
}

/* ── Surveillance des changements de session ── */
if (typeof sb !== 'undefined' && sb.auth) {
  sb.auth.onAuthStateChange(async (event, session) => {
    console.log('[GP] Auth event:', event);

    if (event === 'SIGNED_OUT') {
      GP_USER   = null;
      GP_TENANT = null;
      localStorage.removeItem('gp_session');
      _showLoginScreen();
      return;
    }

    if (event === 'TOKEN_REFRESHED' && session?.user) {
      console.log('[GP] Token rafraîchi — session maintenue');
      // Pas besoin de recharger toute l'app
      return;
    }

    if (event === 'SIGNED_IN' && session?.user && !GP_USER) {
      // Nouveau login depuis un autre onglet
      await _restoreUserContext(session.user);
    }
  });
}

/* ── Gestion erreurs globales ── */
window.addEventListener('unhandledrejection', (event) => {
  console.error('[GP] Promesse non gérée:', event.reason);
});

window.addEventListener('error', (event) => {
  console.error('[GP] Erreur globale:', event.message, event.filename, event.lineno);
});
