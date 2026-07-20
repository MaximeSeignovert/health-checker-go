# VPS Watch

Dashboard minimaliste et léger pour suivre un VPS : CPU, RAM, espace disque disponible et disponibilité HTTP du frontend et de PocketBase.

## Architecture

- `collector/` : binaire Go sans dépendance externe. Il lit les métriques Linux, contrôle les services et écrit dans PocketBase toutes les 15 secondes.
- `frontend/` : application React/Vite servie par Nginx. Elle interroge les 120 dernières mesures toutes les 15 secondes.
- `pocketbase/` : image PocketBase épinglée, stockage SQLite persistant et création du superutilisateur au démarrage.
- `docker-compose.yml` : réseau privé, health checks, volume persistant et montages hôte en lecture seule.

Le collecteur crée automatiquement la collection `system_metrics` au premier démarrage. La lecture est publique pour permettre au dashboard de fonctionner sans compte ; les écritures restent réservées au superutilisateur.

## Démarrage local sur Linux

```bash
cp .env.example .env
# Modifier impérativement PB_SUPERUSER_EMAIL et PB_SUPERUSER_PASSWORD
docker compose up -d --build
```

Le dashboard est disponible sur `http://localhost:3000`. PocketBase est lié uniquement à la boucle locale sur `http://127.0.0.1:8090/_/`.

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

À 15 secondes, la collection reçoit 5 760 lignes par jour. Le nettoyage s'exécute chaque heure et supprime progressivement les données dépassant la rétention.

## Déploiement Coolify sur un VPS OVH

1. Créer une ressource **Docker Compose** pointant vers ce dépôt.
2. Ajouter les variables de `.env.example` dans Coolify, avec un email et un mot de passe PocketBase longs et uniques.
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
- Les données de monitoring sont lisibles publiquement via l'API du dashboard. Pour un dashboard privé, activer la protection par mot de passe du domaine dans Coolify ou placer un proxy d'authentification devant le frontend.
- Sauvegarder régulièrement le volume PocketBase. SQLite convient largement à ce volume d'écriture, mais le volume est la seule source persistante.
