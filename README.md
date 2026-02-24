# GestionPro

Application de gestion commerciale multi-locaux avec Supabase.

## Stack
- HTML/CSS/JS (single-file app)
- Supabase (base de données + auth)
- Vercel (hébergement)

## Déploiement

### 1. GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TON_USER/gestionpro.git
git push -u origin main
```

### 2. Vercel
1. Aller sur [vercel.com](https://vercel.com)
2. "New Project" → importer le repo GitHub
3. Laisser les paramètres par défaut → Deploy
4. ✅ L'app est en ligne

## Connexion par défaut
- Email : `admin@gestionpro.ma`
- Password : `admin123`

> ⚠️ Changer le mot de passe après le premier login dans le panneau Super Admin.

## Supabase
- URL : configurée dans le fichier `index.html`
- Tables : voir `schema.sql` (optionnel)
