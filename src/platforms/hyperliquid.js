// src/platforms/hyperliquid.js
// Couvre Hyperliquid, trade.xyz (dex:'xyz') et HyENA

import {
  HL_KEY_OVERRIDES, MARKET_LABELS, inferCategory,
  EXT_KEY_OVERRIDES, NADO_KEY_OVERRIDES,
} from '../config/markets.js'
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid'
import { signL1Action } from '@nktkas/hyperliquid/signing'
import { privateKeyToAccount } from 'viem/accounts'
import { roundToHLPrice } from '../utils/trading.js'
import { buildHlTpSlAction } from '../utils/tpsl.js'   // ← ajout TP/SL

const HL_API = 'https://api.hyperliquid.xyz/info'
export const XYZ_OFFSET = 110_000

const _cache = new Map()
const _ttls = { hl_all: 300_000, hl_xyz: 300_000 }
const _DEF = 300_000
function getCached(k) { const e = _cache.get(k); return e && Date.now() - e.ts < (_ttls[k] ?? _DEF) ? e.d : null }
function setCached(k, d) { _cache.set(k, { d, ts: Date.now() }) }


//helpers //////////////////////////////////////////////////////////////////////////////////////////
// Ajouter cette fonction en haut du fichier (à côté de roundToHLPrice)
function roundToHLTick(price, szDecimals = 0) {
  // HL : max 5 chiffres significatifs + max (6 - szDecimals) décimales
  const maxDecimals  = Math.max(0, 6 - szDecimals)
  const sigFigDec    = price > 0
    ? Math.max(0, 5 - Math.floor(Math.log10(Math.abs(price))) - 1)
    : 0
  const decimals = Math.min(maxDecimals, sigFigDec)
  return parseFloat(price.toFixed(decimals))
}


//infos HL //////////////////////////////////////////////////////////////////////////////////////
async function fetchUniverse(body) {
  const res = await fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`HL ${res.status}`)
  const data = await res.json()
  const [meta] = Array.isArray(data) ? data : [null]
  return new Set((meta?.universe || []).map(a => a.name))
}

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
        const market = markets.find(m => m.hlKey === coin)
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

//update Leverage////////////////////////////////////////////////////////////////////////////////////
export async function updateLeverage({ hlAgentPk, hlAddress, asset, leverage, isCross = true }) {
if (!leverage || leverage <= 0) return
const nonce = Date.now()
const action = { type: 'updateLeverage', asset, isCross, leverage: Math.round(leverage) }
const wallet = privateKeyToAccount(hlAgentPk)
const sig = await signL1Action({ wallet, action, nonce })
//const sig = await signAction(action, nonce, hlAgentPk)
const res = await fetch(HL_EXCHANGE, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ action, nonce, signature: sig, vaultAddress: hlAddress }),
})
const data = await res.json()
if (data?.status !== 'ok') throw new Error(`[HL] updateLeverage: ${JSON.stringify(data)}`)
console.log('[HL] Leverage set:', data)
return data
}

// ── updateLeverageByName : wrapper coin → assetIndex ─────────────────────────
export async function updateLeverageByName({ hlAgentPk, hlAddress, coin, leverage, isCross = true }) {
const meta = await fetchMetaAndCtx()
const asset = getAssetIndex(meta, coin)
return updateLeverage({ hlAgentPk, hlAddress, asset, leverage, isCross })
}

// passage d'ordre///////////////////////////////////////////////////////////////////////////////////
export async function placeOrder(order, credentials) {
  const { isBuy, size, limitPrice, orderType, reduceOnly, market, tpSlConfig } = order  // ← tpSlConfig ajouté
  const { hlAgentPk, hlVaultAddress } = credentials
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

  // ← await ajouté pour enchaîner le TP/SL
  /*
  const data = await client.order({
    orders: [{
      a: market.assetIndex,
      b: isBuy,
      p: roundedPrice.toFixed(market.pxDecimals ?? 2),
      s: roundedSize.toFixed(market.szDecimals ?? 6),
      r: reduceOnly ?? false,
      t: { limit: { tif: isMaker ? 'Gtc' : 'Ioc' } },
    }],
    grouping: 'na',
  })
  */

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

  // ── TP/SL : requête séparée après l'ordre principal ← ajout depuis nouveau fichier
  if (tpSlConfig) {
    const isXyz  = market.hlKey?.startsWith('xyz:')
    const szWire = roundedSize.toFixed(market.szDecimals ?? 6)
    try {
      const tpSlAction = buildHlTpSlAction({
        side:       isBuy ? 'long' : 'short',
        prices:     tpSlConfig.prices,
        assetIndex: market.assetIndex,
        size:       szWire,
      })
      const tpSlNonce = Date.now()
      const tpSlSig   = await signL1Action({ wallet, action: tpSlAction, nonce: tpSlNonce })

      console.log('[HL] TP/SL payload:', JSON.stringify({ action: tpSlAction, nonce: tpSlNonce }))

      const tpSlRes  = await fetch('https://api.hyperliquid.xyz/exchange', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: tpSlAction, nonce: tpSlNonce, signature: tpSlSig,
          vaultAddress: hlVaultAddress ?? undefined,
          ...(isXyz ? { dex: 'xyz' } : {}),
        }),
      })
      const tpSlData = await tpSlRes.json()
      console.log('[HL] TP/SL response:', JSON.stringify(tpSlData))

      if (tpSlData?.status !== 'ok') {
        console.warn('[HL] TP/SL placement échoué (ordre principal OK):', JSON.stringify(tpSlData))
      }
    } catch (e) {
      console.warn('[HL] TP/SL exception (ordre principal OK):', e.message)
    }
  }

  return data
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
