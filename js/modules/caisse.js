/* ================================================================
   GestionPro — modules/caisse.js
   Caisse & Ventes : renderProductGrid, addToCart, cart management,
   checkout, buildInvoiceHTML, showReceipt, renderDocPreview,
   printInvoice, buildReceiptHTML, printReceipt
================================================================ */

function renderProductGrid(resetPage) {
  if (resetPage !== false) _pages['caisse'] = 1;
  const q = (document.getElementById('product-search')?.value || '').toLowerCase();
  const grid = document.getElementById('products-grid');
  // Grouper les produits identiques — 1 carte par produit unique
  const caisseGroups = new Map();
  products.filter(p => {
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.code||'').toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    const matchCat = selectedCategory === 'Tous' || p.category === selectedCategory;
    return matchQ && matchCat;
  }).forEach(p => {
    const key = (p.code&&p.code.trim()) ? p.code.trim().toLowerCase() : `${p.name.trim().toLowerCase()}||${(p.category||'').toLowerCase()}`;
    if (!caisseGroups.has(key)) caisseGroups.set(key, { ...p, _totalStock: p.stock, _variants: [p] });
    else { const g=caisseGroups.get(key); g._totalStock+=p.stock; g._variants.push(p); }
  });
  // Produit à utiliser pour la vente = variant avec le plus de stock
  const filtered = [...caisseGroups.values()].map(g => {
    const bestV = [...g._variants].sort((a,b)=>b.stock-a.stock)[0];
    return { ...bestV, _totalStock: g._totalStock, _variants: g._variants };
  });
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><div class="emoji">📦</div><p>${products.length ? t('no_products') : t('cart_empty_stock')}</p></div>`;
    const pag = document.getElementById('caisse-pagination');
    if (pag) pag.innerHTML = '';
    return;
  }
  // Pagination 50 items
  const CAISSE_PAGE = 50;
  const page  = _pages['caisse'] || 1;
  const start = (page - 1) * CAISSE_PAGE;
  const pageData = filtered.slice(start, start + CAISSE_PAGE);
  const totalPages = Math.ceil(filtered.length / CAISSE_PAGE);

  grid.innerHTML = pageData.map(p => {
    const photo = p.photo
      ? `<div style="position:relative;width:70px;margin:0 auto 10px;">
          <img src="${p.photo}" style="width:70px;height:70px;border-radius:var(--radius);object-fit:cover;display:block;" alt="">
          <div onclick="openLightbox('${p.photo}','${p.name.replace(/'/g,"\\'")}');event.stopPropagation();" style="position:absolute;inset:0;border-radius:var(--radius);background:rgba(0,0,0,0);display:flex;align-items:center;justify-content:center;font-size:18px;opacity:0;transition:all 0.15s;cursor:zoom-in;" onmouseover="this.style.opacity='1';this.style.background='rgba(0,0,0,0.45)'" onmouseout="this.style.opacity='0';this.style.background='rgba(0,0,0,0)'">🔍</div>
         </div>`
      : `<div class="product-thumb">📦</div>`;
    const isOutOfStock = p.type === 'tailles'
      ? Object.values(p.sizes || {}).every(v => v <= 0)
      : p.type === 'couleurs'
      ? Object.values(p.colors || {}).every(v => v <= 0)
      : p.type === 'kg'
      ? (p._totalStock||p.stock) <= 0
      : (p._totalStock||p.stock) === 0;
    return `<div class="product-card ${isOutOfStock ? 'out-of-stock' : ''}" onclick="addToCart('${p.id}')">
      ${photo}
      <div class="product-stock-badge" title="${p._variants&&p._variants.length>1 ? p._variants.map(v=>{const l=GP_LOCAUX_ALL.find(l=>l.id===v.local_id)?.nom||v.zone||'?';return l+': '+v.stock}).join(' | ') : ''}">${p.type==='tailles' ? '👕' : p.type==='couleurs' ? '🎨' : p.type==='kg' ? `⚖️ ${p._totalStock||p.stock}kg` : (p._totalStock||p.stock)}</div>
      <div class="product-name">${escapeHTML(p.name)}</div>
      ${!SA_ACTIVE_LOCAL && p._variants && p._variants.length > 1 ? `<div style="font-size:9.5px;color:var(--text3);margin-top:1px;text-align:center;">📍 ${p._variants.length} locaux</div>` : ''}
      <div class="product-price">${p.price.toFixed(2)} MAD${p.type==='kg' ? '<span style="font-size:10px;color:var(--text2);"> /kg</span>' : ''}</div>
    </div>`;
  }).join('');

  // Pagination bar for caisse
  const pag = document.getElementById('caisse-pagination');
  if (pag && totalPages > 1) {
    const go = (pg) => { _pages['caisse'] = pg; renderProductGrid(false); };
    let btns = `<button onclick="go(${Math.max(1,page-1)})" ${page===1?'disabled':''} style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:12px;">‹</button>`;
    for (let pg = Math.max(1,page-2); pg <= Math.min(totalPages,page+2); pg++) {
      btns += `<button onclick="go(${pg})" style="padding:4px 10px;border-radius:6px;border:2px solid ${pg===page?'var(--accent)':'var(--border)'};background:${pg===page?'var(--accent)':'var(--surface2)'};color:${pg===page?'#0a0f1e':'var(--text)'};cursor:pointer;font-size:12px;font-weight:${pg===page?'700':'400'};">${pg}</button>`;
    }
    btns += `<button onclick="go(${Math.min(totalPages,page+1)})" ${page===totalPages?'disabled':''} style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:12px;">›</button>`;
    pag.innerHTML = `<div style="display:flex;align-items:center;gap:6px;padding:6px 0;flex-wrap:wrap;">
      <span style="font-size:11px;color:var(--text2);">${filtered.length} produits · Page ${page}/${totalPages}</span>
      ${btns}
    </div>`;
  } else if (pag) pag.innerHTML = '';
}

function filterProducts() { _pages['caisse'] = 1; renderProductGrid(false); }



function addToCart(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  // Produit par tailles
  if (p.type === 'tailles') {
    const sizes = p.sizes || {};
    const availSizes = Object.entries(sizes).filter(([, qty]) => qty > 0);
    if (!availSizes.length) { toast(t('toast_stock_insuf'), 'warn'); return; }
    document.getElementById('modal-size-product-name').textContent = `📦 ${p.name}`;
    const btnContainer = document.getElementById('modal-size-buttons');
    btnContainer.innerHTML = availSizes.map(([sz, qty]) => `
      <button class="btn btn-secondary" style="min-width:70px;flex-direction:column;gap:2px;"
        onclick="addToCartWithSize('${id}','${sz}');closeModal('modal-size-select')">
        <span style="font-size:16px;font-weight:800;">${sz}</span>
        <span style="font-size:10px;color:var(--text2);">Stock: ${qty}</span>
      </button>`).join('');
    openModal('modal-size-select');
    return;
  }

  // Si le produit a des couleurs (quelle que soit son type), proposer le choix
  if (p.colors && Object.keys(p.colors).length > 0) {
    const availColors = Object.entries(p.colors).filter(([, qty]) => qty > 0);
    if (!availColors.length && p.stock <= 0) { toast(t('toast_stock_insuf'), 'warn'); return; }
    if (availColors.length > 0) {
      document.getElementById('modal-size-product-name').textContent = `🎨 ${p.name}`;
      const btnContainer = document.getElementById('modal-size-buttons');
      btnContainer.innerHTML = availColors.map(([col, qty]) => `
        <button class="btn btn-secondary" style="min-width:80px;flex-direction:column;gap:2px;"
          onclick="addToCartWithColor('${id}','${col}');closeModal('modal-size-select')">
          <span style="font-size:14px;font-weight:800;">🎨 ${col}</span>
          <span style="font-size:10px;color:var(--text2);">Stock: ${qty}</span>
        </button>`).join('');
      openModal('modal-size-select');
      return;
    }
  }

  // Produit au KG — ouvrir modal saisie poids
  if (p.type === 'kg') {
    if (p.stock <= 0) { toast(t('toast_stock_insuf'), 'warn'); return; }
    document.getElementById('modal-kg-product-name').textContent = `⚖️ ${p.name}`;
    document.getElementById('modal-kg-stock-info').textContent = `Stock disponible : ${p.stock} ${p.unit || 'Kg'}`;
    document.getElementById('modal-kg-prix-unit').textContent = `${p.price.toFixed(2)} MAD`;
    document.getElementById('modal-kg-poids').value = '';
    document.getElementById('modal-kg-total').textContent = '0.00 MAD';
    document.getElementById('modal-kg-select').dataset.pid = p.id;
    openModal('modal-kg-select');
    setTimeout(() => document.getElementById('modal-kg-poids').focus(), 100);
    return;
  }

  // Produit normal unité
  if (p.stock === 0) { toast(t('toast_stock_insuf'), 'warn'); return; }
  const existing = cart.find(c => c.id === id && !c.size);
  if (existing) {
    if (existing.qty >= p.stock) { toast(t('toast_stock_insuf'), 'warn'); return; }
    existing.qty++;
  } else {
    cart.push({ id, name: p.name, price: p.price, qty: 1 });
  }
  renderCart();
}

function addToCartWithSize(id, size) {
  const p = products.find(x => x.id === id);
  if (!p || !p.sizes) return;
  const availQty = p.sizes[size] || 0;
  if (availQty <= 0) { toast(t('toast_stock_insuf'), 'warn'); return; }
  const existing = cart.find(c => c.id === id && c.size === size);
  if (existing) {
    if (existing.qty >= availQty) { toast(t('toast_stock_insuf'), 'warn'); return; }
    existing.qty++;
  } else {
    cart.push({ id, name: `${p.name} (${size})`, price: p.price, qty: 1, size, productId: id });
  }
  renderCart();
}

function addToCartWithColor(id, color) {
  const p = products.find(x => x.id === id);
  if (!p || !p.colors) return;
  const availQty = p.colors[color] || 0;
  if (availQty <= 0) { toast(t('toast_stock_insuf'), 'warn'); return; }
  const existing = cart.find(c => c.id === id && c.color === color);
  if (existing) {
    if (existing.qty >= availQty) { toast(t('toast_stock_insuf'), 'warn'); return; }
    existing.qty++;
  } else {
    cart.push({ id, name: `${p.name} (${color})`, price: p.price, qty: 1, color, productId: id });
  }
  renderCart();
}

// ─── KG MODAL HELPERS ───
function updateKGPrixTotal() {
  const pid = document.getElementById('modal-kg-select').dataset.pid;
  const p = products.find(x => x.id === pid);
  if (!p) return;
  const poids = parseFloat(document.getElementById('modal-kg-poids').value) || 0;
  const total = poids * p.price;
  document.getElementById('modal-kg-total').textContent = `${total.toFixed(2)} MAD`;
}

function setKGPoids(val) {
  const pid = document.getElementById('modal-kg-select').dataset.pid;
  const p = products.find(x => x.id === pid);
  if (!p) return;
  // Ne pas dépasser le stock
  const poids = Math.min(val, p.stock);
  document.getElementById('modal-kg-poids').value = poids;
  updateKGPrixTotal();
}

function confirmKGAdd() {
  const pid = document.getElementById('modal-kg-select').dataset.pid;
  const p = products.find(x => x.id === pid);
  if (!p) return;
  const poids = parseFloat(document.getElementById('modal-kg-poids').value);
  if (!poids || poids <= 0) { toast('Entrez un poids valide', 'warn'); return; }
  if (poids > p.stock) { toast(`Stock insuffisant (${p.stock} ${p.unit||'Kg'} dispo)`, 'warn'); return; }

  // Chercher si déjà dans panier (remplacer la qté)
  const cartKey = `kg_${pid}`;
  const existing = cart.find(c => c.cartKey === cartKey);
  if (existing) {
    existing.qty = poids;
    existing.totalKg = poids * p.price;
  } else {
    cart.push({
      id: pid,
      cartKey,
      name: `${p.name}`,
      price: p.price,       // prix par Kg
      qty: poids,            // poids en Kg
      unit: p.unit || 'Kg',
      isKg: true,
      displayQty: `${poids} ${p.unit || 'Kg'}`
    });
  }
  closeModal('modal-kg-select');
  renderCart();
  toast(`✅ ${poids} ${p.unit||'Kg'} de ${p.name} ajouté`);
}

function removeFromCartByKey(ck) {
  cart = cart.filter(c => (c.cartKey || c.id + (c.size ? '_' + c.size : '')) !== ck);
  renderCart();
}
// Compat ancien code
function removeFromCart(id) {
  cart = cart.filter(c => c.id !== id || c.size);
  renderCart();
}

function updateQtyByKey(ck, delta) {
  const item = cart.find(c => (c.cartKey || c.id + (c.size ? '_' + c.size : '')) === ck);
  if (!item) return;
  const pid = item.productId || item.id;
  const p = products.find(x => x.id === pid);
  const maxQty = item.size ? (p?.sizes?.[item.size] || 999) : item.color ? (p?.colors?.[item.color] || 999) : (p?.stock || 999);
  item.qty = Math.max(1, item.qty + delta);
  if (item.qty > maxQty) { item.qty = maxQty; toast(t('toast_stock_insuf'), 'warn'); }
  const input = document.getElementById('qty-' + ck);
  if (input) input.value = item.qty;
  const totalEl = document.getElementById('item-total-' + ck);
  if (totalEl) totalEl.textContent = (item.price * item.qty).toFixed(2);
  _updateCartTotals();
}

// Compat
function updateQty(id, delta) {
  const item = cart.find(c => c.id === id && !c.size && !c.isKg);
  if (!item) return;
  updateQtyByKey(id, delta);
}

function updateCartFieldByKey(ck, field, value) {
  const item = cart.find(c => (c.cartKey || c.id + (c.size ? '_' + c.size : '')) === ck);
  if (!item) return;
  if (field === 'qty') {
    const pid = item.productId || item.id;
    const p = products.find(x => x.id === pid);
    const maxQty = item.size ? (p?.sizes?.[item.size] || 999) : item.color ? (p?.colors?.[item.color] || 999) : (p?.stock || 999);
    const newQty = parseFloat(value);
    if (!newQty || newQty <= 0) { removeFromCartByKey(ck); return; }
    item.qty = Math.min(newQty, maxQty);
  }
  if (field === 'price') {
    const newPrice = parseFloat(value);
    if (isNaN(newPrice) || newPrice < 0) return;
    item.price = newPrice;
  }
  renderCart();
}

// Compat
function updateCartField(id, field, value) {
  const ck = cart.find(c => c.id === id && !c.size && !c.isKg) ? id : null;
  if (ck) updateCartFieldByKey(ck, field, value);
}

function updateKGCartQty(ck, value) {
  const item = cart.find(c => c.cartKey === ck);
  if (!item) return;
  const p = products.find(x => x.id === item.id);
  const poids = parseFloat(value);
  if (!poids || poids <= 0) { removeFromCartByKey(ck); return; }
  if (p && poids > p.stock) { toast(`Stock max: ${p.stock} ${p.unit||'Kg'}`, 'warn'); item.qty = p.stock; }
  else item.qty = poids;
  const totalEl = document.getElementById('item-total-' + ck);
  if (totalEl) totalEl.textContent = (item.price * item.qty).toFixed(2);
  _updateCartTotals();
}

function updateKGCartPrice(ck, value) {
  const item = cart.find(c => c.cartKey === ck);
  if (!item) return;
  item.price = parseFloat(value) || 0;
  const totalEl = document.getElementById('item-total-' + ck);
  if (totalEl) totalEl.textContent = (item.price * item.qty).toFixed(2);
  _updateCartTotals();
}

// ── Calcul financier professionnel ──
function calcCartFinancials() {
  // Sous-total brut HT = somme(prix_vente × qty)
  const subtotalHT = cart.reduce((s, c) => s + (c.price || 0) * (c.qty || 1), 0);

  // Remise globale
  const remiseVal  = parseFloat(document.getElementById('cart-remise-val')?.value) || 0;
  const remiseType = document.getElementById('cart-remise-type')?.value || 'pct';
  let remiseMt = 0;
  if (remiseVal > 0) {
    remiseMt = remiseType === 'pct'
      ? subtotalHT * (remiseVal / 100)
      : Math.min(remiseVal, subtotalHT);
  }

  // CA HT = sous-total après remise
  const caHT = subtotalHT - remiseMt;

  // COGS = somme(prix_achat × qty) — depuis les produits
  let cogs = 0;
  cart.forEach(item => {
    const pid = item.productId || item.id;
    const prod = products.find(p => p.id === pid);
    const pa = prod?.cost || prod?.buyPrice || prod?.prixAchat || 0;
    cogs += pa * (item.qty || 1);
  });

  // TVA sur CA HT
  const tvaRate = settings.showTva ? (settings.tva || 0) : 0;
  const tvaAmt  = caHT * (tvaRate / 100);

  // Total TTC
  const totalTTC = caHT + tvaAmt;

  // Bénéfice brut (avant TVA, avant dépenses)
  const beneficeBrut = caHT - cogs;
  const marge = caHT > 0 ? (beneficeBrut / caHT) * 100 : 0;

  return { subtotalHT, remiseMt, caHT, cogs, tvaRate, tvaAmt, totalTTC, beneficeBrut, marge };
}

function _updateCartTotals() {
  const f = calcCartFinancials();

  document.getElementById('cart-subtotal').textContent = fmt(f.subtotalHT);

  // Ligne remise
  const remiseRow = document.getElementById('cart-remise-row');
  if (remiseRow) {
    if (f.remiseMt > 0) {
      remiseRow.style.display = 'flex';
      document.getElementById('cart-remise-amount').textContent = `- ${fmt(f.remiseMt)}`;
    } else {
      remiseRow.style.display = 'none';
    }
  }

  // Ligne CA HT (si remise ou TVA)
  const htRow = document.getElementById('cart-ht-row');
  if (htRow) htRow.style.display = (f.remiseMt > 0 || f.tvaAmt > 0) ? 'flex' : 'none';
  const htAmt = document.getElementById('cart-ht-amount');
  if (htAmt) htAmt.textContent = fmt(f.caHT);

  // TVA
  const tvaRow = document.getElementById('cart-tva-row');
  if (settings.showTva) {
    tvaRow.style.display = 'flex';
    document.getElementById('cart-tva-label').textContent = `TVA (${f.tvaRate}%)`;
    document.getElementById('cart-tva-amount').textContent = fmt(f.tvaAmt);
    document.getElementById('cart-total-label').textContent = 'TOTAL TTC';
  } else {
    tvaRow.style.display = 'none';
    document.getElementById('cart-total-label').textContent = 'TOTAL HT';
  }
  document.getElementById('cart-total').textContent = fmt(f.totalTTC);
}

function clearCart() {
  cart = [];
  currentClientId = null;
  selectedPayment = 'Espèces';
  document.getElementById('cart-client').value = '';
  document.querySelectorAll('.pay-method').forEach(b => b.classList.remove('selected'));
  document.querySelector('.pay-method').classList.add('selected');
  document.getElementById('client-credit-info').style.display = 'none';
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cart-items');
  if (!cart.length) {
    container.innerHTML = `<div class="empty-state" id="cart-empty"><div class="emoji">🛍️</div><p>Cliquez sur les produits</p></div>`;
    document.getElementById('cart-subtotal').textContent = '0,00 MAD';
    document.getElementById('cart-total').textContent = '0,00 MAD';
    return;
  }
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cartKey = (item) => item.cartKey || item.id + (item.size ? '_' + item.size : '');
  container.innerHTML = cart.map(item => {
    const ck = cartKey(item);
    if (item.isKg) {
      // Affichage spécial produit KG
      return `
        <div class="cart-item" style="flex-direction:column;align-items:stretch;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:14px;">⚖️</span>
            <div class="cart-item-name" style="flex:1;">${escapeHTML(item.name)}</div>
            <button class="remove-btn" onclick="removeFromCartByKey('${ck}')">✕</button>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;">
              <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Poids</div>
              <div style="display:flex;align-items:center;gap:6px;background:var(--surface3);border-radius:8px;padding:4px 8px;">
                <input type="number" id="kgqty-${ck}" value="${item.qty}" min="0.001" step="0.001"
                  style="background:transparent;border:none;outline:none;color:var(--accent);font-family:var(--font-mono),monospace;font-weight:700;font-size:15px;width:70px;text-align:center;"
                  onblur="updateKGCartQty('${ck}',this.value)"
                  onkeydown="if(event.key==='Enter')this.blur()"
                  onclick="this.select()">
                <span style="font-size:11px;color:var(--text2);">${item.unit||'Kg'}</span>
              </div>
            </div>
            <div style="flex:1;">
              <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Prix / ${item.unit||'Kg'}</div>
              <input type="number" value="${item.price.toFixed(2)}" step="0.01" min="0"
                style="background:var(--surface3);border:1px solid var(--border);border-radius:6px;outline:none;color:var(--accent);font-family:var(--font-mono),monospace;font-weight:700;font-size:14px;width:100%;padding:5px 8px;text-align:right;"
                onchange="updateKGCartPrice('${ck}',this.value)"
                onclick="this.select()">
            </div>
            <div style="flex:0 0 auto;text-align:right;">
              <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Total</div>
              <div id="item-total-${ck}" style="font-family:var(--font-mono),monospace;font-weight:800;font-size:14px;color:var(--accent);">${(item.price*item.qty).toFixed(2)}</div>
            </div>
          </div>
        </div>`;
    }
    // Item normal
    return `
    <div class="cart-item" style="flex-direction:column;align-items:stretch;gap:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="cart-item-name" style="flex:1;">${escapeHTML(item.name)}</div>
        <button class="remove-btn" onclick="removeFromCartByKey('${ck}')">✕</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;">
          <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Qté</div>
          <div style="display:flex;align-items:center;gap:6px;background:var(--surface3);border-radius:8px;padding:4px 8px;">
            <button class="qty-btn" onclick="updateQtyByKey('${ck}',-1)">−</button>
            <input
              type="number"
              id="qty-${ck}"
              value="${item.qty}"
              min="1"
              style="background:transparent;border:none;outline:none;color:var(--text);font-family:var(--font-mono),monospace;font-weight:700;font-size:15px;width:50px;text-align:center;"
              onblur="updateCartFieldByKey('${ck}','qty',this.value)"
              onkeydown="if(event.key==='Enter'){this.blur();} if(event.key==='ArrowUp'){event.preventDefault();updateQtyByKey('${ck}',1);} if(event.key==='ArrowDown'){event.preventDefault();updateQtyByKey('${ck}',-1);}"
              onclick="this.select()"
            >
            <button class="qty-btn" onclick="updateQtyByKey('${ck}',1)">+</button>
          </div>
        </div>
        <div style="flex:1;">
          <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Prix unit. (MAD)</div>
          <input
            type="number"
            value="${item.price.toFixed(2)}"
            step="0.01"
            min="0"
            style="background:var(--surface3);border:1px solid var(--border);border-radius:6px;outline:none;color:var(--accent);font-family:var(--font-mono),monospace;font-weight:700;font-size:14px;width:100%;padding:5px 8px;text-align:right;"
            onchange="updateCartFieldByKey('${ck}','price',this.value)"
            onclick="this.select()"
          >
        </div>
        <div style="flex:0 0 auto;text-align:right;">
          <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Total</div>
          <div id="item-total-${ck}" style="font-family:var(--font-mono),monospace;font-weight:800;font-size:14px;color:var(--text);">${(item.price*item.qty).toFixed(2)}</div>
        </div>
      </div>
    </div>
  `}).join('');
  const ht = total;
  const tvaAmt = settings.showTva ? ht * (settings.tva / 100) : 0;
  const ttc = ht + tvaAmt;
  document.getElementById('cart-subtotal').textContent = fmt(ht);
  const tvaRow = document.getElementById('cart-tva-row');
  const totalLabel = document.getElementById('cart-total-label');
  if (settings.showTva) {
    tvaRow.style.display = 'flex';
    document.getElementById('cart-tva-label').textContent = `TVA (${settings.tva}%)`;
    document.getElementById('cart-tva-amount').textContent = fmt(tvaAmt);
    totalLabel.textContent = 'TOTAL TTC';
  } else {
    tvaRow.style.display = 'none';
    totalLabel.textContent = 'TOTAL';
  }
  document.getElementById('cart-total').textContent = fmt(ttc);
}

function quickToggleTva() {
  settings.showTva = !settings.showTva;
  saveSettings();
  updateCartTvaUI();
  renderCart();
}

function updateCartTvaUI() {
  const sw = document.getElementById('cart-tva-switch');
  const dot = document.getElementById('cart-tva-switch-dot');
  const lbl = document.getElementById('cart-tva-toggle-label');
  const sub = document.getElementById('cart-tva-toggle-sub');
  const bar = document.getElementById('cart-tva-toggle-bar');
  const subLbl = document.getElementById('cart-subtotal-label');
  if (!sw) return;
  if (settings.showTva) {
    sw.style.background = 'var(--accent)';
    sw.style.borderColor = 'var(--accent)';
    dot.style.transform = 'translateX(16px)';
    lbl.style.color = 'var(--accent)';
    lbl.textContent = `TVA activée — ${settings.tva}%`;
    sub.textContent = 'Les prix sont HT · Cliquer pour désactiver';
    bar.style.borderColor = 'var(--accent)';
    if (subLbl) subLbl.textContent = 'Sous-total HT';
  } else {
    sw.style.background = 'var(--surface3)';
    sw.style.borderColor = 'var(--border)';
    dot.style.transform = 'translateX(0)';
    lbl.style.color = 'var(--text)';
    lbl.textContent = 'TVA désactivée';
    sub.textContent = 'Cliquer pour activer';
    bar.style.borderColor = 'var(--border)';
    if (subLbl) subLbl.textContent = 'Sous-total';
  }
}

function selectPayment(method) {
  selectedPayment = method;
  document.querySelectorAll('.pay-method').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.pay-method').forEach(b => {
    if (b.textContent.includes(method) || (method === 'Crédit' && b.classList.contains('credit-btn'))) {
      b.classList.add('selected');
    }
  });
  if (method === 'Crédit') {
    const sel = document.getElementById('cart-client');
    if (!sel.value) toast(t('toast_select_client'), 'warn');
  }
}

function onClientChange() {
  const sel = document.getElementById('cart-client');
  currentClientId = sel.value || null;
  const infoDiv = document.getElementById('client-credit-info');
  if (!currentClientId) { infoDiv.style.display = 'none'; return; }
  const client = clients.find(c => c.id === currentClientId);
  if (!client) return;
  const used = client.creditUsed || 0;
  const limit = client.creditLimit || 500;
  const pct = Math.min(100, (used / limit) * 100);
  const color = pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--gold)' : 'var(--accent)';
  infoDiv.style.display = 'block';
  infoDiv.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:12px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span>💳 Crédit utilisé</span>
        <span style="font-weight:700;color:${color};font-family:var(--font-mono),monospace;">${fmt(used)} / ${fmt(limit)}</span>
      </div>
      <div class="credit-bar"><div class="credit-bar-fill" style="width:${pct}%;background:${color};"></div></div>
    </div>
  `;
}

function populateClientSelect() {
  const sel = document.getElementById('cart-client');
  sel.innerHTML = '<option value="">Client de passage</option>' +
    clients.map(c => `<option value="${c.id}">${escapeHTML(c.name)}${c.creditUsed > 0 ? ` (Dette: ${fmt(c.creditUsed)})` : ''}</option>`).join('');
}

function checkout(docType) {
  if (!isSuperAdmin() && !hasPermission('caisse', 'create')) {
    toast('⛔ Permission refusée', 'error'); return;
  }
  // Bloquer si accès global sans local sélectionné
  if (isSuperAdmin() && !SA_ACTIVE_LOCAL) {
    openCaisseLocalModal();
    toast('⚠️ Choisissez un local avant de valider la vente', 'warn');
    return;
  }
  if (!cart.length) { toast(t('toast_cart_empty'), 'warn'); return; }
  const fin = calcCartFinancials();

  // Credit check — on vérifie sur le total TTC
  if (selectedPayment === 'Crédit') {
    if (!currentClientId) { toast(t('toast_select_client'), 'error'); return; }
    const client = clients.find(c => c.id === currentClientId);
    const used = client.creditUsed || 0;
    const limit = client.creditLimit || 500;
    if (used + fin.totalTTC > limit) {
      toast(`${t('toast_credit_exceeded')} (${fmt(limit - used)})`, 'error');
      return;
    }
  }

  // Deduct stock
  cart.forEach(item => {
    const pid = item.productId || item.id;
    const p = products.find(x => x.id === pid);
    if (!p) return;
    if (item.size && p.sizes) {
      // Déduire du stock par taille
      p.sizes[item.size] = Math.max(0, (p.sizes[item.size] || 0) - item.qty);
      p.stock = Object.values(p.sizes).reduce((s, v) => s + v, 0);
    } else if (item.color && p.colors) {
      // Déduire du stock par couleur
      p.colors[item.color] = Math.max(0, (p.colors[item.color] || 0) - item.qty);
      p.stock = Object.values(p.colors).reduce((s, v) => s + v, 0);
    } else {
      p.stock = Math.max(0, p.stock - item.qty);
    }
  });

  // Update client credit
  // Crédit = augmente CA + bénéfice + débiteur client, mais PAS la trésorerie
  if (currentClientId && selectedPayment === 'Crédit') {
    const client = clients.find(c => c.id === currentClientId);
    if (client) {
      client.creditUsed = (client.creditUsed || 0) + fin.totalTTC;
      if (!client.transactions) client.transactions = [];
      client.transactions.push({
        type: 'debit', amount: fin.totalTTC,
        date: new Date().toISOString(), note: 'Vente à crédit'
      });
    }
  }

  // Record sale — structure financière complète
  const lid = getLocalId();
  const remiseVal  = parseFloat(document.getElementById('cart-remise-val')?.value) || 0;
  const remiseType = document.getElementById('cart-remise-type')?.value || 'pct';
  const sale = {
    id: uid(),
    local_id: lid,
    date: new Date().toISOString(),
    items: cart.map(item => {
      const pid = item.productId || item.id;
      const prod = products.find(p => p.id === pid);
      const pa = prod?.cost || prod?.buyPrice || prod?.prixAchat || 0;
      return {
        ...item,
        buyPrice:  pa,           // snapshot prix achat au moment de la vente
        sellPrice: item.price,   // snapshot prix vente
      };
    }),
    // Financials
    subtotalHT:   fin.subtotalHT,    // Sous-total brut HT
    remiseMt:     fin.remiseMt,      // Montant remise
    remiseVal:    remiseVal,
    remiseType:   remiseType,
    caHT:         fin.caHT,          // CA HT après remise
    cogs:         fin.cogs,          // Coût marchandises vendues
    beneficeBrut: fin.beneficeBrut,  // Bénéfice brut (avant TVA)
    marge:        fin.marge,         // Marge %
    tva:          fin.tvaRate,
    tvaAmount:    fin.tvaAmt,        // TVA (ne fait PAS partie du bénéfice)
    total:        fin.totalTTC,      // Total TTC (ce que paie le client)
    totalHT:      fin.caHT,          // Alias pour compatibilité
    payment:      selectedPayment,
    clientId:     currentClientId,
    clientName:   currentClientId ? (clients.find(c => c.id === currentClientId)?.name || clients.find(c => c.id === currentClientId)?.nom || 'Client inconnu') : 'Client de passage',
    isCreditSale: selectedPayment === 'Crédit',
  };
  sales.unshift(sale);

  // Log caisse — UNIQUEMENT si paiement cash/carte (pas crédit = pas de trésorerie)
  if (selectedPayment !== 'Crédit') {
    caisseOps.unshift({
      id: uid(), local_id: lid, type: 'vente',
      amount: fin.totalTTC,
      label: `Vente (${sale.items.length} article${sale.items.length>1?'s':''}) — ${sale.clientName || 'Client de passage'}`,
      date: sale.date,
      payment: sale.payment
    });
  } else {
    // Vente crédit → log séparé comme "créance client"
    caisseOps.unshift({
      id: uid(), local_id: lid, type: 'credit_vente',
      amount: fin.totalTTC,
      label: `Crédit client — ${sale.clientName || 'Client de passage'} (${sale.items.length} art.)`,
      date: sale.date,
      payment: 'Crédit'
    });
  }
  save();

  // WhatsApp notification automatique si vente à crédit
  if (sale.isCreditSale) {
    const creditClient = clients.find(c => c.id === sale.clientId);
    setTimeout(() => {
      sendWhatsAppCredit(sale, creditClient);
    }, 500);
  }

  // Show receipt or invoice
  showReceipt(sale, docType);
  clearCart();
  renderProductGrid();
  updateAlertCount();
  renderDashboard();
}

function buildInvoiceHTML(sale) {
  const now = new Date(sale.date);
  const dateStr = now.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
  const dueDate = new Date(now.getTime() + 30*24*60*60*1000).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
  const invoiceNum = (settings.invoicePrefix || 'FAC') + '-' + String(settings.invoiceCounter || 1).padStart(4,'0');
  const ht = sale.totalHT || sale.total;
  const tvaAmt = sale.tvaAmount || 0;
  const ttc = sale.total;
  const currency = 'MAD';

  // Get client info
  const client = clients.find(c => c.id === sale.clientId);
  const clientAddr = client ? (client.city || '') : '';

  return `<div class="invoice-a4" style="
    font-family: Arial, sans-serif;
    font-size: 13px;
    color: #222;
    background: #fff;
    width: 210mm;
    min-height: 297mm;
    padding: 15mm 15mm 20mm;
    box-sizing: border-box;
    position: relative;
  ">
    <!-- HEADER -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px;">
      <div style="flex:1;">
        ${settings.storeLogo
          ? `<img src="${settings.storeLogo}" style="max-height:70px;max-width:180px;object-fit:contain;margin-bottom:10px;display:block;">`
          : `<div style="font-size:24px;font-weight:900;color:#1a3a6b;margin-bottom:8px;">${settings.storeName || 'Mon Entreprise'}</div>`}
        <div style="font-size:12px;color:#555;line-height:1.7;">
          ${settings.storeAddress ? settings.storeAddress + '<br>' : ''}
          ${settings.storePhone ? 'Tél : ' + settings.storePhone + '<br>' : ''}
          ${settings.storeEmail ? settings.storeEmail + '<br>' : ''}
          ${settings.storeWebsite ? settings.storeWebsite + '<br>' : ''}
          ${settings.storeIce ? 'ICE : ' + settings.storeIce : ''}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:36px;font-weight:900;color:#1a3a6b;letter-spacing:-1px;">Facture</div>
        ${settings.storeLogo ? `<div style="font-size:13px;font-weight:700;color:#1a3a6b;margin-top:4px;">${settings.storeName || ''}</div>` : ''}
      </div>
    </div>

    <!-- VENDEUR + CLIENT -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:24px;">
      <div>
        <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Vendeur</div>
        <div style="font-weight:700;font-size:13px;">${settings.storeName || 'Mon Entreprise'}</div>
        <div style="font-size:12px;color:#555;line-height:1.7;margin-top:2px;">
          ${settings.storeAddress || ''}<br>
          ${settings.storePhone ? 'Tél : ' + settings.storePhone : ''}
        </div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Client</div>
        <div style="font-weight:700;font-size:13px;">${sale.clientName || 'Client de passage'}</div>
        <div style="font-size:12px;color:#555;line-height:1.7;margin-top:2px;">
          ${client && client.phone ? 'Tél : ' + client.phone + '<br>' : ''}
          ${clientAddr}
        </div>
      </div>
    </div>

    <!-- META LINE -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;background:#f0f0f0;border-radius:4px;padding:10px 14px;margin-bottom:24px;font-size:12px;">
      <div><div style="color:#888;font-size:10px;margin-bottom:2px;">Date de facturation</div><strong>${dateStr}</strong></div>
      <div><div style="color:#888;font-size:10px;margin-bottom:2px;">Numéro de facture</div><strong>${invoiceNum}</strong></div>
      <div><div style="color:#888;font-size:10px;margin-bottom:2px;">Échéance</div><strong>${dueDate}</strong></div>
      <div><div style="color:#888;font-size:10px;margin-bottom:2px;">Paiement</div><strong>${sale.payment}</strong></div>
      <div><div style="color:#888;font-size:10px;margin-bottom:2px;">Référence</div><strong>${sale.id.slice(-6).toUpperCase()}</strong></div>
    </div>

    ${settings.invoiceNotes ? `<div style="margin-bottom:18px;font-size:12px;"><strong>Informations additionnelles :</strong><br><span style="color:#555;">${settings.invoiceNotes}</span></div>` : ''}

    <!-- ITEMS TABLE -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:0;font-size:12px;">
      <thead>
        <tr style="background:#1a3a6b;color:#fff;">
          <th style="padding:10px 12px;text-align:left;font-weight:700;">Description</th>
          <th style="padding:10px 12px;text-align:center;font-weight:700;">Quantité</th>
          <th style="padding:10px 12px;text-align:center;font-weight:700;">Unité</th>
          <th style="padding:10px 12px;text-align:right;font-weight:700;">Prix unitaire HT</th>
          <th style="padding:10px 8px;text-align:center;font-weight:700;">% TVA</th>
          <th style="padding:10px 12px;text-align:right;font-weight:700;">Total HT</th>
          <th style="padding:10px 12px;text-align:right;font-weight:700;">Total TTC</th>
        </tr>
      </thead>
      <tbody>
        ${sale.items.map((item, idx) => {
          const p = products.find(x => x.id === item.id);
          const unit = p ? (p.unit || 'pcs') : 'pcs';
          const lineHT = item.price * item.qty;
          const lineTVA = sale.tva > 0 ? lineHT * sale.tva / 100 : 0;
          const lineTTC = lineHT + lineTVA;
          return `<tr style="background:${idx%2===0?'#fff':'#f7f9fc'};">
            <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;">${escapeHTML(item.name)}</td>
            <td style="padding:9px 12px;text-align:center;border-bottom:1px solid #e8e8e8;">${item.qty}</td>
            <td style="padding:9px 12px;text-align:center;border-bottom:1px solid #e8e8e8;">${unit}</td>
            <td style="padding:9px 12px;text-align:right;border-bottom:1px solid #e8e8e8;">${item.price.toFixed(2)} ${currency}</td>
            <td style="padding:9px 8px;text-align:center;border-bottom:1px solid #e8e8e8;">${sale.tva > 0 ? sale.tva + ' %' : '—'}</td>
            <td style="padding:9px 12px;text-align:right;border-bottom:1px solid #e8e8e8;">${lineHT.toFixed(2)} ${currency}</td>
            <td style="padding:9px 12px;text-align:right;border-bottom:1px solid #e8e8e8;font-weight:600;">${lineTTC.toFixed(2)} ${currency}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <!-- TOTALS -->
    <div style="display:flex;justify-content:flex-end;margin-top:0;">
      <div style="min-width:280px;">
        <div style="display:flex;justify-content:space-between;padding:9px 12px;background:#f7f9fc;border:1px solid #e8e8e8;border-top:none;font-size:13px;">
          <span style="color:#555;">Total HT</span>
          <strong>${ht.toFixed(2)} ${currency}</strong>
        </div>
        ${sale.tva > 0 ? `<div style="display:flex;justify-content:space-between;padding:9px 12px;background:#f7f9fc;border:1px solid #e8e8e8;border-top:none;font-size:13px;">
          <span style="color:#555;">Total TVA (${sale.tva}%)</span>
          <strong>${tvaAmt.toFixed(2)} ${currency}</strong>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;padding:11px 12px;background:#1a3a6b;color:#fff;font-size:15px;font-weight:900;">
          <span>Total TTC</span>
          <span style="color:#7ec8e3;">${ttc.toFixed(2)} ${currency}</span>
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="position:absolute;bottom:15mm;left:15mm;right:15mm;border-top:1px solid #ddd;padding-top:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;font-size:10.5px;color:#555;line-height:1.7;">
      <div>
        <strong style="color:#222;font-size:11px;">${settings.storeName || 'Mon Entreprise'}</strong><br>
        ${settings.storeAddress || ''}<br>
        ${settings.storeIce ? 'ICE : ' + settings.storeIce : ''}
      </div>
      <div>
        <strong style="color:#222;font-size:11px;">Coordonnées</strong><br>
        ${settings.storePhone ? 'Téléphone : ' + settings.storePhone + '<br>' : ''}
        ${settings.storeEmail ? settings.storeEmail + '<br>' : ''}
        ${settings.storeWebsite ? settings.storeWebsite : ''}
      </div>
      ${settings.bankName || settings.bankIban ? `<div>
        <strong style="color:#222;font-size:11px;">Détails bancaires</strong><br>
        ${settings.bankName ? 'Banque : ' + settings.bankName + '<br>' : ''}
        ${settings.bankIban ? 'RIB : ' + settings.bankIban : ''}
      </div>` : '<div></div>'}
    </div>
  </div>`;
}

function showReceipt(sale, docType) {
  currentSale = sale;
  currentDocType = docType || 'facture';
  settings.invoiceCounter = (settings.invoiceCounter || 1);
  renderDocPreview();
  openModal('modal-receipt');
  if (currentDocType === 'facture') {
    settings.invoiceCounter++;
    saveSettings();
  }
}

function renderDocPreview() {
  const html = currentDocType === 'facture'
    ? buildInvoiceHTML(currentSale)
    : buildReceiptHTML(currentSale);
  document.getElementById('receipt-content').innerHTML = html;
  document.getElementById('receipt-print').innerHTML = html;
  // Update modal title
  const title = document.getElementById('receipt-modal-title');
  if (title) title.textContent = currentDocType === 'facture' ? '📄 Facture' : '🧾 Reçu de caisse';
  // Update tabs
  const tabF = document.getElementById('tab-facture');
  const tabR = document.getElementById('tab-recu');
  if (tabF && tabR) {
    if (currentDocType === 'facture') {
      tabF.style.background = 'var(--accent)'; tabF.style.color = '#0a0f1e';
      tabR.style.background = 'transparent'; tabR.style.color = 'var(--text2)';
    } else {
      tabR.style.background = 'var(--accent)'; tabR.style.color = '#0a0f1e';
      tabF.style.background = 'transparent'; tabF.style.color = 'var(--text2)';
    }
  }
}

function switchDocType(type) {
  currentDocType = type;
  renderDocPreview();
}

function printInvoice() {
  const printEl = document.getElementById('receipt-print');
  printEl.style.display = 'block';
  window.print();
  printEl.style.display = 'none';
}

function buildReceiptHTML(sale) {
  const now = new Date(sale.date);
  const dateStr = now.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
  const timeStr = now.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});
  const receiptNo = (settings.invoicePrefix||'FAC') + '-' + String(settings.invoiceCounter||1).padStart(4,'0');
  const ht = sale.totalHT || sale.total;
  const tvaAmt = sale.tvaAmount || 0;
  const ttc = sale.total;

  return `<div class="receipt-wrap" style="max-width:320px;margin:0 auto;">
    <div class="receipt-header">
      ${settings.storeLogo
        ? `<img src="${settings.storeLogo}" style="max-height:50px;max-width:140px;object-fit:contain;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;">`
        : ''}
      <div class="receipt-store">${settings.storeName || 'GestionPro'}</div>
      ${settings.storeAddress ? `<div class="receipt-subtitle">${settings.storeAddress}</div>` : ''}
      ${settings.storePhone ? `<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;">${settings.storePhone}</div>` : ''}
      <div class="receipt-badge">✓ Reçu de caisse</div>
    </div>
    <div class="receipt-tear"></div>
    <div class="receipt-body">
      <div class="receipt-meta">
        <div class="receipt-meta-item">
          <div class="receipt-meta-label">📅 Date</div>
          <div class="receipt-meta-value">${dateStr}</div>
        </div>
        <div class="receipt-meta-item">
          <div class="receipt-meta-label">🕐 Heure</div>
          <div class="receipt-meta-value">${timeStr}</div>
        </div>
        <div class="receipt-meta-item">
          <div class="receipt-meta-label">👤 Client</div>
          <div class="receipt-meta-value">${sale.clientName || 'Client de passage'}</div>
        </div>
        <div class="receipt-meta-item">
          <div class="receipt-meta-label">${sale.payment === 'Espèces' ? '💵' : sale.payment === 'Carte' ? '💳' : '📋'} Paiement</div>
          <div class="receipt-meta-value">${sale.payment}</div>
        </div>
        <div class="receipt-meta-item" style="grid-column:1/-1;">
          <div class="receipt-meta-label">🔖 N° Reçu</div>
          <div class="receipt-meta-value" style="font-family:var(--font-mono),monospace;font-size:12px;">${receiptNo}</div>
        </div>
      </div>
      <div class="receipt-items-header">
        <span>Article</span>
        <span style="text-align:center;">Qté</span>
        <span style="text-align:right;">Montant</span>
      </div>
      ${sale.items.map(i => `
        <div class="receipt-item">
          <div class="receipt-item-name">
            ${i.name}
            <span>${i.price.toFixed(2)} MAD × ${i.qty}</span>
          </div>
          <div class="receipt-item-qty">×${i.qty}</div>
          <div class="receipt-item-price">${(i.price*i.qty).toFixed(2)} MAD</div>
        </div>
      `).join('')}
    </div>
    <div class="receipt-totals">
      <div class="receipt-total-row">
        <span>Sous-total HT</span>
        <span style="font-family:var(--font-mono),monospace;">${ht.toFixed(2)} MAD</span>
      </div>
      ${sale.tva > 0 ? `<div class="receipt-total-row">
        <span>TVA (${sale.tva}%)</span>
        <span style="font-family:var(--font-mono),monospace;">${tvaAmt.toFixed(2)} MAD</span>
      </div>` : ''}
      <div class="receipt-total-row grand">
        <span>TOTAL${sale.tva > 0 ? ' TTC' : ''}</span>
        <span>${ttc.toFixed(2)} MAD</span>
      </div>
    </div>
    <div class="receipt-footer">
      <div class="receipt-footer-thanks">Merci pour votre confiance ! 🙏</div>
      ${settings.invoiceNotes ? `<div style="margin-top:4px;font-size:10px;">${settings.invoiceNotes}</div>` : ''}
      <div class="receipt-barcode">| || ||| || | || ||| || ||| | || |||</div>
    </div>
  </div>`;
}

// Keep backward compat