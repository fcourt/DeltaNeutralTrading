// src/platforms/index.js
import * as hyperliquid from './hyperliquid.js'
import * as extended    from './extended.js'
import * as nado        from './nado.js'

export const PLATFORMS = [
  {
    id:          'hyperliquid',
    label:       'Hyperliquid',
    source:      'hl',
    adapter:     hyperliquid,
    keysField:   'hl',
    keyFallback: null,
    color:       '#93c5fd',
    statsKey:    'hl',
    statsLabel:  'Hyperliquid Perps',
    isAvailable: (values) => !!(values.hlAddress?.trim() || values.hlVaultAddress?.trim()),
    hasAddressField: true,
    //traking
    normalizeOrderId: (result) => result?.response?.data?.statuses?.[0]?.resting?.oid
                           ?? result?.response?.data?.statuses?.[0]?.filled?.oid
                           ?? null,
    //fetch data comptes
    getAccounts: (wallet, subAccounts, extraAddresses) => {
      const principal = wallet.hlAddress?.trim()      || null
      const vault     = wallet.hlVaultAddress?.trim() || null
      const list = []
      if (principal) list.push({ address: principal, name: 'Principal', badge: 'HL', removable: false })
      if (vault && vault !== principal) list.push({ address: vault, name: 'Vault', badge: 'HL', removable: false })
      //subAccounts.forEach(s => list.push({ address: s.address, name: s.name, badge: 'sub', removable: false }))
      const subs = Array.isArray(subAccounts?.['hyperliquid']) ? subAccounts['hyperliquid'] : []
      subs.forEach(s => list.push({ address: s.address, name: s.name, badge: 'sub', removable: false }))
      extraAddresses.filter(e => e.platformId === 'hyperliquid')
        .forEach(e => list.push({ address: e.address, name: null, badge: 'extra', removable: true }))
      return list
    },
    fetchSubAccounts: async (wallet) => {
      const addr = wallet.hlVaultAddress?.trim() || wallet.hlAddress?.trim()
      if (!addr) return []
      const subs = await hyperliquid.fetchSubAccounts(addr)
      return subs.map(s => ({ address: s.subAccountUser || s.address, name: s.name || 'Sub-account' }))
    },
    //fetch data ordres
    fetchStats: async (wallet, accounts, extraAddresses, subAccounts, start, end) => {
      const allAddrs = [
        wallet.hlAddress?.trim(),
        wallet.hlVaultAddress?.trim(),
        //...subAccounts.map(s => s.address),
        ...(Array.isArray(subAccounts?.['hyperliquid']) ? subAccounts['hyperliquid'] : []).map(s => s.address),
        ...extraAddresses.filter(e => ['hyperliquid','xyz','hyena'].includes(e.platformId)).map(e => e.address),
      ].filter(Boolean)
      const unique = [...new Set(allAddrs)].filter(a => accounts[a] !== false)

      const res = { hl: { pnlGross:0, fees:0, volume:0, trades:0 }, hip3: { pnlGross:0, fees:0, volume:0, trades:0 } }
      for (const addr of unique) {
        try {
          const fills = await hyperliquid.fetchFills(addr, start)
          const { hl, hip3 } = hyperliquid.aggregateFills(fills, start, end)
          // Chaque statsKey n'est accumulé que si sa plateforme est active
          ;['hl','hip3'].forEach(k => {
            res[k].pnlGross += k === 'hl' ? hl.pnlGross : hip3.pnlGross
            res[k].fees     += k === 'hl' ? hl.fees     : hip3.fees
            res[k].volume   += k === 'hl' ? hl.volume   : hip3.volume
            res[k].trades   += k === 'hl' ? hl.trades   : hip3.trades
            res[k].rawTrades  = [...res[k].rawTrades, ...src.rawTrades]  // ← ajout pour tracking
          })
        } catch (e) { console.warn(`[hyperliquid] ${addr}:`, e.message) }
      }
      return res  // retourne { hl: {...}, hip3: {...} } — plusieurs statsKey possibles
    },
  },

  {
    id:          'xyz',
    label:       'trade.xyz',
    source:      'hl',
    adapter:     hyperliquid,
    keysField:   'hl',
    keyFallback: null,
    color:       '#c4b5fd',
    statsKey:    'hip3',
    statsLabel:  'HIP-3 DEX (trade.xyz / HyENA)',
    isAvailable: (values) => !!(values.hlAddress?.trim() || values.hlVaultAddress?.trim()),
    hasAddressField: true,
    normalizeOrderId: (result) => result?.response?.data?.statuses?.[0]?.resting?.oid
                           ?? result?.response?.data?.statuses?.[0]?.filled?.oid
                           ?? null,
    getAccounts: (wallet, _subAccounts, extraAddresses) => {
      const principal = wallet.hlAddress?.trim()      || null
      const vault     = wallet.hlVaultAddress?.trim() || null
      const list = []
      if (principal) list.push({ address: principal, name: 'Principal', badge: 'HL', removable: false })
      if (vault && vault !== principal) list.push({ address: vault, name: 'Vault', badge: 'HL', removable: false })
      extraAddresses.filter(e => e.platformId === 'xyz')
        .forEach(e => list.push({ address: e.address, name: null, badge: 'extra', removable: true }))
      return list
    },
    fetchSubAccounts: undefined,
    fetchStats: undefined,  // xyz et hyena sont couverts par hyperliquid.fetchStats ci-dessus
  },
  {
    id:          'hyena',
    label:       'HyENA',
    source:      'hl',
    adapter:     hyperliquid,
    keysField:   'hl',
    keyFallback: null,
    color:       '#a5b4fc',
    statsKey:    'hip3',
    statsLabel:  'HIP-3 DEX (trade.xyz / HyENA)',
    isAvailable: (values) => !!(values.hlAddress?.trim() || values.hlVaultAddress?.trim()),
    hasAddressField: true,
    normalizeOrderId: (result) => result?.response?.data?.statuses?.[0]?.resting?.oid
                           ?? result?.response?.data?.statuses?.[0]?.filled?.oid
                           ?? null,
    getAccounts: (wallet, _subAccounts, extraAddresses) => {
      const principal = wallet.hlAddress?.trim()      || null
      const vault     = wallet.hlVaultAddress?.trim() || null
      const list = []
      if (principal) list.push({ address: principal, name: 'Principal', badge: 'HL', removable: false })
      if (vault && vault !== principal) list.push({ address: vault, name: 'Vault', badge: 'HL', removable: false })
      extraAddresses.filter(e => e.platformId === 'hyena')
        .forEach(e => list.push({ address: e.address, name: null, badge: 'extra', removable: true }))
      return list
    },
    fetchSubAccounts: undefined,
    fetchStats: undefined,  // xyz et hyena sont couverts par hyperliquid.fetchStats ci-dessus
  },
  {
    id:          'extended',
    label:       'Extended',
    source:      'ext',
    adapter:     extended,
    keysField:   'ext',
    keyFallback: (id) => `${id}-USD`,
    color:       '#6cdfa9',
    statsKey:    'ext',
    statsLabel:  'Extended',
    isAvailable: (values) => !!(values.extMainApiKey?.trim() || values.extApiKey?.trim()),
    hasAddressField: false,
    normalizeOrderId: (result) => result?.data?.id ?? null,
    getAccounts: (wallet, _subAccounts, _extraAddresses) => {
      const list = []
      if (wallet.extMainApiKey?.trim()) list.push({ address: 'ext-main', name: 'Compte principal', badge: 'main', removable: false })
      if (wallet.extApiKey?.trim())     list.push({ address: 'ext-sub',  name: 'Sous-compte',      badge: 'sub',  removable: false })
      return list
    },
    fetchSubAccounts: undefined,
    fetchStats: async (wallet, accounts, _extras, _subs, start, end) => {
      const res = { pnlGross: 0, fees: 0, volume: 0, trades: 0, rawTrades: [] }
        for (const [key, addr] of [['ext-main', wallet.extMainApiKey], ['ext-sub', wallet.extApiKey]]) {
          if (!addr?.trim() || accounts[key] === false) continue
            try {
              const part = await extended.fetchStats(addr.trim(), start, end)
              // part = { pnlGross, fees, volume, trades, rawTrades }
              res.pnlGross   += part.pnlGross
              res.fees       += part.fees
              res.volume     += part.volume
              res.trades     += part.trades
              res.rawTrades   = [...res.rawTrades, ...(part.rawTrades ?? [])]
            } catch (e) { console.warn(`[extended] ${key}:`, e.message) }
        }
      return { ext: res }  // ← pas de changement sur la clé ext
    },
    /*
    fetchStats: async (wallet, accounts, _extras, _subs, start, end) => {
      const res = { pnlGross:0, fees:0, volume:0, trades:0 }
      for (const [key, addr] of [['ext-main', wallet.extMainApiKey], ['ext-sub', wallet.extApiKey]]) {
        if (!addr?.trim() || accounts[key] === false) continue
        try {
          const part = await extended.fetchStats(addr.trim(), start, end)
          res.pnlGross += part.pnlGross; res.fees += part.fees
          res.volume   += part.volume;   res.trades += part.trades
        } catch (e) { console.warn(`[extended] ${key}:`, e.message) }
      }
      return { ext: res }
    },
    */
  },
  {
    id:          'nado',
    label:       'Nado',
    source:      'nado',
    adapter:     nado,
    keysField:   'nado',
    keyFallback: (id) => id,
    color:       '#e1ac83',
    statsKey:    'nado',
    statsLabel:  'Nado',
    isAvailable: (values) => !!values.nadoAddress?.trim(),
    hasAddressField: true,
    normalizeOrderId: (result) => result?.data?.order?.nonce ?? null,
    getAccounts: (wallet, _subAccounts, extraAddresses) => {
      const addr = wallet.nadoAddress?.trim()
      const list = []
      if (addr) list.push({ address: addr, name: wallet.nadoSubaccount?.trim() || 'default', badge: 'nado', removable: false })
      extraAddresses.filter(e => e.platformId === 'nado')
        .forEach(e => list.push({ address: e.address, name: null, badge: 'extra', removable: true }))
      return list
    },
    fetchSubAccounts: undefined,
    fetchStats: async (wallet, _accounts, _extras, _subs, start, end) => {
      const addr = wallet.nadoAddress?.trim()
      //if (!addr) return { nado: { pnlGross:0, fees:0, volume:0, trades:0 } }
      if (!addr) return { nado: { pnlGross: 0, fees: 0, volume: 0, trades: 0, rawTrades: [] } }
      try {
        const part = await nado.fetchStats(addr, wallet.nadoSubaccount, start, end)
        return { nado: part }
      } catch (e) {
        console.warn('[nado]', e.message)
        //return { nado: { pnlGross:0, fees:0, volume:0, trades:0 } }
        return { nado: { pnlGross: 0, fees: 0, volume: 0, trades: 0, rawTrades: [] } }
      }
    },
  },
  // ── Nouvelle plateforme — template ──
  // {
  //   id: 'maPf', label: 'Ma Plateforme', ...,
  //   hasAddressField: true,  // ou false si clé API uniquement
  //   getAccounts: (wallet, _subAccounts, extraAddresses) => {
  //     const list = []
  //     if (wallet.maPfApiKey?.trim()) list.push({ address: 'mapf-main', name: 'Compte', badge: 'API', removable: false })
  //     extraAddresses.filter(e => e.platformId === 'maPf').forEach(e => list.push({ address: e.address, name: null, badge: 'extra', removable: true }))
  //     return list
  //   },
  // },
]


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
    { key: 'ext_main_api_key', stateKey: 'extMainApiKey',  label: 'settingKeys.ext.mainApiKey',  type: 'password', hint: 'settingKeys.ext.mainApiKeyHint',  trim: false },
    { key: 'ext_api_key',      stateKey: 'extApiKey',      label: 'settingKeys.ext.apiKey',      type: 'password', hint: 'settingKeys.ext.apiKeyHint',      trim: false },
    { key: 'ext_stark_pk',     stateKey: 'extStarkPk',     label: 'settingKeys.ext.starkPk',     type: 'password', hint: 'settingKeys.ext.starkPkHint',     trim: false },
    { key: 'ext_l2_vault',     stateKey: 'extL2Vault',     label: 'settingKeys.ext.l2Vault',     type: 'text',     hint: 'settingKeys.ext.l2VaultHint',     trim: false },
  ],
  nado: [
    { key: 'nado_address',    stateKey: 'nadoAddress',    label: 'settingKeys.nado.address',    type: 'text',     hint: 'settingKeys.nado.addressHint',    trim: false },
    { key: 'nado_agent_pk',   stateKey: 'nadoAgentPk',    label: 'settingKeys.nado.agentPk',    type: 'password', hint: 'settingKeys.nado.agentPkHint',    trim: false },
    { key: 'nado_subaccount', stateKey: 'nadoSubaccount', label: 'settingKeys.nado.subaccount', type: 'text',     hint: 'settingKeys.nado.subaccountHint', trim: false, default: 'default' },
  ],
  // ── Nouvelle plateforme ──
  // maPf: [
  //   { key: 'ma_pf_api_key', stateKey: 'maPfApiKey', label: 'settingKeys.maPf.apiKey', type: 'password', hint: 'settingKeys.maPf.apiKeyHint', trim: false },
  // ],
}

/** Liste plate de tous les champs — utilisée par WalletContext */
export const ALL_CREDENTIAL_FIELDS = Object.values(CREDENTIAL_FIELDS).flat()

/**
 * Liste dédupliquée ordonnée des statsKey — utilisée par StatsPage
 * pour itérer byPlatform dans le bon ordre sans hardcoding.
 */
export const STATS_KEYS = [...new Set(PLATFORMS.map(p => p.statsKey))]

export const getPlatform = (id) => PLATFORMS.find(p => p.id === id) ?? null

export function platformHasMarket(platformId, market) {
  const p = getPlatform(platformId)
  if (!p) return false
  return !!market.keys?.[p.keysField]
}

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
 * @property {string} [extMainApiKey]
 * @property {string} [extApiKey]
 * @property {string} [extStarkPk]
 * @property {string} [extL2Vault]
 * @property {string} [nadoAddress]
 * @property {string} [nadoAgentPk]
 * @property {string} [nadoSubaccount]
 */
