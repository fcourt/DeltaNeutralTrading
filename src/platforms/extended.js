// src/platforms/extended.js
// Absorbe : adapter/extended.js + useExtendedL2Config.js + signing Stark

import { ec, hash, shortString } from 'starknet'

const EXT_PROXY    = '/api/extended'
const CACHE_TTL_MS = 60 * 60 * 1000
const SERVER_CLOCK_OFFSET_S = 14 * 24 * 3600
const ORDER_SELECTOR  = '0x36da8d51815527cabfaa9c982f564c80fa7429616739306036f1f9b608dd112'
const DOMAIN_SELECTOR = '0x1ff2f602e42168014d405a94f75e8a93d640751d71d16311266e140d8b0a210'
const STARK_PRIME = BigInt('0x800000000000011000000000000000000000000000000000000000000000001')

const _cache = new Map()
const _ttls  = { extended_keys: 300_000, ext_l2configs: CACHE_TTL_MS }
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
  const ratio    = collatRes / synthRes
  const extraDec = ratio > 1 ? Math.round(Math.log10(ratio)) : 0
  const [pInt, pDec = ''] = String(priceStr).split('.')
  const pDecPadded = pDec.padEnd(extraDec, '0').slice(0, extraDec)
  const priceInt   = parseInt(pInt, 10) * ratio + (extraDec > 0 && pDecPadded ? parseInt(pDecPadded, 10) : 0)
  return syntheticAbs * priceInt
}

function generateNonce()   { return Math.floor(Math.random() * (2 ** 31 - 1)) + 1 }
function generateOrderId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

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

export async function getPrices() {
  const res  = await fetch(`${EXT_PROXY}?endpoint=${encodeURIComponent('/info/markets')}`)
  const data = await res.json()
  const priceMap = {}, precisionMap = {}
  ;(data.data || []).forEach(m => {
    if (!m.name) return
    const price = parseFloat(m.marketStats?.lastPrice || 0)
    if (price) priceMap[m.name] = price
    precisionMap[m.name] = { szDecimals: m.quantityPrecision ?? m.qtyPrecision ?? 2, pxDecimals: m.pricePrecision ?? 2 }
  })
  return { priceMap, precisionMap }
}

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
      const market = markets.find(m => m.extKey === p.market)
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
      syntheticId: l2.syntheticId, syntheticResolution: l2.syntheticResolution,
      collateralResolution: l2.collateralResolution,
      szDecimals: m.assetPrecision ?? 0,
      pxDecimals: pxDecimalsFromMinPrice(tc.minPriceChange),
    }
  }
  setCached('ext_l2configs', configs)
  try { localStorage.setItem('ext_l2configs_cache', JSON.stringify({ ts: Date.now(), configs })) } catch { /* ignore */ }
  return configs
}

export async function placeOrder(order, credentials) {
  const { isBuy, limitPrice, orderType, reduceOnly, market } = order
  const { extStarkPk, extL2Vault, extApiKey } = credentials
  if (!extStarkPk || !extL2Vault) throw new Error('Clé Stark ou l2Vault manquant pour Extended')

  const L2_CONFIGS = await loadL2Configs()
  const l2Config   = L2_CONFIGS[market.extKey]
  if (!l2Config) throw new Error(`Marché non supporté par Extended : ${market.extKey}`)

  const { syntheticId, syntheticResolution, collateralResolution, szDecimals, pxDecimals } = l2Config
  const nonce             = generateNonce()
  const expiryEpochMillis = Date.now() + 3600 * 1000
  //const expirationSecs    = Math.ceil(expiryEpochMillis / 1000) + SERVER_CLOCK_OFFSET_S
  const CLOCK_BUFFER_SECS = 30; // marge côté serveur
  const expirationSecs = Math.ceil(expiryEpochMillis / 1000) + CLOCK_BUFFER_SECS;
  const isMarket          = (orderType ?? 'maker') === 'taker'
  const timeInForce       = isMarket ? 'IOC' : 'GTT'
  const aggressivePrice   = isMarket ? (isBuy ? limitPrice * 1.0075 : limitPrice * 0.9925) : limitPrice

  const sizeStr  = order.size.toFixed(szDecimals)
  const priceStr = aggressivePrice.toFixed(pxDecimals)

  const syntheticAmountAbs  = parseQuantum(sizeStr, syntheticResolution)
  const collateralAmountAbs = parseCollateral(syntheticAmountAbs, priceStr, collateralResolution, syntheticResolution)
  const feeAmount           = Math.ceil(collateralAmountAbs * 0.0005)
  const baseAmount          = isBuy ?  syntheticAmountAbs  : -syntheticAmountAbs
  const quoteAmount         = isBuy ? -collateralAmountAbs :  collateralAmountAbs

  const pubKeyBytes = ec.starkCurve.getPublicKey(extStarkPk, true)
  const starkKey    = '0x' + Array.from(pubKeyBytes.slice(1)).map(b => b.toString(16).padStart(2, '0')).join('')

  const domainHash = computeDomainHash('Perpetuals', 'v0', 'SN_MAIN', 1)
  const orderHash  = computeOrderHash(
    parseInt(extL2Vault, 10), syntheticId, baseAmount,
    '0x1', quoteAmount, '0x1', feeAmount, expirationSecs, nonce,
  )
  const msgHash = computeMessageHash(domainHash, starkKey, orderHash)
  const sig     = ec.starkCurve.sign(msgHash, extStarkPk)

  const payload = {
    id: generateOrderId(), market: market.extKey, type: 'LIMIT',
    side: isBuy ? 'BUY' : 'SELL', qty: sizeStr, price: priceStr,
    timeInForce, expiryEpochMillis, fee: '0.0005',
    nonce: nonce.toString(), selfTradeProtectionLevel: 'ACCOUNT',
    ...(reduceOnly && { reduceOnly: true }),
    settlement: {
      signature: {
        r: '0x' + sig.r.toString(16).padStart(64, '0'),
        s: '0x' + sig.s.toString(16).padStart(64, '0'),
      },
      starkKey,
      collateralPosition: extL2Vault.toString(),
    },
  }

  const res = await fetch(
    //`${EXT_PROXY}?endpoint=${encodeURIComponent('/api/v1/user/order')}`,
    `${EXT_PROXY}?endpoint=${encodeURIComponent('/user/order')}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': extApiKey, 'User-Agent': 'TrekApp/1.0' }, body: JSON.stringify(payload) }
  )
  const rawText = await res.text()
  let data = {}
  try { data = JSON.parse(rawText) } catch { /* non-JSON */ }
  if (!res.ok || data?.status === 'ERROR')
    throw new Error(data?.error?.message || data?.message || rawText || `Extended HTTP ${res.status}`)
  return data
}
