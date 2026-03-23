/* ================================================================
   GestionPro — core/realtime.js
   Synchronisation temps réel Supabase :
   setupRealtime, _handleRealtimeEvent, _pollSync,
   _showSyncToast, showSyncIndicator
================================================================ */

function setupRealtime() {
  // Nettoyer les anciens channels
  _rtChannels.forEach(ch => { try { sb.removeChannel(ch); } catch(e){} });
  _rtChannels = [];
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }

  const lid = getLocalId();
  showSyncIndicator(false);

  // ── Channel séparé pour gp_tenants (plan, blocage, expiration) ──
  // Sans filtre serveur pour éviter le besoin de REPLICA IDENTITY FULL
  if (GP_TENANT?.id) {
    const tenantCh = sb.channel('gp_tenant_watch')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'gp_tenants'
        // Pas de filtre serveur — on filtre côté client
      }, (payload) => {
        const updated = payload.new;
        if (!updated) return;
        // Filtrer côté client — uniquement notre tenant
        if (updated.id !== GP_TENANT.id) return;

        console.log('[Tenant RT] UPDATE reçu:', updated);

        const oldPlan = GP_TENANT.plan;

        // Mettre à jour GP_TENANT localement
        GP_TENANT.actif     = updated.actif;
        GP_TENANT.expire_at = updated.expire_at;
        GP_TENANT.plan      = updated.plan;
        GP_TENANT.nom       = updated.nom || GP_TENANT.nom;

        // ── 1. Vérifier blocage → logout immédiat ──
        if (updated.actif === false) {
          forceLogout("Votre compte a été désactivé par l'administrateur.");
          return;
        }

        // ── 2. Vérifier expiration → logout immédiat ──
        if (updated.expire_at && new Date(updated.expire_at) < new Date()) {
          forceLogout('Votre licence a expiré. Contactez-nous pour renouveler.');
          return;
        }

        // ── 3. Plan changé → mettre à jour nav en temps réel ──
        const planBadge = {starter:'🥉', business:'🥈', premium:'🥇'}[updated.plan] || '';
        const tenantNameEl = document.getElementById('sidebar-tenant-name');
        if (tenantNameEl) tenantNameEl.textContent = GP_TENANT.nom + (planBadge ? ' ' + planBadge : '');

        applyNavPermissions();

        if (updated.plan !== oldPlan) {
          const planLabels = {starter:'Starter 🥉', business:'Business 🥈', premium:'Premium 🥇'};
          toast('Plan mis à jour : ' + (planLabels[updated.plan] || updated.plan), 'success');
        }
      })
      .subscribe((status) => {
        console.log('[Tenant RT] status:', status);
      });
    _rtChannels.push(tenantCh);
  }

  // ── Channel principal pour les données métier ──
  const tables = ['gp_products', 'gp_sales', 'gp_clients', 'gp_employes', 'gp_caisse_ops',
                  'gp_livraisons', 'gp_conges', 'gp_conteneurs', 'gp_ordres', 'gp_docs_rh', 'gp_locaux'];
  let ch = sb.channel('gp_realtime_all');

  tables.forEach(tbl => {
    ch = ch.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: tbl
    }, (payload) => {
      // Ignorer nos propres events Realtime (même ID + sauvegardé il y a moins de 3s)
      const rowId = (payload.new || payload.old || {}).id;
      if (rowId && _lastSaveIds.has(rowId) && Date.now() - _lastSaveTime < 3000) return;

      // Filtre côté client — ISOLATION TENANT
      const row = payload.new || payload.old || {};
      const currentTid = GP_TENANT?.id || null;
      const currentLid = getLocalId();
      // Ignorer les events d'autres tenants
      if (currentTid && row.tenant_id && row.tenant_id !== currentTid) return;
      // Filtre local si nécessaire
      const isGlobalTable = tbl === 'gp_locaux' || tbl === 'gp_products';
      if (!isGlobalTable && currentLid && row.local_id && row.local_id !== currentLid) return;

      console.log('[Realtime]', tbl, payload.eventType, row.local_id || '(global)');
      _handleRealtimeEvent(tbl, payload);
    });
  });

  ch.subscribe((status, err) => {
    console.log('[Realtime] status:', status, err || '');
    if (status === 'SUBSCRIBED') {
      showSyncIndicator(true);
      console.log('[Sync] ✅ Realtime actif sur', tables.length, 'tables');
      // Annuler le polling si actif
      if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      showSyncIndicator(false);
      console.warn('[Sync] Realtime', status, '— fallback polling 10s');
      if (!_pollInterval) {
        _pollInterval = setInterval(_pollSync, 10000);
      }
    }
  });

  _rtChannels.push(ch);

  // Timeout sécurité → fallback si pas connecté en 10s
  setTimeout(() => {
    const dot = document.getElementById('sync-dot');
    const isGreen = dot?.style.background?.includes('accent') || dot?.style.background?.includes('00d4');
    if (!isGreen && !_pollInterval) {
      console.warn('[Sync] Timeout Realtime → polling 10s');
      _pollInterval = setInterval(_pollSync, 10000);
      showSyncIndicator(true);
    }
  }, 10000);
}

async function _handleRealtimeEvent(tbl, payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  const lid = getLocalId();

  if (tbl === 'gp_products') {
    if (eventType === 'DELETE') {
      products = products.filter(p => p.id !== oldRow.id);
    } else if (eventType === 'INSERT') {
      const p = { ...newRow, minStock: newRow.min_stock, photo: newRow.photo_url, createdAt: newRow.created_at };
      if (!products.find(x => x.id === p.id)) products.unshift(p);
    } else if (eventType === 'UPDATE') {
      const idx = products.findIndex(p => p.id === newRow.id);
      const p = { ...newRow, minStock: newRow.min_stock, photo: newRow.photo_url, createdAt: newRow.created_at };
      if (idx >= 0) products[idx] = p; else products.unshift(p);
    }
    renderStockTable(false); updateAlertCount();
    _showSyncToast('Stock mis à jour');

  } else if (tbl === 'gp_sales') {
    if (eventType === 'DELETE') {
      sales = sales.filter(s => s.id !== oldRow.id);
    } else if (eventType === 'INSERT') {
      const s = { ...newRow, clientId: newRow.client_id, totalHT: newRow.total_ht, tvaAmount: newRow.tva_amount };
      if (!sales.find(x => x.id === s.id)) sales.unshift(s);
    } else if (eventType === 'UPDATE') {
      const idx = sales.findIndex(s => s.id === newRow.id);
      const s = { ...newRow, clientId: newRow.client_id, totalHT: newRow.total_ht, tvaAmount: newRow.tva_amount };
      if (idx >= 0) sales[idx] = s; else sales.unshift(s);
    }
    if (typeof renderVentes === 'function') renderVentes();
    renderDashboard();
    _showSyncToast('Ventes mises à jour');

  } else if (tbl === 'gp_clients') {
    if (eventType === 'DELETE') {
      clients = clients.filter(c => c.id !== oldRow.id);
    } else if (eventType === 'INSERT') {
      const c = { ...newRow, creditLimit: newRow.credit_limit, creditUsed: newRow.credit_used };
      if (!clients.find(x => x.id === c.id)) clients.push(c);
    } else if (eventType === 'UPDATE') {
      const idx = clients.findIndex(c => c.id === newRow.id);
      const c = { ...newRow, creditLimit: newRow.credit_limit, creditUsed: newRow.credit_used };
      if (idx >= 0) clients[idx] = c; else clients.push(c);
    }
    if (typeof renderClients === 'function') renderClients();
    populateClientSelect();
    _showSyncToast('Clients mis à jour');

  } else if (tbl === 'gp_employes') {
    if (eventType === 'DELETE') {
      employes = employes.filter(e => e.id !== oldRow.id);
    } else if (eventType === 'INSERT') {
      const e = { ...newRow, dateEmbauche: newRow.date_embauche };
      if (!employes.find(x => x.id === e.id)) employes.push(e);
    } else if (eventType === 'UPDATE') {
      const idx = employes.findIndex(e => e.id === newRow.id);
      const e = { ...newRow, dateEmbauche: newRow.date_embauche };
      if (idx >= 0) employes[idx] = e; else employes.push(e);
    }
    renderEmployes(); updateEmployeSelects();
    _showSyncToast('Employés mis à jour');

  } else if (tbl === 'gp_caisse_ops') {
    const normOp = r => ({ ...r, label: r.label || r.description || '', payment: r.payment || null });
    if (eventType === 'DELETE') {
      caisseOps = caisseOps.filter(o => o.id !== oldRow.id);
    } else if (eventType === 'INSERT') {
      if (!caisseOps.find(x => x.id === newRow.id)) caisseOps.unshift(normOp(newRow));
    } else if (eventType === 'UPDATE') {
      const idx = caisseOps.findIndex(o => o.id === newRow.id);
      if (idx >= 0) caisseOps[idx] = normOp(newRow); else caisseOps.unshift(normOp(newRow));
    }
    if (typeof renderFonds === 'function') renderFonds();
    _showSyncToast('Caisse mise à jour');

  } else if (tbl === 'gp_livraisons') {
    if (eventType === 'DELETE') {
      livraisons = livraisons.filter(l => l.id !== oldRow.id);
    } else if (eventType === 'INSERT') {
      const l = { ...newRow, articles: newRow.articles || [] };
      if (!livraisons.find(x => x.id === l.id)) livraisons.unshift(l);
    } else if (eventType === 'UPDATE') {
      const idx = livraisons.findIndex(l => l.id === newRow.id);
      const l = { ...newRow, articles: newRow.articles || [] };
      if (idx >= 0) livraisons[idx] = l; else livraisons.unshift(l);
    }
    if (typeof renderLivraisons === 'function') renderLivraisons();
    _showSyncToast('Livraisons mises à jour');

  } else if (tbl === 'gp_conges') {
    if (eventType === 'DELETE') {
      conges = conges.filter(c => c.id !== oldRow.id);
    } else if (eventType === 'INSERT') {
      const c = { ...newRow, empId: newRow.emp_id };
      if (!conges.find(x => x.id === c.id)) conges.unshift(c);
    } else if (eventType === 'UPDATE') {
      const idx = conges.findIndex(c => c.id === newRow.id);
      const c = { ...newRow, empId: newRow.emp_id };
      if (idx >= 0) conges[idx] = c; else conges.unshift(c);
    }
    if (typeof renderConges === 'function') renderConges();
    // Badge congés en attente
    const pending = conges.filter(c=>c.statut==='pending').length;
    const badge = document.getElementById('badge-conges');
    if (badge) { badge.textContent=pending; badge.style.display=pending>0?'':'none'; }
    _showSyncToast('Congés mis à jour');

  } else if (tbl === 'gp_conteneurs') {
    if (eventType === 'DELETE') {
      conteneurs = conteneurs.filter(c => c.id !== oldRow.id);
    } else if (eventType === 'INSERT') {
      const c = { ...newRow, dateArrivee: newRow.date_arrivee, dateLimite: newRow.date_limite,
        poidsTotal: newRow.poids_total, volumeCBM: newRow.volume_cbm, nbCartons: newRow.nb_cartons,
        fraisDouane: newRow.frais_douane, fraisPort: newRow.frais_port, fraisTransit: newRow.frais_transit,
        fraisAutres: newRow.frais_autres, methodeRepartition: newRow.methode_repartition, refs: newRow.refs||[] };
      if (!conteneurs.find(x => x.id === c.id)) conteneurs.unshift(c);
    } else if (eventType === 'UPDATE') {
      const idx = conteneurs.findIndex(c => c.id === newRow.id);
      const c = { ...newRow, dateArrivee: newRow.date_arrivee, dateLimite: newRow.date_limite,
        poidsTotal: newRow.poids_total, volumeCBM: newRow.volume_cbm, nbCartons: newRow.nb_cartons,
        fraisDouane: newRow.frais_douane, fraisPort: newRow.frais_port, fraisTransit: newRow.frais_transit,
        fraisAutres: newRow.frais_autres, methodeRepartition: newRow.methode_repartition, refs: newRow.refs||[] };
      if (idx >= 0) conteneurs[idx] = c; else conteneurs.unshift(c);
    }
    if (typeof renderConteneurs === 'function') renderConteneurs();
    _showSyncToast('Conteneurs mis à jour');

  } else if (tbl === 'gp_ordres') {
    if (eventType === 'DELETE') {
      ordres = ordres.filter(o => o.id !== oldRow.id);
    } else if (eventType === 'INSERT') {
      const o = { ...newRow, conteneurId: newRow.conteneur_id, refs: newRow.refs||[] };
      if (!ordres.find(x => x.id === o.id)) ordres.unshift(o);
    } else if (eventType === 'UPDATE') {
      const idx = ordres.findIndex(o => o.id === newRow.id);
      const o = { ...newRow, conteneurId: newRow.conteneur_id, refs: newRow.refs||[] };
      if (idx >= 0) ordres[idx] = o; else ordres.unshift(o);
    }
    if (typeof renderConteneurs === 'function') renderConteneurs();
    _showSyncToast('Ordres mis à jour');

  } else if (tbl === 'gp_docs_rh') {
    if (eventType === 'DELETE') {
      docsRHHistory = docsRHHistory.filter(d => d.id !== oldRow.id);
    } else if (eventType === 'INSERT') {
      const d = { ...newRow, empId: newRow.emp_id, empName: newRow.emp_name, date: newRow.created_at };
      if (!docsRHHistory.find(x => x.id === d.id)) docsRHHistory.unshift(d);
    } else if (eventType === 'UPDATE') {
      const idx = docsRHHistory.findIndex(d => d.id === newRow.id);
      const d = { ...newRow, empId: newRow.emp_id, empName: newRow.emp_name, date: newRow.created_at };
      if (idx >= 0) docsRHHistory[idx] = d; else docsRHHistory.unshift(d);
    }
    if (typeof renderDocsRH === 'function') renderDocsRH();
    if (typeof renderDocsRH === 'function') renderDocsRH();
    _showSyncToast('Documents RH mis à jour');

  } else if (tbl === 'gp_locaux') {
    // Reload locaux depuis Supabase pour avoir la liste à jour
    try {
      const { data } = await sb.from('gp_locaux').select('*').order('nom');
      if (data) {
        GP_LOCAUX_ALL = data.map(l => ({ ...l, desc: l.description }));
        locaux = GP_LOCAUX_ALL;
        if (typeof renderLocaux === 'function') renderLocaux();
        updateSALocalSwitcher();
        _showSyncToast('Locaux mis à jour');
      }
    } catch(e) { console.debug('[Realtime] gp_locaux reload:', e); }
  }

} // end _handleRealtimeEvent

// Fallback polling (si Realtime non disponible)
async function _pollSync() {
  if (Date.now() - _lastSaveTime < 8000) return;
  const lid = getLocalId();
  if (!lid) return;
  try {
    await _realtimeSyncTable('gp_products');
    await _realtimeSyncTable('gp_sales');
    await _realtimeSyncTable('gp_clients');
    await _realtimeSyncTable('gp_employes');
    await _realtimeSyncTable('gp_caisse_ops');
    await _realtimeSyncTable('gp_livraisons');
    await _realtimeSyncTable('gp_conges');
    await _realtimeSyncTable('gp_conteneurs');
  } catch(e) {
    console.debug('[Sync] poll skipped:', e.message);
  }
}

let _syncToastTimer = null;
function _showSyncToast(msg) {
  clearTimeout(_syncToastTimer);
  const el = document.getElementById('sync-toast');
  if (!el) return;
  el.textContent = '🔄 ' + msg;
  el.style.opacity = '1';
  _syncToastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

function showSyncIndicator(online) {
  const dot = document.getElementById('sync-dot');
  if (!dot) return;
  dot.style.background = online ? 'var(--accent)' : 'var(--red)';
  dot.title = online ? 'Synchronisation temps réel active' : 'Déconnecté';
}

// ╔══════════════════════════════════════════════════════════════╗
// ║                  PANNEAU SUPER ADMIN                         ║
// ╚══════════════════════════════════════════════════════════════╝
