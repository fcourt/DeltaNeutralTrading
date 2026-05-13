// src/platforms/hyperliquid.js
// Couvre Hyperliquid, trade.xyz (dex:'xyz') et HyENA

//import {
//  HL_KEY_OVERRIDES, MARKET_LABELS, inferCategory,
//  EXT_KEY_OVERRIDES, NADO_KEY_OVERRIDES,
//} from '../config/markets.js'

// hyperliquid.js — import migré
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid'
import { signL1Action } from '@nktkas/hyperliquid/signing'
import { privateKeyToAccount } from 'viem/accounts'
import { roundToHLPrice, roundToHLTick } from '../utils/trading.js'
import { buildHlTpSlAction, buildHlTpSlOrders } from '../utils/tpsl.js'
import { HL_KEY_OVERRIDES, MARKET_LABELS, inferCategory } from '../config/markets.js'

const HL_API = 'https://api.hyperliquid.xyz/info'
export const XYZ_OFFSET = 110_000

const _cache = new Map()
const _ttls = { hl_all: 300_000, hl_xyz: 300_000 }
const HL_EXCHANGE = 'https://api.hyperliquid.xyz/exchange'
const _DEF = 300_000
function getCached(k) { const e = _cache.get(k); return e && Date.now() - e.ts < (_ttls[k] ?? _DEF) ? e.d : null }
function setCached(k, d) { _cache.set(k, { d, ts: Date.now() }) }

const META_TTL_MS    = 5 * 60 * 1000
let _metaCache        = null
let _metaFetchPromise = null

//helpers //////////////////////////////////////////////////////////////////////////////////////////
// Ajouter cette fonction en haut du fichier (à côté de roundToHLPrice)
/*
function roundToHLTick(price, szDecimals = 0) {
  // HL : max 5 chiffres significatifs + max (6 - szDecimals) décimales
  const maxDecimals  = Math.max(0, 6 - szDecimals)
  const sigFigDec    = price > 0
    ? Math.max(0, 5 - Math.floor(Math.log10(Math.abs(price))) - 1)
    : 0
  const decimals = Math.min(maxDecimals, sigFigDec)
  return parseFloat(price.toFixed(decimals))
}
*/

//infos HL //////////////////////////////////////////////////////////////////////////////////////
async function fetchUniverse(body) {
  const res = await fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`HL ${res.status}`)
  const data = await res.json()
  const [meta] = Array.isArray(data) ? data : [null]
  return new Set((meta?.universe || []).map(a => a.name))
}

/*
function buildMarket(hlKey) {
  const override = HL_KEY_OVERRIDES[hlKey] || {}
  const id = override.id || hlKey.replace(/^xyz:/, '')
  const isXyz = hlKey.startsWith('xyz:')
  const extKey = id in EXT_KEY_OVERRIDES ? EXT_KEY_OVERRIDES[id]
    : !isXyz ? `${id}-USD` : `${id}_24_5-USD`
  const nadoKey = NADO_KEY_OVERRIDES[id] ?? id
  return {
    id, label: MARKET_LABELS[id] || id,
    category: isXyz ? inferCategory(id) : 'Crypto',
    hlKey, extKey, nadoKey, assetIndex: null, nadoProductId: null,
  }
}
*/

/*
function buildMarket(hlKey) {
  const override = HL_KEY_OVERRIDES[hlKey] || {}
  const id       = override.id || hlKey.replace(/^xyz:/, '')
  const isXyz    = hlKey.startsWith('xyz:')
  //const extKey   = id in EXT_KEY_OVERRIDES
  //  ? EXT_KEY_OVERRIDES[id]
  //  : !isXyz ? `${id}-USD` : `${id}_24_5-USD`
  //const nadoKey  = NADO_KEY_OVERRIDES[id] ?? id
  const extKey  = id in KEY_OVERRIDES.ext  
    ? KEY_OVERRIDES.ext[id]  
    : !isXyz ? `${id}-USD` : `${id}_24_5-USD`
  const nadoKey = KEY_OVERRIDES.nado[id]   ?? id
  return {
    id, label: MARKET_LABELS[id] || id,
    category: isXyz ? inferCategory(id) : 'Crypto',
    // ← migration hlKey/extKey/nadoKey → keys
    keys: { hl: hlKey, ext: extKey, nado: nadoKey },
    // rétrocompat le temps de la migration complète
    //hlKey, extKey, nadoKey,
    assetIndex: null, nadoProductId: null,
  }
}
*/

function buildMarket(hlKey) {
  const override = HL_KEY_OVERRIDES[hlKey] || {}
  const id       = override.id || hlKey.replace(/^xyz:/, '')
  const isXyz    = hlKey.startsWith('xyz:')

  return {
    id,
    label:    MARKET_LABELS[id] || id,
    category: isXyz ? inferCategory(id) : 'Crypto',
    keys:     { hl: hlKey },
    assetIndex: null,
  }
}

export async function getMarkets() {
  const [resNat, resXyz] = await Promise.all([
    fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'metaAndAssetCtxs' }) }),
    fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }) }),
  ])
  const [natData, xyzData] = await Promise.all([resNat.json(), resXyz.json()])

  const discoveredMarkets = new Map()
  const prices = {}, stepSizes = {}, assetMeta = {}

  const [natMeta, natCtxs] = Array.isArray(natData) ? natData : [null, null];
  (natMeta?.universe || []).forEach((asset, i) => {
    const m = buildMarket(asset.name)
    m.assetIndex = i
    discoveredMarkets.set(m.id, m)
    if (natCtxs?.[i]?.markPx) {
      prices[asset.name] = natCtxs[i].markPx
      stepSizes[asset.name] = Math.pow(10, -(asset.szDecimals ?? 3))
    }
    assetMeta[asset.name] = {
      index: i, szDecimals: asset.szDecimals ?? 6,
      pxDecimals: asset.pxDecimals ?? 2, maxLeverage: asset.maxLeverage ?? null,
    }
  })

  const [xyzMeta, xyzCtxs] = Array.isArray(xyzData) ? xyzData : [null, null];
  (xyzMeta?.universe || []).forEach((asset, i) => {
    const m = buildMarket(asset.name)
    if (!discoveredMarkets.has(m.id)) {
      m.assetIndex = XYZ_OFFSET + i
      discoveredMarkets.set(m.id, m)
    }
    if (xyzCtxs?.[i]?.markPx) {
      prices[asset.name] = xyzCtxs[i].markPx
      stepSizes[asset.name] = Math.pow(10, -(asset.szDecimals ?? 2))
    }
    const entry = {
      index: XYZ_OFFSET + i, szDecimals: asset.szDecimals ?? 2,
      pxDecimals: asset.pxDecimals ?? 2, maxLeverage: asset.maxLeverage ?? null,
    }
    assetMeta[asset.name] = entry
    assetMeta[asset.name.replace(/^xyz:/, '')] = entry
  })

  return { discoveredMarkets, prices, stepSizes, assetMeta }
}

export const getPrices = getMarkets

const _bidAskCache = new Map()

/*
export async function getBidAsk(hlKey, isXyz = false) {
  const cacheKey = `bidask_${hlKey}`
  const cached = _bidAskCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < 3000) return cached.d
  try {
    const body = { type: 'l2Book', coin: hlKey, nSigFigs: 1 }
    if (isXyz) body.dex = 'xyz'
    const res = await fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) return { bid: null, ask: null }
    const data = await res.json()
    const bid = data?.levels?.[0]?.[0]?.px ? parseFloat(data.levels[0][0].px) : null
    const ask = data?.levels?.[1]?.[0]?.px ? parseFloat(data.levels[1][0].px) : null
    const result = { bid, ask }
    _bidAskCache.set(cacheKey, { d: result, ts: Date.now() })
    return result
  } catch { return { bid: null, ask: null } }
}
*/

export async function getBidAsk(hlKey, isXyz = false) {
  const cacheKey = `bidask_${hlKey}`
  const cached = _bidAskCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < 3000) return cached.d
  try {
    const body = { type: 'l2Book', coin: hlKey, nSigFigs: 5 }  // ← 5 au lieu de 1
    if (isXyz) body.dex = 'xyz'
    const res = await fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`l2Book HTTP ${res.status}`)
    const data = await res.json()
    const bid = data?.levels?.[0]?.[0]?.px ? parseFloat(data.levels[0][0].px) : null
    const ask = data?.levels?.[1]?.[0]?.px ? parseFloat(data.levels[1][0].px) : null
    if (!bid && !ask) throw new Error('l2Book vide')  // ← force le fallback
    const result = { bid, ask }
    _bidAskCache.set(cacheKey, { d: result, ts: Date.now() })
    return result
  } catch (e) {
    console.warn('[HL] getBidAsk → fallback midPx pour', hlKey, e.message)
    // ── Fallback : midPx depuis le cache metaAndAssetCtxs ─────────────────
    try {
      const meta = await fetchMetaAndCtx()
      const idx  = meta[0].universe.findIndex(u => u.name === hlKey)
      const mid  = idx !== -1 ? parseFloat(meta[1][idx]?.midPx ?? 0) : 0
      return { bid: mid || null, ask: mid || null }
    } catch { return { bid: null, ask: null } }
  }
}

export async function getFunding() {
  const [resNat, resXyz] = await Promise.all([
    fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'metaAndAssetCtxs' }) }),
    fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }) }),
  ])
  const [natData, xyzData] = await Promise.all([resNat.json(), resXyz.json()])
  const rates = {}
  const [natMeta, natCtxs] = Array.isArray(natData) ? natData : [null, null];
  (natMeta?.universe || []).forEach((a, i) => { rates[a.name] = parseFloat(natCtxs?.[i]?.funding ?? 0) })
  const [xyzMeta, xyzCtxs] = Array.isArray(xyzData) ? xyzData : [null, null];
  (xyzMeta?.universe || []).forEach((a, i) => { rates[a.name] = parseFloat(xyzCtxs?.[i]?.funding ?? 0) })
  return rates
}

export async function getMargin(credentials) {
  const { hlAddress, hlVaultAddress, platformId } = credentials

  if (platformId === 'hyena') {
    const candidates = [hlVaultAddress, hlAddress].filter(a => a?.trim() && /^0x[0-9a-fA-F]{40}$/i.test(a.trim()))
    for (const addr of candidates) {
      try {
        const res = await fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'spotClearinghouseState', user: addr.trim().toLowerCase() }) })
        const state = await res.json()
        const usde = state?.balances?.find(b => b.coin.toUpperCase() === 'USDE')
        if (usde) { const val = parseFloat(usde.total ?? 0) - parseFloat(usde.hold ?? 0); if (val > 0) return val }
      } catch { /* continue */ }
    }
    return null
  }

  if (hlVaultAddress?.trim() && /^0x[0-9a-fA-F]{40}$/i.test(hlVaultAddress.trim())) {
    const res = await fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'spotClearinghouseState', user: hlVaultAddress.trim().toLowerCase() }) })
    const state = await res.json()
    const usdc = state?.balances?.find(b => b.coin === 'USDC')
    return parseFloat(usdc?.total ?? 0) - parseFloat(usdc?.hold ?? 0)
  }

  if (!hlAddress?.trim() || !/^0x[0-9a-fA-F]{40}$/i.test(hlAddress.trim())) return null
  const res = await fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'clearinghouseState', user: hlAddress.trim().toLowerCase() }) })
  const state = await res.json()
  return parseFloat(state?.withdrawable ?? 0)
}

export async function getPositions(credentials, markets = []) {
  const { hlAddress, hlVaultAddress } = credentials
  const addresses = [hlAddress, hlVaultAddress].filter(a => a?.trim() && /^0x[0-9a-fA-F]{40}$/i.test(a.trim()))
  if (!addresses.length) return []

  const parseState = (state, wallet) =>
    (state?.assetPositions || [])
      .filter(p => parseFloat(p.position?.szi) !== 0)
      .map(p => {
        const coin = p.position.coin, szi = parseFloat(p.position.szi)
        const platform = coin.startsWith('xyz:') ? 'xyz' : coin.startsWith('hyna:') ? 'hyena' : 'hyperliquid'
        //const market = markets.find(m => m.hlKey === coin)
        const market = markets.find(m => m.keys?.hl === coin)
        return {
          platform, coin, wallet,
          marketId: market?.id ?? null,
          label: market?.label ?? coin,
          side: szi > 0 ? 'LONG' : 'SHORT',
          szi: Math.abs(szi),
          entryPx: parseFloat(p.position.entryPx || 0),
          unrealizedPnl: parseFloat(p.position.unrealizedPnl || 0),
        }
      })

  const results = await Promise.allSettled(
    addresses.flatMap(addr => [
      fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'clearinghouseState', user: addr.trim() }) })
        .then(r => r.json()).then(s => parseState(s, addr === hlVaultAddress ? 'vault' : 'main')),
      fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'clearinghouseState', user: addr.trim(), dex: 'xyz' }) })
        .then(r => r.json()).then(s => parseState(s, addr === hlVaultAddress ? 'vault' : 'main')),
    ])
  )
  const seen = new Set()
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .filter(p => { const k = `${p.wallet}-${p.platform}-${p.coin}`; return seen.has(k) ? false : seen.add(k) })
}

export async function getAvailableKeys(platformId = 'hyperliquid') {
  const cacheKey = platformId === 'xyz' ? 'hl_xyz' : 'hl_all'
  const cached = getCached(cacheKey)
  if (cached) return cached
  const keys = await fetchUniverse({ type: 'metaAndAssetCtxs', ...(platformId === 'xyz' ? { dex: 'xyz' } : {}) })
  setCached(cacheKey, keys)
  return keys
}


// ── Interface unifiée ─────────────────────────────────────────────────────────
export function canTrade(credentials) {
  return !!credentials.hlAgentPk
}

// setLeverage — signature unifiée { market, leverage, isCross, credentials }
export async function setLeverage({ market, leverage, isCross = true, credentials }) {
  const coin = market.keys?.hl
  if (!coin) throw new Error(`[HL] Clé hl manquante pour ${market.id}`)
  return updateLeverageByName({
    hlAgentPk:      credentials.hlAgentPk,
    hlVaultAddress: credentials.hlVaultAddress,
    coin,
    leverage,
    isCross,
  })
}

// getFundingRate — signature unifiée (market, credentials)
export async function getFundingRate(market, credentials) {
  const hlKey = market.keys?.hl
  if (!hlKey) return { rate: null, bid: null, ask: null }
  const isXyz = hlKey.startsWith('xyz:')
  const [rates, bidAsk] = await Promise.all([
    getFunding(),
    getBidAsk(hlKey, isXyz).catch(() => ({ bid: null, ask: null })),
  ])
  return {
    rate: rates[hlKey] ?? null,
    bid:  bidAsk.bid,
    ask:  bidAsk.ask,
  }
}

// roundPrice — utilisé par OpenTrade.getDefaultLimitPrice
export { roundToHLPrice as roundPrice }

// getSzDecimals — utilisé par OpenTrade.buildOrderParams
export function getSzDecimals(market, meta, stepSize) {
  return meta?.szDecimals ?? Math.round(-Math.log10(stepSize || 0.01))
}

// ───────────────────────────────────────────────────────── Interface unifiée ──

//update Leverage////////////////////////////////////////////////////////////////////////////////////
async function fetchMetaAndCtx() {
  if (_metaCache && Date.now() - _metaCache.ts < META_TTL_MS) return _metaCache.data
  if (_metaFetchPromise) return _metaFetchPromise
  _metaFetchPromise = (async () => {
    const res  = await fetch(HL_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    })
    if (!res.ok) throw new Error(`/info metaAndAssetCtxs → HTTP ${res.status}`)
    const data = await res.json()
    _metaCache = { data, ts: Date.now() }
    return data
  })()
  try     { return await _metaFetchPromise }
  finally { _metaFetchPromise = null }
}

function getAssetIndex(meta, coin) {
  const idx = meta[0].universe.findIndex(u => u.name === coin)
  if (idx === -1) throw new Error(`[HL] Coin inconnu dans la meta : ${coin}`)
  return idx
}

/*
export async function updateLeverage({ hlAgentPk, hlAddress, hlVaultAddress, asset, leverage, isCross = true }) {
  if (!leverage || leverage <= 0) return
  const nonce  = Date.now()
  const action = { type: 'updateLeverage', asset, isCross, leverage: Math.round(leverage) }
  const wallet = privateKeyToAccount(hlAgentPk)
  const sig    = await signL1Action({ wallet, action, nonce })

  const target = hlVaultAddress?.trim() && /^0x[0-9a-fA-F]{40}$/i.test(hlVaultAddress.trim())
    ? hlVaultAddress.trim()
    : hlAddress

  const res = await fetch(HL_EXCHANGE, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature: sig, vaultAddress: target }),
  })
  const data = await res.json()
  if (data?.status !== 'ok') throw new Error(`[HL] updateLeverage: ${JSON.stringify(data)}`)
  return data
}

// ── updateLeverageByName : wrapper coin → assetIndex ─────────────────────────
export async function updateLeverageByName({ hlAgentPk, hlAddress, hlVaultAddress, coin, leverage, isCross = true }) {
  const meta  = await fetchMetaAndCtx()
  const asset = getAssetIndex(meta, coin)
  return updateLeverage({ hlAgentPk, hlAddress, hlVaultAddress, asset, leverage, isCross })
}
*/
/*
export async function updateLeverage({ hlAgentPk, hlVaultAddress, asset, leverage, isCross = true }) {
  if (!leverage || leverage <= 0) return

  const wallet = privateKeyToAccount(hlAgentPk)
  const client = new ExchangeClient({
    wallet,
    transport: new HttpTransport(),
    defaultVaultAddress: hlVaultAddress?.trim() || undefined,
  })

  return client.updateLeverage({
    asset,
    isCross,
    leverage: Math.round(leverage),
  })
}

export async function updateLeverageByName({ hlAgentPk, hlVaultAddress, coin, leverage, isCross = true }) {
  const meta  = await fetchMetaAndCtx()
  const asset = getAssetIndex(meta, coin)
  return updateLeverage({ hlAgentPk, hlVaultAddress, asset, leverage, isCross })
}
*/

export async function updateLeverage({ hlAgentPk, hlVaultAddress, asset, leverage, isCross = true }) {
  if (!leverage || leverage <= 0) return

  const wallet = privateKeyToAccount(hlAgentPk)
  const client = new ExchangeClient({
    wallet,
    transport: new HttpTransport(),
    defaultVaultAddress: hlVaultAddress?.trim() || undefined,
  })

  return client.updateLeverage({
    asset,
    isCross,
    leverage: Math.round(leverage),
  })
}

export async function updateLeverageByName({ hlAgentPk, hlVaultAddress, coin, leverage, isCross = true }) {
  const isXyz  = coin.startsWith('xyz:')
  const isHyna = coin.startsWith('hyna:')

  let asset

  if (isXyz || isHyna) {
    // Chercher l'index relatif dans le bon endpoint DEX
    const dex     = isXyz ? 'xyz' : 'hyna'
    const res     = await fetch(HL_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs', dex }),
    })
    const data    = await res.json()
    const universe = Array.isArray(data) ? data[0]?.universe : null
    const idx     = universe?.findIndex(u => u.name === coin) ?? -1
    if (idx === -1) throw new Error(`[HL] Coin inconnu dans universe DEX ${dex}: ${coin}`)

    // L'asset envoyé = index ABSOLU avec offset, comme dans placeOrder
    asset = (isXyz ? XYZ_OFFSET : XYZ_OFFSET) + idx  // ← même offset que getMarkets()
  } else {
    // Marché HL natif — fetchMetaAndCtx existant
    const meta = await fetchMetaAndCtx()
    asset      = getAssetIndex(meta, coin)
  }

  return updateLeverage({ hlAgentPk, hlVaultAddress, asset, leverage, isCross })
  // ← plus de dex dans updateLeverage
}

// passage d'ordre///////////////////////////////////////////////////////////////////////////////////
/*
export async function placeOrder(order, credentials) {
  const { isBuy, size, limitPrice, orderType, reduceOnly, market, tpSlConfig } = order  // ← tpSlConfig ajouté
  const { hlAgentPk, hlVaultAddress, hlAddress } = credentials
  if (!hlAgentPk) throw new Error('Clé agent HL manquante')
  if (market.assetIndex === null) throw new Error(`Index non résolu pour ${market.label}`)

  const roundedPrice = roundToHLPrice(limitPrice)
  const roundedSize  = parseFloat(size.toFixed(market.szDecimals ?? 6))
  const wallet       = privateKeyToAccount(hlAgentPk)
  const isMaker      = !orderType || orderType === 'maker'
  const tif          = isMaker ? 'Gtc' : 'FrontendMarket'

  const rawAggressivePrice = isMaker
  ? roundedPrice
  : isBuy
    ? roundedPrice * 1.05
    : roundedPrice * 0.95

  // Re-round APRÈS multiplication pour respecter le tick HL
  const aggressivePrice = roundToHLTick(rawAggressivePrice, market.szDecimals ?? 0)

  const client = new ExchangeClient({
    wallet, transport: new HttpTransport(),
    defaultVaultAddress: hlVaultAddress?.trim() || undefined,
  })

  const data = await client.order({
  orders: [{
    a: market.assetIndex,
    b: isBuy,
    p: aggressivePrice.toFixed(market.pxDecimals ?? 2),
    s: roundedSize.toFixed(market.szDecimals ?? 6),
    r: reduceOnly ?? false,
    t: { limit: { tif } },
  }],
  grouping: 'na',
})

if (tpSlConfig) {
  try {
    const szWire = roundedSize.toFixed(market.szDecimals ?? 6)

    const tpSlOrders = buildHlTpSlOrders({
      side:       isBuy ? 'long' : 'short',
      prices:     tpSlConfig.prices,
      assetIndex: market.assetIndex,
      size:       szWire,
      szDecimals: market.szDecimals ?? 0,
    })

    console.log('[HL] TP/SL orders:', JSON.stringify(tpSlOrders))

    const tpSlData = await client.order({
      orders:   tpSlOrders,
      grouping: 'positionTpsl',
    })

    console.log('[HL] TP/SL response:', JSON.stringify(tpSlData))

  } catch (e) {
    console.warn('[HL] TP/SL exception (ordre principal OK):', e.message)
  }
}

  const hlOid =
  data?.response?.data?.statuses?.[0]?.resting?.oid ??
  data?.response?.data?.statuses?.[0]?.filled?.oid ??
  null
  
  //return data
  return { ...data, resolvedOid: hlOid }
}
*/

export async function placeOrder(order, credentials) {
  const { isBuy, size, limitPrice, orderType, reduceOnly, market, tpSlConfig } = order
  const { hlAgentPk, hlVaultAddress } = credentials
  if (!hlAgentPk) throw new Error('Clé agent HL manquante')
  if (market.assetIndex === null) throw new Error(`Index non résolu pour ${market.label}`)

  const roundedPrice    = roundToHLPrice(limitPrice)
  const roundedSize     = parseFloat(size.toFixed(market.szDecimals ?? 6))
  const wallet          = privateKeyToAccount(hlAgentPk)
  const isMaker         = !orderType || orderType === 'maker'
  const tif             = isMaker ? 'Gtc' : 'FrontendMarket'
  const rawAggressive   = isMaker ? roundedPrice : isBuy ? roundedPrice * 1.05 : roundedPrice * 0.95
  const aggressivePrice = roundToHLTick(rawAggressive, market.szDecimals ?? 0)

  const client = new ExchangeClient({
    wallet, transport: new HttpTransport(),
    defaultVaultAddress: hlVaultAddress?.trim() || undefined,
  })

  const data = await client.order({
    orders: [{
      a: market.assetIndex,
      b: isBuy,
      p: aggressivePrice.toFixed(market.pxDecimals ?? 2),
      s: roundedSize.toFixed(market.szDecimals ?? 6),
      r: reduceOnly ?? false,
      t: { limit: { tif } },
    }],
    grouping: 'na',
  })

  // ← Guard erreur HL avant d'extraire l'oid
  const status0 = data?.response?.data?.statuses?.[0]
  if (status0?.error) throw new Error(`[HL] Order rejected: ${status0.error}`)

  if (tpSlConfig) {
    try {
      const szWire    = roundedSize.toFixed(market.szDecimals ?? 6)
      const tpSlOrders = buildHlTpSlOrders({
        side:       isBuy ? 'long' : 'short',
        prices:     tpSlConfig.prices,
        assetIndex: market.assetIndex,
        size:       szWire,
        szDecimals: market.szDecimals ?? 0,
      })
      const tpSlData = await client.order({ orders: tpSlOrders, grouping: 'positionTpsl' })
      console.log('[HL] TP/SL response:', JSON.stringify(tpSlData))
    } catch (e) {
      console.warn('[HL] TP/SL exception (ordre principal OK):', e.message)
    }
  }

  const hlOid = status0?.resting?.oid ?? status0?.filled?.oid ?? null
  return { ...data, resolvedOid: hlOid }
}

export async function enableAgentDexAbstraction(agentPrivateKey, vaultAddress = null) {
  const wallet = privateKeyToAccount(agentPrivateKey)
  const action = { type: 'agentEnableDexAbstraction' }
  const nonce  = Date.now()
  const signature = await signL1Action(
    vaultAddress ? { wallet, action, nonce, vaultAddress } : { wallet, action, nonce }
  )
  const body = { action, signature, nonce }
  if (vaultAddress) body.vaultAddress = vaultAddress
  const res = await fetch('https://api.hyperliquid.xyz/exchange', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const text = await res.text()
  let result
  try { result = JSON.parse(text) } catch { throw new Error(text) }
  if (result?.status === 'err') {
    const msg = result?.response ?? ''
    if (msg.includes('transition not allowed')) return result
    throw new Error(msg || 'Erreur agentEnableDexAbstraction')
  }
  return result
}

// ─── Stats fetch ──────────────────────────────────────────────────────────────

export async function fetchSubAccounts(address) {
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'subAccounts', user: address })
  })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function fetchFills(address, startTime) {
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'userFillsByTime', user: address, startTime, aggregateByTime: false })
  })
  if (!res.ok) throw new Error(`HL fills error (${res.status})`)
  return res.json()
}
/*
//avant tracking ordres
export function aggregateFills(fills, startTs, endTs) {
  const hl   = { pnlGross: 0, fees: 0, volume: 0, trades: 0 }
  const hip3 = { pnlGross: 0, fees: 0, volume: 0, trades: 0 }
  for (const f of fills) {
    if (f.time < startTs || f.time > endTs) continue
    const isHip3 = typeof f.coin === 'string' && f.coin.includes('xyz')
    const t = isHip3 ? hip3 : hl
    t.pnlGross += parseFloat(f.closedPnl || 0)
    t.fees     += parseFloat(f.fee       || 0)
    t.volume   += parseFloat(f.px || 0) * parseFloat(f.sz || 0)
    t.trades   += 1
  }
  return { hl, hip3 }
}
*/

export function aggregateFills(fills, startTs, endTs) {
  const hl   = { pnlGross: 0, fees: 0, volume: 0, trades: 0, rawTrades: [] }
  const hip3 = { pnlGross: 0, fees: 0, volume: 0, trades: 0, rawTrades: [] }

  for (const f of fills) {
    if (f.time < startTs || f.time > endTs) continue
    const isHip3 = typeof f.coin === 'string' && f.coin.includes('xyz')
    const t = isHip3 ? hip3 : hl
    t.pnlGross += parseFloat(f.closedPnl || 0)
    t.fees     += parseFloat(f.fee       || 0)
    t.volume   += parseFloat(f.px || 0) * parseFloat(f.sz || 0)
    t.trades   += 1
    // ← normalisation pour matchDnGroups
    t.rawTrades.push({
      ...f,
      timestamp: f.time,
      market:    f.coin,
      size:      Math.abs(parseFloat(f.sz || 0)),
      orderId:   f.oid ?? f.tid,
      pnlGross:  parseFloat(f.closedPnl || 0),
      fees:      parseFloat(f.fee       || 0),
    })
  }
  return { hl, hip3 }
}

//ajout Mode Chunked
// hyperliquid.js
// GET order status via /info endpoint
export async function getOrderStatus(orderId, credentials) {
  const { hlAddress } = credentials
  if (!orderId || !hlAddress) return null

  try {
    const res = await fetch('/api/hyperliquid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'orderStatus',
        user: hlAddress,
        oid: Number(orderId),
      }),
    })
    const data = await res.json()
    // Réponse : { status: "ok", order: { order: {...}, status: "open"|"filled"|"canceled"|"rejected" } }
    if (data?.status !== 'ok') return null

    const raw    = data.order
    const status = raw?.status  // "open" | "filled" | "canceled" | "rejected"
    const filled = parseFloat(raw?.order?.origSz ?? 0) - parseFloat(raw?.order?.sz ?? 0)

    return {
      status,                                     // "open" | "filled" | "canceled" | "rejected"
      filled,                                     // quantité remplie en asset
      remaining: parseFloat(raw?.order?.sz ?? 0), // quantité restante
      avgPx: parseFloat(raw?.order?.limitPx ?? 0),
    }
  } catch (e) {
    console.warn('[HL] getOrderStatus error:', e.message)
    return null
  }
}

/*
Les champs hlKey, extKey, nadoKey sont conservés en rétrocompat pendant la migration.
Une fois tous les consommateurs migrés vers market.keys?.hl etc.,
supprimer les anciens champs de buildMarket et de EMPTY_MARKET.
*/
