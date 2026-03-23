/* ================================================================
   GestionPro — core/auth.js
   Authentification & Autorisation :
   PERMISSIONS_DEF, DEFAULT_ROLES, isSuperAdmin, hasPermission,
   loadRoles, saveRoles, getAllRoles, loadSAData, saveSAData,
   hashPassword, doLogin, checkTenantAccess, forceLogout,
   showLicenceExpired, doLogout, startApp,
   applyPageRBAC, applyRBACUI, loadUserData, saveSettings,
   openRestockModal, openContratModal, setupRealtime hooks
================================================================ */

// ═══════════════════════════════════════════════════════════
//  SUPABASE CONFIG
// ═══════════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://xyaispmikggrgjczyghk.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5YWlzcG1pa2dncmdqY3p5Z2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3OTc4NjUsImV4cCI6MjA4NzM3Mzg2NX0.ohiqpHyEuzMyhPLoktFe7SakgfnRRj2TT4ysuQOER3o';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// Gérer expiration/invalidation de session Auth automatiquement
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
    if (event === 'SIGNED_OUT' && GP_USER) {
      // Session expirée - déconnecter proprement
      GP_USER = null; GP_TENANT = null;
      localStorage.removeItem('gp_session');
      if (!document.getElementById('login-screen')?.classList.contains('hidden') === false) {
        location.reload();
      }
    }
  }
});

// ╔══════════════════════════════════════════════════════════════╗
// ║           RBAC — SYSTÈME DE RÔLES & PERMISSIONS             ║
// ╚══════════════════════════════════════════════════════════════╝

// Définition des permissions par module
const PERMISSIONS_DEF = {
  'dashboard':    { label: '📊 Dashboard',         actions: ['read'] },
  'caisse':       { label: '🧾 Caisse & Ventes',    actions: ['read','create','delete'] },
  'stock':        { label: '📦 Stock / Produits',   actions: ['read','create','update','delete'] },
  'clients':      { label: '👥 Clients',            actions: ['read','create','update','delete'] },
  'employes':     { label: '👨‍💼 Employés',           actions: ['read','create','update','delete'] },
  'conges':       { label: '🏖️ Congés',             actions: ['read','create','approuver'] },
  'livraisons':   { label: '🚚 Bons Livraison',     actions: ['read','create','update'] },
  'docs_rh':      { label: '📋 Documents RH',       actions: ['read','create'] },
  'conteneurs':   { label: '🚢 Conteneurs',         actions: ['read','create','update'] },
  'fonds':        { label: '💵 Fonds de Caisse',    actions: ['read','create'] },
  'docs_admin':   { label: '🏢 Docs Administratifs',actions: ['read','create'] },
  'alerts':       { label: '🔔 Alertes',            actions: ['read'] },
  'settings':     { label: '⚙️ Paramètres',         actions: ['read','update'] },
  'rapports':     { label: '📈 Rapports',           actions: ['read','export'] },
};

// Rôles système par défaut avec leurs permissions initiales
const DEFAULT_ROLES = {
  super_admin: {
    label: '👑 Super Admin',
    color: '#ffd166',
    isSystem: true,
    localRequired: false,
    permissions: {} // Tout autorisé — bypass total
  },
  admin_local: {
    label: '🏪 Admin Local',
    color: '#2563eb',
    isSystem: true,
    localRequired: true,
    permissions: {
      dashboard:['read'], caisse:['read','create','delete'], stock:['read','create','update','delete'],
      clients:['read','create','update','delete'], employes:['read','create','update','delete'],
      conges:['read','create','approuver'], livraisons:['read','create','update'],
      docs_rh:['read','create'], conteneurs:['read','create','update'],
      fonds:['read','create'], docs_admin:['read','create'], alerts:['read'],
      settings:['read','update'], rapports:['read','export']
    }
  },
  caissier: {
    label: '💳 Caissier',
    color: '#6c63ff',
    isSystem: true,
    localRequired: true,
    permissions: {
      dashboard:['read'], caisse:['read','create'], stock:['read'],
      clients:['read','create'], fonds:['read','create'], alerts:['read']
    }
  },
  rh: {
    label: '👨‍💼 RH',
    color: '#ff6b35',
    isSystem: true,
    localRequired: true,
    permissions: {
      dashboard:['read'], employes:['read','create','update','delete'],
      conges:['read','create','approuver'], docs_rh:['read','create'],
      livraisons:['read','create','update'], alerts:['read']
    }
  },
  magasinier: {
    label: '📦 Magasinier',
    color: '#3742fa',
    isSystem: true,
    localRequired: true,
    permissions: {
      dashboard:['read'], stock:['read','create','update'],
      conteneurs:['read','create','update'], livraisons:['read','create','update'],
      alerts:['read']
    }
  }
};

// ╔══════════════════════════════════════════════════════════════╗
// ║                      AUTH STATE                              ║
// ╚══════════════════════════════════════════════════════════════╝
let GP_USER   = null;   // utilisateur connecté
let GP_TENANT = null;   // tenant actif (client)
let GP_ROLES  = {};     // rôles chargés depuis Supabase
let GP_LOCAUX_ALL = []; // tous les locaux (pour super admin)
let GP_USERS_ALL  = []; // tous les utilisateurs (pour super admin)
let SA_CURRENT_TAB = 'dash';
let SA_SELECTED_ROLE = null;

// ─── HELPERS RBAC ─────────────────────────────────────────────
function isSuperAdmin() {
  return GP_USER && normalizeRole(GP_USER.role) === 'super_admin';
}

function applyNavPermissions() {
  if (isSuperAdmin()) {
    // SA voit les modules autorisés par son PLAN
    document.querySelectorAll('.nav-item[data-nav-module]').forEach(el => {
      const mod = el.dataset.navModule;
      if (mod === 'owner-admin') return; // géré séparément
      el.style.display = hasModuleAccess(mod) ? '' : 'none';
    });
  } else {
    // User normal : plan + permissions rôle
    document.querySelectorAll('.nav-item[data-nav-module]').forEach(el => {
      const mod = el.dataset.navModule;
      if (mod === 'owner-admin') return; // géré séparément
      const inPlan = hasModuleAccess(mod);
      const canRead = hasPermission(mod, 'read');
      el.style.display = (inPlan && canRead) ? '' : 'none';
    });
  }
  // Owner-admin : masqué — app single tenant
  const ownerNav = document.getElementById('nav-owner-admin');
  if (ownerNav) ownerNav.style.display = 'none';
}

function hasPermission(module, action) {
  if (isSuperAdmin()) return true;
  const normalizedRole = normalizeRole(GP_USER?.role);
  const role = getAllRoles()[normalizedRole];
  if (!role) return false; // ← false : rôle inconnu = aucun accès
  const perms = role.permissions || {};
  return !!(perms[module] && perms[module].includes(action));
}

function getRole(roleName) {
  // cherche directement ET via alias
  return GP_ROLES[roleName] || DEFAULT_ROLES[roleName]
      || GP_ROLES[normalizeRole(roleName)] || DEFAULT_ROLES[normalizeRole(roleName)];
}

// Map des anciens noms de rôles Supabase → nouveaux noms internes
const ROLE_ALIASES = {
  'admin':          'admin_local',
  'admin_local':    'admin_local',
  'super_admin':    'super_admin',
  'caissier':       'caissier',
  'rh':             'rh',
  'magasinier':     'magasinier',
};

function normalizeRole(roleName) {
  if (!roleName) return '';
  return ROLE_ALIASES[roleName] || roleName;
}

function getRoleLabel(roleName) {
  const normalized = normalizeRole(roleName);
  const r = getRole(normalized);
  if (r) return r.label;
  return roleName ? roleName.charAt(0).toUpperCase() + roleName.slice(1).replace(/_/g,' ') : '—';
}

function getRoleColor(roleName) {
  const r = getRole(normalizeRole(roleName));
  return r ? (r.color || '#888') : '#888';
}

// Clé locale scopée par local_id (pas user_id pour partage entre users du même local)
function localKey(key) {
  if (isSuperAdmin()) return `gp_SA_${key}`; // super admin a son propre scope
  const lid = GP_USER?.local_id || GP_USER?.id;
  return `gp_L${lid}_${key}`;
}

function userKey(key) {
  return GP_USER ? `gp_${GP_USER.id}_${key}` : `gp_${key}`;
}

// ─── CHARGEMENT RÔLES ─────────────────────────────────────────
async function loadRoles() {
  GP_ROLES = {};
  try {
    const { data, error } = await sb.from('gp_roles_config').select('*');
    if (error) throw error;
    (data || []).forEach(r => {
      GP_ROLES[r.role_key] = {
        label: r.label || r.role_key,
        color: r.color || '#6c63ff',
        isSystem: r.is_system || false,
        permissions: r.permissions || {}
      };
    });
  } catch(e) {
    console.warn('[SB] loadRoles:', e.message);
  }
}

async function saveRoles() {
  if (!isSuperAdmin()) { toast('⛔ Accès refusé', 'error'); return; }
  try {
    const rows = Object.entries(GP_ROLES).map(([role_key, v]) => ({
      role_key,
      label: v.label || role_key,
      color: v.color || '#6c63ff',
      is_system: v.isSystem || false,
      permissions: v.permissions || {}
    }));
    if (rows.length > 0) {
      const { error } = await sb.from('gp_roles_config')
        .upsert(rows, { onConflict: 'role_key' });
      if (error) throw error;
    }
  } catch(e) {
    console.warn('[SB] saveRoles:', e.message);
    toast('⚠️ Erreur sauvegarde permissions: ' + e.message, 'error');
  }
}

function getAllRoles() {
  const merged = {};
  // 1. Base : DEFAULT_ROLES
  Object.entries(DEFAULT_ROLES).forEach(([key, role]) => {
    merged[key] = { ...role, permissions: JSON.parse(JSON.stringify(role.permissions || {})) };
  });
  // 2. Appliquer overrides GP_ROLES — si une clé existe dans GP_ROLES, SES permissions priment toujours
  Object.entries(GP_ROLES).forEach(([key, override]) => {
    if (!override) return;
    // Si 'permissions' est défini dans l'override (même vide {}), on l'utilise
    const hasPermKey = override.hasOwnProperty('permissions');
    if (merged[key]) {
      merged[key] = {
        ...merged[key],
        ...override,
        permissions: hasPermKey ? override.permissions : merged[key].permissions
      };
    } else {
      merged[key] = { ...override };
    }
  });
  return merged;
}

// ─── CHARGEMENT LOCAUX & USERS (pour super admin) ─────────────
async function loadSAData() {
  try {
    const tid = GP_TENANT?.id || null;
    // TOUJOURS filtrer par tenant — jamais charger sans tenant
    if (!tid) { GP_LOCAUX_ALL = []; GP_USERS_ALL = []; return; }
    const locsQ = sb.from('gp_locaux').select('*').eq('tenant_id', tid).order('nom');
    const { data: locs } = await locsQ;
    GP_LOCAUX_ALL = (locs || []).map(l => ({
      id: l.id, nom: l.nom,
      description: l.description || '', desc: l.description || '',
      adresse: l.adresse || '', telephone: l.telephone || '',
      responsable: l.responsable || '',
      couleur: l.couleur || 'accent', actif: l.actif !== false,
      createdAt: l.created_at
    }));
    locaux = GP_LOCAUX_ALL;

    // Ne PAS charger les passwords dans le client (sécurité)
    const usrsQ = sb.from('gp_users').select('id,nom,prenom,email,role,local_id,telephone,actif,created_at').eq('tenant_id', tid).order('nom');
    const { data: usrs } = await usrsQ;
    GP_USERS_ALL = (usrs || []).map(u => ({
      id: u.id, nom: u.nom, prenom: u.prenom || '',
      email: u.email,
      // password NON chargé — jamais exposé au client
      role: u.role, local_id: u.local_id,
      telephone: u.telephone || '',
      actif: u.actif !== false, createdAt: u.created_at
    }));
  } catch(e) {
    console.warn('[SB] loadSAData error:', e);
  }
}

async function saveSAData() {
  if (!isSuperAdmin()) { toast('⛔ Accès refusé', 'error'); return; }
  await saveGPLocaux();
}

async function saveGPLocaux() {
  if (!isSuperAdmin()) { toast('⛔ Accès refusé', 'error'); return; }
  try {
    await sbUpsert('gp_locaux', GP_LOCAUX_ALL.map(l => ({
      id: l.id, nom: l.nom,
      description: l.description || l.desc || null,
      adresse: l.adresse || null, telephone: l.telephone || null,
      responsable: l.responsable || null,
      couleur: l.couleur || 'accent', actif: l.actif !== false
    })));
  } catch(e) {
    console.warn('[SB] saveGPLocaux error:', e);
  }
}

// ─── LOGIN ────────────────────────────────────────────────────
document.getElementById('l-pwd').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

function fillLogin(email, pwd, code) {
  // fillLogin uniquement pour démos — ne pas utiliser en production
  const c=document.getElementById('l-code'); if(c&&code) c.value=code;
  document.getElementById('l-email').value = email;
  document.getElementById('l-pwd').value = pwd;
  doLogin();
}

// ── Hash password SHA-256 (Web Crypto API — natif navigateur) ──
async function hashPassword(pwd) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pwd + 'GP_SALT_2024'); // salt fixe
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
}

// Rate limiting anti brute-force
const _loginAttempts = { count: 0, lastFail: 0, locked: false };

async function doLogin() {
  const now = Date.now();
  if (_loginAttempts.locked && now - _loginAttempts.lastFail < 120000) {
    const wait = Math.ceil((120000 - (now - _loginAttempts.lastFail)) / 1000);
    showLoginErr(`Trop de tentatives. Réessayez dans ${wait}s`);
    return;
  }
  if (now - _loginAttempts.lastFail > 120000) {
    _loginAttempts.count = 0;
    _loginAttempts.locked = false;
  }

  const email = document.getElementById('l-email').value.trim().toLowerCase();
  const pwd   = document.getElementById('l-pwd').value;
  const btn   = document.getElementById('l-btn');
  const err   = document.getElementById('l-err');
  err.style.display = 'none';

  if (!email || !pwd) { showLoginErr('Email et mot de passe requis'); return; }

  btn.disabled = true;
  btn.textContent = '⏳ Connexion...';

  try {
    // Déconnecter session active
    await sb.auth.signOut();

    // Login Supabase Auth
    const { data: authData, error: authErr } = await sb.auth.signInWithPassword({ email, password: pwd });
    if (authErr) throw new Error('Email ou mot de passe incorrect');

    // Charger user depuis gp_users
    const { data: userRow, error: userErr } = await sb
      .from('gp_users')
      .select('id,nom,prenom,role,local_id,telephone,actif,tenant_id,created_at,auth_id')
      .eq('auth_id', authData.user.id)
      .eq('actif', true)
      .limit(1);

    if (userErr) throw userErr;
    const foundUser = userRow && userRow.length > 0 ? userRow[0] : null;
    if (!foundUser) { await sb.auth.signOut(); throw new Error('Compte non trouvé'); }

    // Charger tenant
    const { data: tenantRow } = await sb
      .from('gp_tenants')
      .select('id, nom, code, actif, plan, expire_at, is_owner')
      .eq('id', foundUser.tenant_id)
      .limit(1);
    const tenant = tenantRow && tenantRow.length > 0 ? tenantRow[0] : null;

    _loginAttempts.count = 0;
    _loginAttempts.locked = false;

    GP_USER   = foundUser;
    GP_TENANT = tenant;
    // Stocker seulement le minimum nécessaire en session
    const sessionData = {
      user: {
        id: GP_USER.id,
        nom: GP_USER.nom,
        email: GP_USER.email,
        role: GP_USER.role,
        local_id: GP_USER.local_id,
        actif: GP_USER.actif,
        tenant_id: GP_USER.tenant_id,
        auth_id: GP_USER.auth_id
        // password JAMAIS stocké en session
      },
      tenant: {
        id: GP_TENANT?.id,
        nom: GP_TENANT?.nom,
        code: GP_TENANT?.code,
        plan: GP_TENANT?.plan,
        expire_at: GP_TENANT?.expire_at,
        is_owner: GP_TENANT?.is_owner
      }
    };
    localStorage.setItem('gp_session', JSON.stringify(sessionData));
    await startApp();
  } catch(e) {
    _loginAttempts.count++;
    _loginAttempts.lastFail = Date.now();
    if (_loginAttempts.count >= 5) _loginAttempts.locked = true;
    showLoginErr(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Se connecter';
  }
}

// ── Vérification accès tenant en temps réel ──
async function checkTenantAccess() {
  if (!GP_TENANT?.id) return;
  try {
    const { data } = await sb.from('gp_tenants')
      .select('actif, expire_at, plan')
      .eq('id', GP_TENANT.id)
      .single();
    if (!data) return;

    // Mettre à jour GP_TENANT avec les données fraîches
    GP_TENANT.actif    = data.actif;
    GP_TENANT.expire_at = data.expire_at;
    GP_TENANT.plan     = data.plan;

    // Vérifier blocage
    if (!data.actif) {
      forceLogout('Votre compte a été désactivé. Contactez le support.');
      return;
    }
    // Vérifier expiration
    if (data.expire_at && new Date(data.expire_at) < new Date()) {
      forceLogout('Votre licence a expiré. Contactez-nous pour renouveler.');
      return;
    }
    // Mettre à jour le plan dans la sidebar
    const tenantNameEl = document.getElementById('sidebar-tenant-name');
    if (tenantNameEl) {
      const planBadge = {starter:'🥉',business:'🥈',premium:'🥇'}[data.plan] || '';
      tenantNameEl.textContent = GP_TENANT.nom + (planBadge ? ' ' + planBadge : '');
    }
    // Réappliquer permissions selon nouveau plan
    applyNavPermissions();
  } catch(e) {
    console.warn('[Tenant] checkTenantAccess error:', e.message);
  }
}

function forceLogout(reason) {
  // Arrêter le polling tenant
  if (_tenantCheckInterval) { clearInterval(_tenantCheckInterval); _tenantCheckInterval = null; }
  // Arrêter Realtime
  _rtChannels.forEach(ch => { try { sb.removeChannel(ch); } catch(e){} });
  _rtChannels = [];
  localStorage.removeItem('gp_session');
  GP_USER = null; GP_TENANT = null;
  const appWrap = document.getElementById('app-wrapper');
  const loginScreen = document.getElementById('login-screen');
  if (appWrap) appWrap.style.display = 'none';
  if (loginScreen) loginScreen.classList.remove('hidden');
  // Afficher message
  const err = document.getElementById('l-err');
  if (err) {
    err.style.display = 'block';
    err.style.background = 'rgba(224,49,49,0.1)';
    err.style.border = '1px solid rgba(224,49,49,0.3)';
    err.style.padding = '14px';
    err.style.borderRadius = '10px';
    err.innerHTML = `<div style="font-weight:700;color:var(--red);margin-bottom:6px;">⛔ Accès bloqué</div>
      <div style="font-size:13px;color:var(--text2);">${reason}</div>
      <a href="https://wa.me/212664783510?text=Bonjour%2C%20je%20veux%20renouveler%20ma%20licence%20GestionPro" 
         target="_blank" style="display:inline-flex;align-items:center;gap:8px;margin-top:10px;background:rgba(37,211,102,0.1);color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
        💬 Renouveler sur WhatsApp
      </a>`;
  }
}

// Vérification toutes les 5 minutes
let _tenantCheckInterval = null;

function showLicenceExpired(tenant) {
  const err = document.getElementById('l-err');
  err.style.display = 'block';
  err.style.background = 'rgba(224,49,49,0.1)';
  err.style.border = '1px solid rgba(224,49,49,0.3)';
  err.style.padding = '16px';
  err.style.borderRadius = '10px';
  err.innerHTML = `
    <div style="font-weight:700;color:var(--red);margin-bottom:6px;">⚠️ Licence expirée</div>
    <div style="font-size:13px;color:var(--text2);">Votre abonnement GestionPro a expiré.</div>
    <a href="https://wa.me/212664783510?text=Bonjour%2C%20je%20veux%20renouveler%20ma%20licence%20GestionPro%20(code%3A%20${tenant.code})" 
       target="_blank"
       style="display:inline-flex;align-items:center;gap:8px;margin-top:10px;background:rgba(37,211,102,0.1);color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
      💬 Renouveler sur WhatsApp
    </a>
  `;
}

function showLoginErr(msg) {
  const el = document.getElementById('l-err');
  el.textContent = msg;
  el.style.display = 'block';
}

function doLogout() {
  // Déconnecter session Supabase Auth
  if (sb?.auth) sb.auth.signOut().catch(() => {});
  // Reset état complet
  GP_USER  = null;
  SA_SELECTED_ROLE = null;
  localStorage.removeItem('gp_session');

  // Remettre le menu à zéro (afficher tous les items, le JS RBAC les filtrera au prochain login)
  document.querySelectorAll('.nav-item[onclick]').forEach(el => {
    el.style.display = 'flex';
  });
  // Cacher le nav Super Admin
  const navSA = document.getElementById('nav-superadmin');
  if (navSA) navSA.style.display = 'none';

  // Réinitialiser le badge local dans la sidebar
  const localInfo = document.getElementById('sb-local-info');
  if (localInfo) localInfo.style.display = 'none';

  // Réinitialiser le nom/rôle
  const sbName = document.getElementById('sb-name');
  const sbRole = document.getElementById('sb-role');
  const sbAv   = document.getElementById('sb-avatar');
  if (sbName) sbName.textContent = '—';
  if (sbRole) { sbRole.textContent = '—'; sbRole.style.color = ''; }
  if (sbAv)   sbAv.textContent = '?';

  // Afficher l'écran de login
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('l-email').value = '';
  document.getElementById('l-pwd').value   = '';
  document.getElementById('l-err').style.display = 'none';
}

// ─── DÉMARRAGE APP ─────────────────────────────────────────────
async async function startApp() {
  document.getElementById('login-screen').classList.add('hidden');

  // Afficher loader
  const appWrap = document.getElementById('app-wrapper');
  const loader = document.getElementById('app-loader');
  if (loader) loader.style.display = 'flex';
  if (appWrap) appWrap.style.display = 'none';

  try {
    await loadRoles();
    // Si aucun rôle en DB → initialiser avec les rôles système par défaut
    if (Object.keys(GP_ROLES).length === 0) {
      GP_ROLES = {};
      Object.entries(DEFAULT_ROLES).forEach(([key, r]) => {
        GP_ROLES[key] = { label: r.label, color: r.color, isSystem: r.isSystem, permissions: JSON.parse(JSON.stringify(r.permissions)) };
      });
      await saveRoles();
    }
    await loadSAData();
    updateSALocalSwitcher(); // populate dropdown with loaded locaux
    await loadUserData();
  } catch(e) {
    console.warn('[SB] startApp load error:', e);
    toast('⚠️ Erreur chargement — certaines données peuvent manquer', 'warn');
  }

  // Cacher loader, afficher app
  if (loader) loader.style.display = 'none';
  if (appWrap) appWrap.style.cssText = 'display:flex;width:100%;height:100%;';

  if (!GP_USER) { console.warn('[startApp] GP_USER null — abort'); return; }
  const firstPage = applyRBACUI();
  populateClientSelect();
  updateAlertCount();
  updateCartTvaUI();
  applyLang();
  updateEmployeSelects();
  updateSALocalSwitcher();
  applyNavPermissions(); // cacher les sections selon le rôle
  // Vérification accès tenant en temps réel (toutes les 5 min)
  if (_tenantCheckInterval) clearInterval(_tenantCheckInterval);
  await checkTenantAccess(); // vérification immédiate
  _tenantCheckInterval = setInterval(checkTenantAccess, 5 * 60 * 1000);
  // Afficher nom du tenant
  const tenantNameEl = document.getElementById('sidebar-tenant-name');
  if (tenantNameEl && GP_TENANT) {
    const planBadge = {starter:'🥉',business:'🥈',premium:'🥇'}[GP_TENANT.plan] || '';
    tenantNameEl.textContent = GP_TENANT.nom + (planBadge ? ' ' + planBadge : '');
  }
  const pending = (conges||[]).filter(c=>c.statut==='pending').length;
  const badge = document.getElementById('badge-conges');
  if(badge){ badge.textContent=pending; badge.style.display=pending>0?'':'none'; }
  navigate(firstPage || 'dashboard');

  // Activer la synchronisation temps réel
  setupRealtime();
}

// ─── RBAC UI : masquer/afficher selon permissions ──────────────
// ─── RBAC sur les boutons statiques HTML ──────────────────────
function applyPageRBAC() {
  const SA = isSuperAdmin();
  const show = (id, mod, action) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = (SA || hasPermission(mod, action)) ? '' : 'none';
  };

  // Stock — boutons d'écriture (create / update / export)
  show('btn-new-product',    'stock', 'create');
  show('btn-transfert-stock','stock', 'update');
  // CSV import/export : nécessite create
  const stockCreate = SA || hasPermission('stock', 'create');
  ['btn-csv-model','btn-export-json','btn-import-json'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = stockCreate ? '' : 'none';
  });
  // Le label CSV import n'a pas d'id fixe, on le cible par contenu
  document.querySelectorAll('#page-stock label.btn').forEach(el => {
    if (el.textContent.includes('CSV')) el.style.display = stockCreate ? '' : 'none';
  });

  // Conteneurs
  show('btn-new-cont', 'conteneurs', 'create');
  show('btn-new-ord',  'conteneurs', 'create');

  // Clients
  show('btn-new-client', 'clients', 'create');

  // Employés
  show('btn-new-employe', 'employes', 'create');

  // Congés
  show('btn-new-conge', 'conges', 'create');

  // Docs RH : bouton Générer
  show('btn-gen-docrh', 'docs_rh', 'create');

  // Docs Administratifs : cacher toute la grille si pas de permission create
  const docsAdminGrid = document.getElementById('docs-admin-grid');
  if (docsAdminGrid) {
    docsAdminGrid.style.display = (SA || hasPermission('docs_admin', 'create')) ? '' : 'none';
  }

  // Fonds de caisse : opérations d'écriture
  const fondWrite = SA || hasPermission('fonds', 'create');
  ['btn-fonds-depot','btn-fonds-retrait','btn-fonds-charge','btn-fonds-open','btn-fonds-close'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = fondWrite ? '' : 'none';
  });

  // Bon de livraison : Nouveau bon (bouton dans la page, trouvé par sélecteur)
  const blBtn = document.querySelector('#page-livraisons button.btn-primary');
  if (blBtn && blBtn.textContent.includes('Nouveau bon')) {
    blBtn.style.display = (SA || hasPermission('livraisons', 'create')) ? '' : 'none';
  }
}

function applyRBACUI() {
  // Guard — ne pas exécuter si pas de user connecté
  if (!GP_USER) return;

  // Normaliser le rôle dès le départ
  if (GP_USER.role) GP_USER._normalizedRole = normalizeRole(GP_USER.role);

  // Sidebar user info — gérer les deux formats (Supabase: name, Local: nom)
  const displayName = GP_USER.name || GP_USER.nom || '?';
  const avatarEl = document.getElementById('sb-avatar');
  const nameEl   = document.getElementById('sb-name');
  if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();
  if (nameEl)   nameEl.textContent   = displayName;

  const roleLabel = getRoleLabel(GP_USER.role);
  const roleColor = getRoleColor(GP_USER.role);
  document.getElementById('sb-role').textContent  = roleLabel;
  document.getElementById('sb-role').style.color  = roleColor;

  // Afficher badge local dans sidebar
  const localInfo = document.getElementById('sb-local-info');
  if (localInfo) {
    if (isSuperAdmin()) {
      localInfo.innerHTML = `<span style="font-size:10px;color:var(--gold);font-weight:700;">🌐 Accès global — tous les locaux</span>`;
      localInfo.style.display = 'block';
    } else if (GP_USER.local_id) {
      const loc = GP_LOCAUX_ALL.find(l => l.id === GP_USER.local_id);
      if (loc) {
        localInfo.innerHTML = `<span style="font-size:10px;color:${loc.couleur||'var(--accent)'};font-weight:700;">📍 ${escapeHTML(loc.nom)}</span>`;
        localInfo.style.display = 'block';
      } else {
        localInfo.style.display = 'none';
      }
    } else {
      localInfo.style.display = 'none';
    }
  }

  // Afficher/masquer nav Super Admin
  const navSA = document.getElementById('nav-superadmin');
  if (navSA) navSA.style.display = isSuperAdmin() ? 'flex' : 'none';

  // Appliquer RBAC sur les items nav
  const navRules = {
    'dashboard':   hasPermission('dashboard', 'read'),
    'caisse':      hasPermission('caisse', 'read'),
    'stock':       hasPermission('stock', 'read'),
    'clients':     hasPermission('clients', 'read'),
    'fonds':       hasPermission('fonds', 'read'),
    'conteneurs':  hasPermission('conteneurs', 'read'),
    'employes':    hasPermission('employes', 'read'),
    'conges':      hasPermission('conges', 'read'),
    'livraisons':  hasPermission('livraisons', 'read'),
    'docs-rh':     hasPermission('docs_rh', 'read'),
    'docs-admin':  hasPermission('docs_admin', 'read'),
    'settings':    hasPermission('settings', 'read'),
    'commandes':   hasPermission('conteneurs', 'read'),
    'docscont':    hasPermission('conteneurs', 'read'),
    'locaux':      isSuperAdmin() || hasPermission('settings', 'update'),
    'alerts':      hasPermission('alerts', 'read'),
  };

  document.querySelectorAll('.nav-item[onclick]').forEach(el => {
    const match = el.getAttribute('onclick').match(/navigate\('([^']+)'\)/);
    if (!match) return;
    const page = match[1];
    if (page === 'superadmin') return; // géré séparément via navSA
    if (page === 'owner-admin') return; // géré séparément via applyNavPermissions
    const allowed = navRules.hasOwnProperty(page) ? navRules[page] : (isSuperAdmin() ? hasModuleAccess(page) : false);
    el.style.display = allowed ? 'flex' : 'none';
  });

  // Trouver la première page autorisée pour la navigation de démarrage
  const firstAllowed = ['dashboard','caisse','stock','clients','employes','conges','conteneurs','fonds','livraisons','docs-rh','docs-admin','settings','commandes','docscont','alerts','locaux']
    .find(p => navRules[p] === true) || (isSuperAdmin() ? 'superadmin' : null);

  // Appliquer RBAC aux boutons statiques HTML
  setTimeout(applyPageRBAC, 50);

  return firstAllowed;
}

// ─── DONNÉES SCOPÉES PAR LOCAL ─────────────────────────────────
async function loadUserData() {
  const lid = getLocalId();
  const tid = GP_TENANT?.id || null;

  // SÉCURITÉ : si pas de tenant_id connu → bloquer le chargement
  if (!tid) {
    console.warn('[Security] No tenant_id — refusing to load data');
    toast('⚠️ Session invalide — veuillez vous reconnecter', 'error');
    products = []; sales = []; clients = []; employes = []; caisseOps = []; depenses = [];
    conteneurs = []; ordres = []; livraisons = []; conges = []; docsRHHistory = [];
    return;
  }

  // Filtre tenant_id (isolation données) + local_id si non SA
  const filter = (q) => {
    q = q.eq('tenant_id', tid); // TOUJOURS filtrer par tenant
    if (lid) q = q.eq('local_id', lid);
    return q;
  };

  try {
    // ── Produits — TOUS les locaux du tenant ───────────────────
    const prodsQ = lid
      ? sb.from('gp_products').select('*').eq('tenant_id', tid).eq('local_id', lid).order('name')
      : sb.from('gp_products').select('*').eq('tenant_id', tid).order('name');
    const { data: prods } = await prodsQ;
    products = (prods || []).map(p => ({
      id: p.id, local_id: p.local_id,
      name: p.name, category: p.category || 'Général',
      code: p.code || '', type: p.type || 'unite',
      price: p.price || 0, cost: p.cost || 0,
      stock: p.stock || 0, minStock: p.min_stock || 5,
      unit: p.unit || 'Pièce', zone: p.zone || '',
      sizes: p.sizes || {}, photo: p.photo_url || null,
      createdAt: p.created_at
    }));

    // ── Clients ───────────────────────────────────────────────
    const { data: cls } = await filter(sb.from('gp_clients').select('*').eq('tenant_id', tid).order('name'));
    clients = (cls || []).map(c => ({
      id: c.id, local_id: c.local_id,
      name: c.name, phone: c.phone || '', email: c.email || '',
      city: c.city || '', address: c.address || '',
      notes: c.notes || '', creditLimit: c.credit_limit || 0,
      creditUsed: c.credit_used || 0, createdAt: c.created_at
    }));

    // ── Ventes ────────────────────────────────────────────────
    const { data: sls } = await filter(sb.from('gp_sales').select('*').eq('tenant_id', tid).order('date', {ascending: false}).limit(500));
    sales = (sls || []).map(s => ({
      id: s.id, local_id: s.local_id,
      clientId: s.client_id, clientName: s.client_name,
      date: s.date, items: s.items || [],
      total: s.total, totalHT: s.total_ht,
      tva: s.tva, tvaAmount: s.tva_amount,
      payment: s.payment
    }));

    // ── Dépenses ──────────────────────────────────────────────
    try {
      const { data: deps } = await sb.from('gp_depenses').select('*').eq('tenant_id', tid).order('date', {ascending: false});
      depenses = (deps || []).map(d => ({
        id: d.id, tenant_id: d.tenant_id,
        cat: d.cat || 'Autre', label: d.label || '',
        montant: d.montant || 0, date: d.date,
        recurrence: d.recurrence || 'once', notes: d.notes || ''
      }));
    } catch(e) { depenses = []; }

    // ── Caisse ────────────────────────────────────────────────
    const { data: ops } = await filter(sb.from('gp_caisse_ops').select('*').eq('tenant_id', tid).order('date', {ascending: false}).limit(500));
    caisseOps = (ops || []).map(o => ({
      id: o.id, local_id: o.local_id,
      type: o.type, amount: o.amount,
      label: o.label || o.description || '',
      date: o.date,
      payment: o.payment || null
    }));

    // ── Conteneurs ────────────────────────────────────────────
    const { data: conts } = await filter(sb.from('gp_conteneurs').select('*').eq('tenant_id', tid).order('created_at', {ascending: false}));
    conteneurs = (conts || []).map(c => ({
      id: c.id, local_id: c.local_id,
      numero: c.numero, fournisseur: c.fournisseur || '',
      pays: c.pays || '', type: c.type || '',
      dateArrivee: c.date_arrivee, dateLimite: c.date_limite,
      statut: c.statut || 'en_cours',
      poidsTotal: c.poids_total || 0, volumeCBM: c.volume_cbm || 0,
      nbCartons: c.nb_cartons || 0,
      fraisDouane: c.frais_douane || 0, fraisPort: c.frais_port || 0,
      fraisTransit: c.frais_transit || 0, fraisAutres: c.frais_autres || 0,
      fraisRetardJour: c.frais_retard_jour || 0,
      joursRetard: c.jours_retard || 0,
      fraisRetardManuel: c.frais_retard_manuel || 0,
      methodeRepartition: c.methode_repartition || 'valeur',
      refs: c.refs || []
    }));

    // ── Ordres ────────────────────────────────────────────────
    const { data: ords } = await filter(sb.from('gp_ordres').select('*').eq('tenant_id', tid).order('created_at', {ascending: false}));
    ordres = (ords || []).map(o => ({
      id: o.id, local_id: o.local_id,
      conteneurId: o.conteneur_id, numero: o.numero,
      date: o.date, fournisseur: o.fournisseur,
      valeur: o.valeur || 0, statut: o.statut,
      refs: o.refs || []
    }));

    // ── Employés ──────────────────────────────────────────────
    const { data: emps } = await filter(sb.from('gp_employes').select('*').eq('tenant_id', tid).order('name'));
    employes = (emps || []).map(e => ({
      id: e.id, local_id: e.local_id,
      name: e.name, prenom: e.prenom || '',
      poste: e.poste || '', dept: e.dept || '',
      tel: e.tel || '', email: e.email || '',
      cin: e.cin || '', salaire: e.salaire || 0,
      dateEmbauche: e.date_embauche || '', contrat: e.contrat || 'CDI',
      local: e.local || '', statut: e.statut || 'actif',
      notes: e.notes || ''
    }));

    // ── Congés ────────────────────────────────────────────────
    const { data: cgs } = await filter(sb.from('gp_conges').select('*').eq('tenant_id', tid).order('debut', {ascending: false}));
    conges = (cgs || []).map(c => ({
      id: c.id, local_id: c.local_id,
      empId: c.emp_id, type: c.type,
      debut: c.debut, fin: c.fin, jours: c.jours || 1,
      motif: c.motif || '', statut: c.statut || 'pending'
    }));

    // ── Livraisons ────────────────────────────────────────────
    const { data: bls } = await filter(sb.from('gp_livraisons').select('*').eq('tenant_id', tid).order('created_at', {ascending: false}));
    livraisons = (bls || []).map(l => ({
      id: l.id, local_id: l.local_id,
      numero: l.numero, date: l.date,
      client: l.client, tel: l.tel,
      adresse: l.adresse, chauffeur: l.chauffeur,
      vehicule: l.vehicule, statut: l.statut || 'en_cours',
      notes: l.notes, articles: l.articles || [],
      valeur: l.valeur || 0
    }));

    // ── Docs RH ───────────────────────────────────────────────
    try {
      const { data: drhs } = await filter(sb.from('gp_docs_rh').select('*').eq('tenant_id', tid).order('created_at', {ascending: false}));
      docsRHHistory = (drhs || []).map(d => ({
        id: d.id, local_id: d.local_id,
        empId: d.emp_id, empName: d.emp_name,
        type: d.type, contenu: d.contenu || {},
        date: d.created_at
      }));
    } catch(e) { console.warn('[SB] gp_docs_rh load skipped:', e.message); docsRHHistory = []; }

    // ── Settings GLOBAUX — localStorage uniquement (pas de table dédiée) ──
    try {
      const localSett = localStorage.getItem('gp_settings_global');
      if (localSett) settings = { ...settings, ...JSON.parse(localSett) };
    } catch(e) {}

  } catch(e) {
    console.warn('[SB] loadUserData error:', e);
    toast('⚠️ Erreur chargement données — mode hors ligne', 'warn');
  }
}

// _doSave → version Supabase définie plus haut

function saveSettings() {
  // Settings stockés en localStorage — pas de sync Supabase (évite erreurs FK/colonnes)
  try { localStorage.setItem('gp_settings_global', JSON.stringify(settings)); } catch(e) {}
}

// ╔══════════════════════════════════════════════════════════════╗
// ║              RÉAPPROVISIONNEMENT RAPIDE                       ║
// ╚══════════════════════════════════════════════════════════════╝

function openRestockModal() {
  if (!isSuperAdmin() && !hasPermission('stock','update')) { toast('⛔ Permission refusée', 'error'); return; }
  document.getElementById('reappro-search').value = '';
  document.getElementById('reappro-prod-id').value = '';
  document.getElementById('reappro-qty').value = '';
  document.getElementById('reappro-note').value = '';
  document.getElementById('reappro-selected').style.display = 'none';
  document.getElementById('reappro-btn-confirm').style.display = 'none';
  filterRestockList();
  openModal('modal-reappro');
  setTimeout(() => document.getElementById('reappro-search').focus(), 100);
}

function filterRestockList() {
  const q = document.getElementById('reappro-search').value.toLowerCase().trim();
  const list = document.getElementById('reappro-list');
  // Grouper les produits identiques — 1 ligne par produit unique
  const groupMap = new Map();
  products
    .filter(p => !q || p.name.toLowerCase().includes(q) || (p.code||'').toLowerCase().includes(q))
    .forEach(p => {
      const key = (p.code&&p.code.trim()) ? p.code.trim().toLowerCase() : `${p.name.trim().toLowerCase()}||${(p.category||'').toLowerCase()}`;
      if (!groupMap.has(key)) groupMap.set(key, { ...p, _total: p.stock, _variants: [p] });
      else { const g=groupMap.get(key); g._total+=p.stock; g._variants.push(p); }
    });

  const filtered = [...groupMap.values()].sort((a,b) => a.name.localeCompare(b.name)).slice(0,30);

  if (!filtered.length) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text2);font-size:13px;">Aucun produit trouvé</div>`;
    return;
  }

  list.innerHTML = filtered.map(g => {
    const displayStock = g._total;
    const totalLabel = g._variants.length > 1 ? ` (total: ${g._total})` : '';
    const localInfo = g._variants.length > 1
      ? g._variants.map(v => { const n=GP_LOCAUX_ALL.find(l=>l.id===v.local_id)?.nom||v.zone||'?'; return `${n}:${v.stock}`; }).join(' · ')
      : (g.zone||'');
    const statusColor = displayStock === 0 ? 'var(--red)' : displayStock < g.minStock ? 'var(--gold)' : 'var(--accent)';
    // Pour le restock, utiliser le variant de mon local (ou le premier)
    const targetId = g._variants[0].id;
    return `<div onclick="selectRestockProduct('${targetId}')" style="display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:.1s;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="flex:1;">
        <div style="font-weight:600;font-size:13px;">${escapeHTML(g.name)}</div>
        <div style="font-size:11px;color:var(--text2);">${g.code||''} ${localInfo ? '· '+localInfo : ''} · ${g.category||''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-family:var(--font-mono),monospace;font-weight:800;font-size:15px;color:${statusColor};">${displayStock}</div>
        <div style="font-size:10px;color:var(--text2);">en stock${totalLabel}</div>
      </div>
    </div>`;
  }).join('');
}

function selectRestockProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  document.getElementById('reappro-prod-id').value = id;
  const localNom = GP_LOCAUX_ALL.find(l => l.id === p.local_id)?.nom || p.zone || '';
  document.getElementById('reappro-prod-name').textContent = `📦 ${p.name}${p.code ? ' · ' + p.code : ''}${localNom ? ' · ' + localNom : ''}`;
  document.getElementById('reappro-selected').style.display = '';
  document.getElementById('reappro-btn-confirm').style.display = '';
  document.getElementById('reappro-list').innerHTML = '';
  document.getElementById('reappro-search').value = p.name;

  if (p.type === 'tailles' && p.sizes) {
    document.getElementById('reappro-qty-container').style.display = 'none';
    document.getElementById('reappro-qty').value = '0';
    document.getElementById('reappro-sizes-section').style.display = '';
    const sizesGrid = document.getElementById('reappro-sizes-grid');
    const allSizes = ['XS','S','M','L','XL','XXL','XXXL','34','36','38','40','42','44','46'];
    const existingSizes = Object.keys(p.sizes || {});
    const sizesToShow = existingSizes.length > 0 ? existingSizes : allSizes.slice(0,6);
    sizesGrid.innerHTML = sizesToShow.map(sz => `
      <div style="text-align:center;">
        <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:3px;">${sz}</div>
        <div style="font-size:10px;color:var(--accent);margin-bottom:3px;">actuel: ${p.sizes[sz]||0}</div>
        <input type="number" min="0" placeholder="0" id="reappro-sz-${sz}"
          style="width:56px;padding:5px;text-align:center;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--font-mono),monospace;font-size:13px;font-weight:700;">
      </div>`).join('');
    const totalSizes = Object.values(p.sizes||{}).reduce((a,b)=>a+b,0);
    document.getElementById('reappro-stock-cur').textContent = `${totalSizes} ${p.unit||'pièces'}`;
    setTimeout(() => { sizesGrid.querySelector('input')?.focus(); }, 100);
  } else if (p.type === 'couleurs' && p.colors) {
    // Réappro par couleur
    document.getElementById('reappro-qty-container').style.display = 'none';
    document.getElementById('reappro-qty').value = '0';
    document.getElementById('reappro-sizes-section').style.display = '';
    const sizesGrid = document.getElementById('reappro-sizes-grid');
    const existingColors = Object.keys(p.colors || {});
    const colorsToShow = existingColors.length > 0 ? existingColors : ['Noir','Blanc','Rouge','Bleu'];
    sizesGrid.innerHTML = colorsToShow.map(col => `
      <div style="text-align:center;">
        <div style="font-size:11px;font-weight:700;color:var(--accent);margin-bottom:3px;">🎨 ${col}</div>
        <div style="font-size:10px;color:var(--text2);margin-bottom:3px;">actuel: ${p.colors[col]||0}</div>
        <input type="number" min="0" placeholder="0" id="reappro-sz-${col}"
          style="width:60px;padding:5px;text-align:center;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--font-mono),monospace;font-size:13px;font-weight:700;">
      </div>`).join('');
    const totalColors = Object.values(p.colors||{}).reduce((a,b)=>a+b,0);
    document.getElementById('reappro-stock-cur').textContent = `${totalColors} ${p.unit||'pièces'}`;
    setTimeout(() => { sizesGrid.querySelector('input')?.focus(); }, 100);
  } else {
    // Produit normal
    document.getElementById('reappro-qty-container').style.display = '';
    document.getElementById('reappro-sizes-section').style.display = 'none';
    document.getElementById('reappro-stock-cur').textContent = `${p.stock} ${p.unit||'unités'}`;
    document.getElementById('reappro-qty').value = '';
    document.getElementById('reappro-qty').focus();
  }
}

async function confirmRestock() {
  if (!isSuperAdmin() && !hasPermission('stock', 'update')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  const id = document.getElementById('reappro-prod-id').value;
  if (!id) { toast('Sélectionnez un produit', 'error'); return; }

  const p = products.find(x => x.id === id);
  if (!p) return;

  if ((p.type === 'tailles' && p.sizes) || (p.type === 'couleurs' && p.colors)) {
    const sizesGrid = document.getElementById('reappro-sizes-grid');
    const inputs = sizesGrid.querySelectorAll('input[id^="reappro-sz-"]');
    let totalAdded = 0;
    inputs.forEach(inp => {
      const key = inp.id.replace('reappro-sz-', '');
      const qty = parseInt(inp.value) || 0;
      if (qty > 0) {
        if (p.type === 'tailles') { p.sizes[key] = (p.sizes[key] || 0) + qty; }
        else { p.colors[key] = (p.colors[key] || 0) + qty; }
        totalAdded += qty;
      }
    });
    if (totalAdded === 0) { toast('Entrez au moins une quantité', 'error'); return; }
    p.stock = p.type === 'tailles'
      ? Object.values(p.sizes).reduce((a,b) => a+b, 0)
      : Object.values(p.colors).reduce((a,b) => a+b, 0);
    p.lastRestock = new Date().toISOString();
    save();
    closeModal('modal-reappro');
    renderStockTable(); updateAlertCount();
    toast(`✅ +${totalAdded} pièces (tailles) ajoutées à "${p.name}" → stock total: ${p.stock}`, 'success');
  } else {
    const qty = parseFloat(document.getElementById('reappro-qty').value);
    if (!qty || qty <= 0) { toast('Quantité invalide', 'error'); return; }
    p.stock += qty;
    p.lastRestock = new Date().toISOString();
    save();
    closeModal('modal-reappro');
    renderStockTable(); updateAlertCount();
    toast(`✅ +${qty} ${p.unit||'unités'} ajouté à "${p.name}" → stock: ${p.stock}`, 'success');
  }
}

// ╔══════════════════════════════════════════════════════════════╗
// ║              CONTRAT DE TRAVAIL — DROIT MAROCAIN             ║
// ╚══════════════════════════════════════════════════════════════╝

function openContratModal(empId) {
  // Peupler la liste des employés
  const sel = document.getElementById('ct-emp');
  sel.innerHTML = '<option value="">— Sélectionner —</option>' +
    employes.map(e => `<option value="${e.id}" ${e.id===empId?'selected':''}>${escapeHTML(e.name)}${e.prenom?' '+e.prenom:''} — ${e.poste||'N/A'}</option>`).join('');

  // Pré-remplir depuis les données employé
  if (empId) {
    const e = employes.find(x => x.id === empId);
    if (e) {
      document.getElementById('ct-type').value        = e.contrat || 'CDI';
      document.getElementById('ct-date-debut').value  = e.dateEmbauche || '';
      document.getElementById('ct-salaire-brut').value= e.salaire ? Math.round(e.salaire * 1.2) : ''; // net → brut approx
      document.getElementById('ct-lieu').value        = e.local || settings.storeAddress || '';
    }
  }
  document.getElementById('ct-date-fin').value = '';
  document.getElementById('ct-avantages').value = '';
  document.getElementById('ct-horaire').value  = '44 heures / semaine';
  document.getElementById('ct-essai').value    = '';
  toggleContratFields();
  openModal('modal-contrat');
}

function toggleContratFields() {
  const type = document.getElementById('ct-type').value;
  const finGroup = document.getElementById('ct-date-fin-group');
  const finLabel = document.getElementById('ct-fin-label');
  const needsEndDate = ['CDD','Stage','Apprentissage','Interim'].includes(type);
  finGroup.style.opacity = needsEndDate ? '1' : '0.4';
  finLabel.textContent = needsEndDate ? '(obligatoire)' : '(CDI : indéterminée)';
}

function updateContratFields() {
  const empId = document.getElementById('ct-emp').value;
  if (!empId) return;
  const e = employes.find(x => x.id === empId);
  if (!e) return;
  if (e.contrat) document.getElementById('ct-type').value = e.contrat;
  if (e.dateEmbauche) document.getElementById('ct-date-debut').value = e.dateEmbauche;
  if (e.salaire) document.getElementById('ct-salaire-brut').value = Math.round(e.salaire * 1.2);
  if (e.local) document.getElementById('ct-lieu').value = e.local;
  toggleContratFields();
}

function genererContrat() {
  const empId     = document.getElementById('ct-emp').value;
  const type      = document.getElementById('ct-type').value;
  const dateDebut = document.getElementById('ct-date-debut').value;
  const dateFin   = document.getElementById('ct-date-fin').value;
  const salBrut   = parseFloat(document.getElementById('ct-salaire-brut').value) || 0;
  const essai     = document.getElementById('ct-essai').value;
  const horaire   = document.getElementById('ct-horaire').value || '44 heures / semaine';
  const lieu      = document.getElementById('ct-lieu').value;
  const avantages = document.getElementById('ct-avantages').value;

  if (!empId) { toast('Sélectionnez un employé', 'error'); return; }
  if (!dateDebut) { toast('Date de début obligatoire', 'error'); return; }
  if (['CDD','Stage','Interim'].includes(type) && !dateFin) { toast('Date de fin obligatoire pour ce type de contrat', 'error'); return; }

  const emp  = employes.find(x => x.id === empId);
  if (!emp) return;

  const store    = settings.storeName || 'GestionPro';
  const logo     = settings.storeLogo ? `<img src="${settings.storeLogo}" style="height:60px;object-fit:contain;">` : `<div style="font-size:22px;font-weight:700;color:#2563eb;">${store}</div>`;
  const today    = new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
  const fmtDate  = d => d ? new Date(d).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}) : '—';

  // Calculs légaux marocains
  const smig      = 2828.71; // SMIG 2024 (MAD/mois)
  const cnssEmp   = (salBrut * 0.0448).toFixed(2);   // CNSS salarié 4.48%
  const cnssPatr  = (salBrut * 0.2097).toFixed(2);   // CNSS patronal 20.97%
  const amoEmp    = (salBrut * 0.0226).toFixed(2);   // AMO salarié 2.26%
  const amoPatr   = (salBrut * 0.0198).toFixed(2);   // AMO patronal 1.98%
  const ipp       = calcIGR(salBrut);                 // IR/IGR simplifié
  const salNet    = (salBrut - parseFloat(cnssEmp) - parseFloat(amoEmp) - ipp).toFixed(2);

  const typeLabels = {
    CDI:'Contrat à Durée Indéterminée (CDI)',
    CDD:'Contrat à Durée Déterminée (CDD)',
    Stage:'Contrat de Stage',
    Apprentissage:"Contrat d'Apprentissage",
    Interim:"Contrat d'Intérim",
    ANAPEC:'Contrat ANAPEC'
  };

  // Clauses légales selon type
  const clausesDuree = type === 'CDI'
    ? `<p>Le présent contrat est conclu pour une <strong>durée indéterminée</strong> conformément aux dispositions de l'article 16 du Code du Travail marocain (Loi 65-99).</p>`
    : type === 'CDD'
    ? `<p>Le présent contrat est conclu pour une <strong>durée déterminée</strong> allant du <strong>${fmtDate(dateDebut)}</strong> au <strong>${fmtDate(dateFin)}</strong>, conformément à l'article 16 du Code du Travail. Le renouvellement ne peut s'effectuer plus d'une fois, la durée totale ne pouvant dépasser 2 ans.</p>`
    : type === 'Stage'
    ? `<p>Le présent contrat de stage est conclu pour la période du <strong>${fmtDate(dateDebut)}</strong> au <strong>${fmtDate(dateFin)}</strong>. Il n'ouvre pas droit aux indemnités de licenciement ni aux allocations chômage.</p>`
    : `<p>Contrat du <strong>${fmtDate(dateDebut)}</strong> au <strong>${fmtDate(dateFin)}</strong>.</p>`;

  const clauseEssai = essai
    ? `<p>Le présent contrat est soumis à une <strong>période d'essai de ${essai}</strong>, renouvelable une fois, conformément à l'article 13 du Code du Travail.</p>`
    : '';

  const clauseConges = `<p>Le salarié bénéficie d'un congé annuel payé de <strong>18 jours ouvrables</strong> par an (1,5 jour par mois de service effectif), conformément aux articles 231 à 251 du Code du Travail. Ce droit est augmenté de 1,5 jour par période de 5 ans d'ancienneté.</p>`;

  const clauseHoraire = `<p>La durée normale du travail est fixée à <strong>${horaire}</strong>, conformément aux articles 184 et suivants du Code du Travail. Toute heure supplémentaire sera rémunérée avec une majoration de 25% (jours ouvrables) ou 50% (jours fériés/nuit).</p>`;

  const clauseResiliation = type === 'CDI'
    ? `<p><strong>Résiliation :</strong> En cas de rupture du contrat, un préavis doit être respecté : 8 jours (moins de 1 an d'ancienneté), 1 mois (1 à 5 ans), 2 mois (5 à 10 ans), 3 mois (plus de 10 ans), conformément à l'article 43 du Code du Travail.</p>`
    : `<p><strong>Fin de contrat :</strong> À l'échéance du terme, le contrat prend fin de plein droit. Une indemnité de fin de contrat de 5% du salaire brut perçu sera versée, sauf cas de faute grave.</p>`;

  const avantagesHtml = avantages
    ? `<div class="section"><h3>ARTICLE 7 — AVANTAGES ET CLAUSES SPÉCIALES</h3><p>${avantages.replace(/\n/g,'<br>')}</p></div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Contrat de Travail — ${emp.name}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', serif; max-width: 750px; margin: 0 auto; padding: 30px; color: #1a1a1a; font-size: 13px; line-height: 1.7; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px double #2563eb; padding-bottom: 16px; margin-bottom: 20px; }
  .doc-title { text-align: center; font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; padding: 14px 0; border-top: 2px solid #1a1a1a; border-bottom: 2px solid #1a1a1a; margin: 20px 0; }
  .parties { background: #f0fdf8; border: 1px solid #2563eb; border-radius: 6px; padding: 16px; margin: 16px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .partie-box { font-size: 12px; }
  .partie-box strong { display: block; font-size: 13px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; }
  .section { margin: 18px 0; }
  .section h3 { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #00557a; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }
  .table-sal { width: 100%; border-collapse: collapse; font-size: 12px; margin: 10px 0; }
  .table-sal th { background: #2563eb; color: #fff; padding: 6px 10px; text-align: left; }
  .table-sal td { padding: 6px 10px; border-bottom: 1px solid #eee; }
  .table-sal tr:last-child td { font-weight: 700; background: #f7fdf9; }
  .sig-area { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; }
  .sig-box { text-align: center; font-size: 11px; }
  .sig-line { border-top: 1px solid #999; margin-top: 50px; padding-top: 6px; }
  .legal-note { background: #fffbec; border-left: 3px solid var(--gold); padding: 8px 12px; font-size: 11px; color: #555; margin: 12px 0; }
  @media print { body { padding: 15px; } .no-print { display: none; } }
</style>
</head>
<body>

<div class="header">
  ${logo}
  <div style="text-align:right;font-size:11px;color:#666;">
    <div>${store}</div>
    <div>${settings.storeAddress||''}</div>
    <div>${settings.storePhone||''}</div>
    ${settings.storeIce ? `<div>ICE : ${settings.storeIce}</div>` : ''}
    <div style="margin-top:6px;"><strong>Fait à :</strong> ${lieu||settings.storeAddress||'—'}</div>
    <div><strong>Le :</strong> ${today}</div>
  </div>
</div>

<div class="doc-title">${typeLabels[type]}</div>

<div class="legal-note">
  📋 Établi conformément au <strong>Code du Travail marocain (Loi n° 65-99)</strong> et ses textes d'application.
</div>

<div class="section">
  <h3>ENTRE LES SOUSSIGNÉS</h3>
  <div class="parties">
    <div class="partie-box">
      <strong>L'Employeur</strong>
      <div><strong>Dénomination :</strong> ${store}</div>
      <div><strong>Adresse :</strong> ${settings.storeAddress||'—'}</div>
      <div><strong>Téléphone :</strong> ${settings.storePhone||'—'}</div>
      <div><strong>ICE :</strong> ${settings.storeIce||'—'}</div>
      <div>Ci-après désigné <strong>« L'Employeur »</strong></div>
    </div>
    <div class="partie-box">
      <strong>Le Salarié</strong>
      <div><strong>Nom & Prénom :</strong> ${escapeHTML(emp.name)} ${escapeHTML(emp.prenom||'')}</div>
      <div><strong>CIN :</strong> ${emp.cin||'—'}</div>
      <div><strong>Tél :</strong> ${emp.tel||'—'}</div>
      <div><strong>Email :</strong> ${emp.email||'—'}</div>
      <div>Ci-après désigné <strong>« Le Salarié »</strong></div>
    </div>
  </div>
  <p style="font-size:12px;"><strong>Il a été convenu et arrêté ce qui suit :</strong></p>
</div>

<div class="section">
  <h3>ARTICLE 1 — ENGAGEMENT ET DURÉE</h3>
  ${clausesDuree}
  ${clauseEssai}
</div>

<div class="section">
  <h3>ARTICLE 2 — POSTE ET LIEU DE TRAVAIL</h3>
  <p>Le Salarié est engagé en qualité de <strong>${emp.poste||'—'}</strong>${emp.dept ? `, département <strong>${emp.dept}</strong>` : ''}, à exercer ses fonctions au <strong>${lieu||'siège social'}</strong> de l'Employeur.</p>
  <p>L'Employeur se réserve le droit de modifier le lieu de travail en cas de nécessité, dans le respect des dispositions légales.</p>
</div>

<div class="section">
  <h3>ARTICLE 3 — DURÉE ET HORAIRES DU TRAVAIL</h3>
  ${clauseHoraire}
</div>

<div class="section">
  <h3>ARTICLE 4 — RÉMUNÉRATION</h3>
  ${salBrut > 0 ? `
  <table class="table-sal">
    <thead><tr><th>Élément</th><th>Montant (MAD)</th><th>Base légale</th></tr></thead>
    <tbody>
      <tr><td>Salaire brut mensuel</td><td>${salBrut.toLocaleString('fr-MA')} MAD</td><td>—</td></tr>
      <tr><td>Cotisation CNSS (salarié 4.48%)</td><td>- ${cnssEmp} MAD</td><td>Dahir n° 1-72-184</td></tr>
      <tr><td>Cotisation AMO (salarié 2.26%)</td><td>- ${amoEmp} MAD</td><td>Loi 65-00</td></tr>
      <tr><td>IR / IGR (estimé)</td><td>- ${ipp.toFixed(2)} MAD</td><td>Art. 57 CGI</td></tr>
      <tr><td><strong>Salaire NET estimé</strong></td><td><strong>${salNet} MAD</strong></td><td></td></tr>
    </tbody>
  </table>
  <p style="font-size:11px;color:#666;">* L'IR est estimatif. Charges patronales CNSS (20.97%) et AMO (1.98%) à la charge de l'Employeur.</p>
  <p>Le salaire sera versé <strong>mensuellement</strong>, au plus tard le dernier jour ouvrable du mois, par virement ou espèces contre reçu signé.</p>
  <p>Note : Le SMIG national en vigueur est de <strong>${smig.toLocaleString('fr-MA')} MAD/mois</strong>. La rémunération ne peut en aucun cas être inférieure à ce montant.</p>
  ` : `<p>La rémunération sera fixée d'un commun accord et ne pourra être inférieure au SMIG en vigueur (${smig.toLocaleString('fr-MA')} MAD/mois).</p>`}
</div>

<div class="section">
  <h3>ARTICLE 5 — CONGÉS ANNUELS</h3>
  ${clauseConges}
</div>

<div class="section">
  <h3>ARTICLE 6 — RÉSILIATION ET PRÉAVIS</h3>
  ${clauseResiliation}
  <p>En cas de licenciement abusif, le Salarié a droit à des dommages et intérêts conformément à l'article 41 du Code du Travail.</p>
</div>

${avantagesHtml}

<div class="section">
  <h3>ARTICLE ${avantages ? '8' : '7'} — RÈGLEMENT INTÉRIEUR ET OBLIGATIONS</h3>
  <p>Le Salarié s'engage à respecter le règlement intérieur de l'Entreprise, à observer la confidentialité sur les informations dont il aurait connaissance dans l'exercice de ses fonctions, et à ne pas exercer d'activité concurrente pendant la durée du présent contrat.</p>
</div>

<div class="section">
  <h3>ARTICLE ${avantages ? '9' : '8'} — LITIGES</h3>
  <p>Tout litige relatif à l'exécution ou à la résiliation du présent contrat sera soumis, à défaut d'accord amiable, à la compétence des <strong>juridictions marocaines compétentes</strong>, conformément aux dispositions du Code du Travail et du Code de Procédure Civile.</p>
</div>

<p style="margin-top:20px;font-size:12px;"><strong>Fait en deux exemplaires originaux</strong>, dont un remis à chaque partie.</p>

<div class="sig-area">
  <div class="sig-box">
    <div style="font-weight:700;">L'EMPLOYEUR</div>
    <div style="color:#555;font-size:11px;">${store}</div>
    <div class="sig-line">Signature et cachet</div>
  </div>
  <div class="sig-box">
    <div style="font-weight:700;">LE SALARIÉ</div>
    <div style="color:#555;font-size:11px;">${escapeHTML(emp.name)} ${escapeHTML(emp.prenom||'')}</div>
    <div style="font-size:10px;color:#888;margin-top:4px;">(Précédé de la mention manuscrite « Lu et approuvé »)</div>
    <div class="sig-line">Signature</div>
  </div>
</div>

<script>window.print();<\/script>
</body></html>`;

  closeModal('modal-contrat');
  // Générer via Blob URL — beaucoup plus rapide que document.write
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (!win) { toast('⚠️ Popup bloqué — autorisez les popups pour ce site', 'warn'); URL.revokeObjectURL(url); return; }
  // Libérer la mémoire après ouverture
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('📄 Contrat généré !', 'success');
}

// Calcul IR/IGR simplifié Maroc (barème annuel → mensuel)
function calcIGR(salBrut) {
  const cnss = salBrut * 0.0448;
  const amo  = salBrut * 0.0226;
  const base = salBrut - cnss - amo;
  const ann  = base * 12;
  let ir = 0;
  if      (ann <= 30000)  ir = 0;
  else if (ann <= 50000)  ir = (ann - 30000) * 0.10;
  else if (ann <= 60000)  ir = 2000 + (ann - 50000) * 0.20;
  else if (ann <= 80000)  ir = 4000 + (ann - 60000) * 0.30;
  else if (ann <= 180000) ir = 10000 + (ann - 80000) * 0.34;
  else                    ir = 44000 + (ann - 180000) * 0.38;
  // Déduction forfaitaire frais professionnels 20% plafonnée
  const deduct = Math.min(base * 0.20 * 12, 30000);
  ir = Math.max(0, ir - deduct * (ir / ann || 0));
  return ir / 12;
}

// ╔══════════════════════════════════════════════════════════════╗
// ║              SYNCHRONISATION TEMPS RÉEL (SUPABASE)           ║
// ╚══════════════════════════════════════════════════════════════╝

// ╔══════════════════════════════════════════════════════════════╗
// ║              SYNCHRONISATION POLLING (30s)                    ║
// ╚══════════════════════════════════════════════════════════════╝

let _pollInterval   = null;
let _pollActive     = false;
let _lastSaveTime   = 0;    // timestamp du dernier save() local
let _sessionId      = 'S' + Date.now() + Math.random().toString(36).slice(2,6);
let _lastSaveIds    = new Set(); // IDs sauvegardés récemment (pour ignorer nos propres events Realtime)

// ── SUPABASE REALTIME ─────────────────────────────────────────
let _rtChannels = [];
