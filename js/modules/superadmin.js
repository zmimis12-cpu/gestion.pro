/* ================================================================
   GestionPro — modules/superadmin.js
   Super Admin Panel : renderSuperAdmin, renderSADash, saTab,
   fixOrphanData, saSelectLocal, saResetAllData,
   renderSALocaux, openSALocalModal, saveSALocal, deleteSALocal,
   renderSAUsers, updateSAUserLocalVisibility, openSAUserModal,
   saveSAUser, deleteSAUser, renderSARoles, _renderSARolesList,
   selectSARole, _renderSAPermsPanel, togglePermission,
   resetRolePerms, openSARoleModal, saveSARole, deleteSARole,
   resetAllRolePerms, saveSAData, renderSAVue
================================================================ */

function renderSuperAdmin() {
  if (!isSuperAdmin()) { toast('Accès refusé', 'error'); return; }
  saTab(SA_CURRENT_TAB || 'dash');
}

function resetAllRolePerms() {
  if (!isSuperAdmin()) { toast('⛔ Accès refusé', 'error'); return; }
  if (!confirm('Réinitialiser TOUTES les permissions aux valeurs par défaut ?')) return;
  if (!confirm('Dernière confirmation — cette action écrase vos permissions personnalisées.')) return;
  GP_ROLES = {};
  saveRoles();
  toast('✅ Toutes les permissions réinitialisées aux valeurs par défaut');
  if (SA_SELECTED_ROLE) _renderSAPermsPanel(SA_SELECTED_ROLE);
  _renderSARolesList();
}

async function saveSAUser() {
  if (!isSuperAdmin()) { toast("⛔ Accès refusé", "error"); return; }
  const id      = document.getElementById('sau-id').value;
  const nom     = document.getElementById('sau-nom').value.trim();
  const email   = document.getElementById('sau-email').value.trim().toLowerCase();
  const pwd     = document.getElementById('sau-pwd').value;
  const role    = document.getElementById('sau-role').value;
  const localId = document.getElementById('sau-local').value;
  const actif   = document.getElementById('sau-actif').value === '1';

  if (!nom || !email) { toast('Nom et email obligatoires', 'error'); return; }
  if (!id && !pwd) { toast('Mot de passe obligatoire pour un nouvel utilisateur', 'error'); return; }
  if (pwd && pwd.length < 4) { toast('Mot de passe minimum 4 caractères', 'error'); return; }

  const roleObj = getRole(role);
  if (roleObj?.localRequired !== false && !localId) {
    toast('Ce rôle nécessite un local assigné', 'error'); return;
  }

  const existing = GP_USERS_ALL.find(u => u.email === email && u.id !== id);
  if (existing) { toast('Email déjà utilisé', 'error'); return; }

  const saveBtnEl = document.querySelector('#modal-sa-user .btn-primary');
  if (saveBtnEl) { saveBtnEl.disabled = true; saveBtnEl.textContent = '⏳ Enregistrement...'; }
  const restoreBtn = () => { if (saveBtnEl) { saveBtnEl.disabled = false; saveBtnEl.textContent = '✅ Enregistrer'; } };

  if (!id) {
    // ── Nouvel utilisateur → Edge Function (crée Auth + gp_users) ──
    try {
      const efRes = await fetch(`${SUPABASE_URL}/functions/v1/create-tenant-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({
          email, password: pwd,
          tenantId: GP_TENANT.id,
          nom, role, local_id: localId || null
        })
      });
      const efData = await efRes.json();
      if (!efRes.ok || !efData.success) throw new Error(efData.error || 'Erreur création compte');

      // Mettre à jour role et local dans gp_users
      await sb.from('gp_users')
        .update({ role, local_id: localId || null, actif })
        .eq('auth_id', efData.auth_id);

      await loadSAData();
      closeModal('modal-sa-user');
      toast(`✅ Utilisateur "${nom}" créé`);
      renderSAUsers();
      renderSADash();
    } catch(e) {
      toast('❌ Erreur: ' + e.message, 'error');
      restoreBtn();
    }
    return;
  }

  // ── Modification utilisateur existant ──
  const obj = {
    nom, email, role,
    prenom:    document.getElementById('sau-prenom').value.trim(),
    telephone: document.getElementById('sau-tel').value.trim(),
    local_id:  localId || null,
    actif
  };

  // Mettre à jour mot de passe Auth si nouveau pwd fourni
  if (pwd) {
    const user = GP_USERS_ALL.find(u => u.id === id);
    if (user?.auth_id) {
      try {
        const pwdRes = await fetch(`${SUPABASE_URL}/functions/v1/create-tenant-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
          body: JSON.stringify({ action: 'updatePassword', auth_id: user.auth_id, password: pwd, tenantId: GP_TENANT.id })
        });
        const pwdData = await pwdRes.json();
        if (!pwdRes.ok || !pwdData.success) {
          toast('⚠️ Profil mis à jour mais mot de passe non changé: ' + (pwdData.error || 'Erreur Edge Function'), 'warn');
        }
      } catch(e) {
        toast('⚠️ Profil mis à jour mais mot de passe non changé: ' + e.message, 'warn');
      }
    }
  }

  const { error } = await sb.from('gp_users').update(obj).eq('id', id);
  if (error) { toast('❌ Erreur: ' + error.message, 'error'); return; }

  const idx = GP_USERS_ALL.findIndex(u => u.id === id);
  if (idx >= 0) GP_USERS_ALL[idx] = { ...GP_USERS_ALL[idx], ...obj };

  closeModal('modal-sa-user');
  toast(`✅ Utilisateur "${nom}" mis à jour`);
  renderSAUsers();
  renderSADash();
}

async function deleteSAUser(id) {
  if (!isSuperAdmin()) { toast('⛔ Accès refusé', 'error'); return; }
  const u = GP_USERS_ALL.find(x => x.id === id);
  if (!confirm(`Supprimer l'utilisateur "${u?.nom || u?.name}" ?`)) return;
  const { error } = await sb.from('gp_users').delete().eq('id', id);
  if (error) { toast('❌ Erreur: ' + error.message, 'error'); return; }
  GP_USERS_ALL = GP_USERS_ALL.filter(x => x.id !== id);
  toast('🗑️ Utilisateur supprimé');
  renderSAUsers();
  renderSADash();
}

async function renderSAVue() {
  const localSel  = document.getElementById('sa-vue-local')?.value || 'all';
  const module    = document.getElementById('sa-vue-module')?.value || 'ventes';

  const sel = document.getElementById('sa-vue-local');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="all">🌐 Tous les locaux</option>' +
      GP_LOCAUX_ALL.map(l => `<option value="${l.id}" ${cur===l.id?'selected':''}>${escapeHTML(l.nom)}</option>`).join('');
  }

  const locsToShow = localSel === 'all' ? GP_LOCAUX_ALL : GP_LOCAUX_ALL.filter(l => l.id === localSel);
  const container  = document.getElementById('sa-vue-content');
  if (!container) return;

  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2);">⏳ Chargement...</div>';

  try {
    const locIds = locsToShow.map(l => l.id);
    if (locIds.length === 0) { container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2);">Aucun local</div>'; return; }

    if (module === 'ventes') {
      const { data: rows } = await sb.from('gp_sales').select('*').eq('tenant_id', tid).in('local_id', locIds).order('date', {ascending: false}).limit(100);
      const enriched = (rows||[]).map(v => ({ ...v, _loc: GP_LOCAUX_ALL.find(l => l.id === v.local_id) || {nom:'—',couleur:'var(--accent)'} }));
      container.innerHTML = `<div class="card"><div class="card-header">💰 Ventes — ${enriched.length} transaction(s)</div>
        <table><thead><tr><th>Local</th><th>Date</th><th>Client</th><th>Mode</th><th>Total</th></tr></thead>
        <tbody>${enriched.map(v => `<tr>
          <td><span style="color:${v._loc.couleur||'var(--accent)'};">● ${v._loc.nom}</span></td>
          <td style="font-size:11px;">${v.date ? new Date(v.date).toLocaleDateString('fr-FR') : '—'}</td>
          <td>${v.client_name||'—'}</td><td>${v.payment||'—'}</td>
          <td style="font-weight:700;color:var(--accent);">${(v.total||0).toFixed(2)} MAD</td>
        </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text2);">Aucune vente</td></tr>'}
        </tbody></table></div>`;

    } else if (module === 'stock') {
      const { data: rows } = await sb.from('gp_products').select('*').eq('tenant_id', tid).in('local_id', locIds).order('name').limit(200);
      const enriched = (rows||[]).map(p => ({ ...p, _loc: GP_LOCAUX_ALL.find(l => l.id === p.local_id) || {nom:'—',couleur:'var(--accent)'} }));
      container.innerHTML = `<div class="card"><div class="card-header">📦 Stock Global — ${enriched.length} produit(s)</div>
        <table><thead><tr><th>Local</th><th>Produit</th><th>Catégorie</th><th>Stock</th><th>Prix</th><th>Statut</th></tr></thead>
        <tbody>${enriched.map(p => {
          const st = p.stock === 0 ? '🔴 Rupture' : p.stock < p.min_stock ? '🟡 Bas' : '🟢 OK';
          return `<tr>
            <td><span style="color:${p._loc.couleur||'var(--accent)'};">● ${p._loc.nom}</span></td>
            <td><strong>${escapeHTML(p.name)}</strong></td><td>${p.category||'—'}</td>
            <td style="font-family:var(--font-mono),monospace;">${p.stock}</td>
            <td style="font-family:var(--font-mono),monospace;">${(p.price||0).toFixed(2)} MAD</td>
            <td>${st}</td></tr>`;
        }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text2);">Aucun produit</td></tr>'}
        </tbody></table></div>`;

    } else if (module === 'employes') {
      const { data: rows } = await sb.from('gp_employes').select('*').eq('tenant_id', tid).in('local_id', locIds).order('name');
      const enriched = (rows||[]).map(e => ({ ...e, _loc: GP_LOCAUX_ALL.find(l => l.id === e.local_id) || {nom:'—',couleur:'var(--accent)'} }));
      container.innerHTML = `<div class="card"><div class="card-header">👨‍💼 Employés Global — ${enriched.length} employé(s)</div>
        <table><thead><tr><th>Local</th><th>Nom</th><th>Poste</th><th>Téléphone</th><th>CIN</th><th>Statut</th></tr></thead>
        <tbody>${enriched.map(e => `<tr>
          <td><span style="color:${e._loc.couleur||'var(--accent)'};">● ${e._loc.nom}</span></td>
          <td><strong>${e.name||'—'}</strong></td><td>${e.poste||'—'}</td>
          <td>${e.tel||'—'}</td><td>${e.cin||'—'}</td>
          <td><span class="chip ${e.statut==='actif'?'chip-green':e.statut==='conge'?'chip-orange':'chip-red'}">${e.statut||'—'}</span></td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text2);">Aucun employé</td></tr>'}
        </tbody></table></div>`;
    }
  } catch(e) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red);">❌ Erreur: ${e.message}</div>`;
  }
}

function saTab(tab) {
  SA_CURRENT_TAB = tab;
  ['dash','locaux','users','roles','vue'].forEach(t => {
    const panel = document.getElementById('sa-panel-' + t);
    const btn   = document.getElementById('sa-tab-'   + t);
    if (!panel || !btn) return;
    if (t === tab) {
      panel.style.display = '';
      btn.style.background = 'var(--accent)';
      btn.style.color = '#0a0f1e';
    } else {
      panel.style.display = 'none';
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text2)';
    }
  });
  if (tab === 'dash')   renderSADash();
  if (tab === 'locaux') renderSALocaux();
  if (tab === 'users')  renderSAUsers();
  if (tab === 'roles')  renderSARoles();
  if (tab === 'vue')    renderSAVue();
}

// ── DASHBOARD SA ───────────────────────────────────────────────
async function renderSADash() {
  const allLocaux = GP_LOCAUX_ALL;
  const allUsers  = GP_USERS_ALL;
  const actifLocs = allLocaux.filter(l => l.actif).length;
  const actifUsers = allUsers.filter(u => u.actif).length;

  // Stats globales depuis Supabase
  let totalSales = 0, totalProds = 0;
  try {
    const { data: salesData } = await sb.from('gp_sales').select('total').eq('tenant_id', GP_TENANT?.id);
    totalSales = (salesData||[]).reduce((acc, v) => acc + (v.total||0), 0);
    const { count } = await sb.from('gp_products').select('*', { count: 'exact', head: true }).eq('tenant_id', GP_TENANT?.id);
    totalProds = count || 0;
  } catch(e) { console.warn('[SB] renderSADash stats:', e); }

  document.getElementById('sa-stats-grid').innerHTML = `
    <div class="card"><div class="card-body" style="text-align:center;">
      <div style="font-size:32px;font-weight:800;color:var(--gold);">${allLocaux.length}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:4px;">🏪 Locaux total</div>
      <div style="font-size:11px;color:var(--accent);">${actifLocs} actifs</div>
    </div></div>
    <div class="card"><div class="card-body" style="text-align:center;">
      <div style="font-size:32px;font-weight:800;color:var(--accent);">${allUsers.length}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:4px;">👥 Utilisateurs</div>
      <div style="font-size:11px;color:var(--accent);">${actifUsers} actifs</div>
    </div></div>
    <div class="card"><div class="card-body" style="text-align:center;">
      <div style="font-size:32px;font-weight:800;color:#6c63ff;">${totalProds}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:4px;">📦 Produits (total)</div>
    </div></div>
    <div class="card"><div class="card-body" style="text-align:center;">
      <div style="font-size:32px;font-weight:800;color:#ff6b35;">${totalSales.toFixed(0)}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:4px;">💰 CA Global (MAD)</div>
    </div></div>
  `;

  // Cards par local
  document.getElementById('sa-locaux-cards').innerHTML = allLocaux.map(loc => {
    const lUsers = allUsers.filter(u => u.local_id === loc.id);
    return `
      <div class="card" style="border-left:3px solid ${loc.couleur||'var(--accent)'};">
        <div class="card-header" style="color:${loc.couleur||'var(--accent)'};">
          🏪 ${loc.nom}
          <span style="margin-left:auto;font-size:10px;padding:2px 8px;border-radius:var(--radius);background:${loc.actif?'rgba(37,99,235,.15)':'rgba(255,71,87,.15)'};color:${loc.actif?'var(--accent)':'var(--red)'};">${loc.actif?'Actif':'Inactif'}</span>
        </div>
        <div class="card-body" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;text-align:center;">
          <div><div style="font-size:22px;font-weight:800;color:var(--accent);">${lUsers.length}</div><div style="font-size:10px;color:var(--text2);">Utilisateurs</div></div>
          <div><div style="font-size:22px;font-weight:800;">${loc.responsable||'—'}</div><div style="font-size:10px;color:var(--text2);">Responsable</div></div>
        </div>
        <div style="padding:0 16px 8px;font-size:11px;color:var(--text2);">📍 ${loc.adresse||'—'}</div>
        <div style="padding:0 16px 12px;">
          <button class="btn btn-secondary" style="font-size:11px;padding:4px 10px;" onclick="saSelectLocal('${loc.id}')">🏪 Travailler dans ce local</button>
        </div>
      </div>`;
  }).join('') || '<div style="color:var(--text2);padding:20px;">Aucun local créé.</div>';

  // Détection données orphelines (sans local_id)
  try {
    const tables = ['gp_products','gp_sales','gp_clients','gp_employes','gp_caisse_ops'];
    let orphanCounts = {};
    for (const t of tables) {
      const { count } = await sb.from(t).select('*',{count:'exact',head:true}).is('local_id',null);
      if (count > 0) orphanCounts[t] = count;
    }
    const totalOrphans = Object.values(orphanCounts).reduce((a,b)=>a+b,0);
    if (totalOrphans > 0) {
      const saStats = document.getElementById('sa-stats-grid');
      const warning = document.createElement('div');
      warning.style.cssText = 'grid-column:1/-1;background:rgba(255,71,87,.1);border:1px solid rgba(255,71,87,.3);border-radius:var(--radius);padding:14px 16px;margin-top:12px;';
      warning.innerHTML = `
        <div style="color:var(--red);font-weight:700;margin-bottom:6px;">⚠️ ${totalOrphans} enregistrement(s) sans local assigné</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">${Object.entries(orphanCounts).map(([t,c])=>t.replace('gp_','')+': '+c).join(' • ')}</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">Ces données ne sont visibles par aucun utilisateur. Assignez-les à un local :</div>
        <select id="orphan-target-local" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--text);font-size:12px;margin-right:8px;">
          <option value="">Choisir un local...</option>
          ${GP_LOCAUX_ALL.filter(l=>l.actif!==false).map(l=>'<option value="'+l.id+'">'+l.nom+'</option>').join('')}
        </select>
        <button class="btn btn-danger" style="font-size:12px;padding:6px 14px;" onclick="fixOrphanData()">🔧 Assigner</button>`;
      saStats.appendChild(warning);
    }
  } catch(e) { console.debug('[SA] orphan check:', e); }
}

async function fixOrphanData() {
  if (!isSuperAdmin()) { toast('⛔ Accès refusé', 'error'); return; }
  const lid = document.getElementById('orphan-target-local')?.value;
  if (!lid) { toast('Sélectionnez un local cible', 'error'); return; }
  const locName = GP_LOCAUX_ALL.find(l=>l.id===lid)?.nom || lid;
  if (!confirm('Assigner toutes les données orphelines au local "'+locName+'" ?')) return;
  const tables = ['gp_products','gp_sales','gp_clients','gp_employes','gp_caisse_ops','gp_livraisons','gp_conges'];
  let fixed = 0;
  for (const t of tables) {
    const { data } = await sb.from(t).select('id').is('local_id', null);
    if (data && data.length > 0) {
      const { error } = await sb.from(t).update({local_id: lid}).in('id', data.map(r=>r.id));
      if (!error) fixed += data.length;
    }
  }
  toast('✅ '+fixed+' enregistrements assignés à "'+locName+'"', 'success');
  renderSADash();
}

function saSelectLocal(lid) {
  SA_ACTIVE_LOCAL = lid;
  const sel = document.getElementById('sa-active-local');
  if (sel) { sel.value = lid; }
  onSALocalSwitch();
}

async function saResetAllData() {
  // Sécurité : réservé au super_admin uniquement
  if (!isSuperAdmin()) { toast('⛔ Accès refusé', 'error'); return; }
  const confirm1 = confirm('⚠️ ATTENTION — Supprimer TOUTES les données (produits, ventes, clients, employés, caisse, livraisons, congés) ?\n\nCette action est IRRÉVERSIBLE.');
  if (!confirm1) return;
  const confirm2 = prompt('Tapez "SUPPRIMER" pour confirmer la suppression complète :');
  if (confirm2 !== 'SUPPRIMER') { toast('Reset annulé', 'warn'); return; }
  const confirm3 = confirm('Dernière confirmation — Êtes-vous absolument certain ?');
  if (!confirm3) return;

  toast('🗑️ Suppression en cours...', 'warn');
  const tables = [
    'gp_products', 'gp_sales', 'gp_clients', 'gp_employes',
    'gp_caisse_ops', 'gp_livraisons', 'gp_conges', 'gp_docs_rh',
    'gp_conteneurs', 'gp_ordres'
  ];
  let errors = 0;
  for (const t of tables) {
    // Supprimer toutes les lignes — utiliser une condition always-true
    const { error } = await sb.from(t).delete().not('id', 'is', null);
    if (error) {
      // Fallback : supprimer par id existants
      const { data } = await sb.from(t).select('id');
      if (data && data.length > 0) {
        const { error: e2 } = await sb.from(t).delete().in('id', data.map(r=>r.id));
        if (e2) { console.warn('[Reset]', t, e2.message); errors++; }
      }
    }
  }

  // Reset local state
  products = []; sales = []; clients = []; employes = [];
  caisseOps = []; livraisons = []; conges = []; docsRHHistory = []; depenses = [];
  conteneurs = []; ordres = []; settings = {tva:20,showTva:false,storeName:'GestionPro',storeAddress:'',storePhone:'',storeEmail:'',storeWebsite:'',invoicePrefix:'FAC',storeIce:'',storeLogo:null,bankName:'',bankIban:'',bankSwift:'',invoiceNotes:'',invoicePaymentTerms:'30 jours',invoiceCounter:1};

  // Re-render
  renderDashboard();
  renderStockTable();
  if (typeof renderVentes === 'function') renderVentes();
  if (typeof renderClients === 'function') renderClients();
  if (typeof renderEmployes === 'function') renderEmployes();
  renderSADash();
  updateAlertCount();

  if (errors === 0) toast('✅ Toutes les données supprimées — base vide', 'success');
  else toast(`⚠️ Reset partiel — ${errors} table(s) en erreur`, 'warn');
}

// ── GESTION LOCAUX ─────────────────────────────────────────────
function renderSALocaux() {
  const q = (document.getElementById('sa-local-search')?.value || '').toLowerCase();
  const tbody = document.getElementById('sa-locaux-table');
  if (!tbody) return;
  const filtered = GP_LOCAUX_ALL.filter(l => !q || l.nom.toLowerCase().includes(q) || (l.adresse||'').toLowerCase().includes(q));

  tbody.innerHTML = filtered.length === 0
    ? '<tr><td colspan="7" style="text-align:center;color:var(--text2);">Aucun local</td></tr>'
    : filtered.map(loc => {
      const lUsers = GP_USERS_ALL.filter(u => u.local_id === loc.id).length;
      return `<tr>
        <td><span style="font-weight:700;color:${loc.couleur||'var(--accent)'};">● ${loc.nom}</span></td>
        <td>${loc.adresse||'—'}</td>
        <td>${loc.responsable||'—'}</td>
        <td>${loc.telephone||'—'}</td>
        <td>${lUsers}</td>
        <td><span class="chip ${loc.actif?'chip-green':'chip-red'}">${loc.actif?'Actif':'Inactif'}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openSALocalModal('${loc.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSALocal('${loc.id}')">🗑️</button>
        </td>
      </tr>`;
    }).join('');
}

function openSALocalModal(id) {
  const loc = id ? GP_LOCAUX_ALL.find(l => l.id === id) : null;
  document.getElementById('sal-id').value       = id || '';
  document.getElementById('sal-nom').value      = loc?.nom || '';
  document.getElementById('sal-desc').value     = loc?.description || loc?.desc || '';
  document.getElementById('sal-adresse').value  = loc?.adresse || '';
  document.getElementById('sal-tel').value      = loc?.telephone || '';
  document.getElementById('sal-resp').value     = loc?.responsable || '';
  document.getElementById('sal-couleur').value  = loc?.couleur || '#2563eb';
  document.getElementById('sal-statut').value   = (loc?.actif !== false) ? '1' : '0';
  document.getElementById('modal-sa-local-title').textContent = id ? '✏️ Modifier le local' : '🏪 Nouveau local';
  openModal('modal-sa-local');
}

async function saveSALocal() {
  if (!isSuperAdmin()) { toast("⛔ Accès refusé", "error"); return; }
  const id   = document.getElementById('sal-id').value;
  const nom  = document.getElementById('sal-nom').value.trim();
  if (!nom) { toast('Nom du local obligatoire', 'error'); return; }

  const obj = {
    id:          id || 'L' + Date.now(),
    nom,
    description: document.getElementById('sal-desc').value.trim(),
    adresse:     document.getElementById('sal-adresse').value.trim(),
    telephone:   document.getElementById('sal-tel').value.trim(),
    responsable: document.getElementById('sal-resp').value.trim(),
    couleur:     document.getElementById('sal-couleur').value || '#2563eb',
    actif:       document.getElementById('sal-statut').value === '1'
  };
  obj.desc = obj.description;

  if (id) {
    const idx = GP_LOCAUX_ALL.findIndex(l => l.id === id);
    if (idx >= 0) GP_LOCAUX_ALL[idx] = { ...GP_LOCAUX_ALL[idx], ...obj };
  } else {
    GP_LOCAUX_ALL.push(obj);
  }
  locaux = GP_LOCAUX_ALL;
  // Supabase upsert
  const { error: sbErr } = await sb.from('gp_locaux').upsert({
    id: obj.id, nom: obj.nom,
    tenant_id: GP_TENANT.id,
    description: obj.description || null,
    adresse: obj.adresse || null, telephone: obj.telephone || null,
    responsable: obj.responsable || null,
    couleur: obj.couleur || 'accent', actif: obj.actif !== false
  });
  if (sbErr) console.warn('[SB] saveSALocal:', sbErr.message);
  closeModal('modal-sa-local');
  toast(`✅ Local "${nom}" ${id ? 'mis à jour' : 'créé'}`);
  await loadSAData();
  renderSALocaux();
  renderSADash();
  updateSALocalSwitcher();
  // Rafraîchir la page locaux si active
  if (document.getElementById('page-locaux')?.classList.contains('active')) renderLocaux();
}

async function deleteSALocal(id) {
  if (!isSuperAdmin()) { toast('⛔ Accès refusé', 'error'); return; }
  const loc = GP_LOCAUX_ALL.find(l => l.id === id);
  if (!confirm(`Supprimer le local "${loc?.nom}" ? Toutes les données associées seront perdues.`)) return;
  GP_LOCAUX_ALL = GP_LOCAUX_ALL.filter(l => l.id !== id);
  locaux = GP_LOCAUX_ALL;
  sb.from('gp_locaux').delete().eq('id', id).then(({error}) => {
    if(error) console.warn('[SB] deleteSALocal:', error.message);
  });
  toast('🗑️ Local supprimé');
  renderSALocaux();
  renderSADash();
}

// ── GESTION UTILISATEURS ────────────────────────────────────────
function renderSAUsers() {
  const q      = (document.getElementById('sa-user-search')?.value || '').toLowerCase();
  const fLocal = document.getElementById('sa-user-filter-local')?.value || 'all';
  const fRole  = document.getElementById('sa-user-filter-role')?.value  || 'all';
  const tbody  = document.getElementById('sa-users-table');
  if (!tbody) return;

  // Populate local filter
  const localSel = document.getElementById('sa-user-filter-local');
  if (localSel) {
    const cur = localSel.value;
    localSel.innerHTML = '<option value="all">Tous les locaux</option>' +
      GP_LOCAUX_ALL.map(l => `<option value="${l.id}" ${cur===l.id?'selected':''}>${escapeHTML(l.nom)}</option>`).join('');
  }

  // Populate role filter — toujours repopuler pour inclure nouveaux rôles
  const roleSel = document.getElementById('sa-user-filter-role');
  if (roleSel) {
    const curRole = roleSel.value || 'all';
    const allRoles = getAllRoles();
    roleSel.innerHTML = '<option value="all">Tous les rôles</option>' +
      Object.entries(allRoles).map(([k,r]) => `<option value="${k}" ${curRole===k?'selected':''}>${r.label}</option>`).join('');
  }

  let filtered = GP_USERS_ALL.filter(u => {
    if (q && !`${u.nom} ${u.prenom} ${u.email}`.toLowerCase().includes(q)) return false;
    if (fLocal !== 'all' && u.local_id !== fLocal) return false;
    if (fRole  !== 'all' && normalizeRole(u.role) !== normalizeRole(fRole)) return false;
    return true;
  });

  const sauPage = getPage('sausers');
  const sauPageData = filtered.slice((sauPage-1)*PAGE_SIZE, sauPage*PAGE_SIZE);
  tbody.innerHTML = filtered.length === 0
    ? '<tr><td colspan="7" style="text-align:center;color:var(--text2);">Aucun utilisateur</td></tr>'
    : sauPageData.map(u => {
      const loc = GP_LOCAUX_ALL.find(l => l.id === u.local_id);
      const role = getRole(u.role);
      return `<tr>
        <td><strong>${escapeHTML(u.nom||'—')}</strong><div style="font-size:11px;color:var(--text2);">${escapeHTML(u.prenom||'')}</td>
        <td style="font-size:12px;">${u.email||'—'}</td>
        <td><span class="chip" style="background:rgba(${role?.color||'#888'},0.12);color:${role?.color||'var(--text2)'};">${role?.label||u.role||'—'}</span></td>
        <td>${loc ? `<span style="color:${loc.couleur||'var(--accent)'};">● ${escapeHTML(loc.nom)}</span>` : '<span style="color:var(--text2);">—</span>'}</td>
        <td>${u.telephone||'—'}</td>
        <td><span class="chip ${u.actif?'chip-green':'chip-red'}">${u.actif?'Actif':'Inactif'}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openSAUserModal('${u.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSAUser('${u.id}')">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  buildPagination('sausers', filtered.length, 'renderSAUsers', 'sausers-pagination');
}

function updateSAUserLocalVisibility() {
  const role = document.getElementById('sau-role')?.value || '';
  const localGroup = document.getElementById('sau-local-group');
  if (!localGroup) return;
  const allRoles = getAllRoles();
  const roleObj = allRoles[role];
  // Super admin n'a pas besoin de local, les autres oui
  const needsLocal = roleObj?.localRequired !== false && role !== 'super_admin';
  localGroup.style.display = needsLocal ? '' : 'none';
}

function openSAUserModal(id) {
  const u = id ? GP_USERS_ALL.find(x => x.id === id) : null;

  // Populate local select
  const localSel = document.getElementById('sau-local');
  if (localSel) {
    localSel.innerHTML = '<option value="">— Aucun local —</option>' +
      GP_LOCAUX_ALL.map(l => `<option value="${l.id}" ${u?.local_id===l.id?'selected':''}>${escapeHTML(l.nom)}</option>`).join('');
  }
  // Populate role select
  const roleSel = document.getElementById('sau-role');
  if (roleSel) {
    const allRoles = getAllRoles();
    const userRole = u?.role ? normalizeRole(u.role) : '';
    roleSel.innerHTML = Object.entries(allRoles)
      .filter(([k]) => k !== 'super_admin')
      .map(([k,r]) => `<option value="${k}" ${normalizeRole(k)===userRole?'selected':''}>${r.label}</option>`).join('');
  }

  // Mettre à jour visibilité local selon rôle
  updateSAUserLocalVisibility();
  document.getElementById('sau-id').value     = id || '';
  document.getElementById('sau-nom').value    = u?.nom || '';
  document.getElementById('sau-prenom').value = u?.prenom || '';
  document.getElementById('sau-email').value  = u?.email || '';
  document.getElementById('sau-pwd').value    = '';
  document.getElementById('sau-tel').value    = u?.telephone || '';
  document.getElementById('sau-actif').value  = (u?.actif !== false) ? '1' : '0';
  document.getElementById('modal-sa-user-title').textContent = id ? '✏️ Modifier utilisateur' : '👤 Nouvel utilisateur';
  document.getElementById('sau-pwd').placeholder = id ? 'Laisser vide = inchangé' : 'Mot de passe *';
  openModal('modal-sa-user');
}

// ── GESTION RÔLES & PERMISSIONS ─────────────────────────────────
function renderSARoles() {
  _renderSARolesList();
  if (SA_SELECTED_ROLE) _renderSAPermsPanel(SA_SELECTED_ROLE);
}

function _renderSARolesList() {
  const allRoles = getAllRoles();
  const list = document.getElementById('sa-roles-list');
  if (!list) return;
  list.innerHTML = Object.entries(allRoles).map(([key, role]) => {
    const isSelected = SA_SELECTED_ROLE === key;
    const bg     = isSelected ? 'rgba(37,99,235,.08)' : 'var(--surface2)';
    const border = isSelected ? 'var(--accent)' : 'transparent';
    const badge  = role.isSystem
      ? '<span style="font-size:9px;color:var(--text3);background:var(--surface3);padding:1px 5px;border-radius:4px;">SYSTÈME</span>'
      : `<button onclick="event.stopPropagation();deleteSARole('${key}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:0 4px;">🗑️</button>`;
    return `<div onclick="selectSARole('${key}')" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:4px;border:2px solid ${border};background:${bg};transition:.15s;">
      <div style="width:10px;height:10px;border-radius:50%;background:${role.color||'#888'};flex-shrink:0;"></div>
      <span style="flex:1;font-size:13px;font-weight:600;">${role.label}</span>
      ${badge}
    </div>`;
  }).join('');
}

function selectSARole(key) {
  SA_SELECTED_ROLE = key;
  _renderSARolesList();
  _renderSAPermsPanel(key);
}

function _renderSAPermsPanel(key) {
  const allRoles   = getAllRoles();
  const role       = allRoles[key];
  if (!role) return;

  document.getElementById('sa-perms-title').textContent = `${role.label} — Permissions`;

  if (key === 'super_admin') {
    document.getElementById('sa-perms-grid').innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--gold);">
        <div style="font-size:40px;margin-bottom:12px;">👑</div>
        <div style="font-size:16px;font-weight:700;">Accès illimité à tout</div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px;">Le Super Admin bypass toutes les restrictions.</div>
      </div>`;
    return;
  }

  const basePerms     = DEFAULT_ROLES[key]?.permissions || {};
  const overridePerms = GP_ROLES[key]?.permissions;
  const perms         = overridePerms || basePerms;
  const isOverridden  = !!GP_ROLES[key];

  let html = `<div style="display:grid;gap:16px;">`;
  Object.entries(PERMISSIONS_DEF).forEach(([mod, def]) => {
    const modPerms = perms[mod] || [];
    html += `<div style="background:var(--surface2);border-radius:var(--radius);padding:14px 16px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:10px;">${def.label}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${def.actions.map(action => {
          const active = modPerms.includes(action);
          const labels = {read:'Voir', create:'Créer', update:'Modifier', delete:'Supprimer', export:'Exporter', approuver:'Approuver'};
          return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;padding:4px 10px;border-radius:20px;border:1.5px solid ${active?'var(--accent)':'var(--border)'};background:${active?'rgba(37,99,235,.12)':'transparent'};color:${active?'var(--accent)':'var(--text2)'};transition:.15s;">
            <input type="checkbox" ${active?'checked':''} data-role="${key}" data-mod="${mod}" data-action="${action}" onchange="togglePermission(this)" style="display:none;">
            ${active?'✅':'⬜'} ${labels[action]||action}
          </label>`;
        }).join('')}
      </div>
    </div>`;
  });
  html += `</div>`;

  const note = `<div style="margin-bottom:14px;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;background:rgba(108,99,255,0.08);border-radius:8px;font-size:12px;color:var(--text2);">
    <span>💡 Cochez/décochez les permissions. Sauvegarde automatique.</span>
    ${isOverridden ? `<button onclick="resetRolePerms('${key}')" class="btn btn-secondary btn-sm" style="font-size:11px;">↩ Réinitialiser</button>` : ''}
  </div>`;

  document.getElementById('sa-perms-grid').innerHTML = note + html;
}

function togglePermission(cb) {
  const key    = cb.dataset.role;
  const mod    = cb.dataset.mod;
  const action = cb.dataset.action;

  if (!GP_ROLES[key]) {
    // Copier toutes les permissions de base dans GP_ROLES pour override complet
    const base = DEFAULT_ROLES[key];
    GP_ROLES[key] = {
      label: base?.label || key,
      color: base?.color || '#888',
      isSystem: base?.isSystem || false,
      permissions: JSON.parse(JSON.stringify(base?.permissions || {}))
    };
  }
  if (!GP_ROLES[key].permissions) GP_ROLES[key].permissions = {};
  if (!GP_ROLES[key].permissions[mod]) GP_ROLES[key].permissions[mod] = [];

  const arr = GP_ROLES[key].permissions[mod];
  if (cb.checked) { if (!arr.includes(action)) arr.push(action); }
  else GP_ROLES[key].permissions[mod] = arr.filter(a => a !== action);

  saveRoles(); // async — sauvegarde en Supabase
  applyNavPermissions(); // mettre à jour le nav immédiatement
  const label = cb.closest('label');
  if (label) {
    const labels = {read:'Voir', create:'Créer', update:'Modifier', delete:'Supprimer', export:'Exporter', approuver:'Approuver'};
    label.style.borderColor = cb.checked ? 'var(--accent)' : 'var(--border)';
    label.style.background  = cb.checked ? 'rgba(37,99,235,.12)' : 'transparent';
    label.style.color       = cb.checked ? 'var(--accent)' : 'var(--text2)';
    label.innerHTML = `<input type="checkbox" ${cb.checked?'checked':''} data-role="${key}" data-mod="${mod}" data-action="${action}" onchange="togglePermission(this)" style="display:none;">${cb.checked?'✅':'⬜'} ${labels[action]||action}`;
    label.querySelector('input').addEventListener('change', function(){ togglePermission(this); });
  }
}

function resetRolePerms(key) {
  if (!isSuperAdmin()) { toast("⛔ Accès refusé", "error"); return; }
  if (!confirm(`Réinitialiser les permissions de "${getRoleLabel(key)}" aux valeurs par défaut ?`)) return;
  delete GP_ROLES[key];
  saveRoles();
  toast('↩ Permissions réinitialisées');
  _renderSAPermsPanel(key);
  _renderSARolesList();
}

function openSARoleModal(id) {
  const role = id ? getAllRoles()[id] : null;
  document.getElementById('sar-id').value    = id || '';
  document.getElementById('sar-nom').value   = role?.label || '';
  document.getElementById('sar-color').value = role?.color || '#6c63ff';
  document.getElementById('modal-sa-role-title').textContent = id ? '✏️ Modifier rôle' : '🔐 Nouveau rôle';
  openModal('modal-sa-role');
}

function saveSARole() {
  if (!isSuperAdmin()) { toast("⛔ Accès refusé", "error"); return; }
  const id    = document.getElementById('sar-id').value;
  const label = document.getElementById('sar-nom').value.trim();
  const color = document.getElementById('sar-color').value;
  if (!label) { toast('Nom du rôle obligatoire', 'error'); return; }

  const key = id || 'role_' + label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();
  if (!GP_ROLES[key]) GP_ROLES[key] = { permissions: {} };
  GP_ROLES[key].label    = label;
  GP_ROLES[key].color    = color;
  GP_ROLES[key].isSystem = false;
  saveRoles();
  closeModal('modal-sa-role');
  toast(`✅ Rôle "${label}" ${id ? 'mis à jour' : 'créé'}`);
  renderSARoles();
}

function deleteSARole(key) {
  if (!isSuperAdmin()) { toast("⛔ Accès refusé", "error"); return; }
  const role = getAllRoles()[key];
  if (role?.isSystem) { toast('Impossible de supprimer un rôle système', 'error'); return; }
  if (!confirm(`Supprimer le rôle "${role?.label}" ?`)) return;
  delete GP_ROLES[key];
  saveRoles();
  if (SA_SELECTED_ROLE === key) SA_SELECTED_ROLE = null;
  toast('🗑️ Rôle supprimé');
  renderSARoles();
}

// ╔══════════════════════════════════════════════════════════════╗
// ║              AUTO-LOGIN & SESSION                            ║
// ╚══════════════════════════════════════════════════════════════╝
(async () => {
  const saved = localStorage.getItem('gp_session');
  if (saved) {
    try {
      const _parsed = JSON.parse(saved);
      // Support nouveau format {user, tenant} et ancien format (juste user)
      const savedUser   = (_parsed.user && _parsed.tenant) ? _parsed.user   : _parsed;
      const savedTenant = (_parsed.user && _parsed.tenant) ? _parsed.tenant : null;

      const { data } = await sb
        .from('gp_users')
        .select('*')
        .eq('id', savedUser.id)
        .eq('actif', true)
        .limit(1);

      if (data && data.length > 0) {
        GP_USER = data[0];
        // Restaurer tenant depuis session ou recharger depuis Supabase
        if (savedTenant) {
          GP_TENANT = savedTenant;
          // Vérifier expiration
          if (GP_TENANT.expire_at && new Date(GP_TENANT.expire_at) < new Date()) {
            localStorage.removeItem('gp_session');
            return; // laisse l'écran de login s'afficher
          }
        } else if (GP_USER.tenant_id) {
          const { data: td } = await sb.from('gp_tenants').select('id, nom, code, actif, plan, expire_at, is_owner').eq('id', GP_USER.tenant_id).limit(1);
          GP_TENANT = td?.[0] || null;
        }
        await startApp();
        return;
      }
    } catch(e) { console.warn('Auto-login failed:', e); }
    localStorage.removeItem('gp_session');
  }
})();
