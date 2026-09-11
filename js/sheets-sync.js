// ── GOOGLE SHEETS SYNC ─────────────────────────────────────────
const _SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbyQD_PDeRhG6DgmWqePBXw3WXnJCXaL52_aov4PcLN2Z22RsMktHnyDlrT7MAcdApCE/exec';

window.sendToGoogleSheets = async function(sale) {
  try {
    for (const item of (sale.items || [])) {
      const prod = (typeof products !== 'undefined') 
        ? products.find(p => p.id === (item.productId || item.id)) 
        : null;
      
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
      });

      await fetch(_SHEETS_WEBHOOK + '?' + params.toString(), {
        method: 'GET',
        mode: 'no-cors',
      });

      console.log('[Sheets] ✅ Ligne envoyée:', item.name || prod?.name);
      await new Promise(r => setTimeout(r, 200));
    }
  } catch(err) {
    console.warn('[Sheets] ❌ Erreur:', err.message);
  }
};
