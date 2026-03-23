/* ================================================================
   GestionPro — i18n.js
   Traductions FR/AR, fonction t(), setLang(), applyLang()
================================================================ */

function t(key) {
  return (TRANSLATIONS[currentLang]||TRANSLATIONS.fr)[key] ?? TRANSLATIONS.fr[key] ?? key;
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('gp_lang', lang);
  applyLang();
}

// ─── STATE ───
let products  = [];
let clients   = [];
let sales     = [];
let cart = [];
let selectedPayment = 'Espèces';
let currentClientId = null;
let editingProductId = null;
let viewingClientId = null;
let newProductPhoto = null;
let editProductPhoto = null;

// ─── PERFORMANCE UTILS ───
const PAGE_SIZE = 50;

// Pagination state per table
const _pages = {};
function getPage(key) { return _pages[key] || 1; }
function setPage(key, p) { _pages[key] = p; }

function buildPagination(key, total, renderFn, containerId) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const cur = getPage(key);
  const container = document.getElementById(containerId);
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  // Use global function call with resetPage=false to avoid resetting page on navigate
  const goBtnStyle = (active) => `padding:6px 13px;border-radius:6px;border:2px solid ${active?'var(--accent)':'var(--border)'};background:${active?'var(--accent)':'var(--surface2)'};color:${active?'#0a0f1e':'var(--text)'};cursor:pointer;font-family:var(--font),sans-serif;font-weight:${active?'800':'400'};font-size:13px;`;

  let btns = `<button onclick="_pages['${key}']=${Math.max(1,cur-1)};window['${renderFn}'](false)"
    style="${goBtnStyle(false)}padding:6px 14px;" ${cur===1?'disabled':''}>${currentLang==='ar'?'التالي ›':'‹ Préc'}</button>`;

  const pageNums = new Set([1, totalPages, cur, cur-1, cur+1].filter(p => p>=1 && p<=totalPages));
  let prev = 0;
  [...pageNums].sort((a,b)=>a-b).forEach(p => {
    if (prev && p - prev > 1) btns += `<span style="padding:5px 4px;color:var(--text2);">…</span>`;
    btns += `<button onclick="_pages['${key}']=${p};window['${renderFn}'](false)" style="${goBtnStyle(p===cur)}">${p}</button>`;
    prev = p;
  });

  btns += `<button onclick="_pages['${key}']=${Math.min(totalPages,cur+1)};window['${renderFn}'](false)"
    style="${goBtnStyle(false)}padding:6px 14px;" ${cur===totalPages?'disabled':''}>${currentLang==='ar'?'‹ السابق':'Suiv ›'}</button>`;

  container.innerHTML = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:14px 0;border-top:1px solid var(--border);margin-top:8px;">
    <span style="font-size:12px;color:var(--text2);">${total} résultats &nbsp;|&nbsp; Page <strong style="color:var(--text);">${cur}</strong> / ${totalPages}</span>
    <div style="display:flex;gap:6px;flex-wrap:wrap;">${btns}</div>
  </div>`;
}

// Debounce pour les recherches
function debounce(fn, delay=220) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

let selectedCategory = 'Tous';
let currentDocType = 'facture';
let currentSale = null;
let caisseOps  = [];
let depenses   = [];
let locaux = []; // Alias vers GP_LOCAUX_ALL — synchronisé au chargement
let conteneurs = [];
let ordres     = [];
let settings   = {tva:20,showTva:false,storeName:'GestionPro',storeAddress:'',storePhone:'',storeEmail:'',storeWebsite:'',invoicePrefix:'FAC',storeIce:'',storeLogo:null,bankName:'',bankIban:'',bankSwift:'',invoiceNotes:'',invoicePaymentTerms:'30 jours',invoiceCounter:1};

