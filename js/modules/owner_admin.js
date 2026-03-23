/* ================================================================
   GestionPro — modules/owner_admin.js
   Owner Admin (gestion tenants) :
   isOwner, loadOAData, renderOAStats, renderOATenants,
   saveOATenant, renewOATenant, toggleOATenant, deleteOATenant
================================================================ */

function getPlanModules() {
  const plan = GP_TENANT?.plan || 'starter';
  return PLAN_MODULES[plan] || PLAN_MODULES.starter;
}

function hasModuleAccess(module) {
  // Owner voit tout
  if (isOwner()) return true;
  // Normaliser tiret/underscore pour comparaison
  const normalize = (s) => s.replace(/-/g, '_');
  const modules = getPlanModules();
  return modules.some(m => m === module || normalize(m) === normalize(module));
}

// ╔══════════════════════════════════════════════════════════════╗
// ║         OWNER ADMIN — GESTION CLIENTS GESTIONPRO            ║
// ╚══════════════════════════════════════════════════════════════╝

let OA_TENANTS = []; // tous les tenants (clients)
let OA_PAYMENTS = []; // historique paiements

// Vérifier si l'utilisateur est le owner (propriétaire de GestionPro)
function isOwner() {
  // Seul le tenant marqué is_owner=true dans Supabase peut voir "Mes Clients"
  // Double vérification : super_admin ET is_owner depuis DB
  return isSuperAdmin() && GP_TENANT?.is_owner === true;
}

// Charger tous les tenants depuis Supabase
async function loadOAData() {
  try {
    const { data: tenants } = await sb.from('gp_tenants').select('id, nom, code, actif, plan, expire_at, is_owner, created_at').order('created_at', { ascending: false });
    OA_TENANTS = tenants || [];

    // Charger paiements si table existe
    try {
      const { data: pays } = await sb.from('gp_payments').select('*').order('date_paiement', { ascending: false });
      OA_PAYMENTS = pays || [];
    } catch(e) { OA_PAYMENTS = []; }

    renderOAStats();
    renderOATenants();
  } catch(e) {
    console.warn('[OA] loadOAData:', e.message);
  }
}

function renderOAStats() {
  const now = new Date();
  const in5days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  const total   = OA_TENANTS.length;
  const actifs  = OA_TENANTS.filter(t => t.actif && (!t.expire_at || new Date(t.expire_at) > now)).length;
  const soon    = OA_TENANTS.filter(t => t.actif && t.expire_at && new Date(t.expire_at) > now && new Date(t.expire_at) <= in5days).length;
  const expired = OA_TENANTS.filter(t => !t.actif || (t.expire_at && new Date(t.expire_at) < now)).length;
  const revenue = OA_PAYMENTS.reduce((s, p) => s + (p.montant || 0), 0);

  const el = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
  el('oa-stat-total', total);
  el('oa-stat-actif', actifs);
  el('oa-stat-soon', soon);
  el('oa-stat-expired', expired);
  el('oa-stat-revenue', fmt(revenue));
}

function renderOATenants() {
  const q      = (document.getElementById('oa-search')?.value || '').toLowerCase();
  const filter = document.getElementById('oa-filter')?.value || 'all';
  const now    = new Date();
  const in5d   = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  let list = OA_TENANTS.filter(t => {
    if (q && !t.nom.toLowerCase().includes(q) && !t.code.includes(q)) return false;
    if (filter === 'actif')   return t.actif && (!t.expire_at || new Date(t.expire_at) > now);
    if (filter === 'soon')    return t.actif && t.expire_at && new Date(t.expire_at) > now && new Date(t.expire_at) <= in5d;
    if (filter === 'expired') return !t.actif || (t.expire_at && new Date(t.expire_at) < now);
    return true;
  });

  const el = document.getElementById('oa-tenants-list');
  if (!el) return;

  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">🏢</div><p>Aucun client trouvé</p></div>`;
    return;
  }

  el.innerHTML = list.map(t => {
    const expired  = t.expire_at && new Date(t.expire_at) < now;
    const soon     = !expired && t.expire_at && new Date(t.expire_at) <= in5d;
    const actif    = t.actif === true && !expired;
    const statusIcon  = expired ? '❌' : soon ? '⚠️' : '✅';
    const statusColor = expired ? 'var(--red)' : soon ? 'var(--gold)' : 'var(--accent)';
    const statusLabel = expired ? 'Expiré' : soon ? 'Bientôt' : 'Actif';
    const expireStr = t.expire_at
      ? (parseInt(new Date(t.expire_at).getFullYear()) > 2090 ? '♾️ À vie' : new Date(t.expire_at).toLocaleDateString('fr-FR'))
      : '—';
    const pays = OA_PAYMENTS.filter(p => p.tenant_id === t.id);
    const totalPay = pays.reduce((s,p) => s + (p.montant||0), 0);
    const planBadge = {starter:'🥉',business:'🥈',premium:'🥇'}[t.plan] || '📦';

    return `<div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--surface2);border-radius:var(--radius);margin-bottom:8px;border:1px solid ${expired?'rgba(224,49,49,0.2)':soon?'rgba(245,166,35,0.2)':'var(--border)'};flex-wrap:wrap;">
      <div style="width:40px;height:40px;border-radius:var(--radius);background:rgba(37,99,235,0.1);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${planBadge}</div>
      <div style="flex:1;min-width:150px;">
        <div style="font-weight:700;font-size:14px;">${escapeHTML(t.nom)}</div>
        <div style="font-size:11px;color:var(--text2);font-family:var(--font-mono),monospace;">code: ${t.code}</div>
      </div>
      <div style="text-align:center;min-width:80px;">
        <div style="font-size:11px;color:var(--text2);">Plan</div>
        <div style="font-size:13px;font-weight:700;text-transform:capitalize;">${t.plan || 'starter'}</div>
      </div>
      <div style="text-align:center;min-width:80px;">
        <div style="font-size:11px;color:var(--text2);">Expire</div>
        <div style="font-size:13px;font-weight:700;">${expireStr}</div>
      </div>
      <div style="text-align:center;min-width:80px;">
        <div style="font-size:11px;color:var(--text2);">Payé</div>
        <div style="font-size:13px;font-weight:700;color:var(--accent);">${totalPay > 0 ? fmt(totalPay) : '—'}</div>
      </div>
      <div style="text-align:center;min-width:70px;">
        <span style="color:${statusColor};font-weight:700;font-size:13px;">${statusIcon} ${statusLabel}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button onclick="openOARenew('${t.id}')" style="padding:6px 12px;border-radius:7px;border:1px solid rgba(37,99,235,0.3);background:rgba(37,99,235,0.08);color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;">🔄 Renouveler</button>
        <button onclick="openOAWA('${t.code}')" style="padding:6px 12px;border-radius:7px;border:1px solid rgba(37,211,102,0.3);background:rgba(37,211,102,0.08);color:#25D366;font-size:12px;font-weight:700;cursor:pointer;">💬 WA</button>
        <button onclick="openOAEdit('${t.id}')" style="padding:6px 12px;border-radius:7px;border:1px solid var(--border);background:transparent;color:var(--text2);font-size:12px;cursor:pointer;">✏️</button>
        <button onclick="toggleOATenant('${t.id}',${actif?'true':'false'})" style="padding:6px 12px;border-radius:7px;border:1px solid ${actif?'rgba(224,49,49,0.3)':'rgba(37,99,235,0.3)'};background:transparent;color:${actif?'var(--red)':'var(--accent)'};font-size:12px;cursor:pointer;">${actif?'🚫 Bloquer':'✅ Activer'}</button>
        <button onclick="deleteOATenant('${t.id}','${t.nom}')" style="padding:6px 12px;border-radius:7px;border:1px solid rgba(224,49,49,0.3);background:transparent;color:var(--red);font-size:12px;cursor:pointer;">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function openOANewTenant() {
  document.getElementById('oa-tenant-id').value = '';
  document.getElementById('oa-modal-title').textContent = '➕ Nouveau client';
  ['oa-nom','oa-code','oa-admin-email','oa-admin-pwd','oa-notes'].forEach(id => { const e=document.getElementById(id); if(e) e.value=''; });
  document.getElementById('oa-montant').value = '0';
  document.getElementById('oa-plan').value = 'starter';
  document.getElementById('oa-duree').value = '1';
  openModal('modal-oa-tenant');
}

function openOAEdit(tenantId) {
  const t = OA_TENANTS.find(x => x.id === tenantId);
  if (!t) return;
  document.getElementById('oa-tenant-id').value = t.id;
  document.getElementById('oa-modal-title').textContent = '✏️ Modifier client';
  document.getElementById('oa-nom').value = t.nom || '';
  document.getElementById('oa-code').value = t.code || '';
  document.getElementById('oa-plan').value = t.plan || 'starter';
  document.getElementById('oa-notes').value = t.notes || '';
  document.getElementById('oa-admin-email').value = '';
  document.getElementById('oa-admin-pwd').value = '';
  document.getElementById('oa-montant').value = '0';
  openModal('modal-oa-tenant');
}

async function saveOATenant() {
  const id     = document.getElementById('oa-tenant-id').value;
  const nom    = document.getElementById('oa-nom').value.trim();
  const code   = document.getElementById('oa-code').value.trim();
  const plan   = document.getElementById('oa-plan').value;
  const duree  = parseInt(document.getElementById('oa-duree').value) || 1;
  const email  = document.getElementById('oa-admin-email').value.trim();
  const pwd    = document.getElementById('oa-admin-pwd').value.trim();
  const montant = parseFloat(document.getElementById('oa-montant').value) || 0;
  const notes  = document.getElementById('oa-notes').value.trim();

  if (!nom || !code) { toast('Nom et code obligatoires', 'error'); return; }

  const expireAt = duree === 9999
    ? new Date('2099-12-31').toISOString()
    : new Date(Date.now() + duree * 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    let tenantId = id;

    if (id) {
      // Modifier tenant existant
      console.log('[OA] Updating tenant:', id, { nom, plan, expire_at: expireAt });
      const { data: updated, error } = await sb.from('gp_tenants')
        .update({ nom, plan, expire_at: expireAt, notes })
        .eq('id', id)
        .select();
      console.log('[OA] Update result:', updated, error);
      if (error) throw error;
      // Mettre à jour localement immédiatement
      const idx = OA_TENANTS.findIndex(t => t.id === id);
      if (idx >= 0) OA_TENANTS[idx] = { ...OA_TENANTS[idx], nom, plan, expire_at: expireAt, notes };
      toast('Client mis à jour ✅');
    } else {
      // Créer nouveau tenant
      const { data: newTenant, error } = await sb.from('gp_tenants').insert({
        nom, code, actif: true, plan, expire_at: expireAt, notes
      }).select().single();
      if (error) throw error;
      tenantId = newTenant.id;

      // Créer le super admin du client
      if (email && pwd) {
        const { error: ue } = await sb.from('gp_users').insert({
          id: 'U' + Date.now(),
          tenant_id: tenantId,
          nom: nom, email, password: await hashPassword(pwd),
          role: 'super_admin', actif: true
        });
        if (ue) console.warn('User creation error:', ue.message);
      }
      toast(`Client "${nom}" créé ✅`);
    }

    // Enregistrer paiement si montant > 0
    if (montant > 0) {
      await sb.from('gp_payments').insert({
        tenant_id: tenantId, montant,
        methode: 'whatsapp', notes: `Création/renouvellement ${plan}`
      });
    }

    closeModal('modal-oa-tenant');
    await loadOAData();
  } catch(e) {
    toast('Erreur: ' + e.message, 'error');
  }
}

function openOARenew(tenantId) {
  const t = OA_TENANTS.find(x => x.id === tenantId);
  if (!t) return;
  document.getElementById('oar-tenant-id').value = t.id;
  document.getElementById('oar-tenant-name').textContent = '🏢 ' + t.nom;
  const expStr = t.expire_at
    ? (new Date(t.expire_at) < new Date() ? '❌ Expiré depuis ' : '✅ Expire le ') + new Date(t.expire_at).toLocaleDateString('fr-FR')
    : 'Pas de date définie';
  document.getElementById('oar-current-expire').textContent = expStr;
  document.getElementById('oar-montant').value = '';
  openModal('modal-oa-renew');
}

async function renewOATenant() {
  const id = document.getElementById('oar-tenant-id')?.value?.trim();
  if (!id) { toast('Erreur: tenant introuvable', 'error'); return; }
  const duree  = parseInt(document.getElementById('oar-duree').value) || 1;
  const montant = parseFloat(document.getElementById('oar-montant').value) || 0;

  const t = OA_TENANTS.find(x => x.id === id);
  if (!t) return;

  // Calculer nouvelle date : depuis maintenant ou depuis expiration actuelle (la plus grande)
  const base = t.expire_at && new Date(t.expire_at) > new Date() ? new Date(t.expire_at) : new Date();
  const newExpire = new Date(base.getTime() + duree * 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    console.log('[OA] Renew tenant:', id, 'expire_at ->', newExpire);
    const { data: res, error } = await sb.from('gp_tenants')
      .update({ expire_at: newExpire, actif: true })
      .eq('id', id)
      .select();
    console.log('[OA] Renew result:', res, error);
    if (error) throw error;
    if (!res || res.length === 0) throw new Error('Aucune ligne modifiée — vérifier les permissions RLS dans Supabase');

    if (montant > 0) {
      await sb.from('gp_payments').insert({
        tenant_id: id, montant, methode: 'whatsapp',
        notes: `Renouvellement +${duree} mois`
      });
    }

    // Mettre à jour localement
    const idx = OA_TENANTS.findIndex(t => t.id === id);
    if (idx >= 0) { OA_TENANTS[idx].expire_at = newExpire; OA_TENANTS[idx].actif = true; }

    toast(`Licence renouvelée jusqu'au ${new Date(newExpire).toLocaleDateString('fr-FR')} ✅`);
    closeModal('modal-oa-renew');
    renderOAStats();
    renderOATenants();
  } catch(e) {
    toast('Erreur: ' + e.message, 'error');
  }
}

async function toggleOATenant(tenantId, currentActif) {
  // Normaliser en booléen (peut arriver comme string 'true'/'false')
  const isActif = currentActif === true || currentActif === 'true';
  const action = isActif ? 'bloquer' : 'activer';
  if (!confirm(`Voulez-vous ${action} ce client ?`)) return;
  try {
    const newActif = !isActif;
    console.log('[OA] Toggle tenant:', tenantId, 'actif ->', newActif);
    const { data: res, error } = await sb.from('gp_tenants')
      .update({ actif: newActif })
      .eq('id', tenantId)
      .select();
    console.log('[OA] Toggle result:', res, error);
    if (error) throw error;
    if (!res || res.length === 0) throw new Error('Aucune ligne modifiée — vérifier les permissions RLS dans Supabase');
    const idx = OA_TENANTS.findIndex(t => t.id === tenantId);
    if (idx >= 0) OA_TENANTS[idx].actif = newActif;
    toast(isActif ? '🚫 Client bloqué' : '✅ Client activé');
    renderOAStats();
    renderOATenants();
  } catch(e) {
    console.error('[OA] Toggle error:', e);
    toast('Erreur: ' + e.message, 'error');
  }
}

async function deleteOATenant(tenantId, nom) {
  if (!confirm(`⚠️ Supprimer définitivement "${nom}" et toutes ses données ?

Cette action est irréversible !`)) return;
  if (!confirm(`Confirmer la suppression de "${nom}" ?`)) return;
  try {
    // Supprimer les données du tenant
    const tables = ['gp_products','gp_sales','gp_clients','gp_employes','gp_caisse_ops',
      'gp_conteneurs','gp_ordres','gp_livraisons','gp_conges','gp_docs_rh','gp_locaux','gp_payments'];
    for (const tbl of tables) {
      try { await sb.from(tbl).delete().eq('tenant_id', tenantId); } catch(e) {}
    }
    // Supprimer les users du tenant
    await sb.from('gp_users').delete().eq('tenant_id', tenantId);
    // Supprimer le tenant
    const { error } = await sb.from('gp_tenants').delete().eq('id', tenantId);
    if (error) throw error;
    OA_TENANTS = OA_TENANTS.filter(t => t.id !== tenantId);
    toast(`🗑️ Client "${nom}" supprimé`);
    renderOAStats();
    renderOATenants();
  } catch(e) {
    toast('Erreur suppression: ' + e.message, 'error');
  }
}

function openOAWA(code) {
  const msg = `Bonjour ! Voici vos accès GestionPro 🎉%0A%0A🔑 Code d'accès : *${code}*%0A📱 Lien : gestionpro.vercel.app%0A%0AConnectez-vous avec votre email et mot de passe fournis.%0A%0A💬 Pour toute question, contactez-nous sur WhatsApp.`;
  window.open(`https://wa.me/212664783510?text=${msg}`, '_blank');
}

// ─── INIT ───
// ─── EXPORT / IMPORT JSON avec photos ───
function exportProductsJSON() {
  if (!products.length) { toast(t('toast_no_products'), 'warn'); return; }
  toast(t('toast_preparing_export'), 'warn');

  // Pour chaque produit, s'assurer qu'on a la photo
  // Elle peut être dans p.photo OU dans localStorage 'gp_photo_'+id
  const productsComplets = products.map(p => {
    let photo = p.photo || null;
    if (!photo) {
      // Tenter de récupérer depuis localStorage séparé
      photo = localStorage.getItem('gp_photo_' + p.id) || null;
    }
    // Retourner l'objet AVEC la photo inline
    const {_hasPhoto, photoUrl, ...rest} = p;
    return { ...rest, photo };
  });

  const avecPhotos = productsComplets.filter(p => p.photo).length;

  const exportData = {
    version: '2.0',
    exportDate: new Date().toISOString(),
    appName: 'GestionPro',
    count: productsComplets.length,
    withPhotos: avecPhotos,
    products: productsComplets
  };

  const json = JSON.stringify(exportData);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
  a.href = url;
  a.download = `GestionPro_Produits_${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast(`✅ ${productsComplets.length} ${t('toast_export_done')} (${avecPhotos} ${t('toast_photos_with')})`);
}
