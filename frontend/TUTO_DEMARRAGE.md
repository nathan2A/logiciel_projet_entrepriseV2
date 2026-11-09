# Lancer le frontend – Agenda SMR Carhaix

**Prérequis :** Git, VS Code et le dépôt `logiciel_projet_entreprise` déjà présents sur l'ordinateur.

**Où taper les commandes :** dans VS Code, ouvrir le dossier `logiciel_projet_entreprise`, puis **Terminal > Nouveau terminal**.

**Windows et macOS :** les commandes sont identiques, sauf mention contraire.

---

## 1. Installation (une seule fois)

### 1.1 Installer Node.js

1. Télécharger la version **LTS** sur https://nodejs.org/fr/download :
    - Windows : fichier `.msi` ;
    - macOS : fichier `.pkg`.
2. Lancer l'installateur et conserver les options par défaut.
3. Quitter puis rouvrir VS Code (sous macOS : **Cmd + Q**).
4. Vérifier l'installation :

```
node -v
```

Résultat attendu : `v18.18` ou une version supérieure.

### 1.2 Récupérer et installer le frontend

```
git checkout main
git pull
cd frontend
npm install
```

Créer ensuite le fichier de configuration :

| Windows | macOS |
| --- | --- |
| `copy .env.example .env` | `cp .env.example .env` |

Résultat attendu : le dossier `frontend` contient `node_modules/` et `.env`.

---

## 2. Lancement (à chaque utilisation)

```
cd frontend
npm run dev
```

Ouvrir ensuite l'adresse affichée, `http://localhost:5173` (Windows : **Ctrl + clic** ; macOS : **Cmd + clic**), puis se connecter avec l'un des comptes de démonstration. Tout mot de passe est accepté.

| Identifiant | Profil |
| --- | --- |
| `DUPONT Daniel` | Patient |
| `QUINET Marc` | Soignant (kinésithérapeute) |
| `MADEC Claire` | Soignant (aide-soignante) |

- Laisser le terminal ouvert pendant l'utilisation du site.
- Pour arrêter : **Ctrl + C** dans le terminal (y compris sous macOS).

---

## 3. Mise à jour (au besoin)

| Situation | Commande |
| --- | --- |
| Récupérer la dernière version du projet | `git pull` |
| Après un `git pull` modifiant `package.json`, ou erreur « Cannot find module » | `npm install` (dans `frontend`) |
| Après une modification du fichier `.env` | **Ctrl + C**, puis `npm run dev` |

---

## 4. Dépannage

| Problème | Solution |
| --- | --- |
| `node` ou `npm` introuvable | Installer Node.js, puis quitter et rouvrir VS Code. |
| Windows : « l'exécution de scripts est désactivée » | Exécuter une fois `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, répondre `O`. |
| macOS : erreur `EACCES` pendant `npm install` | Ne pas utiliser `sudo` ; vérifier que le terminal est dans le dossier `frontend` du projet. |
| Dossier `frontend` absent après `git pull` | Le frontend n'est pas encore dans `main` : exécuter `git checkout frontend-v1`, puis `git pull`. |
| Le port affiché n'est pas 5173 | Un autre serveur est déjà lancé : utiliser l'adresse affichée ou fermer l'autre terminal. |
| Message « Cette version est prévue pour ordinateur » | Élargir la fenêtre du navigateur (1280 px minimum). |
| Page blanche à l'ouverture de `index.html` | Ne pas ouvrir ce fichier directement : utiliser `npm run dev`. |

En cas d'erreur persistante, transmettre au groupe le message complet affiché dans le terminal.

---

Documentation complète (connexion au backend, organisation du code, Git) : `README.md` et le *Guide frontend – Agenda SMR Carhaix*.
