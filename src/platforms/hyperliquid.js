// src/platforms/hyperliquid.js

import { privateKeyToAccount } from 'viem/accounts'
import { encodeAbiParameters, keccak256, toBytes } from 'viem'
import { buildHlTpSlAction }   from '../utils/tpsl.js'

const HL_INFO     = 'https://api.hyperliquid.xyz/info'
const HL_EXCHANGE = 'https://api.hyperliquid.xyz/exchange'

// ── Meta cache + singleton fetch ─────────────────────────────────────────────

const META_TTL_MS    = 5 * 60 * 1000
const META_RETRY_MS  = 300
const META_MAX_RETRY = 2

let _metaCache        = null
let _metaFetchPromise = null

async function fetchMetaAndCtx() {
  if (_metaCache && Date.now() - _metaCache.ts < META_TTL_MS) return _metaCache.data
  if (_metaFetchPromise) return _metaFetchPromise

  _metaFetchPromise = (async () => {
    let lastErr
    for (let attempt = 0; attempt <= META_MAX_RETRY; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, META_RETRY_MS * attempt))
      try {
        const res  = await fetch(HL_INFO, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ type: 'metaAndAssetCtxs' }),
        })
        if (!res.ok) throw new Error(`/info metaAndAssetCtxs → HTTP ${res.status}`)
        const data = await res.json()
        _metaCache = { data, ts: Date.now() }
        return data
      } catch (e) { lastErr = e }
    }
    if (_metaCache) {
      console.warn('[HL] /info dégradé — cache stale utilisé:', lastErr.message)
      return _metaCache.data
    }
    throw lastErr
  })()

  try     { return await _metaFetchPromise }
  finally { _metaFetchPromise = null }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAssetIndex(meta, coin) {
  const idx = meta[0].universe.findIndex(u => u.name === coin)
  if (idx === -1) throw new Error(`[HL] Coin inconnu dans la meta : ${coin}`)
  return idx
}

function floatToWire(x, szDecimals) {
  const rounded = Number(x.toFixed(szDecimals))
  if (Math.abs(rounded) >= 1e15) throw new Error(`[HL] prix/taille trop grand : ${x}`)
  let s = rounded.toFixed(szDecimals)
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '')
  if (s === '-0') s = '0'
  return s
}

function orderToAction(coin, isBuy, limitPx, sz, reduceOnly, tif, cloid) {
  return {
    type: 'order',
    orders: [{
      a:  coin,
      b:  isBuy,
      p:  String(limitPx),
      s:  String(sz),
      r:  reduceOnly ?? false,
      t:  { limit: { tif } },
      ...(cloid ? { c: cloid } : {}),
    }],
    grouping: 'na',
  }
}

async function signAction(action, nonce, agentPk) {
  const account = privateKeyToAccount(agentPk)
  const phantomAgent = {
    source:    'a',
    connectionId: keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'uint64' }],
        [keccak256(toBytes(JSON.stringify(action))), BigInt(nonce)]
      )
    ),
  }
  const signature = await account.signTypedData({
    domain: {
      name:              'Exchange',
      version:           '1',
      chainId:           1337,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      Agent: [
        { name: 'source',       type: 'string'  },
        { name: 'connectionId', type: 'bytes32'  },
      ],
    },
    primaryType: 'Agent',
    message: phantomAgent,
  })
  return signature
}

// ── Exports publics ───────────────────────────────────────────────────────────

export async function getMarkets() {
  const meta = await fetchMetaAndCtx()
  const discoveredMarkets = new Map()
  const prices     = {}
  const stepSizes  = {}
  const assetMeta  = {}

  meta[0].universe.forEach((u, i) => {
    const ctx   = meta[1][i]
    const price = parseFloat(ctx?.midPx ?? ctx?.markPx ?? 0)
    const step  = Math.pow(10, -(u.szDecimals ?? 2))

    discoveredMarkets.set(u.name, {
      id:       u.name,
      hlKey:    u.name,
      label:    u.name,
      category: 'Crypto',
    })

    if (price) prices[u.name] = price
    stepSizes[u.name] = step
    assetMeta[u.name] = {
      szDecimals:   u.szDecimals   ?? 2,
      maxLeverage:  u.maxLeverage  ?? 50,
    }
  })

  return { discoveredMarkets, prices, stepSizes, assetMeta }
}

/*
export async function getPrices() {
  const meta = await fetchMetaAndCtx()
  const priceMap = {}
  meta[0].universe.forEach((u, i) => {
    const ctx   = meta[1][i]
    const price = parseFloat(ctx?.midPx ?? ctx?.markPx ?? 0)
    if (price) priceMap[u.name] = price
  })
  return priceMap   // ← retourne le map plat directement, sans wrapper
}
*/

export async function getPrecision() {
  const meta = await fetchMetaAndCtx()
  const precisionMap = {}
  meta[0].universe.forEach((u, i) => {
    precisionMap[u.name] = { szDecimals: u.szDecimals, pxDecimals: 6 }
  })
  return precisionMap
}

export async function getFunding(hlKey) {
  if (!hlKey) return { fundingRate: null, bid: null, ask: null }
  try {
    const meta = await fetchMetaAndCtx()
    const idx  = meta[0].universe.findIndex(u => u.name === hlKey)
    if (idx === -1) return { fundingRate: null, bid: null, ask: null }
    const ctx = meta[1][idx]
    return {
      fundingRate: parseFloat(ctx?.funding ?? null),
      bid:         null,
      ask:         null,
    }
  } catch { return { fundingRate: null, bid: null, ask: null } }
}

export async function getMargin(credentials) {
  const { hlAddress } = credentials
  if (!hlAddress?.trim()) return null
  try {
    const res  = await fetch(HL_INFO, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'clearinghouseState', user: hlAddress.trim() }),
    })
    const data = await res.json()
    return parseFloat(data?.crossMarginSummary?.accountValue ?? 0)
  } catch { return null }
}

export async function getPositions(credentials, markets = []) {
  const { hlAddress } = credentials
  if (!hlAddress?.trim()) return []
  try {
    const res  = await fetch(HL_INFO, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'clearinghouseState', user: hlAddress.trim() }),
    })
    const data = await res.json()
    return (data?.assetPositions || [])
      .filter(p => parseFloat(p.position?.szi ?? 0) !== 0)
      .map(p => {
        const pos    = p.position
        const szi    = parseFloat(pos.szi)
        const market = markets.find(m => m.hlKey === pos.coin)
        return {
          platform: 'hyperliquid', coin: pos.coin,
          marketId: market?.id ?? null, label: market?.label ?? pos.coin,
          side: szi > 0 ? 'LONG' : 'SHORT', szi: Math.abs(szi),
          entryPx: parseFloat(pos.entryPx ?? 0),
          unrealizedPnl: parseFloat(pos.unrealizedPnl ?? 0),
        }
      })
  } catch (e) { console.warn('[HL] getPositions:', e.message); return [] }
}

export async function updateLeverage({ hlAgentPk, hlAddress, asset, leverage, isCross = true }) {
  if (!leverage || leverage <= 0) return
  const nonce  = Date.now()
  const action = { type: 'updateLeverage', asset, isCross, leverage: Math.round(leverage) }
  const sig    = await signAction(action, nonce, hlAgentPk)
  const res    = await fetch(HL_EXCHANGE, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action, nonce, signature: sig, vaultAddress: hlAddress }),
  })
  const data = await res.json()
  if (data?.status !== 'ok') throw new Error(`[HL] updateLeverage: ${JSON.stringify(data)}`)
  console.log('[HL] Leverage set:', data)
  return data
}

// ── getBidAsk : bid/ask estimé depuis le mid ──────────────────────────────────
// metaAndAssetCtxs ne fournit pas le carnet d'ordres → bid = ask = midPx
export async function getBidAsk(hlKey) {
  if (!hlKey) return { bid: null, ask: null }
  try {
    const meta = await fetchMetaAndCtx()
    const idx  = meta[0].universe.findIndex(u => u.name === hlKey)
    if (idx === -1) return { bid: null, ask: null }
    const ctx = meta[1][idx]
    const mid = parseFloat(ctx?.midPx ?? 0)
    return { bid: mid || null, ask: mid || null }
  } catch { return { bid: null, ask: null } }
}

// ── updateLeverageByName : wrapper coin → assetIndex ─────────────────────────
export async function updateLeverageByName({ hlAgentPk, hlAddress, coin, leverage, isCross = true }) {
  const meta  = await fetchMetaAndCtx()
  const asset = getAssetIndex(meta, coin)
  return updateLeverage({ hlAgentPk, hlAddress, asset, leverage, isCross })
}

// ── Place order ───────────────────────────────────────────────────────────────

export async function placeOrder(order, credentials) {
  const { isBuy, limitPrice, orderType, reduceOnly, market, leverage, tpSlConfig } = order
  const { hlAgentPk, hlAddress } = credentials
  if (!hlAgentPk || !hlAddress) throw new Error('Clé agent ou adresse HL manquante')

  const meta       = await fetchMetaAndCtx()
  const assetIndex = getAssetIndex(meta, market.hlKey)
  const { szDecimals } = meta[0].universe[assetIndex]

  if (leverage != null && leverage > 0) {
    await updateLeverage({ hlAgentPk, hlAddress, asset: assetIndex, leverage, isCross: false })
  }

  const isMaker  = orderType !== 'taker'
  const tif      = isMaker ? 'Gtc' : 'FrontendMarket'
  const pricePx  = limitPrice

  const szWire = floatToWire(order.size, szDecimals)
  const pxWire = floatToWire(pricePx, 6)

  const action = orderToAction(assetIndex, isBuy, pxWire, szWire, reduceOnly, tif)
  const nonce  = Date.now()
  const sig    = await signAction(action, nonce, hlAgentPk)

  console.log('[HL] placeOrder payload:', JSON.stringify({ action, nonce }))

  const res  = await fetch(HL_EXCHANGE, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action, nonce, signature: sig, vaultAddress: hlAddress }),
  })
  const data = await res.json()
  console.log('[HL] response:', JSON.stringify(data))

  const status = data?.response?.data?.statuses?.[0]
  if (data?.status !== 'ok' || (status && typeof status === 'object' && status.error)) {
    throw new Error(`[HL] ${status?.error ?? JSON.stringify(data)}`)
  }

  // ── TP/SL : requête séparée après l'ordre principal ───────────────────────
  if (tpSlConfig) {
    try {
      const tpSlAction = buildHlTpSlAction({
        side:       isBuy ? 'long' : 'short',
        prices:     tpSlConfig.prices,
        assetIndex,
        size:       szWire,
      })
      const tpSlNonce = Date.now()
      const tpSlSig   = await signAction(tpSlAction, tpSlNonce, hlAgentPk)

      console.log('[HL] TP/SL payload:', JSON.stringify({ action: tpSlAction, nonce: tpSlNonce }))

      const tpSlRes  = await fetch(HL_EXCHANGE, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: tpSlAction, nonce: tpSlNonce, signature: tpSlSig, vaultAddress: hlAddress }),
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
