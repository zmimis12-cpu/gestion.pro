/* ================================================================
   GestionPro — modules/settings.js
   Paramètres : exportProductsJSON, importProductsJSON,
   downloadSampleCSV, openLightbox, handleLogoUpload,
   renderCategoryFilters, selectCategory, loadSettingsForm,
   toggleTva, saveAllSettings, addCaisseOp (fonds)
================================================================ */

function importProductsJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);

      // Valider format
      if (!data.products || !Array.isArray(data.products)) {
        toast(t('toast_import_invalid'), 'error');
        e.target.value = ''; return;
      }

      const importedProducts = data.products;
      const avecPhotos = importedProducts.filter(p => p.photo && p.photo.length > 10).length;
      const exportDate = data.exportDate ? new Date(data.exportDate).toLocaleDateString('fr-FR') : 'inconnue';

      // Demander le mode : fusionner ou remplacer
      const choisirMode = confirm(
        `📦 Import GestionPro\n\n` +
        `• ${importedProducts.length} produit(s) dans le fichier\n` +
        `• ${avecPhotos} avec photos intégrées\n` +
        `• Date d'export : ${exportDate}\n\n` +
        `─────────────────────\n` +
        `OK       → Fusionner\n` +
        `(met à jour si le code produit existe, sinon ajoute)\n\n` +
        `Annuler → Remplacer tout\n` +
        `(efface et remplace tous les produits actuels)`
      );

      let added = 0, updated = 0;

      if (choisirMode) {
        // ── MODE FUSION ──
        importedProducts.forEach(imp => {
          // Chercher doublon par code produit (si existe)
          const existing = imp.code ? products.find(p => p.code === imp.code && p.code !== '') : null;

          if (existing) {
            // Mettre à jour en préservant l'ID existant
            const photo = imp.photo && imp.photo.length > 10 ? imp.photo : existing.photo;
            Object.assign(existing, { ...imp, id: existing.id, photo });
            // Sauvegarder la photo immédiatement dans localStorage
            if (photo) {
              try { 
                if (photo && photo.length < 500000) { // Max 500KB par photo
                  localStorage.setItem('gp_photo_' + existing.id, photo); 
                }
              } catch(err) { console.warn('[Photo] localStorage full:', err.message); }
            } else {
              localStorage.removeItem('gp_photo_' + existing.id);
            }
            updated++;
          } else {
            // Nouveau produit — conserver l'ID original si possible
            const newId = imp.id || uid();
            const newP = { ...imp, id: newId };
            // Sauvegarder la photo immédiatement
            if (newP.photo && newP.photo.length > 10) {
              try { localStorage.setItem('gp_photo_' + newId, newP.photo); } catch(err) {}
            }
            products.push(newP);
            added++;
          }
        });
        toast(`✅ ${t('toast_import_done')} : ${added} ${t('toast_import_added')}, ${updated} ${t('toast_import_updated')} (${avecPhotos} ${t('toast_photos_with')})`);

      } else {
        // ── MODE REMPLACEMENT ──
        if (!confirm(
          `⚠️ ATTENTION\n\n` +
          `Ceci va effacer les ${products.length} produits actuels\n` +
          `et les remplacer par ${importedProducts.length} produits importés.\n\n` +
          `Cette action est irréversible.\n\nConfirmer ?`
        )) {
          e.target.value = ''; return;
        }

        // Nettoyer toutes les anciennes photos
        products.forEach(p => localStorage.removeItem('gp_photo_' + p.id));
        products.length = 0;

        importedProducts.forEach(imp => {
          const newId = imp.id || uid();
          const newP = { ...imp, id: newId };
          if (newP.photo && newP.photo.length > 10) {
            try { localStorage.setItem('gp_photo_' + newId, newP.photo); } catch(err) {}
          }
          products.push(newP);
          added++;
        });
        toast(`✅ ${added} ${t('toast_import_replaced')} ${avecPhotos} ${t('toast_photos_with')}`);
      }

      // Sauvegarder et rafraîchir
      save(true); // immediate save
      renderStockTable();
      updateAlertCount();
      e.target.value = '';

    } catch (err) {
      console.error('Import error:', err);
      toast(t('toast_json_error') + ' : ' + err.message, 'error');
      e.target.value = '';
    }
  };
  reader.readAsText(file);
}

function downloadSampleCSV() {
  const header = 'Nom,Catégorie,Prix vente,Prix achat,Stock,Stock min,Unité,Code,URL Photo,Zone';
  const rows = [
    'Coca-Cola 33cl,Boissons,5.00,3.00,100,10,Pièce,CC001,https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/24701-nature-natural-beauty.jpg/320px-24701-nature-natural-beauty.jpg',
    'Sucre 1Kg,Épicerie,12.00,8.00,50,5,Kg,SUC01,',
    'Lait Centrale,Produits laitiers,8.50,6.00,30,8,Litre,LAI01,',
    'Savon Dove,Hygiène,18.00,12.00,40,5,Pièce,SAV01,',
    'Huile Lesieur 1L,Épicerie,35.00,25.00,20,5,Litre,HUI01,',
  ];
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'modele_produits.csv'; a.click();
  URL.revokeObjectURL(url);
  toast(t('toast_csv_downloaded'));
}

// ─── LIGHTBOX ───
function openLightbox(src, caption) {
  if (!src) return;
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-caption').textContent = caption || '';
  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

// ─── LOGO UPLOAD ───
function handleLogoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast(t('toast_logo_too_big'), 'error'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    settings.storeLogo = ev.target.result;
    saveSettings();
    const preview = document.getElementById('logo-preview');
    if (preview) preview.innerHTML = `<img src="${settings.storeLogo}" style="width:100%;height:100%;object-fit:contain;padding:4px;">`;
    toast(t('toast_logo_saved'));
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  settings.storeLogo = null;
  saveSettings();
  const preview = document.getElementById('logo-preview');
  if (preview) preview.innerHTML = '<span style="font-size:28px;color:var(--text3);">🖼️</span>';
  toast('Logo supprimé', 'warn');
}

// ─── CATEGORY FILTERS ───
function renderCategoryFilters() {
  const cats = ['Tous', ...new Set(products.map(p => p.category).filter(Boolean))];
  const container = document.getElementById('category-filters');
  if (!container) return;
  container.innerHTML = cats.map(cat => `
    <button onclick="selectCategory('${cat}')" style="
      padding:6px 14px;border-radius:20px;border:1.5px solid ${selectedCategory===cat ? 'var(--accent)' : 'var(--border)'};
      background:${selectedCategory===cat ? 'rgba(37,99,235,0.12)' : 'var(--surface)'};
      color:${selectedCategory===cat ? 'var(--accent)' : 'var(--text2)'};
      font-family:var(--font),sans-serif;font-size:12px;font-weight:600;cursor:pointer;
      transition:all 0.15s;white-space:nowrap;
    ">${cat === 'Tous' ? '🏷️ Tous' : cat}</button>
  `).join('');
}

function selectCategory(cat) {
  selectedCategory = cat;
  _pages['caisse'] = 1;
  renderCategoryFilters();
  renderProductGrid(false);
}

// ─── SETTINGS ───
function loadSettingsForm() {
  applyLang();
  document.getElementById('set-store-name').value = settings.storeName || '';
  document.getElementById('set-store-phone').value = settings.storePhone || '';
  document.getElementById('set-store-address').value = settings.storeAddress || '';
  document.getElementById('set-store-email').value = settings.storeEmail || '';
  document.getElementById('set-store-website').value = settings.storeWebsite || '';
  document.getElementById('set-invoice-prefix').value = settings.invoicePrefix || 'FAC';
  document.getElementById('set-store-ice').value = settings.storeIce || '';
  document.getElementById('set-bank-name').value = settings.bankName || '';
  document.getElementById('set-bank-iban').value = settings.bankIban || '';
  document.getElementById('set-invoice-notes').value = settings.invoiceNotes || '';
  // Show logo preview if exists
  if (settings.storeLogo) {
    const preview = document.getElementById('logo-preview');
    if (preview) preview.innerHTML = `<img src="${settings.storeLogo}" style="width:100%;height:100%;object-fit:contain;padding:4px;">`;
  }
  updateTvaToggleUI();
  updateTvaExample();
}

function toggleTva() {
  settings.showTva = !settings.showTva;
  updateTvaToggleUI();
  updateTvaExample();
}

function updateTvaToggleUI() {
  const toggle = document.getElementById('tva-toggle');
  const dot = document.getElementById('tva-toggle-dot');
  const label = document.getElementById('tva-toggle-label');
  const opts = document.getElementById('tva-options');
  if (settings.showTva) {
    toggle.style.background = 'var(--accent)';
    dot.style.transform = 'translateX(22px)';
    label.textContent = `Activée — ${settings.tva}%`;
    label.style.color = 'var(--accent)';
    opts.style.display = 'block';
  } else {
    toggle.style.background = 'var(--surface3)';
    dot.style.transform = 'translateX(0)';
    label.textContent = 'Désactivée';
    label.style.color = 'var(--text2)';
    opts.style.display = 'none';
  }
  document.querySelectorAll('.tva-rate-btn').forEach(b => {
    const active = parseInt(b.dataset.rate) === settings.tva;
    b.className = active ? 'tva-rate-btn btn btn-primary' : 'tva-rate-btn btn btn-secondary';
    b.textContent = b.dataset.rate + '%' + (active ? ' ✓' : '');
  });
}

function setTvaRate(rate) {
  if (!rate || rate <= 0) return;
  settings.tva = rate;
  updateTvaToggleUI();
  updateTvaExample();
}

function updateTvaExample() {
  const el = document.getElementById('tva-example');
  if (!el) return;
  const ht = 100;
  const tva = settings.tva;
  const tvaAmt = ht * tva / 100;
  el.innerHTML = `Prix HT : 100,00 MAD<br>TVA ${tva}% : +${tvaAmt.toFixed(2)} MAD<br>Prix TTC : ${(ht+tvaAmt).toFixed(2)} MAD`;
}

function saveAllSettings() {
  if (!GP_USER) { toast("⛔ Non connecté", "error"); return; }
  settings.storeName = document.getElementById('set-store-name').value.trim() || 'GestionPro';
  settings.storePhone = document.getElementById('set-store-phone').value.trim();
  settings.storeAddress = document.getElementById('set-store-address').value.trim();
  settings.storeEmail = document.getElementById('set-store-email').value.trim();
  settings.storeWebsite = document.getElementById('set-store-website').value.trim();
  settings.invoicePrefix = document.getElementById('set-invoice-prefix').value.trim() || 'FAC';
  settings.storeIce = document.getElementById('set-store-ice').value.trim();
  settings.bankName = document.getElementById('set-bank-name').value.trim();
  settings.bankIban = document.getElementById('set-bank-iban').value.trim();
  settings.invoiceNotes = document.getElementById('set-invoice-notes').value.trim();
  saveSettings();
  toast(t('toast_settings_saved'));
}

// ─── FONDS DE CAISSE ───
function getFondsLocalId() {
  // Local actif pour les opérations caisse = filtre sélectionné ou local de l'user
  const sel = document.getElementById('fonds-local-filter');
  return (sel?.value) || getLocalId() || null;
}

function addCaisseOp(type) {
  const label = document.getElementById('op-label').value.trim();
  const amount = parseFloat(document.getElementById('op-amount').value);
  if (!amount || amount <= 0) { toast(t('toast_invalid_amount'), 'error'); return; }
  if (!label && type !== 'depot') { toast('Description obligatoire', 'error'); return; }

  const typeLabels = { depot: t('fonds_depots'), retrait: t('fonds_retraits'), charge: t('fonds_charges') };
  caisseOps.unshift({
    id: uid(), local_id: getFondsLocalId(),
    type,
    amount,
    label: label || typeLabels[type],
    date: new Date().toISOString(),
    payment: 'Espèces'
  });
  save();
  document.getElementById('op-label').value = '';
  document.getElementById('op-amount').value = '';
  const icons = { depot:'➕', retrait:'💸', charge:'📋' };
  toast(`${icons[type]} ${typeLabels[type]} de ${fmt(amount)} enregistré`);
  renderFonds();
}
