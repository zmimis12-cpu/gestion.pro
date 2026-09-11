// ── GOOGLE SHEETS SYNC ─────────────────────────────────────────
const _SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbxKq7d-mzeksy1DAx5bqgWek-NGsOqJLiYfEvLD7dROAn2JkwdXS0XdllcSuctmkvs/exec';

window._sheetsCallback = function(data) {
  console.log('[Sheets] ✅ Response:', data);
};

window.sendToGoogleSheets = async function(sale) {
  try {
    for (const item of (sale.items || [])) {
      const prod = (typeof products !== 'undefined') ? products.find(p => p.id === (item.productId || item.id)) : null;
      const params = new URLSearchParams({
        date:         new Date(sale.date).toLocaleDateString('fr-FR'),
        client_name:  sale.clientName || 'Client de passage',
        photo_url:    prod?.photo || '',
        product_name: item.name || prod?.name || '',
        product_code: item.code || prod?.code || '',
        price:        item.price || item.sellPrice || 0,
        quantity:     item.qty || 1,
        montant:      (item.price || 0) * (item.qty || 1),
        payment_mode: sale.payment || '',
        statut:       'Vendu',
        callback:     '_sheetsCallback',
      });
      const script = document.createElement('script');
      script.src = _SHEETS_WEBHOOK + '?' + params.toString();
      document.head.appendChild(script);
      setTimeout(() => script.remove(), 5000);
      await new Promise(r => setTimeout(r, 300));
    }
    console.log('[Sheets] ✅ Vente envoyée:', sale.id);
  } catch(err) {
    console.warn('[Sheets] ❌ Erreur:', err.message);
  }
};
