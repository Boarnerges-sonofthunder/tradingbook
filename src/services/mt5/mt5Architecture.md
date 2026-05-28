# Architecture MT5 — TradingBook

## Phase 6 — Étape 1 : Analyse et définition

> **Statut** : Document de référence — Phase 6 Étape 1
> **Dernière mise à jour** : 2026-05-18
> **Auteur** : Architecture TradingBook

---

## Table des matières

1. [Contexte et contraintes](#1-contexte-et-contraintes)
2. [Analyse des options](#2-analyse-des-options)
3. [Architecture recommandée](#3-architecture-recommandée)
4. [Flux de données complet](#4-flux-de-données-complet)
5. [Fichiers et dossiers à créer](#5-fichiers-et-dossiers-à-créer)
6. [Types de données MT5](#6-types-de-données-mt5)
7. [Règles de sécurité](#7-règles-de-sécurité)
8. [Gestion des erreurs](#8-gestion-des-erreurs)
9. [Gestion des doublons](#9-gestion-des-doublons)
10. [Logs de synchronisation](#10-logs-de-synchronisation)
11. [Limites connues](#11-limites-connues)
12. [Étapes d'implémentation](#12-étapes-dimplémentation)

---

## 1. Contexte et contraintes

### Stack technique

- **Desktop local** : Tauri v2 + React 19 + TypeScript 5.8 + SQLite
- **OS cible** : Windows uniquement (MetaTrader 5 est Windows-only)
- **Broker** : Fusion Markets (connexion via MT5 terminal)
- **SQLite** : base de données unique locale, source de vérité

### Contraintes impératives

| Règle                            | Détail                                            |
| -------------------------------- | ------------------------------------------------- |
| **Lecture seule MT5**            | TradingBook ne doit jamais envoyer d'ordres       |
| **Pas d'API broker directe**     | Pas de connexion aux serveurs Fusion Markets      |
| **Pas de cloud**                 | Tout reste en local                               |
| **Pas de mots de passe stockés** | Aucun credential broker dans SQLite ni en mémoire |
| **Pas de trading automatique**   | Aucun signal, aucun EA écrit par TradingBook      |

### Ce qui existe déjà dans le codebase

Le schéma SQLite (`002_schema.sql`) contient déjà :

- Table `trades` avec `platform = 'mt5'` et `external_id` (ticket MT5)
- Table `mt5_sync_logs` (statuts : pending / in_progress / success / failed)
- Type `TradePlatform = "mt5" | "csv" | "manual"` dans `src/types/trade.ts`
- Service de déduplication complet (`tradeDeduplicationService.ts`, Phase 5 Étape 9)
- Pipeline d'import CSV complet avec mapping Fusion Markets (Phase 5)
- Stub `src/services/mt5/index.ts` vide, prêt à implémenter

---

## 2. Analyse des options

### Option A — Script Python local (Bridge Python)

**Principe :** TradingBook exécute un script Python bundlé via `tauri-plugin-shell`.
Le script utilise la bibliothèque officielle `MetaTrader5` de MetaQuotes pour lire
l'historique des deals et les positions ouvertes directement depuis le terminal MT5.

```
TradingBook (Tauri)
  → Shell Command : python mt5_bridge.py --from 2024-01-01
    → mt5_bridge.py (Python)
      → MetaTrader5.history_deals_get(from, to)
      → MetaTrader5.positions_get()
      → stdout: JSON { deals: [...], positions: [...] }
  → mt5BridgeService.ts parse JSON
  → mt5MappingService.ts mappe vers Trade[]
  → tradeDeduplicationService.ts filtre les doublons
  → tradesRepository.ts sauvegarde dans SQLite
  → mt5SyncLogsRepository.ts enregistre le résultat
```

**Données disponibles via Python MT5 :**

- `ticket` — identifiant unique du deal (→ `external_id`)
- `order` — identifiant de l'ordre
- `position_id` — identifiant de la position
- `symbol` — instrument
- `type` — DEAL_TYPE_BUY / DEAL_TYPE_SELL / (entrée/sortie)
- `volume` — lots
- `price` — prix d'exécution
- `profit` — P&L brut
- `commission` — commission broker
- `swap` — swap overnight
- `time` — timestamp UNIX de la transaction
- `comment` — commentaire MT5

**Avantages :**

- Accès direct et complet à tous les champs MT5
- Automatisable (bouton "Sync" → lancement immédiat)
- Identifiants uniques de tickets → déduplication parfaite
- Peut récupérer les positions ouvertes en temps réel
- Bibliothèque officielle MetaQuotes, stable et documentée
- Aucun credential broker requis (utilise la session MT5 déjà connectée)

**Limites :**

- Python 3.8+ doit être installé sur la machine utilisateur
- La bibliothèque `MetaTrader5` doit être installée (`pip install MetaTrader5`)
- Le terminal MT5 doit être ouvert et connecté au compte
- `tauri-plugin-shell` doit être ajouté (pas encore dans `Cargo.toml`)
- Windows uniquement (la bibliothèque Python MT5 n'existe pas sur macOS/Linux)
- Délai de lancement du script Python (~1–2 secondes)

**Dépendances à ajouter :**

```toml
# Cargo.toml
tauri-plugin-shell = "2"
```

```json
// capabilities/default.json
"shell:allow-execute"
// + scope limité à python uniquement
```

---

### Option B — Export CSV/HTML depuis MT5 (Déjà fonctionnel)

**Principe :** L'utilisateur exporte manuellement l'historique depuis MT5
(clic droit sur l'onglet History → "Save as Report" → CSV ou HTML).
TradingBook importe ensuite ce fichier via le pipeline CSV existant (Phase 5).

```
MetaTrader 5 terminal
  → Onglet History → clic droit → Save as Report → CSV
    → Fichier CSV Fusion Markets local
      → ImportsPage.tsx (Phase 5)
        → CsvUploadSection → parser → détection Fusion Markets
        → CsvMappingSection → mapping automatique
        → CsvValidationSummary → validation
        → tradeDeduplicationService → déduplication
        → tradesRepository → sauvegarde SQLite
```

**Avantages :**

- **Déjà entièrement implémenté** (Phase 5 complet)
- Zéro dépendance supplémentaire
- Fonctionne toujours, même sans Python
- Format Fusion Markets CSV déjà détecté automatiquement (brokerCsvProfiles)
- Déduplication déjà intégrée (Phase 5 Étape 9)

**Limites :**

- Étape manuelle obligatoire (l'utilisateur doit exporter depuis MT5)
- Pas de synchronisation automatique
- Le format CSV MT5 peut varier selon la version ou les paramètres de date
- Pas d'accès aux positions ouvertes (seulement l'historique fermé)
- Pas de ticket ID MT5 natif dans tous les exports CSV Fusion Markets

---

### Option C — Fichier JSON surveillé (Bridge fichier)

**Principe :** Un composant externe (script Python, Expert Advisor MT5, ou outil tiers)
écrit un fichier JSON local. TradingBook surveille ce fichier et importe
les nouveaux trades quand le fichier est modifié.

```
Composant bridge (externe)
  → Écrit/met à jour : %APPDATA%\TradingBook\mt5_bridge.json
    → Tauri file watcher (plugin-fs watch_path)
      → mt5FileWatcherService.ts
        → mt5MappingService.ts
        → tradeDeduplicationService.ts
        → tradesRepository.ts
```

**Avantages :**

- Architecture découplée (TradingBook ne dépend pas de Python)
- Le bridge peut être n'importe quoi (Python, PowerShell, EA MT5)
- Potentiel de synchronisation "quasi temps réel"

**Limites :**

- Nécessite quand même un composant bridge (on revient à Option A)
- Complexité accrue : gestion des fichiers partiels, locks, JSON corrompu
- `tauri-plugin-fs` ne supporte pas encore `watch_path` de façon stable en v2
- Double maintenance : le bridge ET TradingBook
- Sécurité : fichier JSON modifiable par n'importe quel processus

---

## 3. Architecture recommandée

### Décision : **Hybride A + B**

**Option A (Python Bridge)** comme mode principal — automatisé, complet, un clic.
**Option B (CSV import)** comme mode fallback permanent — toujours disponible,
déjà implémenté, aucune dépendance.
**Option C** : rejetée pour l'instant — complexité injustifiée sans avantage clair.

### Justification du choix

| Critère                                      |     Option A     |   Option B   |     Option C     |
| -------------------------------------------- | :--------------: | :----------: | :--------------: |
| Données complètes (ticket, swap, commission) |        ✅        |  ⚠️ partiel  |        ✅        |
| Déduplication parfaite (ticket MT5)          |        ✅        | ⚠️ empreinte |        ✅        |
| Zéro dépendance externe                      | ❌ Python requis |      ✅      | ❌ bridge requis |
| Fonctionnel aujourd'hui                      | ❌ à implémenter |      ✅      |        ❌        |
| Automatisable (un clic)                      |        ✅        |  ❌ manuel   |        ⚠️        |
| Positions ouvertes en temps réel             |        ✅        |      ❌      |        ✅        |
| Sécurité (pas de credentials)                |        ✅        |      ✅      |        ⚠️        |
| Maintenabilité                               |    ✅ stable     |      ✅      | ⚠️ 2 composants  |

### Principe de l'architecture hybride

```
                    ┌─────────────────────────────────────────────┐
                    │               TRADINGBOOK                    │
                    │           (Tauri desktop app)                │
                    │                                              │
    ┌─────────┐     │  ┌─────────────┐     ┌──────────────────┐  │
    │  MT5    │────▶│  │ mt5Bridge   │────▶│  mt5SyncService  │  │
    │terminal │     │  │ Service.ts  │     │  (orchestrateur) │  │
    └─────────┘     │  └─────────────┘     └────────┬─────────┘  │
         │          │                               │             │
         │ Export   │  ┌─────────────┐     ┌────────▼─────────┐  │
         │ CSV      │  │ mt5Mapping  │◀────│  mt5Validation   │  │
         │          │  │ Service.ts  │     │  Service.ts      │  │
    ┌────▼────┐     │  └──────┬──────┘     └──────────────────┘  │
    │CSV file │────▶│         │                                    │
    │ (Phase5)│     │  ┌──────▼──────────────────┐               │
    └─────────┘     │  │ tradeDeduplication      │               │
                    │  │ Service.ts (Phase 5 ✅) │               │
                    │  └──────┬──────────────────┘               │
                    │         │                                    │
                    │  ┌──────▼──────────────────┐               │
                    │  │ tradesRepository.ts     │               │
                    │  │ mt5SyncLogsRepository   │               │
                    │  └──────┬──────────────────┘               │
                    │         │                                    │
                    │  ┌──────▼──────┐                           │
                    │  │   SQLite    │                           │
                    │  └─────────────┘                           │
                    └─────────────────────────────────────────────┘
```

---

## 4. Flux de données complet

### Mode A — Synchronisation automatique Python

```
1. Utilisateur ouvre MT5SyncPage et clique "Synchroniser"

2. mt5SyncService.runSync(options)
   ├─ 2a. Vérifie si Python est disponible (python --version)
   ├─ 2b. Vérifie si MetaTrader5 est installé (python -c "import MetaTrader5")
   └─ 2c. Si KO → affiche message "Python requis" + lien installation

3. mt5SyncLogsRepository.createLog({ status: 'in_progress' })
   → Crée une entrée dans mt5_sync_logs

4. mt5BridgeService.fetchDeals({ from: lastSyncDate, to: now })
   ├─ Exécute : python mt5_bridge.py --mode deals --from ISO --to ISO
   ├─ stdout  : JSON { deals: MT5Deal[], positions: MT5Position[], meta: {...} }
   └─ stderr  : messages d'erreur Python → loggés

5. mt5MappingService.mapDeals(rawDeals)
   ├─ Convertit MT5Deal → CsvValidatedRow-like structure
   └─ Mappe : ticket→externalId, type→side, time→openedAt, price→entryPrice...

6. mt5ValidationService.validateTrades(mapped)
   ├─ Vérifie champs obligatoires (symbol, side, openedAt, volume, entryPrice)
   └─ Retourne { valid: Trade[], invalid: InvalidRow[] }

7. tradeDeduplicationService.checkDuplicates(valid, { platform: 'mt5' })
   ├─ Réutilise exactement le service de Phase 5 Étape 9
   └─ Priorité : external_id (ticket MT5) = correspondance parfaite

8. tradesRepository.createMany(newTrades)
   ├─ INSERT uniquement les trades "new" (non-doublons)
   └─ platform = 'mt5', source = 'mt5'

9. mt5SyncLogsRepository.updateLog(logId, {
     status: 'success',
     total_trades: N,
     new_trades: X,
     skipped_trades: Y,
     synced_at: now
   })

10. React rafraîchit l'UI : nouveau bilan de sync affiché
```

### Mode B — Import CSV manuel (Phase 5, déjà fonctionnel)

```
1. Utilisateur exporte History depuis MT5 → CSV
2. Utilisateur ouvre ImportsPage (Phase 5)
3. Pipeline existant : upload → parse → détection Fusion Markets
   → mapping → validation → déduplication → SQLite
```

---

## 5. Fichiers et dossiers à créer

### Script Python (Tauri resource)

```
src-tauri/
  resources/
    mt5_bridge.py          ← Script Python bundlé avec l'app
```

### Types TypeScript

```
src/types/
  mt5.ts                   ← Interfaces MT5 brutes + mappées
```

### Services MT5

```
src/services/mt5/
  mt5Architecture.md       ← Ce document ✅
  mt5BridgeService.ts      ← Exécution du script Python via tauri-plugin-shell
  mt5MappingService.ts     ← MT5Deal/Position → Trade (même pattern que CSV)
  mt5ValidationService.ts  ← Validation des champs obligatoires MT5
  mt5SyncService.ts        ← Orchestrateur : vérifie Python → bridge → map → dedup → save
  index.ts                 ← Point d'entrée, re-exporte tout
```

### Repository

```
src/repositories/
  mt5SyncLogsRepository.ts ← CRUD sur mt5_sync_logs (table déjà créée en 002)
```

### Feature UI

```
src/features/mt5/
  components/
    MT5StatusBanner.tsx    ← État Python/MT5 (disponible / non disponible)
    MT5SyncPanel.tsx       ← Bouton sync + résultat + historique de syncs
    MT5SyncHistory.tsx     ← Liste des sync logs
  hooks/
    useMT5Sync.ts          ← Hook React pour déclencher et suivre une sync
```

### Configuration Tauri

```
src-tauri/
  Cargo.toml               ← Ajouter tauri-plugin-shell = "2"
  capabilities/
    default.json           ← Ajouter shell:allow-execute (scope python)
  src/
    lib.rs                 ← Enregistrer le plugin shell
```

---

## 6. Types de données MT5

### Types bruts du bridge Python

```typescript
// src/types/mt5.ts

/** Deal MT5 brut tel que retourné par MetaTrader5.history_deals_get() */
export interface MT5RawDeal {
  ticket: number; // Identifiant unique du deal → external_id
  order: number; // Identifiant de l'ordre
  position_id: number; // Identifiant de la position (groups entry + exit)
  time: number; // Timestamp UNIX (secondes)
  time_msc: number; // Timestamp millisecondes
  type: number; // DEAL_TYPE : 0=BUY, 1=SELL, 2=BALANCE...
  entry: number; // DEAL_ENTRY : 0=IN, 1=OUT, 2=INOUT
  symbol: string;
  volume: number; // en lots
  price: number; // prix d'exécution
  profit: number; // P&L du deal (sans commission/swap)
  commission: number;
  swap: number;
  comment: string;
  magic: number; // identifiant EA (0 si manuel)
}

/** Position ouverte MT5 brute (positions_get) */
export interface MT5RawPosition {
  ticket: number;
  symbol: string;
  type: number; // POSITION_TYPE : 0=BUY, 1=SELL
  volume: number;
  price_open: number;
  price_current: number;
  sl: number; // stop loss (0 si absent)
  tp: number; // take profit (0 si absent)
  profit: number; // profit flottant actuel
  commission: number;
  swap: number;
  time: number;
  comment: string;
  magic: number;
}

/** Résultat complet retourné par le script Python (stdout JSON) */
export interface MT5BridgeOutput {
  success: boolean;
  error?: string;
  meta: {
    account_login: number;
    account_name: string;
    account_currency: string;
    server: string;
    connected: boolean;
    fetched_at: string; // ISO 8601
    from: string; // plage demandée
    to: string;
  };
  deals: MT5RawDeal[];
  positions: MT5RawPosition[];
}

/** Erreur retournée par le bridge Python */
export interface MT5BridgeError {
  success: false;
  error: string;
  error_code?: number; // Code d'erreur MT5 si applicable
}

/** Statut de disponibilité de Python/MT5 */
export interface MT5Availability {
  pythonInstalled: boolean;
  mt5LibInstalled: boolean;
  mt5Running: boolean;
  mt5Connected: boolean;
  pythonVersion?: string;
  mt5Version?: string;
  errorMessage?: string;
}

/** Trade MT5 mappé, prêt pour la déduplication et l'insertion SQLite */
export interface MT5MappedTrade {
  externalId: string; // ticket MT5 converti en string
  symbol: string;
  side: "buy" | "sell";
  status: "open" | "closed";
  openedAt: string; // ISO 8601
  closedAt: string | null;
  entryPrice: number;
  exitPrice: number | null;
  volume: number;
  stopLoss: number | null;
  takeProfit: number | null;
  commission: number;
  swap: number;
  grossPnl: number | null;
  netPnl: number | null;
  platform: "mt5";
  source: "mt5";
  broker?: string;
  accountId?: string;
  currency: string;
}

/** Options de synchronisation MT5 */
export interface MT5SyncOptions {
  fromDate: string; // ISO 8601 — début de la plage
  toDate: string; // ISO 8601 — fin de la plage
  includeOpenPositions: boolean;
  broker?: string;
  accountId?: string;
}

/** Résultat d'une synchronisation MT5 */
export interface MT5SyncResult {
  success: boolean;
  logId: number; // ID dans mt5_sync_logs
  totalDeals: number;
  newTrades: number;
  skippedDuplicates: number;
  invalidRows: number;
  openPositionsFound: number;
  errorMessage?: string;
  syncedAt: string;
}
```

---

## 7. Règles de sécurité

### Le script Python est strictement en lecture seule

```python
# mt5_bridge.py — RÈGLES :
# ❌ JAMAIS : mt5.order_send()
# ❌ JAMAIS : mt5.order_check()
# ❌ JAMAIS : stocker login/password/server dans un fichier
# ❌ JAMAIS : connexion à un serveur externe
# ✅ UNIQUEMENT : mt5.history_deals_get(), mt5.positions_get(), mt5.account_info()
# ✅ MT5 doit être déjà connecté par l'utilisateur avant le lancement
```

### Aucun credential stocké

- Le script Python **ne prend aucun argument login/password**
- Il se connecte à la session MT5 **déjà active** sur la machine
  (`mt5.initialize()` sans paramètres se connecte au terminal ouvert)
- Si MT5 n'est pas connecté, le script retourne une erreur claire en JSON

### Permissions Tauri scopées

```json
// capabilities/default.json — scope strict
{
  "permission": "shell:allow-execute",
  "allow": [
    {
      "name": "python",
      "cmd": "python",
      "args": { "validator": "^mt5_bridge\\.py\\s.*$" }
    }
  ]
}
```

### Validation côté TypeScript (jamais faire confiance au script)

- `mt5ValidationService.ts` valide chaque champ après mapping
- Les nombres sont vérifiés (NaN, Infinity → rejetés)
- Les strings sont trimmées et limitées en longueur
- Les types `side` sont contraints à `"buy" | "sell"` seulement

---

## 8. Gestion des erreurs MT5

### Catégories d'erreurs

| Erreur              | Cause                                | Comportement TradingBook                           |
| ------------------- | ------------------------------------ | -------------------------------------------------- |
| `python_not_found`  | Python non installé                  | Affiche guide d'installation                       |
| `mt5_lib_missing`   | `MetaTrader5` non installé           | Affiche `pip install MetaTrader5`                  |
| `mt5_not_running`   | Terminal MT5 fermé                   | Affiche "Ouvrez MetaTrader 5"                      |
| `mt5_not_connected` | MT5 hors ligne / pas de compte       | Affiche "Connectez-vous à votre compte MT5"        |
| `no_deals_found`    | Plage vide ou compte sans historique | Info : "Aucun trade à importer"                    |
| `json_parse_error`  | Script Python a planté               | Log l'erreur complète, UI affiche erreur générique |
| `timeout`           | Script trop lent (>30s)              | Annule le processus, affiche timeout               |

### Stratégie fail-safe

Identique à la déduplication (Phase 5) :

- En cas d'erreur non récupérable → `status: 'failed'` dans `mt5_sync_logs`
- Aucun trade partiel n'est sauvegardé (transaction SQLite)
- L'erreur complète est loggée via `createLogger("mt5")`
- L'UI affiche un message actionnable (pas de stack trace à l'utilisateur)

---

## 9. Gestion des doublons

### Réutilisation de tradeDeduplicationService.ts (Phase 5 Étape 9)

Le service de déduplication existant est **directement réutilisable** pour MT5 :

```typescript
// Dans mt5SyncService.ts — aucune duplication de logique
import { checkDuplicates } from "../imports/tradeDeduplicationService";

const report = await checkDuplicates(mappedTrades, {
  platform: "mt5",
  broker: meta.account_name,
  accountId: String(meta.account_login),
});
```

### Avantage MT5 : déduplication parfaite par ticket

Le ticket MT5 est unique et permanent. Contrairement au CSV :

- `external_id = String(deal.ticket)` — identifiant fiable à 100%
- La correspondance par `external_id` dans `findTradesForDeduplication`
  détectera immédiatement tout doublon, même si les prix ont bougé (MTM)
- Pas besoin de l'algorithme de correspondance par empreinte

### Stratégie multi-syncs

```
1ère sync : from=2024-01-01 → 500 deals importés
2ème sync : from=2024-06-01 → 50 nouveaux deals
            Les 450 deals en commun → status: 'exact_duplicate' → ignorés
```

La date `from` est idéalement lue depuis `mt5_sync_logs` :

```typescript
// mt5SyncService.ts
const lastSync = await mt5SyncLogsRepository.getLastSuccessful();
const fromDate = lastSync?.synced_at ?? defaultStartDate;
```

---

## 10. Logs de synchronisation

### Table existante : `mt5_sync_logs` (migration 002)

```sql
CREATE TABLE IF NOT EXISTS mt5_sync_logs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    data_path      TEXT,               -- Ex : "MT5 Python Bridge v5.0.37"
    status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'in_progress', 'success', 'failed')),
    total_trades   INTEGER NOT NULL DEFAULT 0,
    new_trades     INTEGER NOT NULL DEFAULT 0,
    updated_trades INTEGER NOT NULL DEFAULT 0,
    skipped_trades INTEGER NOT NULL DEFAULT 0,
    error_message  TEXT,
    synced_at      TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Repository à créer : mt5SyncLogsRepository.ts

```typescript
// src/repositories/mt5SyncLogsRepository.ts — interface prévue

createSyncLog(data: Partial<Mt5SyncLog>): Promise<Mt5SyncLog>
updateSyncLog(id: number, data: Partial<Mt5SyncLog>): Promise<void>
getLastSuccessfulSync(): Promise<Mt5SyncLog | null>
getSyncLogs(limit?: number): Promise<Mt5SyncLog[]>
deleteSyncLog(id: number): Promise<void>
```

---

## 11. Limites connues

### Limites techniques

1. **Windows uniquement** : `MetaTrader5` Python n'existe que sur Windows.
   TradingBook est déjà Windows-only, donc pas de régression.

2. **MT5 doit être ouvert** : Le script Python a besoin que le terminal MT5
   soit lancé et connecté. Il ne peut pas ouvrir MT5 ni s'y connecter seul.

3. **Python requis** : L'utilisateur doit avoir Python 3.8+ ET la bibliothèque
   `MetaTrader5` installés. Une page d'aide avec les commandes d'installation
   sera fournie dans MT5SyncPage.

4. **Historique partiel** : MT5 limite l'historique disponible selon la configuration
   du serveur broker. Fusion Markets conserve généralement 3 mois par défaut ;
   l'utilisateur peut demander plus via le terminal MT5.

5. **Deals vs Trades** : MT5 travaille avec des "deals" (chaque exécution),
   pas des "trades" au sens TradingBook. Un trade fermé = au moins 2 deals
   (entrée + sortie). Le mapping doit reconstruire les trades depuis les deals.

6. **Positions ouvertes** : Les positions ouvertes n'ont pas de prix de sortie.
   Elles sont sauvegardées avec `status = 'open'` et mises à jour lors de
   la sync suivante.

### Limite du mode CSV (Option B fallback)

Le CSV MT5 / Fusion Markets ne contient pas toujours le ticket MT5 natif.
La déduplication utilise alors l'algorithme d'empreinte (Phase 5) qui est
efficace mais imparfait pour des trades très similaires.

---

## 12. Étapes d'implémentation

### Phase 6 — Plan des étapes futures

| Étape    | Titre                         | Contenu                                                                  |
| -------- | ----------------------------- | ------------------------------------------------------------------------ |
| **6.1**  | ✅ Architecture (ce document) | Analyse et définition                                                    |
| **6.2**  | Ajout tauri-plugin-shell      | `Cargo.toml` + `lib.rs` + `capabilities/default.json`                    |
| **6.3**  | Script Python `mt5_bridge.py` | Lecture MT5, output JSON, gestion erreurs                                |
| **6.4**  | Types `src/types/mt5.ts`      | Interfaces complètes (ce document, section 6)                            |
| **6.5**  | `mt5BridgeService.ts`         | Exécution Python via shell Tauri, parse JSON                             |
| **6.6**  | `mt5MappingService.ts`        | MT5Deal[] → MT5MappedTrade[] (deals → trades fermés)                     |
| **6.7**  | `mt5ValidationService.ts`     | Validation des champs obligatoires                                       |
| **6.8**  | `mt5SyncLogsRepository.ts`    | CRUD sur la table `mt5_sync_logs` existante                              |
| **6.9**  | `mt5SyncService.ts`           | Orchestrateur complet (check Python → bridge → map → dedup → save → log) |
| **6.10** | UI — `MT5SyncPage`            | Page complète avec vérification dépendances, bouton sync, historique     |

### Prochaine étape immédiate : Étape 6.2

Ajouter `tauri-plugin-shell` au projet :

```toml
# src-tauri/Cargo.toml
tauri-plugin-shell = "2"
```

```typescript
// npm
@tauri-apps/plugin-shell
```

```json
// capabilities/default.json — permission scopée
"shell:allow-execute"
```

```rust
// src-tauri/src/lib.rs
.plugin(tauri_plugin_shell::init())
```

---

## Résumé de la décision

|                             |                                                                   |
| --------------------------- | ----------------------------------------------------------------- |
| **Architecture principale** | Option A — Python Bridge (`mt5_bridge.py` + `tauri-plugin-shell`) |
| **Architecture fallback**   | Option B — CSV import (Phase 5, déjà implémenté)                  |
| **Option C**                | Rejetée (complexité sans bénéfice sur Windows-only)               |
| **Déduplication**           | Réutilise `tradeDeduplicationService.ts` (Phase 5)                |
| **Logs**                    | Table `mt5_sync_logs` déjà prête (migration 002)                  |
| **Sécurité**                | Lecture seule, aucun credential, scope shell strict               |
| **Maintien de TradingBook** | Toujours offline, local, aucune API broker directe                |
