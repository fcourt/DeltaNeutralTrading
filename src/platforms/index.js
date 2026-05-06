// src/platforms/index.js
import * as hyperliquid from './hyperliquid.js'
import * as extended    from './extended.js'
import * as nado        from './nado.js'

/*
export const PLATFORMS = [
  { id: 'hyperliquid', label: 'Hyperliquid', source: 'hl',   adapter: hyperliquid, marketKey:  'hlKey' },
  { id: 'xyz',         label: 'trade.xyz',   source: 'hl',   adapter: hyperliquid, marketKey:  'hlKey' },
  { id: 'hyena',       label: 'HyENA',       source: 'hl',   adapter: hyperliquid, marketKey:  'hlKey' },
  { id: 'extended',    label: 'Extended',    source: 'ext',  adapter: extended, marketKey:  'extKey'   },
  { id: 'nado',        label: 'Nado',        source: 'nado', adapter: nado, marketKey:  'nadoProductId', altMarketKey: 'nadoKey' },
]

export const PLATFORMS = [
  { id: 'hyperliquid', label: 'Hyperliquid', source: 'hl',   adapter: hyperliquid, keysField: 'hl'   },
  { id: 'xyz',         label: 'trade.xyz',   source: 'hl',   adapter: hyperliquid, keysField: 'hl'   },
  { id: 'hyena',       label: 'HyENA',       source: 'hl',   adapter: hyperliquid, keysField: 'hl'   },
  { id: 'extended',    label: 'Extended',    source: 'ext',  adapter: extended,    keysField: 'ext'  },
  { id: 'nado',        label: 'Nado',        source: 'nado', adapter: nado,        keysField: 'nado' },
]
*/

export const PLATFORMS = [
  { id: 'hyperliquid', label: 'Hyperliquid', source: 'hl',   adapter: hyperliquid, keysField: 'hl',   keyFallback: null },
  { id: 'xyz',         label: 'trade.xyz',   source: 'hl',   adapter: hyperliquid, keysField: 'hl',   keyFallback: null },
  { id: 'hyena',       label: 'HyENA',       source: 'hl',   adapter: hyperliquid, keysField: 'hl',   keyFallback: null },
  { id: 'extended',    label: 'Extended',    source: 'ext',  adapter: extended,    keysField: 'ext',  keyFallback: (id) => `${id}-USD` },
  { id: 'nado',        label: 'Nado',        source: 'nado', adapter: nado,        keysField: 'nado', keyFallback: (id) => id },
]

// Helper central — remplace tous les if/switch de l'app
/*
export function platformHasMarket(platformId, market) {
  const p = getPlatform(platformId)
  if (!p) return false
  // Nado : clé de prix OU productId (marchés NADO_ONLY n'ont pas de nadoProductId au départ)
  if (p.keysField === 'nado') {
    return !!(market.keys?.nado || market.nadoProductId)
  }
  return !!market.keys?.[p.keysField]
}
*/

/**
 * Chaque groupe de credentials est lié à un keysField de PLATFORMS.
 * Ajouter une plateforme = ajouter un bloc ici + une entrée dans PLATFORMS.
 */
export const CREDENTIAL_FIELDS = {
  hl: [
    { key: 'hl_address',       stateKey: 'hlAddress',      label: 'settingKeys.hl.address', type: 'text',     hint: 'settingKeys.hl.addressHint', trim: true  },
    { key: 'hl_agent_pk',      stateKey: 'hlAgentPk',      label: 'settingKeys.hl.agentPk', type: 'password', hint: 'settingKeys.hl.agentPkHint', trim: false },
    { key: 'hl_vault_address', stateKey: 'hlVaultAddress', label: 'settingKeys.hl.vault',   type: 'text',     hint: 'settingKeys.hl.vaultHint',   trim: true  },
  ],
  ext: [
    // ── Compte principal (stats uniquement) ──
    { key: 'ext_main_api_key', stateKey: 'extMainApiKey',  label: 'settingKeys.ext.mainApiKey',  type: 'password', hint: 'settingKeys.ext.mainApiKeyHint',  trim: false },
    // ── Compte secondaire ── trading ──
    { key: 'ext_api_key',  stateKey: 'extApiKey',  label: 'settingKeys.ext.apiKey',  type: 'password', hint: 'settingKeys.ext.apiKeyHint',  trim: false },
    { key: 'ext_stark_pk', stateKey: 'extStarkPk', label: 'settingKeys.ext.starkPk', type: 'password', hint: 'settingKeys.ext.starkPkHint', trim: false },
    { key: 'ext_l2_vault', stateKey: 'extL2Vault', label: 'settingKeys.ext.l2Vault', type: 'text',     hint: 'settingKeys.ext.l2VaultHint', trim: false },
  ],
  nado: [
    { key: 'nado_address',    stateKey: 'nadoAddress',    label: 'settingKeys.nado.address',    type: 'text',     hint: 'settingKeys.nado.addressHint',    trim: false },
    { key: 'nado_agent_pk',   stateKey: 'nadoAgentPk',    label: 'settingKeys.nado.agentPk',    type: 'password', hint: 'settingKeys.nado.agentPkHint',    trim: false },
    { key: 'nado_subaccount', stateKey: 'nadoSubaccount', label: 'settingKeys.nado.subaccount', type: 'text',     hint: 'settingKeys.nado.subaccountHint', trim: false, default: 'default' },
  ],
  // ── Nouvelle plateforme : ajouter un bloc ici ──
  // maPf: [
  //   { key: 'ma_pf_api_key', stateKey: 'maPfApiKey', label: 'settingKeys.maPf.apiKey', type: 'password', hint: 'settingKeys.maPf.apiKeyHint', trim: false },
  // ],
}

/** Liste plate de tous les champs — utilisée par WalletContext */
export const ALL_CREDENTIAL_FIELDS = Object.values(CREDENTIAL_FIELDS).flat()

// ✅ index.js — platformHasMarket générique, sans hardcoding
export function platformHasMarket(platformId, market) {
  const p = getPlatform(platformId)
  if (!p) return false
  return !!market.keys?.[p.keysField]
}

export const getPlatform = (id) => PLATFORMS.find(p => p.id === id) ?? null

/*
// Helper central — remplace tous les if/switch de l'app
export function platformHasMarket(platformId, market) {
  const p = getPlatform(platformId)
  if (!p) return false
  return !!market[p.marketKey] || (p.altMarketKey ? !!market[p.altMarketKey] : false)
}
*/

/**
 * @typedef {Object} Market
 * @property {string}      id
 * @property {string}      label
 * @property {string}      category   'Crypto' | 'Indices' | 'Commodités' | 'Equities' | 'FX'
 * @property {number|null} assetIndex
 * @property {number|null} nadoProductId
 *
 * @property {Object}      keys
 * @property {string|null} keys.hl
 * @property {string|null} keys.ext
 * @property {string|null} keys.nado
 *
 * @typedef {Object} Position
 * @property {string}         platform
 * @property {string}         coin
 * @property {string|null}    marketId
 * @property {string}         label
 * @property {'LONG'|'SHORT'} side
 * @property {number}         szi
 * @property {number}         entryPx
 * @property {number}         unrealizedPnl
 *
 * @typedef {Object} Credentials
 * @property {string} [hlAddress]
 * @property {string} [hlVaultAddress]
 * @property {string} [hlAgentPk]
 * @property {string} [extApiKey]
 * @property {string} [extStarkPk]
 * @property {string} [extL2Vault]
 * @property {string} [nadoAddress]
 * @property {string} [nadoAgentPk]
 * @property {string} [nadoSubaccount]
 */
