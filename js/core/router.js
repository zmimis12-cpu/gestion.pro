/* ================================================================
   GestionPro — core/router.js
   Navigation : navigate(), topbarAction(), updateDate()
   Dépend de: auth.js, permissions.js
================================================================ */

function updateDate() {
  const now = new Date();
  document.getElementById('topbar-date').textContent =
    now.toLocaleDateString(currentLang === 'ar' ? 'ar-MA' : 'fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) +
    ' — ' + now.toLocaleTimeString(currentLang === 'ar' ? 'ar-MA' : 'fr-FR', { hour:'2-digit', minute:'2-digit' });
}
setInterval(updateDate, 1000);
updateDate();

// ─── NAVIGATION ───
function navigate(page) {
  // Vérifier session active (sauf page login)
  if (page !== 'login' && page !== 'dashboard' && !GP_USER) {
    console.warn('[Nav] Tentative accès sans session:', page);
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  // Trouver le bon nav-item par son onclick — insensible aux items cachés
  document.querySelectorAll('.nav-item[onclick]').forEach(el => {
    const match = el.getAttribute('onclick').match(/navigate\('([^']+)'\)/);
    if (match && match[1] === page) el.classList.add('active');
  });

  // Charger données owner-admin si nécessaire
  if (page === 'owner-admin') {
    if (!isOwner()) { navigate('dashboard'); return; } // BLOQUER accès non-owner
    loadOAData();
  }

  // ── Caisse : forcer choix du local si accès global ──
  if (page === 'caisse' && isSuperAdmin() && !SA_ACTIVE_LOCAL) {
    openCaisseLocalModal();
  }

  const titles = { depenses:'💸 Gestion des Dépenses', dashboard:'Tableau de bord', caisse:'Caisse & Ventes', conteneurs:'Gestion Conteneurs', commandes:'Ordres & Ventes', docscont:'Documents Conteneurs', retours:'↩️ Gestion des Retours', fonds:'Fonds de Caisse', stock:'Gestion du Stock', locaux:'Gestion des Locaux / Zones', clients:'Gestion Clients', alerts:'Alertes & Notifications', settings:'Paramètres', superadmin:'👑 Super Admin — Panneau Central', 'owner-admin':'🏢 Mes Clients GestionPro', employes:'👨‍💼 Gestion des Employés', conges:'🏖️ Gestion des Congés', livraisons:'🚚 Bons de Livraison', 'docs-rh':'📋 Documents RH', 'docs-admin':'🏢 Documents Administratifs' };
  document.getElementById('page-title').textContent = titles[page] || page;

  // Actions topbar filtrées par RBAC
  const actionsDef = {
    dashboard: { perm: ['caisse','read'], icon:'➕', text:'Nouvelle vente', fn: () => navigate('caisse') },
    caisse:    { perm: null,              icon:'🔄', text:'Réinitialiser',  fn: () => clearCart() },
    stock:     { perm: ['stock','create'],icon:'➕', text:'Nouveau produit', fn: () => openModal('modal-add-product') },
    clients:   { perm: ['clients','create'],icon:'➕', text:'Nouveau client', fn: () => openModal('modal-add-client') },
    alerts:    { perm: null,              icon:'🔄', text:'Actualiser',     fn: () => renderAlerts() },
    fonds:     { perm: null,              icon:'🔄', text:'Actualiser',     fn: () => renderFonds() },
    conteneurs:{ perm: ['conteneurs','create'], icon:'🚢', text:t('cont_new_btn').replace('🚢 ',''), fn: () => openModal('modal-conteneur') },
    commandes: { perm: null,              icon:'🔄', text:'Actualiser',     fn: () => renderCommandes() },
    docscont:  { perm: null,              icon:'🔄', text:'Actualiser',     fn: () => renderOrdres() },
    locaux:    { perm: null,              icon:'🏪', text:'Nouveau local',  fn: () => openNewLocal() },
    settings:  { perm: ['settings','update'], icon:'💾', text:'Enregistrer', fn: () => saveAllSettings() },
    employes:  { perm: ['employes','create'], icon:'➕', text:'Nouvel employé', fn: () => openEmployeModal() },
    conges:    { perm: ['conges','create'],    icon:'➕', text:'Nouveau congé',  fn: () => openCongeModal() },
    livraisons:{ perm: ['livraisons','create'],icon:'🚚', text:'Nouveau bon',    fn: () => openBLModal() },
    'docs-rh': { perm: ['docs_rh','create'],  icon:'📄', text:'Générer document', fn: () => genererDocRH() },
    'docs-admin':{ perm: ['docs_admin','create'], icon:'🏢', text:'Nouveau document', fn: () => {} },
    'depenses':  { perm: null, icon:'➕', text:'Nouvelle dépense', fn: () => { document.getElementById('dep-montant')?.focus(); } },
  };
  const actionDef = actionsDef[page];
  const topbarBtn = document.getElementById('topbar-action');
  if (actionDef && (actionDef.perm === null || isSuperAdmin() || hasPermission(actionDef.perm[0], actionDef.perm[1]))) {
    document.getElementById('topbar-action-icon').textContent = actionDef.icon;
    document.getElementById('topbar-action-text').textContent = actionDef.text;
    if (topbarBtn) topbarBtn.style.display = '';
  } else {
    if (topbarBtn) topbarBtn.style.display = 'none';
  }

  if (page === 'caisse') { renderProductGrid(); renderCategoryFilters(); updateCartTvaUI(); }
  if (page === 'stock') renderStockTable();
  if (page === 'locaux') { loadSAData().then(() => renderLocaux()); }
  if (page === 'clients') renderClients();
  if (page === 'alerts') renderAlerts();
  if (page === 'fonds') renderFonds();
  if (page === 'conteneurs') renderConteneurs();
  if (page === 'commandes') renderCommandes();
  if (page === 'docscont') renderOrdres();
  if (page === 'dashboard') renderDashboard();
  if (page === 'settings') loadSettingsForm();
  if (page === 'superadmin') renderSuperAdmin();
  if (page === 'employes') renderEmployes();
  if (page === 'conges') renderConges();
  if (page === 'livraisons') renderLivraisons();
  if (page === 'docs-rh') renderDocsRH();
  if (page === 'depenses') renderDepenses();
  if (page === 'docs-admin') {}
  // Apply lang to dynamic elements after page switch
  setTimeout(() => applyLang(), 30);
}

function topbarAction() {
  const page = document.querySelector('.page.active').id.replace('page-', '');
  const actions = {
    dashboard: () => { if (isSuperAdmin() || hasPermission('caisse','read')) navigate('caisse'); else toast('Accès refusé','error'); },
    caisse:    () => clearCart(),
    stock:     () => { if (isSuperAdmin() || hasPermission('stock','create')) openModal('modal-add-product'); },
    clients:   () => { if (isSuperAdmin() || hasPermission('clients','create')) openModal('modal-add-client'); },
    alerts:    () => renderAlerts(),
    fonds:     () => renderFonds(),
    conteneurs:() => { if (isSuperAdmin() || hasPermission('conteneurs','create')) openModal('modal-conteneur'); },
    employes:  () => { if (isSuperAdmin() || hasPermission('employes','create')) openEmployeModal(); },
    conges:    () => { if (isSuperAdmin() || hasPermission('conges','create')) openCongeModal(); },
    livraisons:() => { if (isSuperAdmin() || hasPermission('livraisons','create')) openBLModal(); },
    'docs-rh': () => { if (isSuperAdmin() || hasPermission('docs_rh','create')) genererDocRH(); },
    settings:  () => { if (isSuperAdmin() || hasPermission('settings','update')) saveAllSettings(); },
  };
  actions[page]?.();
}

// ─── LOCAUX : utilitaires ────────────────────────────────────────────────────
