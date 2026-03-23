/* ================================================================
   GestionPro — modules/conteneurs.js
   Gestion conteneurs & ordres : setRetardMode, addRefLine,
   saveConteneur, editConteneur, deleteConteneur, viewConteneur,
   addToStockFromConteneur, renderConteneurs,
   openNewOrdre, showOrdrePDF, printOrdre, renderOrdres
================================================================ */

// ════════════════════════════════════════════
// CONTENEURS
// ════════════════════════════════════════════
let currentConteneurId = null;
let refLineCount = 0;

let retardMode = 'auto';

function setRetardMode(mode) {
  retardMode = mode;
  const autoF = document.getElementById('retard-auto-fields');
  const manF = document.getElementById('retard-manuel-fields');
  const btnA = document.getElementById('btn-retard-auto');
  const btnM = document.getElementById('btn-retard-manuel');
  if (mode === 'auto') {
    autoF.style.display = 'grid';
    manF.style.display = 'none';
    btnA.style.border = '2px solid var(--accent)'; btnA.style.background = 'rgba(37,99,235,0.12)'; btnA.style.color = 'var(--accent)';
    btnM.style.border = '2px solid var(--border)'; btnM.style.background = 'transparent'; btnM.style.color = 'var(--text2)';
  } else {
    autoF.style.display = 'none';
    manF.style.display = 'block';
    btnM.style.border = '2px solid var(--red,#e53e3e)'; btnM.style.background = 'rgba(229,62,62,0.1)'; btnM.style.color = 'var(--red,#e53e3e)';
    btnA.style.border = '2px solid var(--border)'; btnA.style.background = 'transparent'; btnA.style.color = 'var(--text2)';
  }
  updateTotalFrais();
}

function autoCalcJoursRetard() {
  const limite = document.getElementById('c-date-limite')?.value;
  if (!limite) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const lim = new Date(limite);
  const jours = Math.max(0, Math.ceil((today - lim) / 86400000));
  const input = document.getElementById('c-jours-retard');
  const hint = document.getElementById('jours-auto-hint');
  if (input && jours > 0) {
    input.value = jours;
    if (hint) hint.textContent = `(${jours} j calculés auto)`;
    updateTotalFrais();
  } else if (hint) {
    hint.textContent = '';
  }
}

function getRetardFrais() {
  const v = id => parseFloat(document.getElementById(id)?.value) || 0;
  if (retardMode === 'manuel') {
    return { montant: v('c-fretard-total'), joursRetard: 0, fraisRetardJour: 0 };
  } else {
    const jours = v('c-jours-retard');
    const parJour = v('c-fretard-jour');
    const montant = jours * parJour;
    const preview = document.getElementById('retard-calcul-preview');
    if (preview) {
      if (montant > 0) {
        preview.style.display = 'block';
        preview.textContent = `${jours} jours × ${parJour.toFixed(2)} MAD/j = ${montant.toFixed(2)} MAD de frais de retard`;
      } else preview.style.display = 'none';
    }
    return { montant, joursRetard: jours, fraisRetardJour: parJour };
  }
}

function updateTotalFraisManuel() { updateTotalFrais(); }

function updateTotalFrais() {
  const v = id => parseFloat(document.getElementById(id)?.value) || 0;
  const retard = getRetardFrais();
  const total = v('c-fdouane') + v('c-fport') + v('c-ftransit') + v('c-fautres') + retard.montant;
  const el = document.getElementById('total-frais-display');
  if (el) el.textContent = total.toLocaleString('fr-FR',{minimumFractionDigits:2}) + ' MAD';
}

function addRefLine(ref) {
  refLineCount++;
  const n = refLineCount;
  const r = ref || {};
  const div = document.createElement('div');
  div.id = 'ref-line-' + n;
  div.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:10px;';
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div style="font-size:12px;font-weight:700;color:var(--accent);">${t('ref_title')} #${n}</div>
      <button onclick="document.getElementById('ref-line-${n}').remove()" class="btn btn-danger btn-sm">🗑️</button>
    </div>
    <div class="form-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="form-group"><label>${t('ref_code')}</label><input type="text" id="ref-code-${n}" value="${r.refCode||''}" placeholder="S-1, REF-001..."></div>
      <div class="form-group"><label>${t('ref_nom')}</label><input type="text" id="ref-nom-${n}" value="${r.produitNom||''}" placeholder="Skmei Watch..."></div>
      <div class="form-group"><label>${t('ref_cartons')}</label><input type="number" id="ref-cartons-${n}" value="${r.nbCartons||''}" placeholder="30" min="1"></div>
      <div class="form-group"><label>${t('ref_pcs')}</label><input type="number" id="ref-pcs-${n}" value="${r.pcsParCarton||''}" placeholder="30" min="1"></div>
      <div class="form-group"><label>${t('ref_poids')}</label><input type="number" id="ref-poids-${n}" value="${r.poidsCarton||''}" placeholder="5.00" step="0.01"></div>
      <div class="form-group"><label>${t('ref_prix')}</label><input type="number" id="ref-prix-${n}" value="${r.prixAchatUnit||''}" placeholder="0.00" step="0.01"></div>
      <div class="form-group"><label>${t('ref_long')}</label><input type="number" id="ref-long-${n}" value="${r.longueur||''}" placeholder="60" step="0.1"></div>
      <div class="form-group"><label>${t('ref_larg')}</label><input type="number" id="ref-larg-${n}" value="${r.largeur||''}" placeholder="40" step="0.1"></div>
      <div class="form-group"><label>${t('ref_haut')}</label><input type="number" id="ref-haut-${n}" value="${r.hauteur||''}" placeholder="30" step="0.1"></div>
    </div>
  `;
  document.getElementById('refs-list').appendChild(div);
}

function getRefsFromForm() {
  const refs = [];
  document.querySelectorAll('[id^="ref-code-"]').forEach(el => {
    const n = el.id.split('-').pop();
    const code = el.value.trim();
    if (!code) return;
    const cartons = parseInt(document.getElementById('ref-cartons-'+n)?.value)||0;
    const pcs = parseInt(document.getElementById('ref-pcs-'+n)?.value)||0;
    const prixUnit = parseFloat(document.getElementById('ref-prix-'+n)?.value)||0;
    refs.push({
      refCode: code,
      produitNom: document.getElementById('ref-nom-'+n)?.value.trim()||'',
      nbCartons: cartons,
      pcsParCarton: pcs,
      qtyTotale: cartons * pcs,
      poidsCarton: parseFloat(document.getElementById('ref-poids-'+n)?.value)||0,
      longueur: parseFloat(document.getElementById('ref-long-'+n)?.value)||0,
      largeur: parseFloat(document.getElementById('ref-larg-'+n)?.value)||0,
      hauteur: parseFloat(document.getElementById('ref-haut-'+n)?.value)||0,
      prixAchatUnit: prixUnit,
      montantTotal: prixUnit * cartons * pcs,
      fraisRepartis: 0,
      prixAchatReel: prixUnit
    });
  });
  return refs;
}

function getTotalFrais() {
  const v = id => parseFloat(document.getElementById(id)?.value)||0;
  return v('c-fdouane') + v('c-fport') + v('c-ftransit') + v('c-fautres') + getRetardFrais().montant;
}

function repartirFrais(refs, totalFrais, methode) {
  if (!refs.length || totalFrais === 0) return refs.map(r => ({...r, fraisRepartis:0, prixAchatReel:r.prixAchatUnit}));
  let totBase = 0;
  if (methode === 'valeur') totBase = refs.reduce((s,r) => s + r.montantTotal, 0);
  else if (methode === 'poids') totBase = refs.reduce((s,r) => s + (r.poidsCarton * r.nbCartons), 0);
  else totBase = refs.length;

  return refs.map(r => {
    let base = methode === 'valeur' ? r.montantTotal
             : methode === 'poids' ? (r.poidsCarton * r.nbCartons)
             : 1;
    const frais = totBase > 0 ? (base / totBase) * totalFrais : 0;
    const qtyTot = r.nbCartons * r.pcsParCarton;
    const prixReel = qtyTot > 0 ? r.prixAchatUnit + (frais / qtyTot) : r.prixAchatUnit;
    return {...r, fraisRepartis: frais, prixAchatReel: prixReel};
  });
}

function previewRepartition() {
  const refs = getRefsFromForm();
  if (!refs.length) { toast('Ajoutez au moins une référence', 'warn'); return; }
  const totalFrais = getTotalFrais();
  const methode = document.querySelector('input[name="repartition"]:checked')?.value || 'poids';
  const refsCalc = repartirFrais(refs, totalFrais, methode);
  const mLabels = {valeur:'Proportionnel à la valeur', poids:'Proportionnel au poids', egal:'Parts égales'};

  const rows = refsCalc.map(r => `
    <tr>
      <td style="padding:8px 10px;border:1px solid var(--border);font-weight:700;">${r.refCode}</td>
      <td style="padding:8px 10px;border:1px solid var(--border);">${r.produitNom}</td>
      <td style="padding:8px 10px;border:1px solid var(--border);text-align:center;">${r.nbCartons} × ${r.pcsParCarton} = <strong>${r.qtyTotale}</strong></td>
      <td style="padding:8px 10px;border:1px solid var(--border);text-align:right;">${r.montantTotal.toFixed(2)}</td>
      <td style="padding:8px 10px;border:1px solid var(--border);text-align:right;color:#e53e3e;">+${r.fraisRepartis.toFixed(2)}</td>
      <td style="padding:8px 10px;border:1px solid var(--border);text-align:right;font-weight:800;color:#00916e;">${r.prixAchatReel.toFixed(4)}</td>
    </tr>
  `).join('');

  document.getElementById('repartition-content').innerHTML = `
    <div style="background:rgba(108,99,255,0.08);border:1px solid rgba(108,99,255,0.25);border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;">
      <strong>Méthode :</strong> ${mLabels[methode]} &nbsp;|&nbsp;
      <strong>Total frais :</strong> <span style="color:#e53e3e;font-weight:800;">${totalFrais.toLocaleString('fr-FR',{minimumFractionDigits:2})} MAD</span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#1a3a6b;color:#fff;">
        <th style="padding:8px 10px;">Réf.</th>
        <th style="padding:8px 10px;">Produit</th>
        <th style="padding:8px 10px;text-align:center;">Cartons × Pcs = Total</th>
        <th style="padding:8px 10px;text-align:right;">Valeur achat</th>
        <th style="padding:8px 10px;text-align:right;">Frais alloués</th>
        <th style="padding:8px 10px;text-align:right;">Prix réel/pcs</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="background:var(--surface2);font-weight:800;">
        <td colspan="3" style="padding:9px 10px;border:1px solid var(--border);">TOTAL</td>
        <td style="padding:9px 10px;border:1px solid var(--border);text-align:right;">${refsCalc.reduce((s,r)=>s+r.montantTotal,0).toFixed(2)}</td>
        <td style="padding:9px 10px;border:1px solid var(--border);text-align:right;color:#e53e3e;">+${totalFrais.toFixed(2)}</td>
        <td style="padding:9px 10px;border:1px solid var(--border);"></td>
      </tfoot>
    </table>
  `;
  openModal('modal-repartition');
}

function saveConteneur() {
  if (!isSuperAdmin() && !hasPermission('conteneurs', 'create')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  const numero = document.getElementById('c-numero')?.value.trim();
  if (!numero) { toast('N° conteneur obligatoire', 'error'); return; }
  const refs = getRefsFromForm();
  if (!refs.length) { toast('Ajoutez au moins une référence', 'error'); return; }
  const totalFrais = getTotalFrais();
  const methode = document.querySelector('input[name="repartition"]:checked')?.value || 'poids';
  const refsCalc = repartirFrais(refs, totalFrais, methode);
  const v = id => document.getElementById(id)?.value || '';
  const nv = id => parseFloat(document.getElementById(id)?.value)||0;

  const cont = {
    id: currentConteneurId || uid(),
    local_id: getLocalId(),
    numero, fournisseur: v('c-fournisseur'), pays: v('c-pays'),
    type: v('c-type'),
    dateArrivee: v('c-date-arrivee'), dateLimite: v('c-date-limite'),
    statut: v('c-statut'),
    poidsTotal: nv('c-poids'), volumeCBM: nv('c-cbm'), nbCartons: nv('c-cartons'),
    fraisDouane: nv('c-fdouane'), fraisPort: nv('c-fport'),
    fraisTransit: nv('c-ftransit'), fraisAutres: nv('c-fautres'),
    fraisRetardJour: retardMode === 'auto' ? (parseFloat(document.getElementById('c-fretard-jour')?.value)||0) : 0,
    joursRetard: retardMode === 'auto' ? (parseFloat(document.getElementById('c-jours-retard')?.value)||0) : 0,
    fraisRetardManuel: retardMode === 'manuel' ? (parseFloat(document.getElementById('c-fretard-total')?.value)||0) : 0,
    retardMode,
    totalFrais, methodeRepartition: methode,
    refs: refsCalc,
    dateCreation: new Date().toISOString()
  };

  // Update status based on dates
  const today = new Date(); today.setHours(0,0,0,0);
  const limite = new Date(cont.dateLimite);
  if (cont.statut !== 'sorti' && cont.dateLimite && limite < today) cont.statut = 'retard';

  if (currentConteneurId) {
    const idx = conteneurs.findIndex(c => c.id === currentConteneurId);
    if (idx >= 0) conteneurs[idx] = cont;
  } else {
    conteneurs.unshift(cont);
    // Auto-create ordre
    const ordre = buildOrdreFromConteneur(cont);
    ordres.unshift(ordre);
  }
  save();
  closeModal('modal-conteneur');
  closeModal('modal-repartition');
  toast(`✅ Conteneur ${numero} enregistré !`);
  renderConteneurs();
}

function buildOrdreFromConteneur(cont) {
  return {
    local_id: getLocalId(),
    id: uid(),
    conteneurId: cont.id,
    numero: 'ORD-' + String(ordres.length + 1).padStart(4, '0'),
    date: new Date().toISOString(),
    fournisseur: cont.fournisseur,
    statut: cont.statut,
    refs: cont.refs,
    cont: cont
  };
}

function editConteneur(id) {
  closeModal('modal-cont-detail');
  currentConteneurId = id;
  const c = conteneurs.find(x => x.id === id);
  if (!c) return;
  document.getElementById('modal-conteneur-title').textContent = t('cont_modal_title_edit');
  const sv = (elId, val) => { const el = document.getElementById(elId); if(el) el.value = val||''; };
  sv('c-numero', c.numero); sv('c-fournisseur', c.fournisseur); sv('c-pays', c.pays);
  sv('c-date-arrivee', c.dateArrivee); sv('c-date-limite', c.dateLimite);
  sv('c-statut', c.statut); sv('c-type', c.type||'20 pieds');
  sv('c-poids', c.poidsTotal); sv('c-cbm', c.volumeCBM); sv('c-cartons', c.nbCartons);
  sv('c-fdouane', c.fraisDouane); sv('c-fport', c.fraisPort);
  sv('c-ftransit', c.fraisTransit); sv('c-fautres', c.fraisAutres);
  sv('c-fretard-jour', c.fraisRetardJour); sv('c-jours-retard', c.joursRetard);
  document.getElementById('refs-list').innerHTML = '';
  refLineCount = 0;
  c.refs.forEach(r => addRefLine(r));
  updateTotalFrais();
  openModal('modal-conteneur');
}

function deleteConteneur(id) {
  if (!isSuperAdmin() && !hasPermission('conteneurs', 'delete')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  if (!confirm('Supprimer ce conteneur ?')) return;
  // Supprimer les ordres liés aussi
  const ordresLies = ordres.filter(o => o.conteneurId === id);
  ordresLies.forEach(o => sbDelete('gp_ordres', o.id));
  conteneurs = conteneurs.filter(c => c.id !== id);
  ordres = ordres.filter(o => o.conteneurId !== id);
  sbDelete('gp_conteneurs', id);
  renderConteneurs();
  toast(t('toast_cont_deleted'), 'warn');
}

function viewConteneur(id) {
  currentConteneurId = id;
  const c = conteneurs.find(x => x.id === id);
  if (!c) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const limite = c.dateLimite ? new Date(c.dateLimite) : null;
  const joursRestants = limite ? Math.ceil((limite - today) / 86400000) : null;
  const statutColor = c.statut === 'sorti' ? '#00916e' : c.statut === 'retard' ? '#e53e3e' : '#ff9900';
  const statutLabel = c.statut === 'sorti' ? t('cont_statut_sorti') : c.statut === 'retard' ? t('cont_statut_retard') : t('cont_statut_encours');

  const refsRows = c.refs.map((r, i) => `
    <tr style="background:${i%2===0?'#fff':'#f7f9fc'};">
      <td style="padding:8px 10px;border:1px solid var(--border);font-weight:700;color:#1a3a6b;">${r.refCode}</td>
      <td style="padding:8px 10px;border:1px solid var(--border);">${r.produitNom}</td>
      <td style="padding:8px 10px;border:1px solid var(--border);text-align:center;">${r.nbCartons}</td>
      <td style="padding:8px 10px;border:1px solid var(--border);text-align:center;">${r.pcsParCarton}</td>
      <td style="padding:8px 10px;border:1px solid var(--border);text-align:center;font-weight:700;">${r.qtyTotale}</td>
      <td style="padding:8px 10px;border:1px solid var(--border);text-align:right;">${r.poidsCarton} kg</td>
      <td style="padding:8px 10px;border:1px solid var(--border);text-align:center;">${r.longueur}×${r.largeur}×${r.hauteur} cm</td>
      <td style="padding:8px 10px;border:1px solid var(--border);text-align:right;">${r.prixAchatUnit.toFixed(2)}</td>
      <td style="padding:8px 10px;border:1px solid var(--border);text-align:right;color:#e53e3e;">+${r.fraisRepartis.toFixed(2)}</td>
      <td style="padding:8px 10px;border:1px solid var(--border);text-align:right;font-weight:800;color:#00916e;">${r.prixAchatReel.toFixed(4)}</td>
    </tr>
  `).join('');

  document.getElementById('cont-detail-title').textContent = `🚢 Conteneur ${c.numero}`;
  document.getElementById('cont-detail-content').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;font-size:13px;">
      <div style="background:var(--surface2);border-radius:8px;padding:12px;"><div style="color:var(--text2);font-size:10px;text-transform:uppercase;">Fournisseur</div><strong>${c.fournisseur||'—'}</strong></div>
      <div style="background:var(--surface2);border-radius:8px;padding:12px;"><div style="color:var(--text2);font-size:10px;text-transform:uppercase;">Pays origine</div><strong>${c.pays||'—'}</strong></div>
      <div style="background:var(--surface2);border-radius:8px;padding:12px;"><div style="color:var(--text2);font-size:10px;text-transform:uppercase;">Statut</div><strong style="color:${statutColor};">${statutLabel}</strong></div>
      <div style="background:var(--surface2);border-radius:8px;padding:12px;"><div style="color:var(--text2);font-size:10px;text-transform:uppercase;">Arrivée</div><strong>${c.dateArrivee ? new Date(c.dateArrivee).toLocaleDateString('fr-FR') : '—'}</strong></div>
      <div style="background:var(--surface2);border-radius:8px;padding:12px;"><div style="color:var(--text2);font-size:10px;text-transform:uppercase;">Limite sortie</div><strong>${c.dateLimite ? new Date(c.dateLimite).toLocaleDateString('fr-FR') : '—'}</strong></div>
      <div style="background:${joursRestants !== null && joursRestants <= 0 ? '#fff5f5' : '#f7f9fc'};border-radius:8px;padding:12px;border:${joursRestants !== null && joursRestants <= 0 ? '1px solid #fed7d7' : 'none'}">
        <div style="color:var(--text2);font-size:10px;text-transform:uppercase;">Jours restants</div>
        <strong style="color:${joursRestants !== null ? (joursRestants <= 0 ? '#e53e3e' : joursRestants <= 3 ? '#ff9900' : '#00916e') : '#888'};">
          ${joursRestants !== null ? (joursRestants <= 0 ? `${Math.abs(joursRestants)} j retard 🔴` : `${joursRestants} j ✅`) : '—'}
        </strong>
      </div>
      <div style="background:var(--surface2);border-radius:8px;padding:12px;"><div style="color:var(--text2);font-size:10px;text-transform:uppercase;">Poids total</div><strong>${c.poidsTotal} kg</strong></div>
      <div style="background:var(--surface2);border-radius:8px;padding:12px;"><div style="color:var(--text2);font-size:10px;text-transform:uppercase;">Volume CBM</div><strong>${c.volumeCBM} m³</strong></div>
      <div style="background:var(--surface2);border-radius:8px;padding:12px;"><div style="color:var(--text2);font-size:10px;text-transform:uppercase;">Type conteneur</div><strong>${c.type||'—'}</strong></div>
    </div>
    <div style="background:var(--surface2);border:1px solid rgba(251,191,36,0.4);border-radius:8px;padding:12px;margin-bottom:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px;">
      <div><div style="color:var(--text2);font-size:10px;">Douane</div><strong>${c.fraisDouane?.toFixed(2)||0} MAD</strong></div>
      <div><div style="color:var(--text2);font-size:10px;">Port / Fret</div><strong>${c.fraisPort?.toFixed(2)||0} MAD</strong></div>
      <div><div style="color:var(--text2);font-size:10px;">Transit</div><strong>${c.fraisTransit?.toFixed(2)||0} MAD</strong></div>
      <div><div style="color:var(--text2);font-size:10px;">Autres</div><strong>${c.fraisAutres?.toFixed(2)||0} MAD</strong></div>
      ${(c.joursRetard > 0 || c.fraisRetardManuel > 0) ? `<div style="grid-column:1/-1;background:rgba(229,62,62,0.08);border-radius:6px;padding:8px;"><div style="color:#e53e3e;font-size:10px;">⚠️ Frais de retard</div><strong style="color:#e53e3e;">${c.retardMode==='manuel' ? 'Montant forfaitaire : ' + (c.fraisRetardManuel||0).toFixed(2) + ' MAD' : c.joursRetard + ' j × ' + c.fraisRetardJour + ' MAD = ' + (c.joursRetard*c.fraisRetardJour).toFixed(2) + ' MAD'}</strong></div>` : ''}
      <div style="grid-column:1/-1;display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid rgba(251,191,36,0.4);"><span style="font-weight:700;">💰 TOTAL FRAIS</span><span style="font-weight:900;font-size:15px;color:#e53e3e;">${c.totalFrais?.toFixed(2)||0} MAD</span></div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
      <thead><tr style="background:#1a3a6b;color:#fff;">
        <th style="padding:8px 10px;">Réf.</th><th style="padding:8px 10px;">Produit</th>
        <th style="padding:8px 10px;text-align:center;">Cartons</th><th style="padding:8px 10px;text-align:center;">Pcs/C</th>
        <th style="padding:8px 10px;text-align:center;">Qty tot.</th><th style="padding:8px 10px;text-align:right;">Poids/C</th>
        <th style="padding:8px 10px;text-align:center;">L×l×H (cm)</th>
        <th style="padding:8px 10px;text-align:right;">Prix achat</th>
        <th style="padding:8px 10px;text-align:right;">Frais alloués</th>
        <th style="padding:8px 10px;text-align:right;">Prix réel/pcs</th>
      </tr></thead>
      <tbody>${refsRows}</tbody>
    </table>
  `;
  openModal('modal-cont-detail');
}

function addToStockFromConteneur(id) {
  // id peut venir du paramètre ou de currentConteneurId
  const cid = id || currentConteneurId;
  if (!cid) { toast('Erreur : aucun conteneur sélectionné', 'error'); return; }

  const c = conteneurs.find(x => x.id === cid);
  if (!c) { toast('Conteneur introuvable', 'error'); return; }
  if (!c.refs || !c.refs.length) { toast('Ce conteneur n\'a aucune référence', 'error'); return; }

  // Résumé avant confirmation
  const nouveaux = c.refs.filter(r => !products.find(p => p.code === r.refCode)).length;
  const miseAjour = c.refs.length - nouveaux;
  const msg = `Conteneur ${c.numero}\n\n` +
    `• ${nouveaux} nouvelle(s) référence(s) → créées dans le stock\n` +
    `• ${miseAjour} référence(s) existante(s) → stock mis à jour\n\n` +
    `Confirmer l'ajout au stock ?`;

  if (!confirm(msg)) return;

  let added = 0, updated = 0;
  c.refs.forEach(r => {
    const qtyTotale = r.qtyTotale || (r.nbCartons * r.pcsParCarton) || 0;
    const prixReel = r.prixAchatReel || r.prixAchatUnit || 0;
    const existing = products.find(p => p.code === r.refCode);
    if (existing) {
      existing.stock = (existing.stock || 0) + qtyTotale;
      existing.cost = prixReel;
      existing.name = existing.name || r.produitNom || r.refCode;
      updated++;
    } else {
      products.push({
        id: uid(),
        name: r.produitNom || r.refCode,
        code: r.refCode,
        category: 'Import',
        price: parseFloat((prixReel * 1.3).toFixed(2)),
        cost: prixReel,
        stock: qtyTotale,
        minStock: Math.max(1, Math.ceil(qtyTotale * 0.1)),
        unit: 'Pièce',
        photo: null
      });
      added++;
    }
  });

  c.statut = 'sorti';
  save();
  closeModal('modal-cont-detail');
  toast(`✅ ${added} produit(s) créés, ${updated} mis à jour dans le stock`);
  renderConteneurs();
  renderStockTable();
}

function renderConteneurs() {
  const q = document.getElementById('cont-search')?.value.toLowerCase() || '';
  const sf = document.getElementById('cont-filter-statut')?.value || 'all';
  const today = new Date(); today.setHours(0,0,0,0);

  // Update statuses
  conteneurs.forEach(c => {
    if (c.statut !== 'sorti' && c.dateLimite) {
      const lim = new Date(c.dateLimite);
      if (lim < today) c.statut = 'retard';
    }
  });

  const filtered = conteneurs.filter(c => {
    const matchQ = c.numero?.toLowerCase().includes(q) || c.fournisseur?.toLowerCase().includes(q);
    const matchS = sf === 'all' || c.statut === sf;
    return matchQ && matchS;
  });

  // Stats
  const stats = document.getElementById('cont-stats');
  if (stats) {
    const enCours = conteneurs.filter(c => c.statut === 'en_cours').length;
    const retard = conteneurs.filter(c => c.statut === 'retard').length;
    const sorti = conteneurs.filter(c => c.statut === 'sorti').length;
    const totalFrais = conteneurs.reduce((s,c) => s+(c.totalFrais||0), 0);
    stats.innerHTML = `
      <div class="stat-card"><div class="stat-icon">🚢</div><div class="stat-value">${conteneurs.length}</div><div class="stat-label">${t('cont_stat_label_total')}</div></div>
      <div class="stat-card gold"><div class="stat-icon">⏳</div><div class="stat-value">${enCours}</div><div class="stat-label">${t('cont_stat_label_encours')}</div></div>
      <div class="stat-card" style="--card-color:#e53e3e"><div class="stat-icon">🔴</div><div class="stat-value">${retard}</div><div class="stat-label">${t('cont_stat_label_retard')}</div></div>
      <div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-value">${sorti}</div><div class="stat-label">${t('cont_stat_label_sortis')}</div><div class="stat-sub">${totalFrais.toFixed(0)} ${t('cont_frais_tot')}</div></div>
    `;
  }

  const grid = document.getElementById('conteneurs-grid');
  if (!grid) return;
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="emoji">🚢</div><p>${t('no_cont')}</p></div>`;
    buildPagination('conteneurs', 0, 'renderConteneurs', 'conteneurs-pagination');
    return;
  }
  const contPage = getPage('conteneurs');
  const contPageData = filtered.slice((contPage-1)*PAGE_SIZE, contPage*PAGE_SIZE);

  grid.innerHTML = contPageData.map(c => {
    const limite = c.dateLimite ? new Date(c.dateLimite) : null;
    const joursR = limite ? Math.ceil((limite - today) / 86400000) : null;
    const sColor = c.statut==='sorti' ? 'var(--accent)' : c.statut==='retard' ? 'var(--red)' : '#ff9900';
    const sLabel = c.statut==='sorti' ? t('cont_statut_sorti') : c.statut==='retard' ? t('cont_statut_retard') : t('cont_statut_encours');
    const alertBar = c.statut === 'retard'
      ? `<div style="background:#fff5f5;border-top:1px solid #fed7d7;padding:8px 14px;font-size:11px;color:#e53e3e;font-weight:700;">⚠️ ${Math.abs(joursR)} ${t('cont_jours_retard')} ${(Math.abs(joursR)*c.fraisRetardJour).toFixed(0)} MAD</div>`
      : joursR !== null && joursR <= 3 && c.statut !== 'sorti'
      ? `<div style="background:#fffbeb;border-top:1px solid #fcd34d;padding:8px 14px;font-size:11px;color:#92400e;font-weight:700;">⚡ ${t('cont_sortie_dans')} ${joursR} ${t('cont_jours')}</div>`
      : '';
    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;cursor:pointer;" onclick="viewConteneur('${c.id}')">
        <div style="padding:14px;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <div>
              <div style="font-size:16px;font-weight:800;font-family:var(--font-mono),monospace;">${c.numero}</div>
              <div style="font-size:12px;color:var(--text2);">${c.fournisseur||''} ${c.pays?'• '+c.pays:''} ${c.type?'• '+c.type:''}</div>
            </div>
            <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${sColor}22;color:${sColor};">${sLabel}</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px;">
            <div style="background:var(--surface2);border-radius:6px;padding:8px;">
              <div style="color:var(--text2);font-size:10px;">${t('cont_refs_label')}</div>
              <strong>${c.refs.length}</strong>
            </div>
            <div style="background:var(--surface2);border-radius:6px;padding:8px;">
              <div style="color:var(--text2);font-size:10px;">${t('cont_cartons_label')}</div>
              <strong>${c.refs.reduce((s,r)=>s+r.nbCartons,0)}</strong>
            </div>
            <div style="background:var(--surface2);border-radius:6px;padding:8px;">
              <div style="color:var(--text2);font-size:10px;">${t('cont_pcs_label')}</div>
              <strong>${c.refs.reduce((s,r)=>s+r.qtyTotale,0)}</strong>
            </div>
          </div>
        </div>
        <div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;font-size:12px;">
          <span style="color:var(--text2);">${t('cont_frais_label')} <strong style="color:var(--red);">${(c.totalFrais||0).toFixed(0)} MAD</strong></span>
          <span style="color:var(--text2);">${t('cont_limite_label')} <strong>${c.dateLimite ? new Date(c.dateLimite).toLocaleDateString(currentLang==='ar'?'ar-MA':'fr-FR') : '—'}</strong></span>
        </div>
        ${alertBar}
        <div style="padding:8px 14px;border-top:1px solid var(--border);display:flex;gap:6px;" onclick="event.stopPropagation()">
          ${(isSuperAdmin()||hasPermission('conteneurs','update')) ? `<button class="btn btn-secondary btn-sm" onclick="editConteneur('${c.id}')">✏️</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="showOrdreConteneur('${c.id}')">📑 Ordre PDF</button>
          ${(isSuperAdmin()||hasPermission('conteneurs','delete')) ? `<button class="btn btn-danger btn-sm" onclick="deleteConteneur('${c.id}')">🗑️</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
  buildPagination('conteneurs', filtered.length, 'renderConteneurs', 'conteneurs-pagination');
}

// ════════════════════════════════════════════
// ORDRES
// ════════════════════════════════════════════
function openNewOrdre() {
  if (!conteneurs.length) { toast('Créez d\'abord un conteneur', 'warn'); navigate('conteneurs'); return; }
  const sel = prompt('Numéro du conteneur :');
  if (!sel) return;
  const c = conteneurs.find(x => x.numero === sel);
  if (!c) { toast('Conteneur introuvable', 'error'); return; }
  const ordre = buildOrdreFromConteneur(c);
  ordres.unshift(ordre);
  save();
  showOrdrePDF(ordre.id);
  renderOrdres();
}

function showOrdreConteneur(conteneurId) {
  let ordre = ordres.find(o => o.conteneurId === conteneurId);
  if (!ordre) {
    const c = conteneurs.find(x => x.id === conteneurId);
    if (!c) return;
    ordre = buildOrdreFromConteneur(c);
    ordres.unshift(ordre);
    save();
  }
  showOrdrePDF(ordre.id);
}

function showOrdrePDF(ordreId) {
  const o = ordres.find(x => x.id === ordreId);
  if (!o) return;
  const c = conteneurs.find(x => x.id === o.conteneurId) || o.cont || {};
  const dateStr = new Date(o.date).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
  const refs = (c.refs || o.refs || []);
  const totalVal = refs.reduce((s,r) => s + r.montantTotal, 0);
  const totalFrais = c.totalFrais || 0;
  const totalReel = refs.reduce((s,r) => s + (r.prixAchatReel * r.qtyTotale), 0);

  const refsRows = refs.map((r, i) => `
    <tr style="background:${i%2===0?'#fff':'#f7f9fc'};">
      <td style="padding:8px 10px;border:1px solid #e8e8e8;font-weight:700;color:#1a3a6b;">${r.refCode}</td>
      <td style="padding:8px 10px;border:1px solid #e8e8e8;">${r.produitNom}</td>
      <td style="padding:8px 10px;border:1px solid #e8e8e8;text-align:center;">${r.nbCartons}</td>
      <td style="padding:8px 10px;border:1px solid #e8e8e8;text-align:center;">${r.pcsParCarton}</td>
      <td style="padding:8px 10px;border:1px solid #e8e8e8;text-align:center;font-weight:700;">${r.qtyTotale}</td>
      <td style="padding:8px 10px;border:1px solid #e8e8e8;text-align:right;">${r.poidsCarton||0} kg</td>
      <td style="padding:8px 10px;border:1px solid #e8e8e8;text-align:center;">${r.longueur||0}×${r.largeur||0}×${r.hauteur||0}</td>
      <td style="padding:8px 10px;border:1px solid #e8e8e8;text-align:right;">${r.prixAchatUnit.toFixed(2)}</td>
      <td style="padding:8px 10px;border:1px solid #e8e8e8;text-align:right;color:#e53e3e;">${r.fraisRepartis.toFixed(2)}</td>
      <td style="padding:8px 10px;border:1px solid #e8e8e8;text-align:right;font-weight:800;color:#00916e;">${r.prixAchatReel.toFixed(4)}</td>
      <td style="padding:8px 10px;border:1px solid #e8e8e8;text-align:right;font-weight:800;">${(r.prixAchatReel*r.qtyTotale).toFixed(2)}</td>
    </tr>
  `).join('');

  const html = `
  <div style="font-family:Arial,sans-serif;font-size:12px;color:#222;padding:15mm;background:#fff;min-height:297mm;box-sizing:border-box;">
    <!-- EN-TÊTE -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #1a3a6b;">
      <div>
        ${settings.storeLogo ? `<img src="${settings.storeLogo}" style="max-height:60px;max-width:160px;object-fit:contain;margin-bottom:8px;display:block;">` : `<div style="font-size:22px;font-weight:700;color:#1a3a6b;">${settings.storeName||'Mon Commerce'}</div>`}
        <div style="font-size:11px;color:#666;line-height:1.7;margin-top:4px;">
          ${settings.storeAddress||''}<br>
          ${settings.storePhone?'Tél: '+settings.storePhone+' &nbsp;':''} ${settings.storeEmail||''}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:28px;font-weight:900;color:#1a3a6b;">ORDRE D'IMPORTATION</div>
        <div style="font-size:13px;color:#888;margin-top:4px;">${o.numero}</div>
        <div style="font-size:12px;color:#888;">Date : ${dateStr}</div>
        <div style="display:inline-block;margin-top:8px;background:${c.statut==='sorti'?'#c6f6d5':c.statut==='retard'?'#fed7d7':'#fef3c7'};color:${c.statut==='sorti'?'#276749':c.statut==='retard'?'#c53030':'#92400e'};padding:4px 14px;border-radius:20px;font-weight:700;font-size:11px;">
          ${c.statut==='sorti'?'✅ SORTI':c.statut==='retard'?'🔴 EN RETARD':'🟡 EN COURS'}
        </div>
      </div>
    </div>

    <!-- INFOS CONTENEUR -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
      <div>
        <div style="font-size:10px;font-weight:700;color:#1a3a6b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">🚢 Informations Conteneur</div>
        <table style="width:100%;font-size:11.5px;">
          <tr><td style="padding:4px 0;color:#888;width:45%;">N° Conteneur</td><td style="font-weight:700;font-family:monospace;">${c.numero||'—'}</td></tr>
          <tr><td style="padding:4px 0;color:#888;">Type</td><td>${c.type||'—'}</td></tr>
          <tr><td style="padding:4px 0;color:#888;">Fournisseur</td><td style="font-weight:700;">${c.fournisseur||'—'}</td></tr>
          <tr><td style="padding:4px 0;color:#888;">Pays d'origine</td><td>${c.pays||'—'}</td></tr>
          <tr><td style="padding:4px 0;color:#888;">${t('cont_detail_arrivee')}</td><td>${c.dateArrivee ? new Date(c.dateArrivee).toLocaleDateString('fr-FR') : '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#888;">${t('cont_detail_limite')}</td><td>${c.dateLimite ? new Date(c.dateLimite).toLocaleDateString('fr-FR') : '—'}</td></tr>
        </table>
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;color:#1a3a6b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">📦 Dimensions & Poids</div>
        <table style="width:100%;font-size:11.5px;">
          <tr><td style="padding:4px 0;color:#888;width:45%;">Poids total</td><td style="font-weight:700;">${c.poidsTotal||0} kg</td></tr>
          <tr><td style="padding:4px 0;color:#888;">Volume</td><td style="font-weight:700;">${c.volumeCBM||0} CBM</td></tr>
          <tr><td style="padding:4px 0;color:#888;">Total cartons</td><td>${c.nbCartons||refs.reduce((s,r)=>s+r.nbCartons,0)}</td></tr>
          <tr><td style="padding:4px 0;color:#888;">Total pièces</td><td style="font-weight:700;">${refs.reduce((s,r)=>s+r.qtyTotale,0)}</td></tr>
        </table>
      </div>
    </div>

    <!-- FRAIS -->
    <div style="background:#fff8f0;border:1px solid #fcd34d;border-radius:8px;padding:12px;margin-bottom:20px;">
      <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">💰 Frais d'importation</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;font-size:11.5px;">
        <div><div style="color:#888;">Douane</div><strong>${(c.fraisDouane||0).toFixed(2)} MAD</strong></div>
        <div><div style="color:#888;">Port/Fret</div><strong>${(c.fraisPort||0).toFixed(2)} MAD</strong></div>
        <div><div style="color:#888;">Transit</div><strong>${(c.fraisTransit||0).toFixed(2)} MAD</strong></div>
        <div><div style="color:#888;">Autres</div><strong>${(c.fraisAutres||0).toFixed(2)} MAD</strong></div>
        <div><div style="color:#888;">Retard</div><strong style="color:#e53e3e;">${c.retardMode==='manuel' ? 'Forfait : '+(c.fraisRetardManuel||0).toFixed(2)+' MAD' : (c.joursRetard||0)+' j × '+(c.fraisRetardJour||0)+' = '+((c.joursRetard||0)*(c.fraisRetardJour||0)).toFixed(2)+' MAD'}</strong></div>
      </div>
      <div style="border-top:1px solid #fcd34d;margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;">
        <span style="font-weight:700;">TOTAL FRAIS</span>
        <span style="font-weight:900;font-size:14px;color:#e53e3e;">${totalFrais.toFixed(2)} MAD</span>
      </div>
    </div>

    <!-- TABLE RÉFÉRENCES -->
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:0;">
      <thead>
        <tr style="background:#1a3a6b;color:#fff;">
          <th style="padding:8px 8px;text-align:left;">Réf.</th>
          <th style="padding:8px 8px;text-align:left;">Produit</th>
          <th style="padding:8px 8px;text-align:center;">Cartons</th>
          <th style="padding:8px 8px;text-align:center;">Pcs/C</th>
          <th style="padding:8px 8px;text-align:center;">Qty tot.</th>
          <th style="padding:8px 8px;text-align:right;">Poids/C</th>
          <th style="padding:8px 8px;text-align:center;">L×l×H (cm)</th>
          <th style="padding:8px 8px;text-align:right;">Prix achat</th>
          <th style="padding:8px 8px;text-align:right;">Frais alloc.</th>
          <th style="padding:8px 8px;text-align:right;">Prix réel/pcs</th>
          <th style="padding:8px 8px;text-align:right;">Total réel</th>
        </tr>
      </thead>
      <tbody>${refsRows}</tbody>
      <tfoot>
        <tr style="background:#f0f4f8;font-weight:800;font-size:12px;">
          <td colspan="4" style="padding:9px 8px;border:1px solid #e8e8e8;">TOTAUX</td>
          <td style="padding:9px 8px;border:1px solid #e8e8e8;text-align:center;">${refs.reduce((s,r)=>s+r.qtyTotale,0)}</td>
          <td style="padding:9px 8px;border:1px solid #e8e8e8;text-align:right;">${refs.reduce((s,r)=>s+(r.poidsCarton||0)*r.nbCartons,0).toFixed(1)} kg</td>
          <td style="padding:9px 8px;border:1px solid #e8e8e8;"></td>
          <td style="padding:9px 8px;border:1px solid #e8e8e8;text-align:right;">${totalVal.toFixed(2)}</td>
          <td style="padding:9px 8px;border:1px solid #e8e8e8;text-align:right;color:#e53e3e;">${totalFrais.toFixed(2)}</td>
          <td style="padding:9px 8px;border:1px solid #e8e8e8;"></td>
          <td style="padding:9px 8px;border:1px solid #e8e8e8;text-align:right;color:#00916e;">${totalReel.toFixed(2)}</td>
        </tr>
        <tr style="background:#1a3a6b;color:#fff;font-size:13px;font-weight:900;">
          <td colspan="9" style="padding:10px 8px;">COÛT TOTAL RÉEL (marchandise + tous frais)</td>
          <td colspan="2" style="padding:10px 8px;text-align:right;color:#7ec8e3;">${(totalVal + totalFrais).toFixed(2)} MAD</td>
        </tr>
      </tfoot>
    </table>

    <!-- FOOTER -->
    <div style="margin-top:30px;padding-top:12px;border-top:1px solid #ddd;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;font-size:10.5px;color:#555;">
      <div><strong style="color:#222;">${settings.storeName||''}</strong><br>${settings.storeAddress||''}</div>
      <div><strong style="color:#222;">Document généré le</strong><br>${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>
      <div style="text-align:right;"><strong style="color:#222;">Méthode répartition</strong><br>${{valeur:'Proportionnel valeur',poids:'Proportionnel poids',egal:'Parts égales'}[c.methodeRepartition||'poids']}</div>
    </div>
  </div>`;

  document.getElementById('ordre-pdf-content').innerHTML = html;
  document.getElementById('modal-ordre-pdf').style.display = 'flex';
}

function printOrdre() {
  const content = document.getElementById('ordre-pdf-content').innerHTML;
  const htmlStr = `<html><head><title>Ordre Importation</title>
    <style>@page{size:A4;margin:0}body{margin:0;font-family:Arial,sans-serif}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>
  </head><body>${content}
<!-- ═══ MODAL CHOIX LOCAL CAISSE (obligatoire) ═══ -->
<div class="modal-overlay" id="modal-caisse-local" style="z-index:2000;">
  <div class="modal" style="max-width:420px;text-align:center;">
    <div style="font-size:40px;margin-bottom:12px;">🏪</div>
    <div style="font-size:17px;font-weight:700;color:#111827;letter-spacing:-0.3px;margin-bottom:8px;">Choisir le local de vente</div>
    <div style="font-size:13px;color:#6b7280;margin-bottom:20px;line-height:1.6;">
      Sélectionnez le local depuis lequel vous effectuez cette vente.<br>
      <strong>Le stock sera déduit uniquement de ce local.</strong>
    </div>
    <div id="caisse-local-choices" style="display:flex;flex-direction:column;gap:8px;margin-bottom:4px;"></div>
  </div>
</div>

</body></html>`;
  const blob = new Blob([htmlStr], {type:'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.addEventListener('load', () => { win.print(); });
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
}

function renderOrdres(resetPage) {
  if (resetPage !== false) _pages['ordres'] = 1;
  const q = document.getElementById('ord-search')?.value.toLowerCase() || '';
  const tbody = document.getElementById('ordres-table');
  if (!tbody) return;
  const filtered = ordres.filter(o =>
    o.numero?.toLowerCase().includes(q) || o.fournisseur?.toLowerCase().includes(q)
  );
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="emoji">📑</div><p>${t('cont_no_docs')}</p></div></td></tr>`;
    document.getElementById('ordres-pagination').innerHTML = '';
    return;
  }
  const ordPage = getPage('ordres');
  const ordStart = (ordPage - 1) * PAGE_SIZE;
  const pageData = filtered.slice(ordStart, ordStart + PAGE_SIZE);
  tbody.innerHTML = pageData.map(o => {
    const c = conteneurs.find(x => x.id === o.conteneurId) || {};
    const refs = (c.refs || o.refs || []);
    const totalReel = refs.reduce((s,r) => s + (r.prixAchatReel||0) * r.qtyTotale, 0);
    const sColor = c.statut==='sorti'?'chip-green':c.statut==='retard'?'chip-red':'chip-orange';
    const sLabel = c.statut==='sorti'?t('cont_statut_sorti'):c.statut==='retard'?t('cont_statut_retard'):t('cont_statut_encours');
    const dateStr = new Date(o.date).toLocaleDateString('fr-FR');
    return `<tr>
      <td style="font-family:var(--font-mono),monospace;font-weight:700;">${o.numero}</td>
      <td>${dateStr}</td>
      <td style="font-family:var(--font-mono),monospace;">${c.numero||'—'}</td>
      <td>${o.fournisseur||'—'}</td>
      <td style="text-align:center;">${refs.length} réf.</td>
      <td style="text-align:right;font-weight:700;font-family:var(--font-mono),monospace;">${totalReel.toFixed(2)} MAD</td>
      <td><span class="chip ${sColor}">${sLabel}</span></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="showOrdrePDF('${o.id}')">📄 PDF</button>
        ${(isSuperAdmin()||hasPermission('conteneurs','delete')) ? `<button class="btn btn-danger btn-sm" onclick="if(confirm('Supprimer ?')){ordres=ordres.filter(x=>x.id!=='${o.id}');save();renderOrdres();toast('Supprimé','warn')}">🗑️</button>` : ''}
      </td>
    </tr>`;
  }).join('');
  buildPagination('ordres', filtered.length, 'renderOrdres', 'ordres-pagination');
}
