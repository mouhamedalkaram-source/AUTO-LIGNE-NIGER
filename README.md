# Auto Ligne Niger

Projet complet du site Auto Ligne Niger, pret a etre lance localement puis publie en ligne.

## Contenu

- `index.html` : structure du site
- `styles.css` : design et responsive
- `assets/app.client.js` : logique client
- `server.py` : serveur HTTP + API Python
- `server.js` : serveur local Node.js
- `server-core.js` : logique serveur partagee
- `api/index.js` : fonction Vercel pour `/api/*`
- `data.json` : donnees des comptes et annonces
- `assets/` : logo et images statiques
- `uploads/` : images envoyees par les utilisateurs
- `package.json` : scripts de lancement

## Lancement local

### Option 1

```bash
python3 server.py
```

### Option 2

```bash
npm start
```

Le site sera disponible sur :

`http://127.0.0.1:5174`

## Comptes

- Administrateur :
  - Email : `alkaram.ichirif@gmail.com`
  - Mot de passe : utilisez le mot de passe administrateur actuel

## Fonctions principales

- consultation publique des annonces
- inscription et connexion
- publication de voitures avec plusieurs photos
- espace vendeur
- panneau administrateur
- validation obligatoire des annonces vendeur
- moderation des utilisateurs
- changement du mot de passe administrateur

## Mise en ligne

Pour une mise en ligne serieuse et durable, il est conseille de remplacer plus tard `data.json` par une vraie base de donnees et d'ajouter HTTPS, sauvegardes et hebergement stable.
