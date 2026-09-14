// ── GOOGLE SHEETS SYNC ─────────────────────────────────────────
const _SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbyQD_PDeRhG6DgmWqePBXw3WXnJCXaL52_aov4PcLN2Z22RsMktHnyDlrT7MAcdApCE/exec';

// Le Sheet veut un lien cliquable "https://drive.google.com/open?id=XXX",
// pas le format thumbnail utilisé dans l'app — on convertit ici.
function _sheetsPhotoLink(url) {
  if (!url) return '';
  const m = url.match(/[?&]id=([^&]+)/);
  if (m) return 'https://drive.google.com/open?id=' + m[1];
  return url;
}

window.sendToGoogleSheets = async function(sale) {
  const items = sale.items || [];
  console.log(`[Sheets] Envoi de ${items.length} ligne(s) pour cette vente...`);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const prod = (typeof products !== 'undefined')
        ? products.find(p => p.id === (item.productId || item.id))
        : null;

      const params = new URLSearchParams({
        date:         new Date(sale.date).toLocaleDateString('fr-FR'),
        client_name:  sale.clientName || 'Client de passage',
        photo_url:    _sheetsPhotoLink(prod?.photo),
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

      console.log(`[Sheets] ✅ Ligne ${i+1}/${items.length} envoyée:`, item.name || prod?.name);
    } catch(err) {
      // Une ligne en échec ne doit pas bloquer les suivantes
      console.warn(`[Sheets] ❌ Erreur ligne ${i+1}/${items.length} (${item.name}):`, err.message);
    }
    // Petite pause entre chaque requête pour ne pas saturer le webhook Apps Script
    await new Promise(r => setTimeout(r, 250));
  }
  console.log('[Sheets] Envoi terminé.');
};
