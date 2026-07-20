# VPS Watch

Dashboard privé et léger pour suivre un VPS : CPU, RAM, espace disque disponible et disponibilité HTTP de services personnalisables.

## Architecture

- `collector/` : binaire Go sans dépendance externe. Il lit les métriques Linux, exécute les health checks enregistrés et écrit dans PocketBase toutes les 15 secondes.
- `frontend/` : application React/Vite servie par Nginx. Elle exige une connexion puis interroge les 120 dernières mesures toutes les 15 secondes.
- `pocketbase/` : image PocketBase épinglée, stockage SQLite persistant et création du superutilisateur au démarrage.
- `docker-compose.yml` : réseau privé, health checks, volume persistant et montages hôte en lecture seule.

Le collecteur crée et migre automatiquement les collections `dashboard_users`, `system_metrics` et `health_checks`. Les métriques et les adresses des services ne sont jamais retournées à un visiteur non authentifié. Le superutilisateur PocketBase reste réservé aux échanges serveur-à-serveur et n'est jamais envoyé au navigateur.

## Démarrage local sur Linux

```bash
cp .env.example .env
# Modifier impérativement les quatre identifiants présents dans le fichier
docker compose up -d --build
```

Le dashboard est disponible sur `http://localhost:3000`. PocketBase est lié uniquement à la boucle locale sur `http://127.0.0.1:8090/_/`.

Connectez-vous au dashboard avec `DASHBOARD_ADMIN_EMAIL` et `DASHBOARD_ADMIN_PASSWORD`. Le compte est créé automatiquement au démarrage du collecteur. Une modification de ces variables puis un redémarrage du collecteur met à jour les identifiants du compte.

```bash
docker compose ps
docker compose logs -f collector
```

> Les métriques hôte utilisent `/proc` et `/` montés en lecture seule. Le stack complet doit donc tourner sur Linux. Le frontend et les tests Go peuvent être développés sur Windows ou macOS.

## Configuration

| Variable | Valeur par défaut | Rôle |
| --- | --- | --- |
| `COLLECT_INTERVAL` | `15s` | Intervalle entre deux mesures |
| `HEALTH_TIMEOUT` | `3s` | Timeout de chaque contrôle HTTP |
| `METRICS_RETENTION` | `168h` | Conservation des mesures (7 jours) |
| `VPS_NAME` | `vps-01` | Nom affiché dans le dashboard |
| `FRONTEND_PORT` | `3000` | Port public du dashboard |
| `HOST_ROOT_PATH` | `/` | Système de fichiers dont l'espace est mesuré |
| `POCKETBASE_VERSION` | `0.38.2` | Version du binaire PocketBase |

Les variables suivantes n'ont volontairement aucune valeur par défaut et doivent être définies :

| Variable | Rôle |
| --- | --- |
| `PB_SUPERUSER_EMAIL` | Compte technique utilisé uniquement par le collecteur |
| `PB_SUPERUSER_PASSWORD` | Mot de passe long et unique du compte technique |
| `DASHBOARD_ADMIN_EMAIL` | Identifiant affiché sur l'écran de connexion |
| `DASHBOARD_ADMIN_PASSWORD` | Mot de passe du dashboard, 10 caractères minimum |

À 15 secondes, la collection reçoit 5 760 lignes par jour. Le nettoyage s'exécute chaque heure et supprime progressivement les données dépassant la rétention.

## Health checks personnalisés

Depuis **Services surveillés**, utilisez **Ajouter** pour enregistrer un endpoint HTTP ou HTTPS, par exemple `https://mon-frontend.example.com/health`. Chaque check peut ensuite être renommé, modifié, mis en pause ou supprimé.

La configuration et le dernier résultat sont stockés dans PocketBase, donc conservés dans le volume `pocketbase_data` entre les connexions et les redéploiements. Un nouvel endpoint apparaît d'abord « En attente », puis reçoit son premier statut au prochain cycle du collecteur (15 secondes par défaut).

## Déploiement Coolify sur un VPS OVH

1. Créer une ressource **Docker Compose** pointant vers ce dépôt.
2. Ajouter les variables de `.env.example` dans Coolify, avec deux paires d'identifiants longues, uniques et différentes pour PocketBase et le dashboard.
3. Conserver le volume nommé `pocketbase_data` entre les déploiements et l'inclure dans les sauvegardes.
4. Exposer le port `80` du service `frontend` via le domaine souhaité. Le port PocketBase `8090` reste lié à `127.0.0.1`.
5. Vérifier que Coolify autorise les deux bind mounts en lecture seule (`/proc` et `/`). Ils sont nécessaires pour observer l'hôte plutôt que les limites du conteneur.

Pour ouvrir l'administration PocketBase sans l'exposer publiquement :

```bash
ssh -L 8090:127.0.0.1:8090 utilisateur@votre-vps
```

Puis ouvrir `http://127.0.0.1:8090/_/` localement.

## Développement

```bash
cd frontend
npm ci
npm run dev
```

En développement, Vite proxifie `/api` vers PocketBase sur `http://127.0.0.1:8090`. Il suffit donc de laisser le service PocketBase du Compose actif.

```bash
cd collector
go test ./...
```

## Sécurité et exploitation

- Ne jamais committer le fichier `.env`.
- Le montage de `/` est en lecture seule, mais donne au collecteur une visibilité sur l'arborescence hôte. L'image `collector` est minimale, tourne avec un utilisateur non privilégié et n'expose aucun port.
- Les règles PocketBase protègent la lecture des métriques et la gestion des health checks ; afficher uniquement un formulaire de connexion côté React ne serait pas une protection suffisante.
- Les jetons du dashboard sont conservés dans le stockage local du navigateur. Servez toujours le dashboard derrière HTTPS en production.
- Les URLs de checks sont exécutées par le collecteur. Réservez le compte dashboard aux administrateurs de confiance, car ils peuvent cibler des services accessibles depuis le réseau Docker.
- Sauvegarder régulièrement le volume PocketBase. SQLite convient largement à ce volume d'écriture, mais le volume est la seule source persistante.
