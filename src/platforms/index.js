// src/platforms/index.js
import * as hyperliquid from './hyperliquid.js'
import * as extended    from './extended.js'
import * as nado        from './nado.js'

export const PLATFORMS = [
  { id: 'hyperliquid', label: 'Hyperliquid', source: 'hl',   adapter: hyperliquid },
  { id: 'xyz',         label: 'trade.xyz',   source: 'hl',   adapter: hyperliquid },
  { id: 'hyena',       label: 'HyENA',       source: 'hl',   adapter: hyperliquid },
  { id: 'extended',    label: 'Extended',    source: 'ext',  adapter: extended    },
  { id: 'nado',        label: 'Nado',        source: 'nado', adapter: nado        },
]

export const getPlatform = (id) => PLATFORMS.find(p => p.id === id) ?? null

/**
 * @typedef {Object} Market
 * @property {string}      id
 * @property {string}      label
 * @property {string}      category   'Crypto' | 'Indices' | 'Commodités' | 'Equities' | 'FX'
 * @property {string|null} hlKey
 * @property {string|null} extKey
 * @property {string|null} nadoKey
 * @property {number|null} assetIndex
 * @property {number|null} nadoProductId
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
