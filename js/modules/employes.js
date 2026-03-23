/* ================================================================
   GestionPro — modules/employes.js
   Employés, Congés, Livraisons BL, Documents RH, Contrats :
   renderEmployes, saveEmploye, deleteEmploye, voirEmploye,
   renderConges, saveConge, updateCongeStatut, deleteConge,
   renderLivraisons, saveBL, deleteBL, printBL,
   renderDocsRH, genererDocRH, openDocAdmin, genererDocAdmin,
   openContratModal, genererContrat, calcIGR
================================================================ */

// ═══════════════════════════════════════════════════════════
//  MODULE EMPLOYÉS
// ═══════════════════════════════════════════════════════════
let employes = [];
let conges = [];
let livraisons = [];
let docsRHHistory = [];

// loadUserData et _doSave → version Supabase définie plus bas



// ── EMPLOYÉS ──────────────────────────────────────────────
function renderEmployes() {
  const q = (document.getElementById('emp-search')?.value || '').toLowerCase();
  const filtered = employes.filter(e =>
    !q || e.name.toLowerCase().includes(q) || (e.poste||'').toLowerCase().includes(q) || (e.dept||'').toLowerCase().includes(q)
  );
  const el = document.getElementById('emp-count');
  if(el) el.textContent = `${filtered.length} employé(s)`;
  const tbody = document.getElementById('employes-table');
  if(!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text2);">👨‍💼 Aucun employé enregistré</td></tr>`;
    buildPagination('employes', 0, 'renderEmployes', 'employes-pagination');
    return;
  }
  const empPage = getPage('employes');
  const empPageData = filtered.slice((empPage-1)*PAGE_SIZE, empPage*PAGE_SIZE);
  const statutBadge = {actif:'<span style="background:rgba(37,99,235,.12);color:var(--accent);padding:2px 8px;border-radius:var(--radius-lg);font-size:11px;font-weight:700;">✅ Actif</span>', conge:'<span style="background:rgba(255,209,102,.12);color:var(--gold);padding:2px 8px;border-radius:var(--radius-lg);font-size:11px;font-weight:700;">🏖️ Congé</span>', inactif:'<span style="background:rgba(255,71,87,.12);color:var(--red);padding:2px 8px;border-radius:var(--radius-lg);font-size:11px;font-weight:700;">❌ Inactif</span>'};
  tbody.innerHTML = empPageData.map(e => `<tr>
    <td><strong>${escapeHTML(e.name)}</strong>${e.prenom?' '+e.prenom:''}</td>
    <td style="color:var(--text2);">${e.poste||'—'}</td>
    <td style="color:var(--text2);">${e.dept||'—'}</td>
    <td>${e.tel||'—'}</td>
    <td style="font-size:12px;">${e.cin||'—'}</td>
    <td style="font-family:var(--font-mono),monospace;font-weight:700;color:var(--accent);">${e.salaire?Number(e.salaire).toLocaleString('fr-MA')+' MAD':'—'}</td>
    <td style="font-size:12px;color:var(--text2);">${e.dateEmbauche||'—'}</td>
    <td>${statutBadge[e.statut]||e.statut||'—'}</td>
    <td style="white-space:nowrap;">
      ${(isSuperAdmin()||hasPermission('employes','update')) ? `<button class="btn btn-secondary btn-sm" onclick="openEmployeModal('${e.id}')">✏️</button>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="openContratModal('${e.id}')" title="Générer contrat de travail" style="border-color:rgba(108,99,255,0.4);color:var(--purple);">📄</button>
      <button class="btn btn-secondary btn-sm" onclick="voirEmploye('${e.id}')" title="Documents">📋</button>
      ${(isSuperAdmin()||hasPermission('employes','delete')) ? `<button class="btn btn-danger btn-sm" onclick="deleteEmploye('${e.id}')">🗑️</button>` : ''}
    </td>
  </tr>`).join('');
  buildPagination('employes', filtered.length, 'renderEmployes', 'employes-pagination');
}

function openEmployeModal(id) {
  const e = id ? employes.find(x => x.id === id) : null;
  // Vérifier permission : create si nouveau, update si modification
  const neededPerm = e ? 'update' : 'create';
  if (!isSuperAdmin() && !hasPermission('employes', neededPerm)) { toast('⛔ Permission refusée', 'error'); return; }
  document.getElementById('modal-employe-title').textContent = e ? '✏️ Modifier employé' : '👨‍💼 Nouvel employé';
  document.getElementById('emp-editing-id').value = id || '';
  document.getElementById('emp-name').value      = e?.name || '';
  document.getElementById('emp-prenom').value    = e?.prenom || '';
  document.getElementById('emp-poste').value     = e?.poste || '';
  document.getElementById('emp-dept').value      = e?.dept || '';
  document.getElementById('emp-tel').value       = e?.tel || '';
  document.getElementById('emp-email').value     = e?.email || '';
  document.getElementById('emp-cin').value       = e?.cin || '';
  document.getElementById('emp-salaire').value   = e?.salaire || '';
  document.getElementById('emp-date-embauche').value = e?.dateEmbauche || '';
  document.getElementById('emp-contrat').value   = e?.contrat || 'CDI';
  document.getElementById('emp-local').value     = e?.local || '';
  document.getElementById('emp-statut').value    = e?.statut || 'actif';
  document.getElementById('emp-notes').value     = e?.notes || '';
  openModal('modal-employe');
}

function saveEmploye() {
  if (!isSuperAdmin() && !hasPermission('employes', 'create')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  const name = document.getElementById('emp-name').value.trim();
  if (!name) { toast('Nom requis', 'error'); return; }
  const id = document.getElementById('emp-editing-id').value;
  const lid = getLocalId();
  // lid peut être null si SA global — on utilise null comme local_id
  const data = {
    name, prenom: document.getElementById('emp-prenom').value.trim(),
    poste: document.getElementById('emp-poste').value.trim(),
    dept: document.getElementById('emp-dept').value.trim(),
    tel: document.getElementById('emp-tel').value.trim(),
    email: document.getElementById('emp-email').value.trim(),
    cin: document.getElementById('emp-cin').value.trim(),
    salaire: parseFloat(document.getElementById('emp-salaire').value) || 0,
    dateEmbauche: document.getElementById('emp-date-embauche').value,
    contrat: document.getElementById('emp-contrat').value,
    local: document.getElementById('emp-local').value.trim(),
    statut: document.getElementById('emp-statut').value,
    notes: document.getElementById('emp-notes').value.trim()
  };
  if (id) {
    const idx = employes.findIndex(x => x.id === id);
    if (idx >= 0) employes[idx] = { ...employes[idx], ...data };
    toast('Employé mis à jour');
  } else {
    employes.push({ id: uid(), local_id: lid, ...data, createdAt: new Date().toISOString() });
    toast('Employé ajouté ✅');
  }
  save(); closeModal('modal-employe'); renderEmployes();
  // Mettre à jour selects congés + docs
  updateEmployeSelects();
}

function deleteEmploye(id) {
  if (!isSuperAdmin() && !hasPermission('employes', 'delete')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  if (!confirm('Supprimer cet employé ?')) return;
  employes = employes.filter(x => x.id !== id);
  sbDelete('gp_employes', id);
  renderEmployes(); toast('Employé supprimé', 'warn');
}

function voirEmploye(id) {
  const e = employes.find(x => x.id === id);
  if (!e) return;
  // Switch to docs-rh and preselect this employee
  navigate('docs-rh');
  setTimeout(() => {
    const sel = document.getElementById('doc-rh-emp');
    if(sel) sel.value = id;
  }, 100);
}

function updateEmployeSelects() {
  ['conge-emp','doc-rh-emp'].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">Sélectionner un employé</option>` +
      employes.filter(e => e.statut !== 'inactif').map(e =>
        `<option value="${e.id}" ${e.id===cur?'selected':''}>${escapeHTML(e.name)}${e.prenom?' '+e.prenom:''} — ${e.poste||'N/A'}</option>`
      ).join('');
  });
  // BL product select
  const blSel = document.getElementById('bl-prod-select');
  if (blSel) {
    blSel.innerHTML = `<option value="">Sélectionner un produit...</option>` +
      products.map(p => `<option value="${p.id}">${escapeHTML(p.name)} (Stock: ${p.stock} ${p.unit||''})</option>`).join('');
  }
}

// ── CONGÉS ────────────────────────────────────────────────
function renderConges() {
  const filtreSt = document.getElementById('conge-filter-statut')?.value || 'all';
  const filtered = conges.filter(c => filtreSt === 'all' || c.statut === filtreSt);

  // Stats
  const statsEl = document.getElementById('conge-stats');
  if (statsEl) {
    const pending  = conges.filter(c => c.statut === 'pending').length;
    const approved = conges.filter(c => c.statut === 'approved').length;
    const rejected = conges.filter(c => c.statut === 'rejected').length;
    const totalJours = conges.filter(c => c.statut === 'approved').reduce((s, c) => s + (c.jours||0), 0);
    statsEl.innerHTML = [
      {icon:'⏳', val:pending,   lbl:'En attente',  color:'var(--gold)'},
      {icon:'✅', val:approved,  lbl:'Approuvés',   color:'var(--accent)'},
      {icon:'❌', val:rejected,  lbl:'Refusés',     color:'var(--red)'},
      {icon:'📅', val:totalJours,lbl:'Jours accordés',color:'var(--purple)'}
    ].map(s => `<div class="card" style="padding:16px;text-align:center;border-left:3px solid ${s.color}">
      <div style="font-size:22px;font-weight:700;color:${s.color};font-family:var(--font-mono),monospace;">${s.val}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:4px;">${s.icon} ${s.lbl}</div>
    </div>`).join('');
  }

  // Badge nav
  const badge = document.getElementById('badge-conges');
  const pending = conges.filter(c => c.statut === 'pending').length;
  if(badge) { badge.textContent = pending; badge.style.display = pending > 0 ? '' : 'none'; }

  const tbody = document.getElementById('conges-table');
  if (!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text2);">🏖️ Aucune demande de congé</td></tr>`;
    buildPagination('conges', 0, 'renderConges', 'conges-pagination');
    return;
  }
  const congesPage = getPage('conges');
  const congesPageData = filtered.slice((congesPage-1)*PAGE_SIZE, congesPage*PAGE_SIZE);
  const typeLabel = {annuel:'🏖️ Annuel', maladie:'🏥 Maladie', maternite:'🤱 Maternité', sans_solde:'💸 Sans solde', exceptionnel:'⚠️ Exceptionnel'};
  const stBadge = {
    pending: '<span style="background:rgba(255,209,102,.15);color:var(--gold);padding:2px 8px;border-radius:var(--radius-lg);font-size:11px;font-weight:700;">⏳ En attente</span>',
    approved:'<span style="background:rgba(37,99,235,.12);color:var(--accent);padding:2px 8px;border-radius:var(--radius-lg);font-size:11px;font-weight:700;">✅ Approuvé</span>',
    rejected:'<span style="background:rgba(255,71,87,.12);color:var(--red);padding:2px 8px;border-radius:var(--radius-lg);font-size:11px;font-weight:700;">❌ Refusé</span>'
  };
  tbody.innerHTML = congesPageData.map(c => {
    const emp = employes.find(e => e.id === c.empId);
    return `<tr>
      <td><strong>${emp?.name||'—'}</strong>${emp?.poste?`<br><small style="color:var(--text2);">${escapeHTML(emp.poste)}</small>`:''}</td>
      <td>${typeLabel[c.type]||c.type}</td>
      <td>${c.debut||'—'}</td>
      <td>${c.fin||'—'}</td>
      <td style="font-weight:700;color:var(--accent);">${c.jours||0}j</td>
      <td style="font-size:12px;color:var(--text2);">${c.motif||'—'}</td>
      <td>${stBadge[c.statut]||c.statut}</td>
      <td style="white-space:nowrap;">
        ${(c.statut==='pending'&&(isSuperAdmin()||hasPermission('conges','approuver')))?`
          <button class="btn btn-secondary btn-sm" style="color:var(--accent);border-color:rgba(37,99,235,.3);" onclick="updateCongeStatut('${c.id}','approved')">✅</button>
          <button class="btn btn-danger btn-sm" onclick="updateCongeStatut('${c.id}','rejected')">❌</button>
        `:''}\n        ${(isSuperAdmin()||hasPermission('conges','update'))?`<button class="btn btn-secondary btn-sm" onclick="openCongeModal('${c.id}')">✏️</button>`:''}
        ${(isSuperAdmin()||hasPermission('conges','delete'))?`<button class="btn btn-danger btn-sm" onclick="deleteConge('${c.id}')">🗑️</button>`:''}
    </tr>`;
  }).join('');
  buildPagination('conges', filtered.length, 'renderConges', 'conges-pagination');
}

function openCongeModal(id) {
  const c = id ? conges.find(x => x.id === id) : null;
  const neededPerm = c ? 'update' : 'create';
  if (!isSuperAdmin() && !hasPermission('conges', neededPerm)) { toast('⛔ Permission refusée', 'error'); return; }
  document.getElementById('modal-conge-title').textContent = c ? '✏️ Modifier congé' : '🏖️ Nouvelle demande';
  document.getElementById('conge-editing-id').value = id || '';
  updateEmployeSelects();
  if (c) {
    document.getElementById('conge-emp').value    = c.empId || '';
    document.getElementById('conge-type').value   = c.type || 'annuel';
    document.getElementById('conge-debut').value  = c.debut || '';
    document.getElementById('conge-fin').value    = c.fin || '';
    document.getElementById('conge-motif').value  = c.motif || '';
    document.getElementById('conge-statut').value = c.statut || 'pending';
  } else {
    ['conge-debut','conge-fin','conge-motif'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('conge-statut').value = 'pending';
  }
  openModal('modal-conge');
}

function saveConge() {
  if (!isSuperAdmin() && !hasPermission('conges', 'create')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  const empId = document.getElementById('conge-emp').value;
  const debut = document.getElementById('conge-debut').value;
  const fin   = document.getElementById('conge-fin').value;
  if (!empId || !debut || !fin) { toast('Employé, début et fin requis', 'error'); return; }
  const jours = Math.max(1, Math.round((new Date(fin) - new Date(debut)) / 86400000) + 1);
  const id = document.getElementById('conge-editing-id').value;
  const data = {
    empId, type: document.getElementById('conge-type').value,
    debut, fin, jours,
    motif: document.getElementById('conge-motif').value.trim(),
    statut: document.getElementById('conge-statut').value
  };
  if (id) {
    const idx = conges.findIndex(x => x.id === id);
    if(idx >= 0) conges[idx] = { ...conges[idx], ...data };
    toast('Congé mis à jour');
  } else {
    conges.push({ id: uid(), local_id: getLocalId(), ...data, createdAt: new Date().toISOString() });
    toast('Demande de congé enregistrée ✅');
  }
  save(); closeModal('modal-conge'); renderConges();
}

function updateCongeStatut(id, statut) {
  const c = conges.find(x => x.id === id);
  if(c) { c.statut = statut; save(); renderConges(); toast(statut==='approved'?'✅ Congé approuvé':'❌ Congé refusé'); }
}

function deleteConge(id) {
  if (!isSuperAdmin() && !hasPermission('conges', 'delete')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  if (!confirm('Supprimer cette demande ?')) return;
  conges = conges.filter(x => x.id !== id);
  sbDelete('gp_conges', id);
  renderConges();
}

// ── BONS DE LIVRAISON ─────────────────────────────────────
let blArticlesTemp = [];

function renderLivraisons() {
  const q = (document.getElementById('bl-search')?.value || '').toLowerCase();
  const statut = document.getElementById('bl-filter-statut')?.value || 'all';
  const filtered = livraisons.filter(bl =>
    (statut === 'all' || bl.statut === statut) &&
    (!q || bl.numero?.toLowerCase().includes(q) || bl.client?.toLowerCase().includes(q))
  );
  // Stats
  const statsEl = document.getElementById('bl-stats');
  if (statsEl) {
    const enCours = livraisons.filter(b=>b.statut==='en_cours').length;
    const livre   = livraisons.filter(b=>b.statut==='livre').length;
    const retour  = livraisons.filter(b=>b.statut==='retour').length;
    const total   = livraisons.reduce((s,b)=>s+(b.valeur||0),0);
    statsEl.innerHTML = [
      {icon:'🔄', val:enCours, lbl:'En cours',    color:'var(--gold)'},
      {icon:'✅', val:livre,   lbl:'Livrés',       color:'var(--accent)'},
      {icon:'↩️', val:retour,  lbl:'Retours',      color:'var(--red)'},
      {icon:'💰', val:total.toLocaleString('fr-MA',{maximumFractionDigits:0})+' MAD', lbl:'Valeur totale', color:'var(--purple)'}
    ].map(s=>`<div class="card" style="padding:16px;text-align:center;border-left:3px solid ${s.color}">
      <div style="font-size:22px;font-weight:800;color:${s.color};font-family:var(--font-mono),monospace;">${s.val}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:4px;">${s.icon} ${s.lbl}</div>
    </div>`).join('');
  }
  const tbody = document.getElementById('bl-table');
  if (!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text2);">🚚 Aucun bon de livraison</td></tr>`;
    buildPagination('bl', 0, 'renderLivraisons', 'bl-pagination');
    return;
  }
  const blPage = getPage('bl');
  const blPageData = filtered.slice((blPage-1)*PAGE_SIZE, blPage*PAGE_SIZE);
  const stBadge = {
    en_cours:`<span style="background:rgba(255,209,102,.12);color:var(--gold);padding:2px 8px;border-radius:var(--radius-lg);font-size:11px;font-weight:700;">🔄 En cours</span>`,
    livre:`<span style="background:rgba(37,99,235,.12);color:var(--accent);padding:2px 8px;border-radius:var(--radius-lg);font-size:11px;font-weight:700;">✅ Livré</span>`,
    retour:`<span style="background:rgba(255,71,87,.12);color:var(--red);padding:2px 8px;border-radius:var(--radius-lg);font-size:11px;font-weight:700;">↩️ Retour</span>`
  };
  tbody.innerHTML = blPageData.map(bl => `<tr>
    <td><strong style="font-family:var(--font-mono),monospace;">${bl.numero}</strong></td>
    <td style="font-size:12px;color:var(--text2);">${bl.date||'—'}</td>
    <td><strong>${bl.client||'—'}</strong>${bl.adresse?`<br><small style="color:var(--text2);">${escapeHTML(bl.adresse)}</small>`:''}</td>
    <td>${bl.chauffeur||'—'}</td>
    <td>${(bl.articles||[]).length} articles</td>
    <td style="font-family:var(--font-mono),monospace;font-weight:700;color:var(--accent);">${(bl.valeur||0).toLocaleString('fr-MA',{maximumFractionDigits:2})} MAD</td>
    <td>${stBadge[bl.statut]||bl.statut}</td>
    <td style="white-space:nowrap;">
      <button class="btn btn-secondary btn-sm" onclick="printBL('${bl.id}')">🖨️</button>
      ${(isSuperAdmin()||hasPermission('livraisons','update')) ? `<button class="btn btn-secondary btn-sm" onclick="openBLModal('${bl.id}')">✏️</button>` : ''}
      ${(isSuperAdmin()||hasPermission('livraisons','delete')) ? `<button class="btn btn-danger btn-sm" onclick="deleteBL('${bl.id}')">🗑️</button>` : ''}
    </td>
  </tr>`).join('');
  buildPagination('bl', filtered.length, 'renderLivraisons', 'bl-pagination');
}

function openBLModal(id) {
  blArticlesTemp = [];
  const bl = id ? livraisons.find(x => x.id === id) : null;
  document.getElementById('modal-bl-title').textContent = bl ? '✏️ Modifier BL' : '🚚 Nouveau Bon de Livraison';
  document.getElementById('bl-editing-id').value = id || '';
  // Auto-generate number
  if (!bl) {
    const num = 'BL-' + String(livraisons.length + 1).padStart(4, '0');
    document.getElementById('bl-numero').value = num;
    document.getElementById('bl-date').value = new Date().toISOString().split('T')[0];
    ['bl-client','bl-tel','bl-adresse','bl-chauffeur','bl-vehicule','bl-notes'].forEach(i => document.getElementById(i).value='');
    document.getElementById('bl-statut').value = 'en_cours';
  } else {
    document.getElementById('bl-numero').value    = bl.numero;
    document.getElementById('bl-date').value      = bl.date;
    document.getElementById('bl-client').value    = bl.client;
    document.getElementById('bl-tel').value       = bl.tel||'';
    document.getElementById('bl-adresse').value   = bl.adresse||'';
    document.getElementById('bl-chauffeur').value = bl.chauffeur||'';
    document.getElementById('bl-vehicule').value  = bl.vehicule||'';
    document.getElementById('bl-statut').value    = bl.statut;
    document.getElementById('bl-notes').value     = bl.notes||'';
    blArticlesTemp = [...(bl.articles||[])];
  }
  // populate product select
  const sel = document.getElementById('bl-prod-select');
  sel.innerHTML = `<option value="">Sélectionner un produit...</option>` +
    products.map(p=>`<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
  renderBLArticlesTemp();
  openModal('modal-bl');
}

function addBLArticle() {
  const sel = document.getElementById('bl-prod-select');
  const qty = parseFloat(document.getElementById('bl-prod-qty').value);
  const pid = sel.value;
  if (!pid || !qty || qty <= 0) { toast('Sélectionner un produit et une quantité', 'warn'); return; }
  const prod = products.find(p=>p.id===pid);
  if (!prod) return;
  const existing = blArticlesTemp.find(a=>a.pid===pid);
  if (existing) existing.qty += qty;
  else blArticlesTemp.push({ pid, name: prod.name, qty, unit: prod.unit||'pcs', prixU: prod.price });
  sel.value=''; document.getElementById('bl-prod-qty').value='';
  renderBLArticlesTemp();
}

function renderBLArticlesTemp() {
  const container = document.getElementById('bl-articles-list');
  if (!container) return;
  if (!blArticlesTemp.length) { container.innerHTML='<div style="color:var(--text2);font-size:12px;padding:8px;">Aucun article ajouté</div>'; return; }
  container.innerHTML = blArticlesTemp.map((a,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--surface2);border-radius:8px;margin-bottom:5px;">
      <span style="flex:1;font-size:13px;font-weight:600;">${escapeHTML(a.name)}</span>
      <input type="number" value="${a.qty}" min="0.001" step="0.001" style="width:72px;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:4px 8px;color:var(--text);font-family:var(--font-mono),monospace;font-size:13px;"
        onchange="blArticlesTemp[${i}].qty=parseFloat(this.value)||0;renderBLArticlesTemp()">
      <span style="font-size:11px;color:var(--text2);">${a.unit}</span>
      <span style="font-family:var(--font-mono),monospace;font-size:12px;color:var(--accent);min-width:70px;text-align:right;">${(a.prixU*a.qty).toFixed(2)} MAD</span>
      <button onclick="blArticlesTemp.splice(${i},1);renderBLArticlesTemp()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;">✕</button>
    </div>`).join('');
}

function saveBL() {
  if (!isSuperAdmin() && !hasPermission('livraisons', 'create')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  const client = document.getElementById('bl-client').value.trim();
  if (!client) { toast('Client requis', 'error'); return; }
  const id = document.getElementById('bl-editing-id').value;
  const valeur = blArticlesTemp.reduce((s,a)=>s+a.prixU*a.qty,0);
  const data = {
    numero: document.getElementById('bl-numero').value,
    date:   document.getElementById('bl-date').value,
    client, tel: document.getElementById('bl-tel').value,
    adresse: document.getElementById('bl-adresse').value,
    chauffeur: document.getElementById('bl-chauffeur').value,
    vehicule: document.getElementById('bl-vehicule').value,
    statut: document.getElementById('bl-statut').value,
    notes: document.getElementById('bl-notes').value,
    articles: [...blArticlesTemp], valeur
  };
  if (id) {
    const idx = livraisons.findIndex(x=>x.id===id);
    if(idx>=0) livraisons[idx] = {...livraisons[idx],...data};
    toast('Bon de livraison mis à jour');
  } else {
    livraisons.push({id:uid(), local_id: getLocalId(), ...data, createdAt:new Date().toISOString()});
    toast('Bon de livraison créé ✅');
  }
  save(); closeModal('modal-bl'); renderLivraisons();
}

function deleteBL(id) {
  if (!isSuperAdmin() && !hasPermission('livraisons', 'delete')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  if (!confirm('Supprimer ce bon de livraison ?')) return;
  livraisons = livraisons.filter(x=>x.id!==id);
  sbDelete('gp_livraisons', id);
  renderLivraisons();
}

function printBL(id) {
  const bl = livraisons.find(x=>x.id===id);
  if (!bl) return;
  const store = settings.storeName || 'GestionPro';
  const logo = settings.storeLogo ? `<img src="${settings.storeLogo}" style="height:60px;object-fit:contain;">` : '';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>BL ${bl.numero}</title>
  <style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:30px;color:#111;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:20px;}
  .bl-title{font-size:28px;font-weight:800;color:#2563eb;}
  h3{font-size:14px;font-weight:700;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:12px;}
  table{width:100%;border-collapse:collapse;margin-bottom:20px;}
  th{background:#f0f9f7;padding:10px;text-align:left;font-size:12px;text-transform:uppercase;color:#555;}
  td{padding:10px;border-bottom:1px solid #eee;font-size:13px;}
  .total-row{background:#f0f9f7;font-weight:800;}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;}
  .info-block{background:#f8f8f8;padding:14px;border-radius:8px;}
  .info-block label{font-size:10px;text-transform:uppercase;color:#888;display:block;margin-bottom:3px;}
  .info-block span{font-weight:700;font-size:14px;}
  .statut{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;}
  .st-en_cours{background:#fff3cd;color:#856404;} .st-livre{background:#d1f0e8;color:#0a6948;} .st-retour{background:#fde8e8;color:#92190e;}
  .sig-area{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:30px;}
  .sig-box{border-top:2px dashed #ccc;padding-top:8px;font-size:12px;color:#888;}
  @media print{body{padding:10px;}}</style></head><body>
  <div class="header"><div>${logo}<div class="bl-title">Bon de Livraison</div><div style="font-size:22px;font-weight:800;color:#555;margin-top:4px;">${bl.numero}</div></div>
  <div style="text-align:right;"><div style="font-size:15px;font-weight:700;">${store}</div><div style="font-size:12px;color:#888;">${settings.storeAddress||''}</div><div style="font-size:12px;color:#888;">${settings.storePhone||''}</div></div></div>
  <div class="info-grid">
    <div class="info-block"><label>Client / Destinataire</label><span>${escapeHTML(bl.client)}</span>${bl.tel?`<br><small>${bl.tel}</small>`:''}<br>${bl.adresse||''}</div>
    <div class="info-block"><label>Livraison</label><span>${bl.date||'—'}</span><br><small>Chauffeur: ${bl.chauffeur||'—'}</small><br><small>Véhicule: ${bl.vehicule||'—'}</small><br><span class="statut st-${bl.statut}">${{en_cours:'🔄 En cours',livre:'✅ Livré',retour:'↩️ Retour'}[bl.statut]||bl.statut}</span></div>
  </div>
  <h3>Articles</h3>
  <table><thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th>Prix unit.</th><th>Total</th></tr></thead>
  <tbody>${(bl.articles||[]).map(a=>`<tr><td>${escapeHTML(a.name)}</td><td style="font-weight:700;">${a.qty}</td><td>${a.unit||''}</td><td>${a.prixU?.toFixed(2)||'—'} MAD</td><td style="font-weight:700;">${(a.prixU*a.qty).toFixed(2)} MAD</td></tr>`).join('')}
  <tr class="total-row"><td colspan="4" style="text-align:right;">TOTAL</td><td>${bl.valeur?.toFixed(2)||'0.00'} MAD</td></tr></tbody></table>
  ${bl.notes?`<div style="background:#f8f8f8;padding:12px;border-radius:8px;font-size:13px;margin-bottom:20px;"><strong>Notes:</strong> ${escapeHTML(bl.notes)}</div>`:''}
  <div class="sig-area"><div class="sig-box">Signature expéditeur :<br><br><br></div><div class="sig-box">Signature destinataire :<br><br><br></div></div>
  <script>window.print();<\/script></body></html>`;
  const _blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const _url = URL.createObjectURL(_blob);
  const win = window.open(_url, '_blank');
  if (win) setTimeout(() => URL.revokeObjectURL(_url), 10000);
}

// ── DOCUMENTS RH ──────────────────────────────────────────
function renderDocsRH() {
  updateEmployeSelects();
  const tbody = document.getElementById('docs-rh-history');
  if (!tbody) return;
  if (!docsRHHistory.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text2);">Aucun document généré</td></tr>`;
    return;
  }
  const docsrhSorted = docsRHHistory.slice().reverse();
  const docsrhPage = getPage('docsrh');
  const docsrhPageData = docsrhSorted.slice((docsrhPage-1)*PAGE_SIZE, docsrhPage*PAGE_SIZE);
  tbody.innerHTML = docsrhPageData.map(d => {
    const emp = employes.find(e=>e.id===d.empId);
    const typeLabel = {certificat_travail:'📜 Certificat de travail', attestation_salaire:'💰 Attestation de salaire', lettre_recommandation:'✉️ Lettre de recommandation'};
    return `<tr>
      <td style="font-size:12px;color:var(--text2);">${new Date(d.date).toLocaleDateString('fr-FR')}</td>
      <td><strong>${emp?.name||'—'}</strong></td>
      <td>${typeLabel[d.type]||d.type}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="regenDocRH('${d.id}')">🖨️ Réimprimer</button></td>
    </tr>`;
  }).join('');
  buildPagination('docsrh', docsRHHistory.length, 'renderDocsRH', 'docsrh-pagination');
}

function updateDocRHForm() {
  const type = document.getElementById('doc-rh-type')?.value;
  const extra = document.getElementById('doc-rh-extra-fields');
  if (!extra) return;
  if (type === 'certificat_travail') {
    extra.innerHTML = `<label>Destinataire</label><input type="text" id="doc-dest" placeholder="À qui de droit" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;">`;
  } else if (type === 'attestation_salaire') {
    extra.innerHTML = `<label>Organisme demandeur</label><input type="text" id="doc-dest" placeholder="Banque, administration..." style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;">`;
  } else {
    extra.innerHTML = '';
  }
}

function genererDocRH() {
  if (!isSuperAdmin() && !hasPermission('docs_rh','create')) { toast('⛔ Permission refusée', 'error'); return; }
  const empId = document.getElementById('doc-rh-emp')?.value;
  const type  = document.getElementById('doc-rh-type')?.value;
  if (!empId) { toast('Sélectionnez un employé', 'warn'); return; }
  const emp = employes.find(e=>e.id===empId);
  if (!emp) return;
  const dest = document.getElementById('doc-dest')?.value || 'À qui de droit';
  const entry = { id: uid(), local_id: getLocalId(), empId, type, dest, date: new Date().toISOString() };
  docsRHHistory.push(entry);
  save();
  imprimerDocRH(entry, emp);
  renderDocsRH();
}

function regenDocRH(id) {
  const doc = docsRHHistory.find(d=>d.id===id);
  if (!doc) return;
  const emp = employes.find(e=>e.id===doc.empId);
  if (!emp) { toast('Employé introuvable', 'error'); return; }
  imprimerDocRH(doc, emp);
}

function imprimerDocRH(doc, emp) {
  const store = settings.storeName || 'GestionPro';
  const logo = settings.storeLogo ? `<img src="${settings.storeLogo}" style="height:60px;object-fit:contain;">` : `<div style="font-size:22px;font-weight:700;color:#2563eb;">${store}</div>`;
  const today = new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
  const dateEmb = emp.dateEmbauche ? new Date(emp.dateEmbauche).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}) : '—';
  const annees = emp.dateEmbauche ? Math.floor((new Date()-new Date(emp.dateEmbauche))/31536000000) : 0;

  let corps = '';
  if (doc.type === 'certificat_travail') {
    corps = `
      <p>Je soussigné(e), la Direction de <strong>${store}</strong>, certifie par la présente que :</p>
      <div class="emp-card">
        <div><strong>M. / Mme :</strong> ${escapeHTML(emp.name)} ${escapeHTML(emp.prenom||'')}</div>
        <div><strong>CIN :</strong> ${emp.cin||'—'}</div>
        <div><strong>Poste :</strong> ${emp.poste||'—'}</div>
        <div><strong>Département :</strong> ${emp.dept||'—'}</div>
        <div><strong>Type de contrat :</strong> ${emp.contrat||'CDI'}</div>
        <div><strong>Date d'embauche :</strong> ${dateEmb}</div>
        <div><strong>Ancienneté :</strong> ${annees} an(s)</div>
      </div>
      <p>est bien employé(e) dans notre entreprise à la date de délivrance du présent certificat.</p>
      <p>Ce certificat de travail est délivré à <strong>${doc.dest||'qui de droit'}</strong>, pour servir et valoir ce que de droit.</p>`;
  } else if (doc.type === 'attestation_salaire') {
    corps = `
      <p>Je soussigné(e), la Direction de <strong>${store}</strong>, atteste que :</p>
      <div class="emp-card">
        <div><strong>M. / Mme :</strong> ${escapeHTML(emp.name)} ${escapeHTML(emp.prenom||'')}</div>
        <div><strong>Poste :</strong> ${emp.poste||'—'}</div>
        <div><strong>Salaire net mensuel :</strong> <strong style="font-size:18px;">${emp.salaire?Number(emp.salaire).toLocaleString('fr-MA'):'—'} MAD</strong></div>
        <div><strong>Type de contrat :</strong> ${emp.contrat||'CDI'}</div>
      </div>
      <p>Cette attestation est délivrée à la demande de l'intéressé(e) pour être remise à <strong>${doc.dest||'qui de droit'}</strong>.</p>`;
  } else {
    corps = `
      <p>C'est avec plaisir que nous témoignons de notre entière satisfaction quant au travail accompli par :</p>
      <div class="emp-card">
        <div><strong>M. / Mme :</strong> ${escapeHTML(emp.name)} ${escapeHTML(emp.prenom||'')}</div>
        <div><strong>Poste occupé :</strong> ${emp.poste||'—'}</div>
        <div><strong>Période :</strong> du ${dateEmb} à ce jour</div>
      </div>
      <p>Durant sa période au sein de notre entreprise, cette personne a fait preuve de sérieux, de compétences professionnelles et d'un comportement irréprochable. Nous la recommandons sans réserve à tout employeur potentiel.</p>`;
  }

  const titles = {certificat_travail:'Certificat de Travail', attestation_salaire:'Attestation de Salaire', lettre_recommandation:'Lettre de Recommandation'};
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titles[doc.type]}</title>
  <style>
    body{font-family:'Georgia',serif;max-width:700px;margin:0 auto;padding:40px;color:#222;line-height:1.7;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:30px;}
    .doc-title{text-align:center;font-size:22px;font-weight:800;letter-spacing:1px;text-transform:uppercase;border-bottom:2px solid #2563eb;border-top:2px solid #2563eb;padding:10px 0;margin:20px 0 28px;}
    .emp-card{background:#f7fdf9;border-left:4px solid #2563eb;padding:16px 20px;border-radius:0 8px 8px 0;margin:16px 0;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:14px;}
    p{font-size:14px;margin-bottom:14px;}
    .sig-area{margin-top:50px;display:grid;grid-template-columns:1fr 1fr;gap:40px;}
    .sig-box{text-align:center;font-size:12px;color:#888;}
    .sig-line{border-top:2px solid #ccc;margin-top:40px;padding-top:8px;}
    @media print{body{padding:15px;}}
  </style></head><body>
  <div class="header">${logo}<div style="text-align:right;font-size:12px;color:#888;"><div>${store}</div><div>${settings.storeAddress||''}</div><div>${settings.storePhone||''}</div><div>ICE: ${settings.storeIce||'—'}</div></div></div>
  <div style="text-align:right;font-size:13px;color:#888;margin-bottom:10px;">${store}, le ${today}</div>
  <div class="doc-title">${titles[doc.type]}</div>
  ${corps}
  <div class="sig-area">
    <div></div>
    <div class="sig-box"><div>${store}</div><div style="color:#555;margin-top:4px;">Le Directeur / La Direction</div><div class="sig-line">Signature et cachet</div></div>
  </div>
  <script>window.print();<\/script></body></html>`;
  const _blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const _url = URL.createObjectURL(_blob);
  const win = window.open(_url, '_blank');
  if (win) setTimeout(() => URL.revokeObjectURL(_url), 10000);
}

// ── DOCUMENTS ADMINISTRATIFS ──────────────────────────────
function openDocAdmin(type) {
  if (!isSuperAdmin() && !hasPermission('docs_admin','create')) { toast('⛔ Permission refusée', 'error'); return; }
  const forms = {
    procuration: `
      <div class="form-grid">
        <div class="form-group full"><label>Mandant (qui donne la procuration)</label><input type="text" id="da-mandant" placeholder="Nom et prénom" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;"></div>
        <div class="form-group full"><label>Mandataire (qui reçoit la procuration)</label><input type="text" id="da-mandataire" placeholder="Nom et prénom" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;"></div>
        <div class="form-group full"><label>Objet / Mission</label><textarea id="da-objet" rows="3" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;resize:vertical;" placeholder="Décrire la mission confiée..."></textarea></div>
        <div class="form-group"><label>Valable jusqu'au</label><input type="date" id="da-validite" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;"></div>
      </div>`,
    attestation_activite: `
      <div class="form-grid">
        <div class="form-group"><label>Destinataire</label><input type="text" id="da-dest" placeholder="Banque, administration..." style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;"></div>
        <div class="form-group"><label>Secteur d'activité</label><input type="text" id="da-activite" value="${settings.storeAddress||'Commerce'}" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;"></div>
      </div>`,
    lettre_partenariat: `
      <div class="form-grid">
        <div class="form-group full"><label>Entreprise partenaire</label><input type="text" id="da-partenaire" placeholder="Nom de l'entreprise" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;"></div>
        <div class="form-group full"><label>Objet du partenariat</label><textarea id="da-objet" rows="3" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;resize:vertical;" placeholder="Description de la collaboration envisagée..."></textarea></div>
      </div>`,
    mise_en_demeure: `
      <div class="form-grid">
        <div class="form-group full"><label>Débiteur (nom/société)</label><input type="text" id="da-debiteur" placeholder="Nom complet ou raison sociale" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;"></div>
        <div class="form-group"><label>Montant dû (MAD)</label><input type="number" id="da-montant" placeholder="0.00" step="0.01" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;"></div>
        <div class="form-group"><label>Délai de paiement (jours)</label><input type="number" id="da-delai" value="15" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;"></div>
        <div class="form-group full"><label>Motif / Détail de la créance</label><textarea id="da-motif" rows="2" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font),sans-serif;width:100%;resize:vertical;" placeholder="Factures impayées, livraisons non réglées..."></textarea></div>
      </div>`
  };
  const titles = {procuration:'📜 Procuration', attestation_activite:'🏢 Attestation d\'activité', lettre_partenariat:'🤝 Lettre de partenariat', mise_en_demeure:'⚖️ Mise en demeure'};
  document.getElementById('modal-doc-admin-title').textContent = titles[type] || 'Document';
  document.getElementById('doc-admin-form').innerHTML = forms[type] || '';
  document.getElementById('modal-doc-admin').dataset.type = type;
  openModal('modal-doc-admin');
}

function genererDocAdmin() {
  const type = document.getElementById('modal-doc-admin').dataset.type;
  const store = settings.storeName || 'GestionPro';
  const logo = settings.storeLogo ? `<img src="${settings.storeLogo}" style="height:60px;object-fit:contain;">` : `<div style="font-size:22px;font-weight:800;color:#2563eb;">${store}</div>`;
  const today = new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
  let title = '', corps = '';
  if (type === 'procuration') {
    const mandant = document.getElementById('da-mandant')?.value || '—';
    const mandataire = document.getElementById('da-mandataire')?.value || '—';
    const objet = document.getElementById('da-objet')?.value || '—';
    const validite = document.getElementById('da-validite')?.value;
    title = 'Procuration';
    corps = `<p>Je soussigné(e) <strong>${mandant}</strong>, donne par la présente procuration à <strong>${mandataire}</strong>, la mission de me représenter et d'agir en mon nom pour :</p>
    <div style="background:#f7fdf9;border-left:4px solid #2563eb;padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0;font-style:italic;">${objet}</div>
    ${validite ? `<p>Cette procuration est valable jusqu'au <strong>${new Date(validite).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})}</strong>.</p>` : ''}
    <p>Fait pour servir et valoir ce que de droit.</p>`;
  } else if (type === 'attestation_activite') {
    const dest = document.getElementById('da-dest')?.value || 'qui de droit';
    const activite = document.getElementById('da-activite')?.value || '—';
    title = "Attestation d'Activité";
    corps = `<p>La société <strong>${store}</strong>${settings.storeAddress?', sise '+settings.storeAddress:''}, déclare exercer régulièrement une activité commerciale dans le domaine :</p>
    <div style="background:#f7fdf9;border-left:4px solid #2563eb;padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0;font-size:16px;font-weight:700;">${activite}</div>
    <p>La présente attestation est délivrée à <strong>${dest}</strong>, pour servir et valoir ce que de droit.</p>`;
  } else if (type === 'lettre_partenariat') {
    const partenaire = document.getElementById('da-partenaire')?.value || '—';
    const objet = document.getElementById('da-objet')?.value || '—';
    title = 'Lettre de Partenariat';
    corps = `<p>Nous avons l'honneur de vous adresser la présente afin de vous soumettre une proposition de partenariat commercial entre <strong>${store}</strong> et <strong>${partenaire}</strong>.</p>
    <p><strong>Objet du partenariat :</strong></p>
    <div style="background:#f7fdf9;border-left:4px solid #2563eb;padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0;">${objet}</div>
    <p>Convaincus de l'intérêt mutuel de cette collaboration, nous espérons une réponse favorable à notre proposition.</p>`;
  } else if (type === 'mise_en_demeure') {
    const debiteur = document.getElementById('da-debiteur')?.value || '—';
    const montant = parseFloat(document.getElementById('da-montant')?.value)||0;
    const delai = document.getElementById('da-delai')?.value || 15;
    const motif = document.getElementById('da-motif')?.value || '—';
    const echeance = new Date(Date.now() + delai * 86400000).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
    title = 'Mise en Demeure';
    corps = `<p>Nous mettons en demeure par la présente <strong>${debiteur}</strong> de nous régler dans un délai de <strong>${delai} jours</strong> (soit avant le <strong>${echeance}</strong>), la somme de :</p>
    <div style="text-align:center;background:#fff0f0;border:2px solid #ff4757;padding:20px;border-radius:var(--radius);margin:20px 0;font-size:28px;font-weight:800;color:#ff4757;">${montant.toLocaleString('fr-MA',{minimumFractionDigits:2})} MAD</div>
    <p>Au titre de : ${motif}</p>
    <p>À défaut de règlement dans le délai imparti, nous nous réservons le droit d'engager toutes procédures judiciaires à votre encontre, sans autre formalité préalable.</p>`;
  }
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
  <style>body{font-family:'Georgia',serif;max-width:700px;margin:0 auto;padding:40px;color:#222;line-height:1.7;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:30px;}
  .doc-title{text-align:center;font-size:22px;font-weight:800;letter-spacing:1px;text-transform:uppercase;border-bottom:2px solid #2563eb;border-top:2px solid #2563eb;padding:10px 0;margin:20px 0 28px;}
  p{font-size:14px;margin-bottom:14px;}
  .sig-area{margin-top:50px;display:grid;grid-template-columns:1fr 1fr;gap:40px;}
  .sig-box{text-align:center;font-size:12px;color:#888;}
  .sig-line{border-top:2px solid #ccc;margin-top:40px;padding-top:8px;}
  @media print{body{padding:15px;}}
  </style></head><body>
  <div class="header">${logo}<div style="text-align:right;font-size:12px;color:#888;"><div>${store}</div><div>${settings.storeAddress||''}</div><div>${settings.storePhone||''}</div></div></div>
  <div style="text-align:right;font-size:13px;color:#888;margin-bottom:10px;">${store}, le ${today}</div>
  <div class="doc-title">${title}</div>
  ${corps}
  <div class="sig-area"><div></div><div class="sig-box"><div>${store}</div><div style="color:#555;margin-top:4px;">La Direction</div><div class="sig-line">Signature et cachet</div></div></div>
  <script>window.print();<\/script></body></html>`;
  const _blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const _url = URL.createObjectURL(_blob);
  const win = window.open(_url, '_blank');
  if (win) setTimeout(() => URL.revokeObjectURL(_url), 10000);
  // Sauvegarder dans l'historique docs RH
  const entryAdmin = {
    id: uid(), local_id: getLocalId(),
    empId: null, empName: null,
    type: 'doc_admin_' + type,
    contenu: { title, type },
    date: new Date().toISOString()
  };
  docsRHHistory.push(entryAdmin);
  save();
  closeModal('modal-doc-admin');
}
