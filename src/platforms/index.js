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
*/

export const PLATFORMS = [
  { id: 'hyperliquid', label: 'Hyperliquid', source: 'hl',   adapter: hyperliquid, keysField: 'hl'   },
  { id: 'xyz',         label: 'trade.xyz',   source: 'hl',   adapter: hyperliquid, keysField: 'hl'   },
  { id: 'hyena',       label: 'HyENA',       source: 'hl',   adapter: hyperliquid, keysField: 'hl'   },
  { id: 'extended',    label: 'Extended',    source: 'ext',  adapter: extended,    keysField: 'ext'  },
  { id: 'nado',        label: 'Nado',        source: 'nado', adapter: nado,        keysField: 'nado' },
]

// Helper central — remplace tous les if/switch de l'app
export function platformHasMarket(platformId, market) {
  const p = getPlatform(platformId)
  if (!p) return false
  // Nado : clé de prix OU productId (marchés NADO_ONLY n'ont pas de nadoProductId au départ)
  if (p.keysField === 'nado') {
    return !!(market.keys?.nado || market.nadoProductId)
  }
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
