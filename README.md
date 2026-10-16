# GreenKeeping · Green Housekeeping pour The Hotel Brussels

Le client renonce au nettoyage quotidien d'un geste, depuis le **bouton de sa chambre** ; une
boisson lui est offerte au bar. L'équipe d'étage suit chaque chambre en temps réel sur
**GreenKeeping** (tableau de bord, chambres, historique, rapports, paramètres) et peut forcer
l'état d'une chambre à distance. Un changement fait en chambre apparaît sur le tableau de bord
en 13 à 21 ms (mesuré en réseau local).

- Backend : FastAPI + SQLite (SQLModel) + WebSocket natif, un seul processus.
- Frontend : React + TypeScript + Vite + Tailwind CSS, compilé puis servi par FastAPI.
- Police Plus Jakarta Sans embarquée : aucune dépendance Internet à l'exécution.

---

## Installation

Prérequis : **Python 3.11+** et **Node.js 20+** (22 LTS conseillé).

```bash
python run.py          # Windows : py run.py
```

Au premier lancement, la commande installe les dépendances, compile le frontend, puis
**demande de créer le compte administrateur** (nom, e-mail, mot de passe saisi masqué) avant de
démarrer le serveur sur `0.0.0.0:8000`. Les lancements suivants démarrent directement.

| Écran | Adresse | Accès |
|---|---|---|
| Connexion de l'équipe | `/connexion` | public |
| Tableau de bord | `/dashboard` | équipe connectée |
| Chambres (grille, liste, détail) | `/dashboard/chambres` | équipe connectée |
| Historique, Rapports | `/dashboard/historique`, `/dashboard/rapports` | équipe connectée |
| Paramètres | `/dashboard/parametres` | équipe connectée (modification : administrateurs) |
| Bouton d'une chambre | `/chambre/<numéro>` | public : l'écran installé en chambre n'a pas de compte |

Commandes utiles :

| Commande | Effet |
|---|---|
| `python run.py --create-admin` | ajoute un compte administrateur |
| `python run.py --port 8001` | autre port |
| `python run.py --dev` | développement (Vite, rechargement à chaud) |

### Mise en service

1. **Équipe** : l'administrateur invite chaque membre dans Paramètres › Équipe et rôles. Un mot
   de passe provisoire s'affiche une fois ; le membre le change depuis le menu de son profil.
2. **Chambres** : les 10 chambres pilotes (704, 707, 712, 1203, 1208, 1211, 1802, 1806, 1809,
   2104) sont créées libres au premier démarrage (`GH_ROOMS` pour en choisir d'autres).
   Paramètres › Chambres pilotes permet d'en ajouter ou d'en retirer.
3. **Écrans en chambre** : sur chaque tablette ou téléphone de chambre, scannez le QR code
   affiché dans Chambres › Détail › Écran en chambre.
4. **Séjours** : en attendant la connexion au logiciel de réception (PMS), la réception
   enregistre l'arrivée, la durée et le départ dans le détail de chaque chambre.

Les règles du programme (séjour minimum, allumage à l'arrivée, forçage, boisson offerte,
ratios d'impact, notifications) se règlent dans **Paramètres**.

---

## Mise en ligne sur Render

Le dépôt contient un `Dockerfile` (une seule image : frontend + API + WebSocket) et un
`render.yaml`. Sur <https://dashboard.render.com> : **New → Blueprint**, choisissez le dépôt.
Render demande alors `GH_ADMIN_NAME`, `GH_ADMIN_EMAIL` et `GH_ADMIN_PASSWORD` : ce sera le
premier compte administrateur, créé au premier démarrage. Chaque `git push` sur `main`
redéploie automatiquement.

- **Offre et disque** : `render.yaml` demande l'offre **Starter** (payante) avec un disque
  persistant de 1 Go monté sur `/data`. C'est indispensable en production : sans disque (offre
  gratuite), comptes, séjours et historique sont effacés à chaque redémarrage, et le service se
  met en veille après 15 minutes, ce qui couperait les écrans en chambre.
- **Une seule instance** : les connexions temps réel sont gérées en mémoire.
- Après la première connexion, vous pouvez retirer `GH_ADMIN_PASSWORD` des variables Render :
  le compte est enregistré en base.

### Réseau local

Le serveur écoute sur `0.0.0.0` : depuis un autre appareil du même réseau, utilisez l'adresse IP
du poste (affichée au démarrage), pas `localhost`. Au premier lancement sous Windows, autorisez
Python sur les « Réseaux privés ».

---

## Configuration (variables d'environnement)

| Variable | Défaut | Rôle |
|---|---|---|
| `GH_HOTEL_NAME` | `The Hotel Brussels` | nom affiché |
| `GH_TIMEZONE` | `Europe/Brussels` | dates de séjour et journées des rapports |
| `GH_CLEANING_HOUR` | `11` | heure locale à laquelle le planning de ménage est arrêté (calcul des nettoyages évités) |
| `GH_ROOMS` / `GH_SUITES` | 10 chambres pilotes / `2104` | chambres créées au premier démarrage |
| `GH_ADMIN_EMAIL`, `GH_ADMIN_PASSWORD`, `GH_ADMIN_NAME` | — | premier administrateur, si l'équipe est vide |
| `GH_DB_URL` | `sqlite:///backend/data/greenkeeping.db` | emplacement de la base SQLite |
| `GH_MODE` | `production` | `demo` charge un jeu de données de présentation (voir plus bas) |

---

## Ce que fait l'application

### Règles métier (appliquées par le serveur, `backend/app/logic.py`)

| # | Règle | Implémentation |
|---|---|---|
| 1 | Éligible si le séjour atteint le séjour minimum (2 nuits, réglable). Sinon le client ne peut pas basculer. | `guest_toggle` répond **409** avec un message clair. Changer le séjour minimum réévalue les séjours en cours. |
| 2 | Un séjour éligible créé démarre **allumé** (`updated_by="system"`). | `set_stay`, désactivable dans Paramètres. |
| 3 | La gouvernante force l'état d'une chambre à distance. | `staff_force`, désactivable dans Paramètres. Le nom du membre est enregistré. |
| 4 | Chaque changement écrit **une** ligne d'`Event` et diffuse l'état de la chambre. | Journal protégé par des triggers SQLite (ni modification, ni suppression). |
| 5 | Une boisson par séjour, au premier allumage **par le client**. | Contrainte `UNIQUE(stay_id)`. Le bar la marque « remise » depuis le détail de la chambre. |

### Sécurité

- Comptes de l'équipe : mots de passe hachés (scrypt), sessions par cookie `HttpOnly`,
  `SameSite=Lax`, `Secure` en HTTPS ; seule l'empreinte du jeton est stockée.
- Tentatives de connexion limitées (8 échecs par adresse IP sur 10 minutes).
- Aucun identifiant n'est affiché ni publié par l'application ; le premier administrateur est
  créé en ligne de commande ou par variables d'environnement.
- Routes de l'équipe protégées par session ; Paramètres et équipe réservés aux administrateurs.
- L'état diffusé aux écrans en chambre ne contient ni nom de l'équipe ni code de boisson.

### API

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/config`, `/api/rooms`, `/api/qr.svg` | public : configuration, état des chambres, QR codes |
| POST | `/api/rooms/{n}/toggle` | public : bouton en chambre (`{"to": "on"\|"off"}` facultatif, idempotent) |
| POST | `/api/auth/login`, `/api/auth/logout`, `/api/auth/password` · GET `/api/auth/me` | session |
| GET | `/api/rooms/{n}` | détail, journal (20 derniers événements), boissons |
| PUT | `/api/rooms/{n}/state` | forçage gouvernante |
| PUT / DELETE | `/api/rooms/{n}/stay` | arrivée ou durée du séjour / départ |
| POST / DELETE | `/api/rooms`, `/api/rooms/{n}` | ajouter / retirer une chambre pilote (admin) |
| PUT | `/api/vouchers/{id}` | boisson remise ou annulée |
| GET | `/api/events`, `/api/stats` | historique, indicateurs |
| GET | `/api/export/events.csv`, `rooms.csv`, `daily.csv` | exports CSV (séparateur `;`, compatible Excel) |
| GET / PUT | `/api/settings` | réglages du programme (modification : admin) |
| GET / POST / PATCH / DELETE | `/api/users` | équipe et rôles (admin) |
| WS | `/ws` | état complet à la connexion, puis `{type:"state", room}` à chaque changement |

### Robustesse temps réel

Mise à jour optimiste sans latence perçue, retour arrière si le serveur refuse, appuis rapides
fusionnés, reconnexion WebSocket avec backoff et heartbeat, état complet renvoyé à chaque
reconnexion, gestes hors ligne rejoués sans doublon, révision par chambre pour ignorer les
réponses périmées.

### Interface

Reprise de la maquette « Green Housekeeping · The Hotel Brussels » : connexion, tableau de bord,
chambres (grille, liste, détail), historique, rapports, paramètres et bouton en chambre, en
thème clair, sombre ou système. Chaque état combine couleur, pastille et libellé : vert « Sans
nettoyage », bleu « Nettoyage normal », gris « Non éligible ». « Exporter en PDF » utilise
l'impression du navigateur avec une mise en page dédiée.

---

## Jeu de données de présentation (facultatif)

Pour une présentation commerciale ou des tests, `python run.py --demo` démarre avec 10 chambres
occupées et 32 jours d'historique fictifs, dans une **base séparée**
(`backend/data/greenkeeping-demo.db`) : la base de production n'est jamais touchée.
`python run.py --demo --reset` repart du jeu initial. Le compte de présentation est
`elodie.martens@thehotel.demo`, mot de passe `GH_DEMO_PASSWORD` (`greenkeeping` par défaut) ;
il n'est affiché nulle part dans l'interface.

---

## Tests

```bash
cd backend
.venv/Scripts/python -m pip install -r requirements-dev.txt   # macOS/Linux : .venv/bin/python
.venv/Scripts/python -m pytest
```

20 tests : règles 1 à 5, idempotence, journal immuable, WebSocket, connexion et droits,
équipe, réglages, statistiques, exports, chambres pilotes, mode production.

## Arborescence

```
run.py                     lanceur unique (installation, compte administrateur, serveur)
backend/app/
  config.py                variables d'environnement, fuseau de l'hôtel
  models.py                Room, Stay, ButtonState, Event, Voucher, User, AuthSession, Setting
  logic.py                 règles métier
  program.py               réglages du programme (écran Paramètres)
  auth.py / cli.py         mots de passe, sessions ; création d'administrateur
  stats.py                 nettoyages évités, adoption, impact
  seed.py                  démarrage en production, jeu de présentation
  ws.py / main.py          WebSocket et routes
frontend/src/
  lib/                     store temps réel, session, réglages, thème, formats
  components/              coque (barre latérale), kit d'interface, chambres, graphique
  pages/                   Connexion, Tableau de bord, Chambres, Historique, Rapports,
                           Paramètres, Bouton en chambre
```

## Points à valider

- **Forçage des chambres non éligibles** : désactivé dans l'interface (comme la maquette),
  toujours autorisé par l'API.
- **Boisson offerte** : émise seulement quand le **client** allume lui-même son bouton (règle 5) ;
  une chambre allumée automatiquement à l'arrivée affiche « en attente du client ».
- **Pas encore branché** (et signalé comme tel dans l'interface) : envoi d'e-mails (invitations,
  récapitulatif quotidien), transmission automatique au bar, langues néerlandaise et anglaise,
  Bilan Green Key mensuel en PDF, connexion au PMS.
- **Écrans en chambre** : l'adresse `/chambre/<numéro>` est publique ; pour un déploiement à
  grande échelle, prévoir un jeton d'appairage par appareil.
