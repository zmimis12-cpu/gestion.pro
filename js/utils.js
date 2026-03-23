/* ================================================================
   GestionPro — utils.js
   Utilitaires : applyLang, debounce, uid, escapeHTML, fmt, fmtDate,
   toast, openModal, closeModal, buildPagination, pagination
================================================================ */

// ════════════════════════════════════════════════════════════
// SYSTÈME DE TRADUCTION COMPLET FR / AR
// ════════════════════════════════════════════════════════════



function applyLang() {
  const isAr = currentLang === 'ar';
  const html = document.documentElement;
  html.setAttribute('lang', isAr ? 'ar' : 'fr');
  html.setAttribute('dir', isAr ? 'rtl' : 'ltr');

  // ── NAV ──
  const navMap = {
    'dashboard':'nav_dashboard','caisse':'nav_caisse','conteneurs':'nav_conteneurs',
    'commandes':'nav_commandes','docscont':'nav_docscont','fonds':'nav_fonds',
    'stock':'nav_stock','locaux':'nav_locaux','clients':'nav_clients',
    'alerts':'nav_alerts','settings':'nav_settings'
  };
  document.querySelectorAll('.nav-item[onclick]').forEach(el => {
    const m = el.getAttribute('onclick').match(/navigate\('([^']+)'\)/);
    if (!m) return;
    const key = navMap[m[1]];
    if (!key) return;
    const iconEl = el.querySelector('.icon');
    const badgeEl = el.querySelector('.badge');
    const iconText = iconEl ? iconEl.textContent : '';
    el.textContent = '';
    if (iconEl) { const sp = document.createElement('span'); sp.className='icon'; sp.textContent=iconText; el.appendChild(sp); }
    el.appendChild(document.createTextNode(' ' + t(key)));
    if (badgeEl) el.appendChild(badgeEl);
  });

  // ── TOPBAR title ──
  const activePage = document.querySelector('.page.active');
  if (activePage) {
    const pid = activePage.id.replace('page-','');
    const el = document.getElementById('page-title');
    if (el) {
      // Utiliser t() seulement si la clé existe, sinon garder le titre déjà set par navigate()
      const translated = t('title_'+pid);
      if (translated && translated !== 'title_'+pid) el.textContent = translated;
    }
  }

  // Helpers
  const _setText = (id,txt)=>{ const el=document.getElementById(id); if(el) el.textContent=txt; };
  const _setHTML = (id,html)=>{ const el=document.getElementById(id); if(el) el.innerHTML=html; };
  const _setFirstOpt = (sid,txt)=>{ const s=document.getElementById(sid); if(s&&s.options[0]) s.options[0].textContent=txt; };
  const _setNthOpt = (sid,n,txt)=>{ const s=document.getElementById(sid); if(s&&s.options[n]) s.options[n].textContent=txt; };

  // ── CAISSE ──
  const ps = document.getElementById('product-search');
  if (ps) ps.placeholder = t('search_product');
  _setText('cart-header-title',  t('cart_title'));
  _setText('cart-clear-btn',     t('cart_clear'));
  _setText('cart-subtotal-label',t('subtotal'));
  _setText('cart-total-label',   t('total_label'));
  _setText('pay-mode-label',     t('payment_mode'));
  _setText('pay-cash-btn',       t('pay_cash'));
  _setText('pay-card-btn',       t('pay_card'));
  _setText('pay-credit-btn',     t('pay_credit'));
  _setText('btn-validate-recu',  t('btn_validate_recu'));
  _setText('btn-validate-facture',t('btn_validate_facture'));
  const co = document.querySelector('#cart-client option[value=""]');
  if (co) co.textContent = t('client_passage');
  updateCartTvaUI();

  // ── STOCK ──
  const stockSearch = document.getElementById('stock-search');
  if (stockSearch) stockSearch.placeholder = '🔍 ' + t('search_stock');
  _setFirstOpt('stock-filter-cat',    t('all_categories'));
  _setFirstOpt('stock-filter-cont',   t('all_containers'));
  _setFirstOpt('stock-filter-zone',   t('all_zones'));
  _setFirstOpt('stock-filter-statut', t('all_statuts'));
  _setNthOpt('stock-filter-statut',1, t('status_ok'));
  _setNthOpt('stock-filter-statut',2, t('status_low'));
  _setNthOpt('stock-filter-statut',3, t('status_out'));
  _setText('th-col-product', t('col_product'));
  _setText('th-col-category',t('col_category'));
  _setText('th-col-stock',   t('col_stock'));
  _setText('th-col-min',     t('col_min'));
  _setText('th-col-price',   t('col_price'));
  _setText('th-col-zone',    t('col_zone'));
  _setText('th-col-cost',    t('col_cost'));
  _setText('th-col-profit',  t('col_profit'));
  _setText('th-col-margin',  t('col_margin'));
  _setText('th-col-status',  t('col_status'));
  _setText('th-col-actions', t('col_actions'));

  // ── LOCAUX ──
  const ls = document.getElementById('local-search');
  if (ls) ls.placeholder = t('search_locals');
  _setText('btn-new-local', t('btn_new_local'));

  // ── CLIENTS ──
  const cs = document.getElementById('client-search');
  if (cs) cs.placeholder = t('search_client');
  _setText('btn-new-client', t('btn_new_client'));

  // ── CONTENEURS ──
  const contS = document.getElementById('cont-search');
  if (contS) contS.placeholder = t('search_cont');
  _setFirstOpt('cont-filter-statut', t('cont_all_statuts'));
  _setNthOpt('cont-filter-statut',1, t('cont_en_cours'));
  _setNthOpt('cont-filter-statut',2, t('cont_retard'));
  _setNthOpt('cont-filter-statut',3, t('cont_sorti'));
  _setText('btn-new-cont',    t('cont_new_btn'));
  _setText('btn-new-ord',     t('cont_new_ordre'));
  _setText('docs-cont-header',t('cont_docs_title'));
  _setText('th-ord-numero',   t('cont_col_numero'));
  _setText('th-ord-date',     t('cont_col_date'));
  _setText('th-ord-cont',     t('cont_col_cont'));
  _setText('th-ord-fourn',    t('cont_col_fourn'));
  _setText('th-ord-refs',     t('cont_col_refs'));
  _setText('th-ord-val',      t('cont_col_val'));
  _setText('th-ord-statut',   t('cont_col_statut'));
  _setText('th-ord-actions',  t('cont_col_actions'));

  // ── ORDRES/COMMANDES ──
  const cmdS = document.getElementById('cmd-search');
  if (cmdS) cmdS.placeholder = '🔍 ' + t('search_ord').replace('🔍 ','');
  _setFirstOpt('cmd-filter-pay', t('ord_all_pay'));
  _setNthOpt('cmd-filter-pay',1, t('pay_cash'));
  _setNthOpt('cmd-filter-pay',2, t('pay_card'));
  _setNthOpt('cmd-filter-pay',3, t('pay_credit'));
  _setText('btn-cmd-reset',   t('ord_reset'));
  _setText('cmd-table-header',t('ord_history'));
  _setText('th-cmd-numero',   t('ord_col_numero'));
  _setText('th-cmd-date',     t('ord_col_date'));
  _setText('th-cmd-client',   t('ord_col_client'));
  _setText('th-cmd-items',    t('ord_col_items'));
  _setText('th-cmd-ht',       t('ord_col_ht'));
  _setText('th-cmd-tva',      t('ord_col_tva'));
  _setText('th-cmd-ttc',      t('ord_col_ttc'));
  _setText('th-cmd-pay',      t('ord_col_pay'));
  _setText('th-cmd-actions',  t('ord_col_actions'));

  // ── FONDS ──
  _setText('fonds-quick-op-title', t('fonds_quick_op'));
  _setText('fonds-op-label-lbl',   t('fonds_description'));
  _setText('fonds-op-amount-lbl',  t('fonds_amount'));
  const opL = document.getElementById('op-label');
  if (opL) opL.placeholder = t('fonds_description');
  _setText('btn-fonds-depot',    t('fonds_depot'));
  _setText('btn-fonds-retrait',  t('fonds_retrait'));
  _setText('btn-fonds-charge',   t('fonds_charge'));
  _setText('fonds-today-title',  t('fonds_today'));
  _setText('fonds-history-title',t('fonds_history'));
  _setFirstOpt('fonds-filter', t('fonds_all'));
  _setNthOpt('fonds-filter',1, t('fonds_ventes'));
  _setNthOpt('fonds-filter',2, t('fonds_depots'));
  _setNthOpt('fonds-filter',3, t('fonds_retraits'));
  _setNthOpt('fonds-filter',4, t('fonds_charges'));
  _setText('btn-fonds-open',   t('fonds_open'));
  _setText('btn-fonds-close',  t('fonds_close'));
  _setText('th-fonds-date',    t('fonds_col_date'));
  _setText('th-fonds-type',    t('fonds_col_type'));
  _setText('th-fonds-desc',    t('fonds_col_desc'));
  _setText('th-fonds-in',      t('fonds_col_in'));
  _setText('th-fonds-out',     t('fonds_col_out'));
  _setText('th-fonds-balance', t('fonds_col_balance'));

  // ── SETTINGS ──
  _setText('settings-lang-title',    t('settings_lang'));
  _setText('settings-store-title',   t('settings_store'));
  _setText('settings-bank-title',    t('settings_bank'));
  _setText('settings-tva-title-hdr', t('settings_tva'));

  // ── MODALS ──
  _setText('modal-add-product-title', t('prod_add_title'));
  _setText('modal-edit-product-title',t('prod_edit_title'));
  _setText('modal-add-client-title',  t('client_add_title'));

  // ── SIDEBAR FOOTER ──
  _setText('sidebar-footer-txt', isAr ? 'v2.0 — البيانات محلية 🔒' : 'v2.0 — Données locales 🔒');

  // ── MODAL PRODUIT ──
  _setText('lbl-prod-photo',    t('prod_photo_lbl'));
  _setText('lbl-prod-click-photo', t('prod_click_photo2'));
  _setText('lbl-prod-change',   t('prod_change_photo2'));
  _setText('lbl-prod-name',     t('prod_name_lbl'));
  _setText('lbl-prod-cat',      t('prod_cat_lbl'));
  _setText('lbl-prod-price',    t('prod_price_lbl'));
  _setText('lbl-prod-cost',     t('prod_cost_lbl'));
  _setText('lbl-prod-stock',    t('prod_stock_lbl'));
  _setText('lbl-prod-min',      t('prod_min_lbl'));
  _setText('lbl-prod-unit',     t('prod_unit_lbl'));
  _setText('lbl-prod-code',     t('prod_code_lbl'));
  _setText('lbl-prod-zone',     t('prod_zone_lbl'));
  _setText('prod-btn-cancel',   t('prod_btn_cancel'));
  _setText('prod-btn-save',     t('prod_btn_save'));
  // Labels Edit Product
  _setText('lbl-editprod-click',  t('prod_click_change'));
  _setText('lbl-editprod-name',   t('prod_name_lbl_short'));
  _setText('lbl-editprod-cat',    t('prod_cat_lbl'));
  _setText('lbl-editprod-price',  t('prod_price_lbl_short'));
  _setText('lbl-editprod-cost',   t('prod_cost_lbl_short'));
  _setText('lbl-editprod-stock',  t('prod_stock_lbl'));
  _setText('lbl-editprod-min',    t('prod_min_lbl_short'));
  _setText('lbl-editprod-unit',   t('prod_unit_lbl'));
  _setText('lbl-editprod-code',   t('prod_code_lbl'));
  _setText('lbl-editprod-zone',   t('prod_zone_lbl'));
  _setText('editprod-btn-cancel', t('prod_btn_cancel'));
  _setText('editprod-btn-update', t('prod_btn_update'));
  // Placeholders modals
  document.querySelectorAll('[data-ph]').forEach(el => {
    const ph = t(el.dataset.ph);
    if (ph) el.placeholder = ph;
  });

  // ── MODAL LOCAL ──
  _setText('lbl-local-nom',    t('local_nom_lbl'));
  _setText('lbl-local-desc',   t('local_desc_lbl'));
  _setText('lbl-local-resp',   t('local_resp_lbl'));
  _setText('lbl-local-couleur',t('local_couleur_lbl'));
  _setText('local-btn-cancel', t('local_btn_cancel'));
  _setText('local-btn-save',   t('local_btn_save'));
  _setText('local-detail-close',   t('local_btn_close'));
  _setText('local-detail-edit-txt',t('local_btn_edit2'));
  // Couleur options
  const colOpts = {
    'local-col-accent':t('local_col_accent'), 'local-col-blue':t('local_col_blue'),
    'local-col-orange':t('local_col_orange'), 'local-col-purple':t('local_col_purple'),
    'local-col-red':t('local_col_red'),       'local-col-gold':t('local_col_gold'),
  };
  Object.entries(colOpts).forEach(([id, txt]) => { const el=document.getElementById(id); if(el) el.textContent=txt; });

  // ── MODAL CLIENT ──
  _setText('lbl-cli-nom',   t('client_nom_lbl'));
  _setText('lbl-cli-phone', t('client_phone_lbl'));
  _setText('lbl-cli-limit', t('client_limit_lbl'));
  _setText('lbl-cli-city',  t('client_city_lbl'));
  _setText('lbl-cli-notes', t('client_notes_lbl'));
  _setText('cli-btn-cancel',t('client_btn_cancel'));
  _setText('cli-btn-save',  t('client_btn_save'));
  _setText('cli-detail-close',   t('client_btn_close'));
  _setText('cli-detail-modify',  t('client_btn_modify_limit'));
  _setText('cli-detail-pay-txt', t('client_btn_pay'));

  // ── MODAL LOCAL TITLE ──
  const localTitleEl = document.getElementById('modal-local-title');
  if (localTitleEl && localTitleEl.textContent.includes('Nouveau') || localTitleEl?.textContent.includes('جديد') || localTitleEl?.textContent.includes('محل')) {
    // Only update if showing "New" title (not edit)
    if (!document.getElementById('local-edit-id')?.value) {
      _setText('modal-local-title', t('local_modal_title_new'));
    }
  }
  _setText('local-detail-title', t('local_detail_title_lbl'));

  // ── MODAL CONTENEUR ──
  _setText('cont-sect-general',       t('cont_section_general'));
  _setText('cont-sect-dims',          t('cont_section_dims'));
  _setText('cont-sect-frais',         t('cont_section_frais'));
  _setText('cont-sect-refs',          t('cont_section_refs'));
  _setText('cont-sect-repartition',   t('cont_section_repartition'));
  _setText('cont-lbl-numero',         t('cont_field_numero'));
  _setText('cont-lbl-fourn',          t('cont_field_fourn'));
  _setText('cont-lbl-pays',           t('cont_field_pays'));
  _setText('cont-lbl-date-arr',       t('cont_field_date_arr'));
  _setText('cont-lbl-date-lim',       t('cont_field_date_lim'));
  _setText('cont-lbl-statut',         t('cont_field_statut'));
  _setText('cont-lbl-poids',          t('cont_field_poids'));
  _setText('cont-lbl-cbm',            t('cont_field_cbm'));
  _setText('cont-lbl-cartons',        t('cont_field_cartons'));
  _setText('cont-lbl-type',           t('cont_field_type'));
  _setText('cont-lbl-douane',         t('cont_field_douane'));
  _setText('cont-lbl-port',           t('cont_field_port'));
  _setText('cont-lbl-transit',        t('cont_field_transit'));
  _setText('cont-lbl-autres',         t('cont_field_autres'));
  _setText('cont-lbl-retard',         t('cont_field_retard'));
  _setText('cont-btn-retard-auto-txt',t('cont_retard_auto'));
  _setText('cont-btn-retard-manuel-txt',t('cont_retard_manuel'));
  _setText('cont-lbl-retard-jour',    t('cont_field_retard_jour'));
  _setText('cont-lbl-retard-total',   t('cont_field_retard_total'));
  _setText('cont-lbl-total-frais',    t('cont_total_frais'));
  _setText('cont-btn-add-ref',        t('cont_add_ref'));
  _setText('cont-btn-cancel',         t('cont_btn_cancel'));
  _setText('cont-btn-apercu',         t('cont_btn_apercu'));
  _setText('cont-btn-save',           t('cont_btn_save'));
  _setText('cont-apercu-title',       t('cont_apercu_title'));
  _setText('cont-apercu-confirm',     t('cont_apercu_confirm'));
  _setText('cont-detail-close',       t('btn_close'));
  _setText('cont-repartition-valeur', t('cont_repartition_valeur'));
  _setText('cont-repartition-poids',  t('cont_repartition_poids'));
  _setText('cont-repartition-egal',   t('cont_repartition_egal'));
  // Statut options du modal
  const cOptEnCours = document.getElementById('cont-opt-en-cours');
  const cOptSorti   = document.getElementById('cont-opt-sorti');
  if (cOptEnCours) cOptEnCours.textContent = t('cont_option_en_cours');
  if (cOptSorti)   cOptSorti.textContent   = t('cont_option_sorti');
  // Label jours de retard (contient un <span> enfant)
  const lblJours = document.getElementById('cont-lbl-jours');
  if (lblJours) { const hint = lblJours.querySelector('#jours-auto-hint'); lblJours.childNodes[0].textContent = t('cont_field_jours') + ' '; if(hint) lblJours.appendChild(hint); }

  // ── LANG BUTTONS ──
  document.querySelectorAll('.lang-btn').forEach(b => {
    const active = b.dataset.lang === currentLang;
    b.style.background  = active ? 'var(--accent)' : 'var(--surface2)';
    b.style.color       = active ? '#0a0f1e' : 'var(--text)';
    b.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
    b.style.fontWeight  = active ? '800' : '400';
  });


  // ── DASHBOARD static labels ──
  _setText('lbl-dash-sales-today', t('dash_sales_today'));
  _setText('lbl-dash-products',    t('dash_products_stock'));
  _setText('lbl-dash-clients',     t('dash_active_clients'));
  _setText('lbl-dash-credits',     t('dash_credits'));
  _setText('lbl-dash-recent-sales',t('dash_recent_sales').replace('📈 ',''));
  _setText('btn-dash-see-all',     t('dash_see_all'));
  _setHTML('lbl-dash-alerts-stock',t('dash_alerts_stock'));

  // ── CAISSE static ──
  _setText('btn-validate-recu',    t('btn_validate_recu'));
  _setText('btn-validate-facture', t('btn_validate_facture'));

  // ── STOCK buttons ──
  _setText('btn-new-product',   t('btn_new_product'));
  _setText('btn-csv-model',     t('btn_csv_model'));
  _setText('btn-export-json',   t('btn_export_json'));
  _setText('lbl-stock-inventory',t('stock_inventory').replace('📦 ',''));

  // ── LOCAUX ──
  _setText('btn-new-local',     t('btn_new_local'));

  // ── CLIENTS ──
  _setText('btn-new-client',    t('btn_new_client') || '➕ Nouveau client');

  // ── CONTENEURS ──
  _setText('btn-new-cont',      t('cont_new_btn'));
  _setText('btn-new-ord',       t('cont_new_ordre'));

  // ── FONDS static ──
  _setText('btn-fonds-depot',   t('fonds_depot'));
  _setText('btn-fonds-retrait', t('fonds_retrait'));
  _setText('btn-fonds-charge',  t('fonds_charge'));

  // ── MODAL titles ──
  _setText('modal-add-product-title',  t('prod_add_title'));
  _setText('modal-edit-product-title', t('prod_edit_title'));
  _setText('modal-add-client-title',   t('client_add_title'));
  _setText('modal-local-title',        isAr ? '🏪 محل جديد' : '🏪 Nouveau local');

  // ── SIDEBAR FOOTER ──
  _setText('sidebar-footer-txt', isAr ? 'v2.0 — البيانات محلية 🔒' : 'v2.0 — Données locales 🔒');

  // Re-render page active
  const curPage = activePage?.id?.replace('page-','');
  setTimeout(() => {
    if (curPage === 'stock')      renderStockTable(false);
    if (curPage === 'dashboard')  renderDashboard();
    if (curPage === 'alerts')     renderAlerts();
    if (curPage === 'clients')    renderClients();
    if (curPage === 'fonds')      renderFonds();
    if (curPage === 'conteneurs') renderConteneurs();
    if (curPage === 'commandes')  renderCommandes(false);
    if (curPage === 'docscont')   renderOrdres(false);
    if (curPage === 'locaux')     renderLocaux();
  }, 0);
}






let _saveTimer = null;