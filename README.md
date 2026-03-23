# GestionPro

Plateforme de gestion commerce marocaine — caisse, stock, clients, RH, logistique.

## Structure du projet

```
GestionPro/
├── index.html              # Application principale (HTML)
├── css/
│   └── main.css            # Design system complet (variables, layout, composants)
└── js/
    ├── app.js              # Point d'entrée (DOMContentLoaded, init)
    ├── config.js           # Constantes : Supabase URL/ANON, version, couleurs
    ├── i18n.js             # Traductions FR/AR, t(), setLang()
    ├── utils.js            # Utilitaires : debounce, uid, fmt, toast, modal, pagination
    ├── core/
    │   ├── auth.js         # Auth Supabase, session, RBAC, permissions, loadUserData
    │   ├── api.js          # Helpers Supabase : sbSync, sbDelete, sbUpsert
    │   ├── state.js        # État global : save(), getLocalId(), onSALocalSwitch()
    │   ├── router.js       # navigate(), topbarAction(), updateDate()
    │   ├── dom_helpers.js  # Helpers DOM : populateLocalSelect, openTransfertModal
    │   └── realtime.js     # Supabase Realtime : setupRealtime(), _pollSync()
    └── modules/
        ├── stock.js        # Gestion stock : saveProduct, renderStockTable, transfert
        ├── caisse.js       # Caisse & ventes : panier, checkout, facture, reçu
        ├── clients.js      # Clients : renderClients, saveClient, crédit
        ├── dashboard.js    # Tableau de bord : renderDashboard, alertes
        ├── depenses.js     # Dépenses + rapports financiers + WhatsApp
        ├── conteneurs.js   # Conteneurs + ordres d'importation
        ├── commandes.js    # Commandes ventes + fonds de caisse
        ├── locaux.js       # Locaux/zones + fonds de caisse
        ├── employes.js     # RH : employés, congés, BL, docs RH, contrats
        ├── settings.js     # Paramètres, logo, catégories, export/import
        ├── owner_admin.js  # Admin owner (gestion tenants GestionPro)
        └── superadmin.js   # Super Admin : utilisateurs, rôles, permissions
```

## Déploiement

### Vercel (recommandé)
1. Push sur GitHub
2. Connecter le dépôt sur vercel.com
3. Deploy — aucune configuration nécessaire (static site)

### Fichiers statiques
Copier tous les fichiers sur n'importe quel hébergeur statique.

## Configuration Supabase

Les clés Supabase sont dans `js/config.js` :
```js
const SUPABASE_URL  = 'https://xxxxxx.supabase.co'
const SUPABASE_ANON = 'eyJ...'
```

⚠️ Pour la production, utiliser des variables d'environnement via Vercel.

## Ordre de chargement des scripts

L'ordre dans `index.html` est critique :
1. `config.js` — doit être PREMIER (définit `sb`, constantes)
2. `i18n.js`, `utils.js` — utilitaires de base
3. `core/state.js`, `core/api.js`, `core/auth.js` — noyau
4. `core/router.js`, `core/dom_helpers.js`, `core/realtime.js`
5. `modules/*.js` — modules métier (ordre libre entre eux)
6. `app.js` — doit être DERNIER (initialisation)

## Sécurité (avant production)

- [ ] Activer RLS sur toutes les tables Supabase
- [ ] Configurer les policies tenant_id
- [ ] Activer email confirmation Supabase Auth
- [ ] Configurer redirectTo pour reset password
- [ ] Vérifier que l'Edge Function `create-tenant-user` supporte `action: 'updatePassword'`

## Version

v3.5.0 — Architecture modulaire restructurée
