# Green Housekeeping · SunyGreen

Un téléphone fait office de **bouton de chambre**, un laptop affiche le **dashboard gouvernante**.
Chaque appui se voit en temps réel sur l'autre écran (mesuré : 13 à 18 ms en local).

- Backend : FastAPI + SQLite (SQLModel) + WebSocket natif, un seul processus.
- Frontend : React + TypeScript + Vite + Tailwind CSS, compilé puis servi par FastAPI.
- Aucune dépendance Internet à l'exécution : les polices sont embarquées.
- Deux modes, le même code : **démo** (données fictives, outils de démonstration) et
  **production** (aucune donnée fictive, aucun outil de démo). Voir [Modes](#modes-démo-et-production).

---

## Démarrer

Prérequis : **Python 3.11+** et **Node.js 20+** (22 LTS conseillé).

```bash
python run.py          # Windows : py run.py
```

C'est la seule commande. Au premier lancement, elle crée `backend/.venv`, installe les
dépendances Python et npm, compile le frontend, puis démarre le serveur sur `0.0.0.0:8000`.
Les lancements suivants démarrent en quelques secondes.

Le terminal affiche alors les deux adresses et un **QR code à scanner avec le téléphone** :

| Écran | Adresse |
|---|---|
| Dashboard (laptop) | `http://localhost:8000/dashboard` |
| Bouton (téléphone) | `http://<IP-du-laptop>:8000/chambre/313` |
| Simulateur client, toutes les chambres (démo) | `http://<IP-du-laptop>:8000/chambres` |

Chambres disponibles : 312 à 316 (3ᵉ étage) et 420 à 424 (4ᵉ étage). `/` redirige vers `/dashboard`.

**Tester plusieurs chambres.** Chaque chambre a sa propre adresse (`/chambre/312`, `/chambre/420`…),
qu'on peut ouvrir sur autant de téléphones ou d'onglets que l'on veut. Pour piloter toutes les
chambres depuis un seul téléphone, ouvrez le **simulateur client** `/chambres` : une pastille par
chambre, qui envoie exactement la même requête que l'écran bouton. Dans la barre de démo, le
bouton « QR téléphone » affiche son QR code. Chaque panneau de chambre affiche aussi le QR code
de son écran bouton.

Pour trouver l'IP du laptop sans le QR code : `ipconfig` (Windows, ligne « Adresse IPv4 »)
ou `ipconfig getifaddr en0` (macOS).

Options : `python run.py --reset` (repart du jeu de données initial), `--port 8001`,
`--dev` (Vite sur le port 5173 avec rechargement à chaud et proxy vers l'API).

<details>
<summary>Démarrage manuel, sans <code>run.py</code></summary>

```bash
cd frontend && npm ci && npm run build && cd ..
cd backend && pip install -r requirements.txt && uvicorn app.main:app --host 0.0.0.0 --port 8000
```
</details>

### Réseau : à vérifier avant la réunion

1. **Le laptop et le téléphone doivent être sur le même réseau.**
2. **Pare-feu Windows** : au premier lancement, Windows demande d'autoriser Python. Cochez
   « Réseaux privés » et acceptez. Si la fenêtre a été fermée, lancez ceci en administrateur :
   `netsh advfirewall firewall add rule name="Green Housekeeping" dir=in action=allow protocol=TCP localport=8000`.
3. **Plan B si le Wi-Fi de l'hôtel pose problème** (portail captif, isolation des clients) :
   activez le partage de connexion du téléphone et connectez-y le laptop. Relancez
   `python run.py` pour afficher la nouvelle IP et le nouveau QR code. Aucune connexion
   Internet n'est nécessaire : les deux appareils ont seulement besoin de se voir.
4. Sur le téléphone : luminosité au maximum et mise en veille automatique désactivée.
   Vous pouvez aussi « Ajouter à l'écran d'accueil » pour un affichage plein écran.
5. Avant d'entrer en salle, cliquez sur **Réinitialiser la démo** (barre violette en bas du dashboard).

---

## Mise en ligne sur Render

Le dépôt contient un `Dockerfile` (frontend compilé et servi par FastAPI, dans une seule image)
et un `render.yaml` qui décrit le service.

1. **Publier le code sur GitHub.** Créez un dépôt **privé** vide sur <https://github.com/new>,
   puis, depuis ce dossier :
   ```bash
   git remote add origin https://github.com/<votre-compte>/green-housekeeping.git
   git push -u origin main
   ```
2. **Créer le service sur Render.** Dans <https://dashboard.render.com>, cliquez sur
   **New → Blueprint**, autorisez l'accès à GitHub, choisissez le dépôt, puis validez.
   Render lit `render.yaml` et crée le service web « green-housekeeping » (offre gratuite, Docker).
   Pour personnaliser le nom de l'hôtel, modifiez `GH_HOTEL_NAME` dans l'onglet **Environment**.
3. **Attendre la première compilation** (3 à 5 minutes). Render affiche ensuite l'adresse
   publique, du type `https://green-housekeeping-xxxx.onrender.com`.
4. **Envoyer au client** :
   - le dashboard : `https://…onrender.com/dashboard` ;
   - le simulateur pour son téléphone : `https://…onrender.com/chambres`, ou le bouton
     « QR téléphone » de la barre de démo.

Chaque `git push` sur `main` redéploie automatiquement.

**Limites de l'offre gratuite de Render :**
- **Mise en veille.** Le service s'endort après 15 minutes sans visite. La visite suivante
  attend environ une minute : les écrans affichent « Connexion… », puis se reconnectent seuls.
  Ouvrez le lien une minute avant la réunion.
- **Pas de disque persistant.** Chaque réveil ou redéploiement repart du jeu de données de
  démo. C'est sans conséquence en mode démo. Pour conserver les données (mode production),
  passez sur une offre payante et ajoutez un disque monté sur `/data`.
- **Une seule instance.** Les connexions temps réel sont gérées en mémoire : ne passez pas à
  plusieurs instances.

---

## Modes démo et production

Le mode se choisit par variable d'environnement. C'est le même projet dans les deux cas.

| | `GH_MODE=demo` (défaut) | `GH_MODE=production` |
|---|---|---|
| Données au démarrage | 10 chambres avec séjours et historique fictifs | chambres de `GH_ROOMS`, toutes libres |
| Barre de démo violette, simulateur `/chambres` | oui | non (le simulateur redirige vers le dashboard) |
| `POST /api/demo/reset` | oui | refusé (403) |
| Régénération des données de plus de 18 h | oui | jamais |
| Mention « Simulation web » sur l'écran bouton | oui | remplacée par le nom de l'hôtel |

Variables disponibles :

| Variable | Défaut | Rôle |
|---|---|---|
| `GH_MODE` | `demo` | `demo` ou `production` |
| `GH_HOTEL_NAME` | `Hôtel Pilote` | nom affiché dans le bandeau et sur l'écran bouton |
| `GH_ROOMS` | `312-316,420-424` | chambres gérées en production (l'étage est déduit du numéro) |
| `GH_SUITES` | `316,424` | chambres affichées comme suites |
| `GH_MINUTES_PER_CLEANING` | `25` | durée estimée d'une recouche, pour l'indicateur « Impact du jour » |
| `GH_DB_URL` | `sqlite:///backend/data/…` | emplacement de la base SQLite |

Exemple : `GH_MODE=production GH_HOTEL_NAME="Grand Hôtel du Lac" python run.py`
(PowerShell : `$env:GH_MODE="production"; py run.py`).

**Séjours.** Il n'y a pas encore d'intégration au logiciel de réception (PMS). En attendant,
les séjours se saisissent dans le panneau de chaque chambre, dans les deux modes :
« Enregistrer l'arrivée » (avec le nombre de nuits), modification de la durée, et
« Enregistrer le départ », qui libère la chambre et verrouille son bouton. Chaque nouveau
séjour donne droit à son propre voucher.

**Avant une mise en ligne publique** : l'application n'a pas d'authentification (hors périmètre
du prototype). Quiconque connaît l'adresse peut ouvrir le dashboard. Ne communiquez l'URL
qu'aux personnes concernées, ou ajoutez un code d'accès avant un vrai pilote.

---

## Scénario de démonstration (5 étapes)

Le laptop affiche `/dashboard`. Le téléphone affiche `/chambre/313`, éteint par le client ce matin.

1. **Le client renonce au ménage.** Il touche le bouton sur le téléphone : le bouton devient
   vert sans délai. Sur le dashboard, la tuile 313 pulse avec la mention « Reçu · client » et
   le compteur « À ne pas nettoyer » augmente de 1. Cliquez sur la tuile 313 : le voucher
   5 € est **émis**, avec son code, et l'historique montre la ligne horodatée « Client ».
2. **La gouvernante reprend la main.** Sur le dashboard, basculez l'interrupteur de la tuile 313.
   Le téléphone affiche « Modifié par la gouvernante » et pulse. Le client rallume son bouton :
   le panneau montre toujours **un seul** voucher, car il n'y en a qu'un par séjour.
3. **La règle des 2 nuits est appliquée par le serveur.** Ouvrez `/chambre/314` sur le
   téléphone (séjour d'1 nuit) : le bouton est verrouillé. Si on le touche, c'est le serveur qui
   refuse (HTTP 409) et le téléphone affiche son message. Le client ne peut pas contourner la règle.
4. **Le séjour change en direct.** Sur le dashboard, ouvrez la chambre 314. Dans « Séjour »,
   passez à 2 nuits puis cliquez sur « Enregistrer ». Le bouton du téléphone s'allume tout seul
   (« Séjour mis à jour ») et la tuile 314 passe à « Pas de nettoyage » avec la mention
   « Séjour modifié ».
5. **La connexion tombe.** Passez le téléphone en mode avion : il affiche « Hors ligne ».
   Touchez le bouton : le choix est conservé et le téléphone indique « Votre choix sera
   transmis dès le retour de la connexion ». Coupez le mode avion : le téléphone se reconnecte
   en une à deux secondes et le dashboard reçoit le changement. Terminez avec
   **Réinitialiser la démo**.

---

## Ce que fait le prototype

### Règles métier (toutes appliquées par le serveur, dans `backend/app/logic.py`)

| # | Règle | Implémentation |
|---|---|---|
| 1 | `eligible = nights >= 2`. Une chambre non éligible est éteinte et refuse toute bascule du client. | `guest_toggle` répond **409** avec un message clair. Une chambre libre (sans séjour) répond aussi 409. |
| 2 | Un séjour éligible créé démarre **allumé** (`updated_by="system"`). | `set_stay` à la création du séjour. Si un séjour d'1 nuit passe à 2 nuits ou plus, le bouton s'allume aussi. |
| 3 | La gouvernante force n'importe quel état, même sur une chambre non éligible. | `staff_force` ne vérifie pas l'éligibilité. Les boutons « Allumer / Éteindre » du panneau restent actifs pour toutes les chambres. |
| 4 | Chaque changement écrit **une** ligne d'`Event` et diffuse l'état complet de la chambre. | `_write_change` et `_mutate`. Le journal est protégé par des triggers SQLite qui refusent `UPDATE` et `DELETE`. |
| 5 | Un voucher est émis au premier passage à « on » par le client, **une seule fois par séjour**. | Contrainte `UNIQUE(stay_id)` en base, en plus du contrôle applicatif. |

### API

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/rooms` | état complet des 10 chambres |
| GET | `/api/rooms/{number}` | une chambre, ses 20 derniers événements et ses vouchers |
| POST | `/api/rooms/{number}/toggle` | bascule client (règle 1). Corps optionnel `{"to": "on"\|"off"}` : rend l'appel idempotent pour les renvois après une coupure. |
| PUT | `/api/rooms/{number}/state` | forçage gouvernante `{"state": "on"\|"off"}` |
| PUT | `/api/rooms/{number}/stay` | `{"nights": 1..30}` : enregistre une arrivée si la chambre est libre, sinon modifie la durée |
| DELETE | `/api/rooms/{number}/stay` | départ : libère la chambre, bouton éteint et verrouillé |
| POST | `/api/demo/reset` | revient au jeu de données initial et diffuse un snapshot (mode démo uniquement) |
| GET | `/api/config` | mode, nom de l'hôtel, paramètres d'affichage |
| GET | `/api/qr.svg?data=…` | QR code d'appairage d'un écran |
| WS | `/ws` | `{type:"snapshot", rooms:[…]}` à la connexion et après une réinitialisation, puis `{type:"state", room:{…}}` à chaque changement. Le client envoie `{type:"ping"}` et reçoit `{type:"pong"}`. |

### Robustesse

- **Optimisme sans latence perçue** : l'appui change l'écran immédiatement. L'indicateur
  « Synchronisation… » n'apparaît que si le serveur met plus de 250 ms à répondre.
- **Retour arrière** : si le serveur refuse (4xx/5xx), l'état revient à la vérité serveur, un
  message s'affiche et un snapshot complet est redemandé.
- **Appuis rapides** : une seule requête en vol par chambre. Les appuis suivants sont fusionnés
  et l'état final est toujours celui du dernier geste.
- **Reconnexion WebSocket** : backoff exponentiel avec gigue (250 ms à 5 s). Un heartbeat
  applicatif toutes les 4 s détecte une connexion morte en 10 s au plus. Au réveil du
  téléphone ou au retour du réseau, la connexion est vérifiée tout de suite.
- **Source de vérité unique** : chaque (re)connexion reçoit un snapshot complet. Les gestes
  faits hors ligne sont rejoués ensuite, sans risque de doublon grâce au paramètre `to`.
- Chaque message porte une **révision** (l'id du dernier événement) : une réponse plus ancienne
  que l'état déjà reçu est ignorée.
- Côté serveur, les écritures sont sérialisées par un verrou. Chaque client WebSocket a sa
  propre file d'envoi : un client lent ne ralentit jamais les autres.
- Si les données datent de plus de 18 h au démarrage (démo d'un autre jour), le jeu de
  données est régénéré pour que l'historique reste vivant.

### Interface

L'écran bouton reprend les maquettes à l'identique (A1–A3, A·S1–S3). Le dashboard en garde
les tokens `--sg-*` et les typographies (Newsreader, Geist, Geist Mono), avec une ambiance
hôtelière ajoutée :
- un bandeau sombre façon réception, avec le monogramme et le nom de l'hôtel ;
- des numéros de chambre en plaques de porte, et un plan de ménage organisé par étage ;
- le vocabulaire des étages : arrivée du jour, recouche (nuit 2 sur 4), départ ;
- un encart « Impact du jour » (temps de ménage libéré, vouchers émis).

Le laiton est purement décoratif : seul le vert signale un état. Sous 1280 px, le dashboard
passe en 3 colonnes avec un panneau en surimpression. Chaque état combine **couleur + icône +
libellé + forme** :

| État | Rendu |
|---|---|
| allumé | disque plein + coche |
| éteint | anneau vide |
| non éligible | contour pointillé + cadenas |
| libre | contour pointillé + porte |

Le mode clair ou sombre suit la préférence du système. Tous les textes sont en français.

---

## Tests

```bash
cd backend
.venv/Scripts/python -m pip install -r requirements-dev.txt   # macOS/Linux : .venv/bin/python
.venv/Scripts/python -m pytest
```

Les tests couvrent les cinq règles, l'idempotence, l'immutabilité du journal, la diffusion
WebSocket, le départ et la nouvelle arrivée, ainsi que le mode production.

## Arborescence

```
run.py                  lanceur unique
backend/app/
  config.py             mode démo / production, nom de l'hôtel, chambres
  models.py             Room, Stay, ButtonState, Event, Voucher
  logic.py              règles métier
  seed.py               jeu de données initial (10 chambres, historique sur 24 h)
  ws.py                 gestionnaire de connexions WebSocket en mémoire
  main.py               routes API, /ws, service du frontend compilé
frontend/src/
  lib/store.ts          synchronisation : optimisme, intentions, reconnexion
  pages/RoomButton.tsx  écran bouton (/chambre/:number)
  pages/Dashboard.tsx   vue gouvernante (/dashboard)
  pages/Simulator.tsx   simulateur client multi-chambres (/chambres, démo)
  components/           bandeau hôtel, tuile, panneau, barre de démo, icônes
```

## Décisions à valider

- **Forçage des chambres non éligibles.** Les maquettes posaient l'hypothèse « forçage
  indisponible pour un séjour d'1 nuit ». La règle 3 du cahier des charges dit l'inverse et
  c'est elle qui est appliquée. Sur ces chambres, la tuile garde le cadenas (le client ne peut
  rien faire) et le panneau propose quand même « Allumer / Éteindre » avec une explication.
- **Voucher et allumage automatique.** Selon la règle 5, un voucher n'est émis que lorsque le
  **client** passe lui-même à « on ». Un client qui garde le bouton allumé depuis son arrivée
  (règle 2) n'a donc pas de voucher en base. Pourtant, l'écran client annonce « un voucher vous
  attend ». Il faut trancher l'une ou l'autre version. Le dashboard, lui, affiche l'état réel
  (« Impact du jour » et panneau de chambre).
- **Extensions du modèle.** `Event.eligible` permet d'afficher « Non éligible » dans
  l'historique. `Stay.closed_at` marque le départ ; la colonne est ajoutée automatiquement aux
  bases existantes. Le paramètre optionnel `to` du toggle rend les renvois idempotents.
- **Chambre libre (424).** Elle n'apparaît pas dans les maquettes. Elle a reçu un état
  dédié (porte, « Chambre libre »).
- **« Impact du jour ».** Le temps libéré est une estimation : nombre de recouches évitées
  × `GH_MINUTES_PER_CLEANING`. La valeur réelle est à confirmer avec l'hôtel.
