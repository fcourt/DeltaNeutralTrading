# Delta Neutral Trading App

Application web de trading en stratégie **delta-neutre** permettant d'ouvrir simultanément deux positions opposées sur plusieurs plateformes de trading crypto et TradFi (Hyperliquid, Extended, Nado, trade.xyz / HIP-3).

---

## Table des matières

- [Présentation](#présentation)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Plateformes supportées](#plateformes-supportées)
- [Marchés supportés](#marchés-supportés)
- [Mode Chunked](#mode-chunked)
- [Installation](#installation)
- [Configuration](#configuration)
- [Déploiement](#déploiement)
- [Structure du projet](#structure-du-projet)
- [Notes techniques](#notes-techniques)

---

## Présentation

L'application permet d'exécuter des stratégies **delta-neutres** en ouvrant deux legs opposées (long/short) sur des marchés corrélés ou identiques, sur une ou deux plateformes différentes. L'objectif est de neutraliser l'exposition directionnelle tout en capturant le différentiel de funding rate entre les plateformes.

Quatre plateformes sont supportées : **Hyperliquid** (perps CEX), **Extended** (StarkNet L2), **Nado** (perps on-chain Ink/EVM), et **trade.xyz / HyENA** (HIP-3 DEX sur Hyperliquid).

---

## Fonctionnalités

- **Ouverture delta-neutre** — placement simultané de deux ordres opposés (Leg A / Leg B)
- **Multi-plateformes** — Hyperliquid, Extended, Nado et HIP-3 (trade.xyz / HyENA) dans la même interface
- **Mode Chunked** — découpage d'un trade en plusieurs slices pour réduire le slippage et le risque d'exécution partielle
- **Switch taker automatique** — si un ordre maker n'est pas rempli dans le délai imparti, il est annulé et resoumis en taker (IOC)
- **Compensation delta** — chaque slice recalcule la taille de Leg B en fonction du delta accumulé (filledA − filledB) pour maintenir la neutralité
- **TP/SL intégrés** — prise de profit et stop loss signés cryptographiquement (Extended via Poseidon StarkNet, Nado via EIP-712)
- **Suivi de positions** — affichage temps réel des positions ouvertes sur chaque plateforme
- **Statistiques** — PnL, volume, frais, tracking des trades par période avec séparation HL / HIP-3 / Nado / Extended
- **Gestion du levier** — configuration du levier par marché et par plateforme (HL/Extended uniquement ; Nado ne supporte pas le levier)
- **Internationalisation** — interface disponible en français et en anglais (i18next)
- **Thème clair / sombre** — toggle intégré

---

## Architecture

```
src/
├── platforms/
│   ├── index.js          # Registre PLATFORMS + CREDENTIAL_FIELDS + getPlatform()
│   ├── hyperliquid.js    # Adapter Hyperliquid & HIP-3 (signing ECDSA EIP-712)
│   ├── extended.js       # Adapter Extended (signing Poseidon StarkNet)
│   └── nado.js           # Adapter Nado (signing EIP-712 viem, gateway Ink)
├── hooks/
│   ├── useChunkedDNExecutor.js   # Hook principal du mode chunked
│   ├── useDeltaNeutralPairs.js   # Appariement long/short cross-platform
│   ├── useFundingRates.js        # Polling funding rates multi-plateformes
│   ├── useLivePrices.js          # Prix temps réel
│   ├── useMargins.js             # Marges disponibles
│   ├── useOpenPositions.js       # Positions ouvertes
│   └── usePositions.js           # Agrégation positions
├── pages/
│   ├── OpenTrade.jsx             # Interface d'ouverture de trade (mode normal + chunked)
│   ├── ManagePositions.jsx       # Gestion des positions ouvertes
│   ├── StatsPage.jsx             # Statistiques et historique
│   ├── Configuration.jsx         # Configuration marchés et paramètres
│   └── SettingKeys.jsx           # Saisie des credentials
├── config/
│   └── markets.js                # Mapping marchés, KEY_OVERRIDES, NADO_ONLY_MARKETS
├── services/
│   ├── accountService.js         # Gestion des comptes multi-adresses
│   ├── marketService.js          # Résolution dynamique des marchés par plateforme
│   ├── orderService.js           # Couche d'abstraction des ordres
│   ├── orderTracker.js           # Tracking des ordres en cours
│   └── priceService.js           # Agrégation des prix
└── utils/
    ├── deltaNeutral.js           # Calculs delta, compensation, sizing
    ├── format.js                 # Formatage des montants et prix
    ├── liquidationPrice.js       # Estimation prix de liquidation
    ├── tpsl.js                   # Helpers TP/SL Hyperliquid
    └── trading.js                # Helpers génériques trading
api/
├── extended.js     # Proxy Vercel → Extended REST API (CORS)
└── nado.js         # Proxy Vercel → Nado Gateway + Archive (CORS)
```

### Flux d'exécution standard

```
OpenTrade.jsx
  └── handlePlaceBothLegs()
        ├── placeOrder(legA)   ← adapter.placeOrder()
        └── placeOrder(legB)   ← adapter.placeOrder()
```

### Flux d'exécution chunked

```
OpenTrade.jsx
  └── useChunkedDNExecutor.start()
        └── [for each slice i of N]
              ├── getMarkPrice(legA) + getMarkPrice(legB)
              ├── getLimitPriceFn()  (bid/ask + offset)
              ├── placeOrderFn(legA) + placeOrderFn(legB)   ← en parallèle
              ├── pollUntilFilled(legA) + pollUntilFilled(legB)
              │     └── [si timeout] → cancelOrder() + switchToTaker() (IOC)
              ├── compensation delta → sizeB += (totalFilledA - totalFilledB)
              └── attendre delayBetweenMs avant slice suivante
```

---

## Plateformes supportées

### Hyperliquid

| Champ | Description |
|-------|-------------|
| Signing | ECDSA EIP-712 via `@nktkas/hyperliquid` ExchangeClient |
| Auth | `hlAgentPk` (clé privée agent) + `hlAddress` + `hlVaultAddress` (optionnel) |
| Order status | `POST /info` — type `orderStatus` (polling `oid`) |
| Cancel | `POST /exchange` — action `cancel` (asset index + oid) |
| `normalizeOrderId` | `result?.resolvedOid` (extrait de `statuses[0].resting.oid` ou `filled.oid`) |
| Levier | Configurable par marché via `POST /exchange` action `updateLeverage` |

### Extended (StarkNet L2)

| Champ | Description |
|-------|-------------|
| Signing | Poseidon hash + ECDSA StarkNet (`starknet.js`) |
| Auth | `extStarkPk` + `extL2Vault` + `extApiKey` (+ `extMainApiKey` pour certains endpoints) |
| Order status | `GET /user/orders/external/:externalId` — réponse `data` est un **tableau** |
| Cancel | `DELETE /user/order/:numericId` (l'ID numérique, pas l'externalId UUID) |
| `normalizeOrderId` | `{ externalId: UUID, numericId: string }` — deux identifiants distincts |
| TP/SL | Signés Poseidon, soumis comme ordres séparés avec `reduceOnly: true` |

### Nado (Ink / EVM)

| Champ | Description |
|-------|-------------|
| Signing | EIP-712 Typed Data via `viem` (`privateKeyToAccount` + `signTypedData`) |
| Auth | `nadoAddress` (adresse EVM) + `nadoAgentPk` (clé privée EVM) + `nadoSubaccount` (nom, défaut `"default"`) |
| Proxy | `/api/nado` (Gateway Ink) + `/api/nado?endpoint=archive` (Archive Nado) |
| Order status | Polling via `fetchStats` / matches — identifiant unique : `order.nonce` (BigInt) |
| `normalizeOrderId` | `result?.data?.order?.nonce` |
| `normalizeTradeId` | `trade?.order?.nonce?.toString()` |
| Levier | Non supporté (le composant LeverageSlider le détecte et reste silencieux) |
| Sub-accounts | Support natif via `nadoSubaccount` + `buildSubaccount(address, name)` |
| Sizing | Arrondi via `roundToTick()` sur base `price_increment_x18` et `size_increment` (BigInt x18) |
| Prix | `getPrices()` retourne `{ prices, bidPrices, askPrices }` — mid = (bid + ask) / 2 |
| Funding | `getFunding()` — polling via Archive `/v2/funding_rates` |
| Symboles | Cache en mémoire TTL 5 min (prix) / 5 h (symboles, clés) |

### HIP-3 / trade.xyz / HyENA

| Champ | Description |
|-------|-------------|
| Infrastructure | Marché DEX sur l'infrastructure Hyperliquid (HIP-3 = Hyperliquid Improvement Proposal 3) |
| Adapter | Identique à Hyperliquid — réutilise `hyperliquid.js` |
| Signing | Identique à Hyperliquid (ECDSA EIP-712) |
| Auth | Mêmes credentials que Hyperliquid (`hlAddress`, `hlAgentPk`) |
| Distinction HL / HIP-3 | Dans `aggregateFills()` : un fill est HIP-3 si `f.coin.includes('xyz')` |
| `statsKey` | `'hip3'` (séparé de `'hl'` dans les statistiques) |
| Symboles | Préfixés `xyz:` dans l'univers Hyperliquid (ex : `xyz:XYZ100`, `xyz:CL`) — gérés via `HL_KEY_OVERRIDES` |

---

## Marchés supportés


> Les clés par plateforme sont résolues dynamiquemet via appel API dans chaque adpater selon plateforme puis l'ensemble des marchés disponible est construit dans `src/services/marketService.js` 
> Certaines clés par plateforme sont résolues via `KEY_OVERRIDES` dans `src/config/markets.js` pour les marchés ne portant pas le même ticker


---

## Mode Chunked

Le mode chunked découpe un trade de taille totale `totalUsd` en `N = ceil(totalUsd / sliceUsd)` slices exécutées séquentiellement.

### Paramètres

| Paramètre | Description |
|-----------|-------------|
| `totalUsd` | Montant total du trade en USD |
| `sliceUsd` | Taille de chaque slice en USD |
| `delayBetweenMs` | Délai en ms entre chaque slice |
| `makerTimeoutMs` | Délai avant switch taker si l'ordre maker n'est pas rempli |
| `maxRetries` | Nombre maximum de tentatives taker par slice |
| `onErrorMode` | Comportement en cas d'erreur : `continue`, `pause` ou `abort` |

### Compensation delta

À chaque slice, la taille de Leg B est ajustée pour compenser le delta accumulé :

```
sizeB_slice = sizeA_slice + (totalFilledA - totalFilledB)
```

Cela garantit que les deux legs restent équilibrées sur la durée de l'exécution, même en cas de remplissage partiel.

### Cycle de vie d'une slice

```
PENDING → PLACING → WAITING_FILL → FILLED
                                 ↘ SWITCHING_TAKER → WAITING_FILL → FILLED
                                                                   ↘ FAILED
```

---

## Installation

```bash
# Cloner le dépôt
git clone https://github.com/fcourt/DeltaNeutralTrading.git
cd DeltaNeutralTrading

# Installer les dépendances
npm install

# Lancer en développement
npm run dev
```

### Dépendances principales

| Package | Usage |
|---------|-------|
| `react` + `vite` | Frontend |
| `@nktkas/hyperliquid` | Client Hyperliquid (signing + API) |
| `starknet` | Signing Extended (ec, hash, shortString) |
| `viem` | `privateKeyToAccount` pour Nado (EIP-712) |
| `react-router-dom` | Navigation SPA |
| `i18next` + `react-i18next` | Internationalisation FR/EN |
| `lucide-react` | Icônes |

---

## Configuration

Les credentials sont saisis dans l'interface (**Settings → Clés API**) et stockés localement dans le navigateur. Aucune clé n'est transmise au serveur — les proxies Vercel relaient uniquement les requêtes.

### Credentials par plateforme

| Plateforme | Champ | Description |
|------------|-------|-------------|
| Hyperliquid / HIP-3 | `hlAddress` | Adresse EVM principale |
| Hyperliquid / HIP-3 | `hlAgentPk` | Clé privée de l'agent HL |
| Hyperliquid / HIP-3 | `hlVaultAddress` | Adresse vault (optionnelle) |
| Extended | `extApiKey` | Clé API REST Extended |
| Extended | `extMainApiKey` | Clé API principale (certains endpoints) |
| Extended | `extStarkPk` | Clé privée StarkNet |
| Extended | `extL2Vault` | ID du vault L2 Extended |
| Nado | `nadoAddress` | Adresse EVM Nado |
| Nado | `nadoAgentPk` | Clé privée EVM Nado |
| Nado | `nadoSubaccount` | Nom du sous-compte (défaut : `"default"`) |

---

## Déploiement

L'application est déployée sur **Vercel** avec des fonctions serverless comme proxies pour les APIs externes (contournement CORS).

```bash
# Build local
npm run build

# Preview local
npm run preview
```

Les proxies `api/extended.js` et `api/nado.js` sont automatiquement déployés comme Vercel Functions. La configuration des routes est dans `vercel.json`.

---

## Structure du projet

```
/
├── src/
│   ├── platforms/        # Adapters par plateforme
│   ├── hooks/            # Hooks React
│   ├── pages/            # Pages principales
│   ├── components/       # Composants UI réutilisables
│   ├── config/           # Marchés, constantes
│   ├── services/         # Couches métier (account, market, order, price)
│   ├── utils/            # Helpers (delta, format, liquidation, TP/SL)
│   ├── locales/          # Traductions FR / EN
│   └── context/          # WalletContext (credentials)
├── api/
│   ├── extended.js       # Proxy Vercel → Extended API
│   └── nado.js           # Proxy Vercel → Nado Gateway + Archive
├── public/
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

---

## Notes techniques

### BigInt safety (Extended & Nado)

L'`id` numérique retourné par Extended (`data.id`) et le `nonce` Nado dépassent `Number.MAX_SAFE_INTEGER`. Ces valeurs sont manipulées en `string` ou `BigInt` — ne jamais les parser avec `parseInt()` ou `Number()`.

### getOrderStatus Extended — `data` est un tableau

La réponse de `GET /user/orders/external/:externalId` retourne `{ status: "OK", data: [ {...} ] }`. Il faut lire `data.data[0]` et non `data.data` pour accéder au statut de l'ordre.

### Rate limiting Hyperliquid (429)

Le polling de `getOrderStatus` HL est espacé de **3 secondes minimum** pour éviter les erreurs 429. L'app faisant déjà des appels parallèles (prix, positions), le polling chunked ne doit pas descendre sous cet intervalle.

### Signing Nado (EIP-712 x18)

Chaque ordre Nado est signé via `signTypedData` (viem). Le prix et la taille sont encodés en **entiers x10¹⁸** avec `roundToTick()` qui gère les nombres négatifs (shorts). Le `nonce` est construit à partir du timestamp serveur synchronisé (`syncClock()` + `_clockOffset`).

### Signing Extended (Poseidon StarkNet)

Chaque ordre Extended est signé avec Poseidon hash sur StarkNet. L'expiration est calculée en secondes avec un offset serveur de 14 jours (`SERVER_CLOCK_OFFSET_S`). Les configs L2 (syntheticId, resolutions) sont cachées en mémoire et dans `localStorage` avec un TTL de 1 heure.

### HIP-3 vs HL dans les statistiques

Les fills Hyperliquid sont séparés en deux buckets dans `aggregateFills()` : les fills dont `f.coin.includes('xyz')` vont dans `hip3`, les autres dans `hl`. Cela permet d'afficher des statistiques distinctes pour Hyperliquid Perps et le DEX HIP-3.

### Ajout d'une nouvelle plateforme

Le registre `PLATFORMS` dans `src/platforms/index.js` est conçu pour être étendu. Un template commenté est disponible directement dans le fichier. Il suffit d'ajouter un adapter dans `src/platforms/`, un bloc dans `PLATFORMS`, et les champs de credentials dans `CREDENTIAL_FIELDS`.
