/* ================================================================
   GestionPro — core/api.js
   Supabase helpers : sbUpsert, sbSync, sbDelete, _doSave
   Dépend de: config.js (sb), state.js
================================================================ */

async function sbUpsert(table, data, conflictCol = 'id') {
  if (!data || data.length === 0) return;
  const { error } = await sb.from(table).upsert(data, { onConflict: conflictCol });
  if (error) console.warn(`[SB] Upsert ${table}:`, error.message);
}

// Helper : synchronisation correcte multi-utilisateur
// UPSERT uniquement — les suppressions se font via sbDelete() directement
// sbSync ne supprime JAMAIS en masse pour ne pas écraser les données des autres users
async function sbSync(table, data, localIdCol = 'local_id', lid) {
  if (!data || data.length === 0) return;
  try {
    const { error } = await sb.from(table).upsert(data, { onConflict: 'id' });
    if (error) {
      console.error(`[SB] ❌ Sync ${table}:`, error.message, error.code, error.details);
      // Afficher l'erreur visible pour debug
      toast(`❌ Save ${table}: ${error.message}`, 'error');
    } else {
      console.log(`[SB] ✅ Sync ${table}: ${data.length} rows`);
    }
  } catch(e) {
    console.error(`[SB] ❌ Sync ${table} exception:`, e.message);
    toast(`❌ Save ${table}: ${e.message}`, 'error');
  }
}

async function sbDelete(table, id) {
  try {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) console.warn(`[SB] Delete ${table}:`, error.message);
  } catch(e) {
    console.warn(`[SB] Delete ${table} exception:`, e.message);
  }
}

async function _doSave() {
  const lid = getLocalId();
  try {
    // ── Produits ──────────────────────────────────────────────
    const tid = GP_TENANT?.id || null;
    await sbSync('gp_products', products.map(p => ({
      id: p.id, tenant_id: tid, local_id: lid || p.local_id,
      name: p.name, category: p.category, code: p.code || null,
      type: p.type || 'unite', price: p.price, cost: p.cost || 0,
      stock: p.stock, min_stock: p.minStock || 5,
      unit: p.unit || 'Pièce', zone: p.zone || null,
      sizes: p.sizes || {}, photo_url: p.photo || null,
      updated_at: new Date().toISOString()
    })), 'local_id', lid);

    // ── Clients ───────────────────────────────────────────────
    await sbSync('gp_clients', clients.map(c => ({
      id: c.id, tenant_id: tid, local_id: lid || c.local_id,
      name: c.name, phone: c.phone || null, email: c.email || null,
      city: c.city || null, address: c.address || null,
      notes: c.notes || null,
      credit_limit: c.creditLimit || 0, credit_used: c.creditUsed || 0
    })), 'local_id', lid);

    // ── Ventes ────────────────────────────────────────────────
    await sbSync('gp_sales', sales.map(s => ({
      id: s.id, tenant_id: tid, local_id: lid || s.local_id,
      client_id: s.clientId || null, client_name: s.clientName || null,
      date: s.date, items: s.items || [],
      total: s.total, total_ht: s.totalHT || s.total,
      tva: s.tva || 0, tva_amount: s.tvaAmount || 0,
      payment: s.payment || 'especes'
    })), 'local_id', lid);

    // ── Caisse ────────────────────────────────────────────────
    await sbSync('gp_caisse_ops', caisseOps.map(o => ({
      id: o.id, tenant_id: tid, local_id: lid || o.local_id,
      type: o.type, amount: o.amount,
      description: o.label || o.description || null,
      payment: o.payment || null,
      date: o.date
    })), 'local_id', lid);

    // ── Conteneurs ────────────────────────────────────────────
    await sbSync('gp_conteneurs', conteneurs.map(c => ({
      id: c.id, tenant_id: tid, local_id: lid || c.local_id,
      numero: c.numero, fournisseur: c.fournisseur || null,
      pays: c.pays || null, type: c.type || null,
      date_arrivee: c.dateArrivee || null, date_limite: c.dateLimite || null,
      statut: c.statut || 'en_cours',
      poids_total: c.poidsTotal || 0, volume_cbm: c.volumeCBM || 0,
      nb_cartons: c.nbCartons || 0,
      frais_douane: c.fraisDouane || 0, frais_port: c.fraisPort || 0,
      frais_transit: c.fraisTransit || 0, frais_autres: c.fraisAutres || 0,
      frais_retard_jour: c.fraisRetardJour || 0,
      jours_retard: c.joursRetard || 0,
      frais_retard_manuel: c.fraisRetardManuel || 0,
      methode_repartition: c.methodeRepartition || 'valeur',
      refs: c.refs || []
    })), 'local_id', lid);

    // ── Ordres ────────────────────────────────────────────────
    await sbSync('gp_ordres', ordres.map(o => ({
      id: o.id, tenant_id: tid, local_id: lid || o.local_id,
      conteneur_id: o.conteneurId || null,
      numero: o.numero || null, date: o.date || null,
      fournisseur: o.fournisseur || null,
      valeur: o.valeur || 0, statut: o.statut || 'en_attente',
      refs: o.refs || []
    })), 'local_id', lid);

    // ── Employés ──────────────────────────────────────────────
    await sbSync('gp_employes', employes.map(e => ({
      id: e.id, tenant_id: tid, local_id: lid || e.local_id,
      name: e.name, prenom: e.prenom || null,
      poste: e.poste || null, dept: e.dept || null,
      tel: e.tel || null, email: e.email || null,
      cin: e.cin || null, salaire: e.salaire || 0,
      date_embauche: e.dateEmbauche || null,
      contrat: e.contrat || 'CDI',
      local: e.local || null, statut: e.statut || 'actif',
      notes: e.notes || null
    })), 'local_id', lid);

    // ── Congés ────────────────────────────────────────────────
    await sbSync('gp_conges', conges.map(c => ({
      id: c.id, tenant_id: tid, local_id: lid || c.local_id,
      emp_id: c.empId || null, type: c.type || 'conge_annuel',
      debut: c.debut, fin: c.fin, jours: c.jours || 1,
      motif: c.motif || null, statut: c.statut || 'pending'
    })), 'local_id', lid);

    // ── Livraisons ────────────────────────────────────────────
    await sbSync('gp_livraisons', livraisons.map(l => ({
      id: l.id, local_id: lid || l.local_id,
      numero: l.numero || null, date: l.date || null,
      client: l.client || null, tel: l.tel || null,
      adresse: l.adresse || null, chauffeur: l.chauffeur || null,
      vehicule: l.vehicule || null, statut: l.statut || 'en_cours',
      notes: l.notes || null, articles: l.articles || [],
      valeur: l.valeur || 0
    })), 'local_id', lid);

    // ── Docs RH ───────────────────────────────────────────────
    await sbSync('gp_docs_rh', docsRHHistory.map(d => ({
      id: d.id, tenant_id: tid, local_id: lid || d.local_id,
      emp_id: d.empId || null, emp_name: d.empName || null,
      type: d.type || null, contenu: d.contenu || {}
    })), 'local_id', lid);

  } catch(e) {
    console.warn('[SB] Save error:', e);
    toast('⚠️ Erreur sauvegarde — vérifier connexion', 'warn');
  }
}

// ─── DATE ───