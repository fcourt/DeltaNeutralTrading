// src/platforms/extended.js
// Absorbe : adapter/extended.js + useExtendedL2Config.js + signing Stark

import { ec, hash, shortString } from 'starknet'
import { EXT_KEY_TO_ID } from '../config/markets.js'
//import { buildExtendedTpSl }     from '../utils/tpsl.js' // ← nouveau

const EXT_PROXY           = '/api/extended'
const CACHE_TTL_MS        = 60 * 60 * 1000
const _PRICE_TTL = 5_000 // 5s cache pour les prix
const SERVER_CLOCK_OFFSET_S = 14 * 24 * 3600
const ORDER_SELECTOR      = '0x36da8d51815527cabfaa9c982f564c80fa7429616739306036f1f9b608dd112'
const DOMAIN_SELECTOR     = '0x1ff2f602e42168014d405a94f75e8a93d640751d71d16311266e140d8b0a210'
const STARK_PRIME         = BigInt('0x800000000000011000000000000000000000000000000000000000000000001')

const _cache = new Map()
const _ttls  = { extended_keys: 300_000, ext_l2configs: CACHE_TTL_MS, ext_prices: 5_000 }
const _DEF   = 300_000
function getCached(k)    { const e = _cache.get(k); return e && Date.now() - e.ts < (_ttls[k] ?? _DEF) ? e.d : null }
function setCached(k, d) { _cache.set(k, { d, ts: Date.now() }) }

function pxDecimalsFromMinPrice(v) {
  const n = parseFloat(v)
  if (!n || n <= 0) return 2
  return Math.max(0, Math.round(-Math.log10(n)))
}

function signedToFelt252(n) { const b = BigInt(n); return '0x' + (b < 0n ? STARK_PRIME + b : b).toString(16) }
function uintToFelt252(n)   { return '0x' + BigInt(n).toString(16) }

function computeDomainHash(name, version, chainId, revision) {
  return hash.computePoseidonHashOnElements([
    DOMAIN_SELECTOR,
    shortString.encodeShortString(name),
    shortString.encodeShortString(version),
    shortString.encodeShortString(chainId),
    uintToFelt252(revision),
  ])
}

function computeOrderHash(positionId, baseAssetId, baseAmount, quoteAssetId, quoteAmount, feeAssetId, feeAmount, expiration, salt) {
  return hash.computePoseidonHashOnElements([
    ORDER_SELECTOR, uintToFelt252(positionId), baseAssetId,
    signedToFelt252(baseAmount), quoteAssetId, signedToFelt252(quoteAmount),
    feeAssetId, uintToFelt252(feeAmount), uintToFelt252(expiration), uintToFelt252(salt),
  ])
}

function computeMessageHash(domainHash, starkKey, orderHash) {
  return hash.computePoseidonHashOnElements([
    shortString.encodeShortString('StarkNet Message'), domainHash, starkKey, orderHash,
  ])
}

function parseQuantum(valueStr, resolution) {
  const resPow = Math.round(Math.log10(resolution))
  const [intPart, decPart = ''] = String(valueStr).split('.')
  const dec = decPart.padEnd(resPow, '0').slice(0, resPow)
  return parseInt(intPart, 10) * resolution + (dec ? parseInt(dec, 10) : 0)
}

function parseCollateral(syntheticAbs, priceStr, collatRes, synthRes) {
  const extraDec = Math.round(Math.log10(collatRes / synthRes))
  const [pInt, pDec = ''] = String(priceStr).split('.')
  const pDecNorm    = pDec.padEnd(extraDec, '0').slice(0, extraDec)
  const ratio       = collatRes / synthRes
  const priceScaled = parseInt(pInt, 10) * ratio
                    + (extraDec > 0 ? parseInt(pDecNorm || '0', 10) : 0)
  return syntheticAbs * priceScaled
}

function generateNonce()   { return Math.floor(Math.random() * (2 ** 31 - 1)) + 1 }
function generateOrderId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Public helpers
// ─────────────────────────────────────────────────────────────────────────────

// ── Interface unifiée attendue par les services ───────────────────────────────

export function canTrade(credentials) {
  return !!credentials.extStarkPk && !!credentials.extL2Vault
}

// roundPrice — utilisé par OpenTrade.getDefaultLimitPrice
export const roundPrice = (p) => p  // Extended : pas d'arrondi spécifique

// getSzDecimals — utilisé par OpenTrade.buildOrderParams
export function getSzDecimals(market, meta, stepSize) {
  // Extended utilise raw tel quel — szDecimals depuis l2Config via getPrices()
  return meta?.szDecimals ?? 5
}

// ─────────────────────────────── Interface unifiée attendue par les services ──

// extended.js — getMarkets() unifié
export async function getMarkets() {
  const cached = getCached('extended_keys')
  if (cached) return cached

  const res  = await fetch(`${EXT_PROXY}?endpoint=/info/markets`)
  if (!res.ok) throw new Error(`Extended /info/markets → ${res.status}`)
  const data = await res.json()

  const discoveredMarkets = new Map()
  const priceMap = {}, precisionMap = {}

  ;(data.data || []).forEach(m => {
    if (!m.name) return
    const extKey = m.name  // ex: 'BTC-USD', 'XAG-USD', 'TECH100m-USD'

    // Retrouve l'id canonique via KEY_OVERRIDES.ext (inverse) ou supprime le suffixe
    const id = EXT_KEY_TO_ID[extKey] ?? extKey.replace(/-USD$/, '').replace(/_24_5-USD$/, '')

    if (!discoveredMarkets.has(id)) {
      discoveredMarkets.set(id, {
        id,
        label: id,
        category: m.category ?? 'Crypto',  // Extended expose la catégorie
        keys: { ext: extKey },
      })
    }

    const price = parseFloat(m.marketStats?.lastPrice || 0)
    if (price) priceMap[extKey] = price
    precisionMap[extKey] = {
      szDecimals: m.assetPrecision ?? 5,
      pxDecimals: pxDecimalsFromMinPrice(m.tradingConfig?.minPriceChange) ?? 2,
    }
  })

  const result = { discoveredMarkets, priceMap, precisionMap }
  setCached('extended_keys', result)
  return result
}

/*
export async function getMarkets() {
  const cached = getCached('extended_keys')
  if (cached) return cached
  const res  = await fetch(`${EXT_PROXY}?endpoint=${encodeURIComponent('/info/markets')}`)
  if (!res.ok) throw new Error(`Extended /info/markets → ${res.status}`)
  const data = await res.json()
  const keys = new Set((data.data || []).map(m => m.name).filter(Boolean))
  setCached('extended_keys', keys)
  return keys
}
*/

/*
export async function getPrices() {
  const res  = await fetch(`${EXT_PROXY}?endpoint=${encodeURIComponent('/info/markets')}`)
  const data = await res.json()
  const priceMap = {}, precisionMap = {}
  ;(data.data || []).forEach(m => {
    if (!m.name) return
    const price = parseFloat(m.marketStats?.lastPrice || 0)
    if (price) priceMap[m.name] = price
    precisionMap[m.name] = {
      szDecimals: m.assetPrecision ?? m.quantityPrecision ?? 5,
      pxDecimals: m.pricePrecision ?? pxDecimalsFromMinPrice(m.tradingConfig?.minPriceChange) ?? 2,
    }
  })
  return { priceMap, precisionMap }
}
*/

/*
export async function getPrices() {
  const cached = getCached('ext_prices')
  if (cached) return cached

  try {
    // ← même format non-encodé que loadL2Configs
    const res = await fetch(`${EXT_PROXY}?endpoint=/info/markets`)
    if (!res.ok) throw new Error(`Extended /info/markets → ${res.status}`)

    const data = await res.json()
    if (data?.status === 'ERROR') throw new Error(data?.error?.message || 'Extended API error')

    const priceMap = {}, precisionMap = {}
    ;(data.data || []).forEach(m => {
      if (!m.name) return
      const price = parseFloat(m.marketStats?.lastPrice || 0)
      if (price) priceMap[m.name] = price
      precisionMap[m.name] = {
        szDecimals: m.assetPrecision ?? m.quantityPrecision ?? 5,
        pxDecimals: m.pricePrecision ?? pxDecimalsFromMinPrice(m.tradingConfig?.minPriceChange) ?? 2,
      }
    })

    const result = { priceMap, precisionMap }
    setCached('ext_prices', result)  // ← ajoute 'ext_prices': 5_000 dans _ttls
    return result

  } catch (e) {
    console.warn('[Extended] getPrices error:', e.message)
    return { priceMap: {}, precisionMap: {} }
  }
}
*/

// extended.js — getPrices redirige vers getMarkets (évite le double fetch)
export async function getPrices() {
  const { priceMap, precisionMap } = await getMarkets()
  return { priceMap, precisionMap }
}

/* avant migration "dynamique"
export async function getFunding(extKey, apiKey) {
  if (!extKey || !apiKey) return { fundingRate: null, bid: null, ask: null }
  try {
    const res    = await fetch(`${EXT_PROXY}?endpoint=${encodeURIComponent('/info/markets')}`, { headers: { 'X-Api-Key': apiKey } })
    if (!res.ok) return { fundingRate: null, bid: null, ask: null }
    const data   = await res.json()
    const market = (data.data || []).find(m => m.name === extKey)
    if (!market) return { fundingRate: null, bid: null, ask: null }
    return {
      fundingRate: parseFloat(market.marketStats?.fundingRate ?? null),
      bid:         parseFloat(market.marketStats?.bidPrice   ?? null),
      ask:         parseFloat(market.marketStats?.askPrice   ?? null),
    }
  } catch { return { fundingRate: null, bid: null, ask: null } }
}
*/
// Signature unifiée : (market, credentials)
export async function getFundingRate(market, credentials) {
  const extKey = market.keys?.ext
  const apiKey = credentials.extApiKey
  if (!extKey || !apiKey) return { rate: null, bid: null, ask: null }
  try {
    const res  = await fetch(
      `${EXT_PROXY}?endpoint=${encodeURIComponent('/info/markets')}`,
      { headers: { 'X-Api-Key': apiKey } }
    )
    if (!res.ok) return { rate: null, bid: null, ask: null }
    const data = await res.json()
    const m    = (data.data || []).find(m => m.name === extKey)
    if (!m) return { rate: null, bid: null, ask: null }
    return {
      rate: parseFloat(m.marketStats?.fundingRate ?? null),
      bid:  parseFloat(m.marketStats?.bidPrice   ?? null),
      ask:  parseFloat(m.marketStats?.askPrice   ?? null),
    }
  } catch { return { rate: null, bid: null, ask: null } }
}


export async function getMargin(credentials) {
  const { extApiKey } = credentials
  if (!extApiKey?.trim()) return null
  const res  = await fetch(`${EXT_PROXY}?endpoint=${encodeURIComponent('/user/balance')}`, { headers: { 'X-Api-Key': extApiKey } })
  const data = await res.json()
  return parseFloat(data?.data?.availableForTrade ?? 0)
}

export async function getPositions(credentials, markets = []) {
  const { extApiKey } = credentials
  if (!extApiKey?.trim()) return []
  try {
    const res  = await fetch(`${EXT_PROXY}?endpoint=${encodeURIComponent('/user/positions')}`, { headers: { 'X-Api-Key': extApiKey } })
    const data = await res.json()
    return (data?.data || []).map(p => {
      //const market = markets.find(m => m.extKey === p.market)
      const market = markets.find(m => m.keys?.ext === p.market)
      return {
        platform: 'extended', coin: p.market,
        marketId: market?.id ?? null, label: market?.label ?? p.market,
        side: p.side, szi: parseFloat(p.size),
        entryPx: parseFloat(p.openPrice), unrealizedPnl: parseFloat(p.unrealisedPnl ?? 0),
      }
    })
  } catch (e) { console.warn('Extended getPositions:', e.message); return [] }
}

export async function loadL2Configs() {
  const cached = getCached('ext_l2configs')
  if (cached) return cached

  try {
    const stored = JSON.parse(localStorage.getItem('ext_l2configs_cache') || 'null')
    if (stored && Date.now() - stored.ts < CACHE_TTL_MS) {
      setCached('ext_l2configs', stored.configs)
      return stored.configs
    }
  } catch { /* ignore */ }

  const res  = await fetch(`${EXT_PROXY}?endpoint=/info/markets`)
  const data = await res.json()
  const configs = {}
  for (const m of (data?.data || [])) {
    const l2 = m.l2Config || {}, tc = m.tradingConfig || {}
    configs[m.name] = {
      syntheticId:          l2.syntheticId,
      syntheticResolution:  l2.syntheticResolution,
      collateralResolution: l2.collateralResolution,
      collateralId:         l2.collateralId ?? '0x1',
      szDecimals:           m.assetPrecision ?? 0,
      pxDecimals:           pxDecimalsFromMinPrice(tc.minPriceChange),
    }
  }
  setCached('ext_l2configs', configs)
  try { localStorage.setItem('ext_l2configs_cache', JSON.stringify({ ts: Date.now(), configs })) } catch { /* ignore */ }
  return configs
}

// ─────────────────────────────────────────────────────────────────────────────
// Leverage — PATCH /api/v1/user/leverage
// ─────────────────────────────────────────────────────────────────────────────

/* avant migration "dynamique"
export async function setLeverage(marketKey, leverage, apiKey) {
  if (!leverage || leverage <= 0 || !marketKey || !apiKey) return
  const res = await fetch(
    `${EXT_PROXY}?endpoint=${encodeURIComponent('/user/leverage')}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'User-Agent': 'TrekApp/1.0',
      },
      body: JSON.stringify({ market: marketKey, leverage: Math.round(leverage) }),
    }
  )
  const data = await res.json()
  if (!res.ok || data?.status === 'ERROR')
    throw new Error(data?.error?.message || `Extended setLeverage HTTP ${res.status}`)
  console.log('[Extended] Leverage set:', data?.data)
  return data?.data
}
*/

// Signature unifiée : { market, leverage, credentials }
export async function setLeverage({ market, leverage, credentials }) {
  const marketKey = market.keys?.ext
  const apiKey    = credentials.extApiKey
  if (!leverage || leverage <= 0 || !marketKey || !apiKey) return
  const res = await fetch(
    `${EXT_PROXY}?endpoint=${encodeURIComponent('/user/leverage')}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'User-Agent': 'TrekApp/1.0',
      },
      body: JSON.stringify({ market: marketKey, leverage: Math.round(leverage) }),
    }
  )
  const data = await res.json()
  if (!res.ok || data?.status === 'ERROR')
    throw new Error(data?.error?.message || `Extended setLeverage HTTP ${res.status}`)
  return data?.data
}

//------------------------------------------------------------------------------
// TP/SL
//------------------------------------------------------------------------------
// Signe un ordre de fermeture TP ou SL (reduce-only)
async function signTpSlSettlement({
  extStarkPk,
  vaultId,
  side,           // 'long' | 'short' — la position à FERMER
  size,           // taille en unités asset (ex: 0.01 BTC)
  triggerPrice,   // prix du TP ou SL
  marketL2Config, // { syntheticId, syntheticResolution, collateralId, collateralResolution }
  feeRate = 0.0005,
  expiryEpochMs,  // timestamp ms
  salt,           // nonce unique
}) {
  const { syntheticId, syntheticResolution, collateralId, collateralResolution } = marketL2Config

  // Fermer un LONG = SELL synthetic → baseAmount négatif, quoteAmount positif
  // Fermer un SHORT = BUY synthetic → baseAmount positif, quoteAmount négatif
  const sign       = side === 'long' ? -1n : 1n
  const baseAmount = BigInt(Math.round(size * syntheticResolution)) * sign
  const quoteRaw   = BigInt(Math.round(size * triggerPrice * collateralResolution))
  const quoteAmount = quoteRaw * -sign
  const feeAmount  = BigInt(Math.ceil(Number(quoteRaw) * feeRate))

  //const expirationHours = Math.ceil(expiryEpochMs / 1000 / 3600)
  const expirationSecs = Math.ceil(expiryEpochMs / 1000) + SERVER_CLOCK_OFFSET_S

  const orderHash = computeOrderHash(
    vaultId,
    syntheticId,
    baseAmount,
    collateralId,
    quoteAmount,
    collateralId,
    feeAmount,
    //expirationHours,
    expirationSecs,
    salt,
  )

  //const msgHash  = computeMessageHash(orderHash)  // même helper que l'ordre principal
  const starkKey = ec.starkCurve.getStarkKey(extStarkPk)
  const domainHash = computeDomainHash('Perpetuals', 'v0', 'SN_MAIN', 1)
  const msgHash = computeMessageHash(domainHash, starkKey, orderHash)
  const sig      = ec.starkCurve.sign(msgHash, extStarkPk)


  console.log('[Extended] TP/SL signing:', {
  vaultId: vaultId.toString(),
  syntheticId,
  collateralId,
  baseAmount: baseAmount.toString(),
  quoteAmount: quoteAmount.toString(),
  feeAmount: feeAmount.toString(),
  expirationSecs,
  salt,
  })

  // Dans signTpSlSettlement — ajoute ce log pour confirmer
console.log('[Extended] expiryEpochMs reçu:', expiryEpochMs)
console.log('[Extended] expirationSecs calculé:', Math.ceil(expiryEpochMs / 1000) + SERVER_CLOCK_OFFSET_S)
// Doit correspondre à debugInfo "seconds": "0x6a1929fb" = 1779834363
  
  return {
    starkKey,
    collateralPosition: String(vaultId),
    signature: {
      r: '0x' + sig.r.toString(16).padStart(64, '0'),
      s: '0x' + sig.s.toString(16).padStart(64, '0'),
    },
  }
}


async function buildExtendedTpSl({
  side,
  prices,
  size,
  extStarkPk,
  vaultId,
  marketL2Config,
  feeRate    = 0.0005,
  expiryEpochMs,
  saltBase,      // nonce de base — +1 pour TP, +2 pour SL
  pxDecimals = 2,
  isTradFi = false,   // ← nouveau paramètre
}) {
  const isLong    = side === 'long'

  const rawTp     = isLong ? prices.upPrice   : prices.downPrice
  const rawSl     = isLong ? prices.downPrice : prices.upPrice
  
  //const tpTrigger = isLong ? prices.upPrice   : prices.downPrice
  //const slTrigger = isLong ? prices.downPrice : prices.upPrice
  // ← Arrondir ICI pour que prix signé = prix dans le payload
  const tpTrigger = parseFloat(rawTp.toFixed(pxDecimals))
  const slTrigger = parseFloat(rawSl.toFixed(pxDecimals))
  
  const triggerPriceType = isTradFi ? 'MARK' : 'LAST'   // ← adaptatif

  const [tpSettlement, slSettlement] = await Promise.all([
    signTpSlSettlement({
      extStarkPk, vaultId, side, size,
      triggerPrice:  tpTrigger,
      triggerPriceType,   // ← ici
      marketL2Config, feeRate, expiryEpochMs,
      //salt: saltBase + 1,
      salt: saltBase,
    }),
    signTpSlSettlement({
      extStarkPk, vaultId, side, size,
      triggerPrice:  slTrigger,
      triggerPriceType,   // ← ici
      marketL2Config, feeRate, expiryEpochMs,
      //salt: saltBase + 2,
      salt: saltBase,
    }),
  ])

  return {
    tpSlType: 'ORDER',
    takeProfit: {
      triggerPrice: String(tpTrigger),
      //triggerPrice:     String(tpTrigger.toFixed(pxDecimals)),
      //triggerPriceType: 'LAST',
      triggerPriceType,
      price:            String(tpTrigger.toFixed(pxDecimals)),
      priceType:        'MARKET',
      settlement:       tpSettlement,
    },
    stopLoss: {
      triggerPrice: String(slTrigger),
      //triggerPrice:     String(slTrigger.toFixed(pxDecimals)),
      //triggerPriceType: 'LAST',
      triggerPriceType,   // ← ici
      price:            String(slTrigger.toFixed(pxDecimals)),
      priceType:        'MARKET',
      settlement:       slSettlement,
    },
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Place order
// ─────────────────────────────────────────────────────────────────────────────

export async function placeOrder(order, credentials) {
  //const { isBuy, limitPrice, orderType, reduceOnly, market, leverage } = order
  const { isBuy, limitPrice, orderType, reduceOnly, market, leverage, tpSlConfig } = order
  const { extStarkPk, extL2Vault, extApiKey } = credentials
  if (!extStarkPk || !extL2Vault) throw new Error('Clé Stark ou l2Vault manquant pour Extended')

  const L2_CONFIGS = await loadL2Configs()
  const l2Config   = L2_CONFIGS[market.keys?.ext]
  if (!l2Config) throw new Error(`Marché non supporté par Extended : ${market.keys?.ext}`)

  /*
  // ── Levier : applique sur la plateforme avant de signer ───────────────────
  if (leverage != null && leverage > 0) {
    await setLeverage(market.extKey, leverage, extApiKey)
  }
  */

  const { syntheticId, syntheticResolution, collateralResolution, szDecimals, pxDecimals } = l2Config

  // BigInt natif → pas de perte de précision sur vaultId
  const vaultIdBig = BigInt(extL2Vault)

  const nonce             = generateNonce()
  const expiryEpochMillis = Date.now() + 14 * 24 * 3600 * 1000
  const expirationSecs    = Math.ceil(expiryEpochMillis / 1000) + SERVER_CLOCK_OFFSET_S

  const isMarket        = (orderType ?? 'maker') === 'taker'
  const timeInForce     = isMarket ? 'IOC' : 'GTT'
  const aggressivePrice = isMarket
    ? (isBuy ? limitPrice * 1.0075 : limitPrice * 0.9925)
    : limitPrice

  const sizeStr = order.size.toFixed(szDecimals)
  if (parseFloat(sizeStr) <= 0) {
    throw new Error(
      `Taille invalide pour Extended après arrondi à ${szDecimals} décimales : ` +
      `${order.size} → "${sizeStr}". ` +
      `Augmente le montant (min. ~${(1 / Math.pow(10, szDecimals - 1)).toFixed(szDecimals)} sur ce marché).`
    )
  }

  const priceStr = aggressivePrice.toFixed(pxDecimals)

  const syntheticAmountAbs  = parseQuantum(sizeStr, syntheticResolution)
  const collateralAmountAbs = parseCollateral(syntheticAmountAbs, priceStr, collateralResolution, syntheticResolution)

  // Division entière pour éviter les flottants sur feeAmount
  const feeAmount   = Math.ceil(collateralAmountAbs / 2000) // × 0.0005
  const baseAmount  = isBuy ?  syntheticAmountAbs  : -syntheticAmountAbs
  const quoteAmount = isBuy ? -collateralAmountAbs :  collateralAmountAbs

  const starkKey   = ec.starkCurve.getStarkKey(extStarkPk)
  const domainHash = computeDomainHash('Perpetuals', 'v0', 'SN_MAIN', 1)

  console.log('[Extended] parseCollateral inputs:', {
    market: market.keys?.ext, sizeStr, priceStr,
    syntheticResolution, collateralResolution,
    syntheticAmountAbs, collateralAmountAbs,
    ratio: collateralResolution / syntheticResolution,
  })

  const orderHash = computeOrderHash(
    vaultIdBig, syntheticId, baseAmount,
    '0x1', quoteAmount, '0x1', feeAmount, expirationSecs, nonce,
  )
  
  const msgHash = computeMessageHash(domainHash, starkKey, orderHash)
  
  const sig     = ec.starkCurve.sign(msgHash, extStarkPk)

  console.log('[Extended] Signing debug:', {
    vaultIdBig: vaultIdBig.toString(), starkKey, syntheticId,
    baseAmount, quoteAmount, feeAmount, expirationSecs, nonce, orderHash, msgHash,
  })

  /*
  const payload = {
    id:                       generateOrderId(),
    market:                   market.extKey,
    type:                     'LIMIT',
    side:                     isBuy ? 'BUY' : 'SELL',
    qty:                      sizeStr,
    price:                    priceStr,
    timeInForce,
    expiryEpochMillis,
    fee:                      '0.0005',
    nonce:                    nonce.toString(),
    selfTradeProtectionLevel: 'ACCOUNT',
    postOnly:                 !isMarket,
    ...(reduceOnly && { reduceOnly: true }),
    ...(tpSlConfig?.prices
    ? buildExtendedTpSl({
        side:   isBuy ? 'long' : 'short',
        prices: tpSlConfig.prices,
      })
    : {}),
    settlement: {
      signature: {
        r: '0x' + sig.r.toString(16).padStart(64, '0'),
        s: '0x' + sig.s.toString(16).padStart(64, '0'),
      },
      starkKey,
      collateralPosition: vaultIdBig.toString(),
    },
  }
  */

  const payload = {
    id: generateOrderId(),
    market: market.keys?.ext,
    type: 'LIMIT',
    side: isBuy ? 'BUY' : 'SELL',
    qty: sizeStr,
    price: priceStr,
    timeInForce,
    expiryEpochMillis,
    fee: '0.0005',
    nonce: nonce.toString(),
    selfTradeProtectionLevel: 'ACCOUNT',
    postOnly: !isMarket,
    ...(reduceOnly && { reduceOnly: true }),
    settlement: {
      signature: { r: '0x' + sig.r.toString(16).padStart(64, '0'), s: '0x' + sig.s.toString(16).padStart(64, '0') },
      starkKey,
      collateralPosition: vaultIdBig.toString(),
    },
  }

  if (tpSlConfig?.prices) {
    //const isTradFi = market.category === 'TradFi'   // ou 'Equity', 'Forex', 'Commodity'...
    const isTradFi = market.category !== 'Crypto'

    console.log('[Extended] market.category:', market.category, '| isTradFi:', isTradFi)
    
    const tpSlBlock = await buildExtendedTpSl({
      side:           isBuy ? 'long' : 'short',
      prices:         tpSlConfig.prices,
      size:           parseFloat(sizeStr),
      extStarkPk,
      vaultId:        vaultIdBig,
      //marketL2Config: market.l2Config,   // { syntheticId, syntheticResolution, collateralId, collateralResolution }
      marketL2Config: l2Config,
      feeRate:        0.0005,
      expiryEpochMs:  expiryEpochMillis,
      saltBase:       nonce,             // TP = nonce+1, SL = nonce+2 → nonces uniques
      pxDecimals,
      isTradFi,      // ← passer le flag
    })
    Object.assign(payload, tpSlBlock)
  }

  console.log('[Extended] Payload:', JSON.stringify(payload, null, 2))

  const res = await fetch(
    `${EXT_PROXY}?endpoint=${encodeURIComponent('/user/order')}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': extApiKey,
        'User-Agent': 'TrekApp/1.0',
      },
      body: JSON.stringify(payload),
    }
  )

  // À la fin de placeOrder(), après le fetch de soumission
const rawText = await res.text()
let data = {}
try { data = JSON.parse(rawText) } catch {}

if (!res.ok || data?.status === 'ERROR')
  throw new Error(data?.error?.message || rawText || `Extended HTTP ${res.status}`)

// ── Vérification post-soumission ─────────────────────────────────────────
const externalId = data?.data?.externalId  // ton UUID — pas d'ambiguïté BigInt

if (externalId) {
  await new Promise(r => setTimeout(r, 500))
  try {
    const checkRes = await fetch(
      `${EXT_PROXY}?endpoint=${encodeURIComponent(`/user/orders/external/${externalId}`)}`,
      { headers: { 'X-Api-Key': extApiKey } }
    )
    const checkData = await checkRes.json()
    const orderStatus   = checkData?.data?.status
    const cancelReason  = checkData?.data?.cancelReason

    if (orderStatus === 'CANCELLED' || orderStatus === 'REJECTED') {
      const msg = cancelReason === 'POSTONLY_FAILED'
        ? `Ordre rejeté : prix croise le carnet (POST_ONLY). Ajuste le prix limite.`
        : `Ordre rejeté par Extended : ${cancelReason ?? orderStatus}`
      throw new Error(msg)
    }
  } catch (e) {
    if (e.message.includes('rejeté') || e.message.includes('POST_ONLY')) throw e
    // Ignore les erreurs réseau du check secondaire — l'ordre a bien été soumis
    console.warn('[Extended] vérification post-ordre échouée (non-bloquant):', e.message)
  }
}

return data
}

// ─── Stats fetch ──────────────────────────────────────────────────────────────

//const BASE_URL = 'https://api.starknet.extended.exchange'

/*
async function fetchPositions(apiKey, startTime, endTime) {
  let cursor = null, all = []
  while (true) {
    const params = new URLSearchParams({ startTime, endTime, limit: 500 })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(`${BASE_URL}/api/v1/user/positions/history?${params}`, {
      headers: { 'X-Api-Key': apiKey }
    })
    if (!res.ok) break
    const json = await res.json()
    if (json.data) all = all.concat(json.data)
    if (!json.pagination?.cursor || json.data?.length < 500) break
    cursor = json.pagination.cursor
  }
  return all
}

async function fetchTrades(apiKey, startTime, endTime) {
  let cursor = null, all = []
  while (true) {
    const params = new URLSearchParams({ startTime, endTime, limit: 500 })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(`${BASE_URL}/api/v1/user/trades?${params}`, {
      headers: { 'X-Api-Key': apiKey }
    })
    if (!res.ok) break
    const json = await res.json()
    if (json.data) all = all.concat(json.data)
    if (!json.pagination?.cursor || json.data?.length < 500) break
    cursor = json.pagination.cursor
  }
  return all
}
*/

// ✅ REMPLACER PAR — utilise EXT_PROXY comme partout ailleurs dans le fichier
//plus utile ??? à garder pour retrouver les positions ouvertes ?
/*
async function fetchPositions(apiKey, startTime, endTime) {
  let cursor = null, all = []
  while (true) {
    // ✅ Les params font partie de l'endpoint, pas du proxy
    const params = new URLSearchParams({ startTime, endTime, limit: 500 })
    if (cursor) params.set('cursor', cursor)
    const endpoint = `/user/positions/history?${params}`

    const res = await fetch(
      `${EXT_PROXY}?endpoint=${encodeURIComponent(endpoint)}`,
      { headers: { 'X-Api-Key': apiKey } }
    )
    if (!res.ok) break
    const json = await res.json()
    if (json.data) all = all.concat(json.data)
    if (!json.pagination?.cursor || json.data?.length < 500) break
    cursor = json.pagination.cursor
  }
  return all
}

*/
/*
async function fetchTrades(apiKey, startTime, endTime) {
  let cursor = null, all = []
  while (true) {
    const params = new URLSearchParams({ startTime, endTime, limit: 500 })
    if (cursor) params.set('cursor', cursor)
    const endpoint = `/user/trades?${params}`

    const res = await fetch(
      `${EXT_PROXY}?endpoint=${encodeURIComponent(endpoint)}`,
      { headers: { 'X-Api-Key': apiKey } }
    )
    if (!res.ok) break
    const json = await res.json()
    if (json.data) all = all.concat(json.data)
    if (!json.pagination?.cursor || json.data?.length < 500) break
    cursor = json.pagination.cursor
  }
  return all
}
*/

async function fetchTrades(apiKey, startTime, endTime) {
  let cursor = null, all = []

  // ← LOG : vérifie les valeurs reçues
  console.log('[fetchTrades] startTime:', startTime, '=', new Date(startTime).toLocaleString('fr-FR'))
  console.log('[fetchTrades] endTime:  ', endTime,   '=', new Date(endTime).toLocaleString('fr-FR'))

  while (true) {
    const params = new URLSearchParams({ startTime, endTime, limit: 500 })
    if (cursor) params.set('cursor', cursor)
    const endpoint = `/user/trades?${params}`

    // ← LOG : vérifie l'URL complète qui part au proxy
    const fullUrl = `${EXT_PROXY}?endpoint=${encodeURIComponent(endpoint)}`
    console.log('[fetchTrades] URL proxy:', fullUrl)

    const res = await fetch(fullUrl, { headers: { 'X-Api-Key': apiKey } })

    // ← LOG : vérifie la réponse brute
    const rawText = await res.text()
    console.log('[fetchTrades] status:', res.status, '| réponse:', rawText.slice(0, 300))

    if (!res.ok) break
    let json
    try { json = JSON.parse(rawText) } catch { break }
    if (json.data) all = all.concat(json.data)
    if (!json.pagination?.cursor || json.data?.length < 500) break
    cursor = json.pagination.cursor
  }

  console.log('[fetchTrades] total trades:', all.length)
  return all
}

//avant rawTrade pour tracking
/*
export async function fetchStats(apiKey, startTime, endTime) {
  // ── Trades → volume + count uniquement ───────────────────────────────────
  const allTrades = await fetchTrades(apiKey, startTime, endTime)
  const trades = allTrades.filter(t => {
    const ts = parseInt(t.createdTime ?? 0)
    return ts >= startTime && ts <= endTime
  })
  const volume = trades.reduce((s, t) => s + Math.abs(parseFloat(t.value ?? 0)), 0)

  // ── Positions fermées → PnL + fees ───────────────────────────────────────
  let pnlGross = 0
  let fees = 0
  try {
    const allPositions = await fetchClosedPositions(apiKey)

    const closedInRange = allPositions.filter(p => {
      const closedTs = parseInt(p.closedTime ?? 0)
      return closedTs > 0 && closedTs >= startTime && closedTs <= endTime
    })

    console.log(`[Extended] positions fermées dans période: ${closedInRange.length}`)

    closedInRange.forEach(p => {
      const b = p.realisedPnlBreakdown
      if (b) {
        pnlGross += parseFloat(b.tradePnl    ?? 0)
                  //+ parseFloat(b.fundingFees  ?? 0) // à rajouter plus trad comme option 
                  //+ parseFloat(b.openFees     ?? 0) // 
                  //+ parseFloat(b.closeFees    ?? 0) //

        // fees = frais de transaction uniquement (positifs)
        fees += Math.abs(parseFloat(b.openFees  ?? 0))
              + Math.abs(parseFloat(b.closeFees ?? 0))
      } else {
        pnlGross += parseFloat(p.realisedPnl ?? 0)
      }
    })
  } catch (e) {
    console.warn('[Extended] positions/history:', e.message)
  }

  return { pnlGross, fees, volume, trades: trades.length }
}


export async function fetchStats(apiKey, startTime, endTime) {
  // ── Trades → volume + count uniquement ───────────────────────────────────
  const allTrades = await fetchTrades(apiKey, startTime, endTime)
  const trades = allTrades.filter(t => {
    const ts = parseInt(t.createdTime ?? 0)
    return ts >= startTime && ts <= endTime
  })
  const volume = trades.reduce((s, t) => s + Math.abs(parseFloat(t.value ?? 0)), 0)

  // ── Positions fermées → PnL + fees ───────────────────────────────────────
  let pnlGross = 0
  let fees = 0
  try {
    const allPositions = await fetchClosedPositions(apiKey)

    const closedInRange = allPositions.filter(p => {
      const closedTs = parseInt(p.closedTime ?? 0)
      return closedTs > 0 && closedTs >= startTime && closedTs <= endTime
    })

    console.log(`[Extended] positions fermées dans période: ${closedInRange.length}`)

    closedInRange.forEach(p => {
      const b = p.realisedPnlBreakdown
      if (b) {
        pnlGross += parseFloat(b.tradePnl ?? 0)
        fees += Math.abs(parseFloat(b.openFees  ?? 0))
              + Math.abs(parseFloat(b.closeFees ?? 0))
      } else {
        pnlGross += parseFloat(p.realisedPnl ?? 0)
      }
    })
  } catch (e) {
    console.warn('[Extended] positions/history:', e.message)
  }

  // ── rawTrades enrichis pour appariement DN ────────────────────────────────
  const rawTrades = trades.map(t => ({
    ...t,
    // champs normalisés attendus par matchDnGroups
    timestamp:  parseInt(t.createdTime ?? 0),
    market:     t.market ?? t.symbol,
    size:       Math.abs(parseFloat(t.qty ?? t.quantity ?? t.size ?? 0)),
    orderId:    t.orderId ?? t.id,
    pnlGross:   0,   // Extended : PnL sur position fermée, pas sur trade
    fees:       Math.abs(parseFloat(t.payedFee ?? t.fee ?? 0)),
  }))

  //return { ext: { pnlGross, fees, volume, trades: trades.length, rawTrades } }
  //         ↑ clé "ext" — aligné avec STATS_KEYS et le reste de ton système
  return { pnlGross, fees, volume, trades: trades.length, rawTrades }
}
*/

export async function fetchStats(apiKey, startTime, endTime) {
  // ── Trades → volume + count ───────────────────────────────────────────────
  const allTrades = await fetchTrades(apiKey, startTime, endTime)
  const trades = allTrades.filter(t => {
    const ts = parseInt(t.createdTime ?? 0)
    return ts >= startTime && ts <= endTime
  })
  const volume = trades.reduce((s, t) => s + Math.abs(parseFloat(t.value ?? 0)), 0)

  // ── Positions fermées → PnL + fees ───────────────────────────────────────
  let pnlGross = 0, fees = 0
  try {
    const allPositions = await fetchClosedPositions(apiKey)
    const closedInRange = allPositions.filter(p => {
      const closedTs = parseInt(p.closedTime ?? 0)
      return closedTs > 0 && closedTs >= startTime && closedTs <= endTime
    })
    closedInRange.forEach(p => {
      const b = p.realisedPnlBreakdown
      if (b) {
        pnlGross += parseFloat(b.tradePnl ?? 0)
        fees += Math.abs(parseFloat(b.openFees ?? 0)) + Math.abs(parseFloat(b.closeFees ?? 0))
      } else {
        pnlGross += parseFloat(p.realisedPnl ?? 0)
      }
    })
  } catch (e) { console.warn('[Extended] positions/history:', e.message) }

  // ── ↓↓ COLLER ICI — normalisation rawTrades ──────────────────────────────
  const rawTrades = []
  for (const f of trades) {
    rawTrades.push({
      ...f,
      timestamp:  parseInt(f.createdTime ?? 0),
      //market:     f.market,
      market: EXT_KEY_TO_ID[f.market] ?? f.market?.replace(/-USD$/, '') ?? f.market,
      size:       Math.abs(parseFloat(f.qty || 0)),
      //orderId:    f.id?.toString() ?? null,
      orderId: f.externalOrderId?.toString() ?? f.orderId?.toString() ?? null,
      pnlGross:   0,                                    // vient de closedPositions, pas des trades
      fees:       parseFloat(f.fee ?? f.payedFee ?? 0),
    })
  }
  // ── ↑↑ fin normalisation ─────────────────────────────────────────────────

  return { pnlGross, fees, volume, trades: trades.length, rawTrades }  // ← ajouter rawTrades ici
}

async function fetchClosedPositions(apiKey) {
  let cursor = null
  const all = []
  while (true) {
    const params = new URLSearchParams({ limit: 500 })
    if (cursor) params.set('cursor', cursor)
    const endpoint = `/user/positions/history?${params}`
    const res = await fetch(
      `${EXT_PROXY}?endpoint=${encodeURIComponent(endpoint)}`,
      { headers: { 'X-Api-Key': apiKey } }
    )
    if (!res.ok) break
    const json = await res.json()
    if (json.data?.length) all.push(...json.data)

    // ← log temporaire
    console.log(`[fetchClosedPositions] page: ${json.data?.length} | cursor: ${json.pagination?.cursor ?? 'fin'} | total: ${all.length}`)

    if (!json.pagination?.cursor) break
    cursor = json.pagination.cursor
  }
  return all
}

//ajout Mode Chunked
// extended.js
// GET order status via /user/order/:orderId
export async function getOrderStatus(orderId, credentials) {
  const { extApiKey } = credentials
  if (!orderId || !extApiKey) return null

  try {
    const res = await fetch(
      `${EXT_PROXY}?endpoint=${encodeURIComponent(`/user/order/${orderId}`)}`,
      { headers: { 'X-Api-Key': extApiKey } }
    )
    const data = await res.json()
    if (data?.status === 'ERROR') return null

    const o = data?.data
    // Extended statuses : "OPEN" | "FILLED" | "CANCELLED" | "PARTIALLY_FILLED"
    const rawStatus = (o?.status ?? '').toUpperCase()

    const statusMap = {
      OPEN:             'open',
      FILLED:           'filled',
      CANCELLED:        'canceled',
      PARTIALLY_FILLED: 'open',   // toujours actif → traité comme open
      REJECTED:         'rejected',
    }

    const filled    = parseFloat(o?.filledQty ?? o?.executedQty ?? 0)
    const remaining = parseFloat(o?.qty ?? 0) - filled

    return {
      status:    statusMap[rawStatus] ?? 'open',
      filled,
      remaining: Math.max(0, remaining),
      avgPx:     parseFloat(o?.avgPrice ?? o?.price ?? 0),
    }
  } catch (e) {
    console.warn('[Extended] getOrderStatus error:', e.message)
    return null
  }
}

// extended.js
// Signature unifiée : { orderId, market, credentials }
export async function cancelOrder({ orderId, market, credentials }) {
  const { extApiKey } = credentials
  if (!orderId || !extApiKey) return

  const res = await fetch(
    `${EXT_PROXY}?endpoint=${encodeURIComponent(`/user/order/${orderId}`)}`,
    {
      method:  'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key':    extApiKey,
        'User-Agent':   'TrekApp/1.0',
      },
    }
  )

  const rawText = await res.text()
  console.log('[Extended] cancelOrder:', orderId, '| status:', res.status, '| response:', rawText.slice(0, 200))

  let data = {}
  try { data = JSON.parse(rawText) } catch { /* non-JSON */ }

  // 404 = ordre déjà rempli ou inexistant → pas une erreur critique
  if (res.status === 404) {
    console.warn('[Extended] cancelOrder 404 — ordre déjà rempli ou inexistant:', orderId)
    return null
  }

  if (!res.ok || data?.status === 'ERROR')
    throw new Error(data?.error?.message || rawText || `Extended cancelOrder HTTP ${res.status}`)

  return data
}

// extended.js
export function normalizeOrderId(result) {
  return result?.data?.id ?? result?.data?.orderId ?? null
}
