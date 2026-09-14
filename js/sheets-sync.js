// ── GOOGLE SHEETS SYNC ─────────────────────────────────────────
const _SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwGXAQqMEoQGibN-bkERHDRmB20q0x-DgdKv33j5noEmSjSXjccWyc27n3xwH9_BGP5/exec';

// Le Sheet veut un lien cliquable "https://drive.google.com/open?id=XXX",
// pas le format thumbnail utilisé dans l'app — on convertit ici.
function _sheetsPhotoLink(url) {
  if (!url) return '';
  const m = url.match(/[?&]id=([^&]+)/);
  if (m) return 'https://drive.google.com/open?id=' + m[1];
  return url;
}

window.sendToGoogleSheets = async function(sale) {
  // ── Verrou anti-doublon : une vente (par id) n'est envoyée qu'une seule
  // fois, même si cette fonction est appelée plusieurs fois pour la même
  // vente (double-clic, onglet dupliqué, re-render, etc.) ──
  window._sheetsSentSaleIds = window._sheetsSentSaleIds || new Set();
  if (sale.id && window._sheetsSentSaleIds.has(sale.id)) {
    console.warn('[Sheets] ⛔ Vente déjà envoyée, ignorée:', sale.id);
    return;
  }
  if (sale.id) window._sheetsSentSaleIds.add(sale.id);

  const items = sale.items || [];
  const zoneName = (typeof GP_LOCAUX_ALL !== 'undefined')
    ? (GP_LOCAUX_ALL.find(l => l.id === sale.local_id)?.nom || '')
    : '';
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
        payment_mode: sale.payment === 'Virement' ? (sale.bankAccount || 'Virement') : (sale.payment || ''),
        zone:         zoneName,
      });

      // Réessaie jusqu'à 3 fois si l'envoi échoue (on a vu des 404
      // ponctuels dans les logs) — pour ne jamais rater une vente.
      let sent = false;
      for (let attempt = 1; attempt <= 3 && !sent; attempt++) {
        try {
          await fetch(_SHEETS_WEBHOOK + '?' + params.toString(), {
            method: 'GET',
            mode: 'no-cors',
          });
          sent = true;
        } catch(attemptErr) {
          console.warn(`[Sheets] Tentative ${attempt}/3 échouée pour ligne ${i+1}:`, attemptErr.message);
          if (attempt < 3) await new Promise(r => setTimeout(r, 400));
        }
      }
      if (!sent) throw new Error('Échec après 3 tentatives');

      console.log(`[Sheets] ✅ Ligne ${i+1}/${items.length} envoyée:`, item.name || prod?.name);
    } catch(err) {
      // Une ligne en échec ne doit pas bloquer les suivantes
      console.warn(`[Sheets] ❌ Erreur ligne ${i+1}/${items.length} (${item.name}):`, err.message);
    }
    // Petite pause entre chaque requête — Apps Script traite une requête à
    // la fois, envoyer trop vite peut créer un vrai risque de collision
    await new Promise(r => setTimeout(r, 150));
  }
  console.log('[Sheets] Envoi terminé.');
};
