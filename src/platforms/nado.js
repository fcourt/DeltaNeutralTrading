// src/platforms/nado.js
// Absorbe : adapter/nado.js + utils/nadoSigning.js

import { privateKeyToAccount } from 'viem/accounts'

const GATEWAY_PROXY = '/api/nado'
//const ARCHIVE       = 'https://archive.prod.nado.xyz'
const ARCHIVE = '/api/nado?endpoint=archive' 
const NADO_EXECUTE  = 'https://gateway.prod.nado.xyz/v1/execute'
// Client trigger → endpoint dédié (TP/SL, stops)
//const TRIGGER_URL = 'https://trigger.prod.nado.xyz/v1'
const TRIGGER_URL = 'https://trigger.prod.nado.xyz/v1/execute'
//const NADO_EXECUTE   = '/api/nado?action=execute'; // ← passe par le proxy
const CHAIN_ID      = 57073
const DEAD          = new Set(['not_tradable', 'reduce_only'])

// src/platforms/nado.js — adapter export
export const adapter = {
  placeOrder,
  placeTpSl,   // 👈 seul ajout
  canTrade,
}

const _cache = new Map()
const _ttls  = { nado_prices: 5_000, nado_keys: 300_000, nado_symbols: 300_000 }
const _DEF   = 300_000
function getCached(k)    { const e = _cache.get(k); return e && Date.now() - e.ts < (_ttls[k] ?? _DEF) ? e.d : null }
function setCached(k, d) { _cache.set(k, { d, ts: Date.now() }) }

async function gatewayPost(body) {
  const res = await fetch(GATEWAY_PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Nado gateway → ${res.status}`)
  return res.json()
}
/*
async function archiveGet(path) {
  const res = await fetch(`${ARCHIVE}${path}`)
  if (!res.ok) throw new Error(`Nado archive ${path} → ${res.status}`)
  return res.json()
}
*/
async function archiveGet(path) {
  const res = await fetch(`${ARCHIVE}&path=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error(`Nado archive ${path} → ${res.status}`)
  return res.json()
}

export function buildSubaccount(address, name = 'default') {
  const addr    = address.toLowerCase().replace('0x', '')
  const bytes   = new TextEncoder().encode(name)
  const nameHex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').padEnd(24, '0').slice(0, 24)
  return '0x' + addr + nameHex
}

function productIdToAddress(productId) { return '0x' + productId.toString(16).padStart(40, '0') }

let _clockOffset = 0
async function syncClock() {
  try {
    const t0  = Date.now()
    const res = await fetch(GATEWAY_PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'server_time' }) })
    //const res = await fetch(GATEWAY_PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'time' }) })
    const t1  = Date.now()
    const data = await res.json()
    if (data?.data?.server_time) _clockOffset = data.data.server_time - t1 + (t1 - t0) / 2
  } catch { /* silent */ }
}
const serverNow = () => Date.now() + _clockOffset

// ── Interface unifiée ─────────────────────────────────────────────────────────

export function canTrade(credentials) {
  return !!credentials.nadoAgentPk && !!credentials.nadoAddress
}

// getFundingRate — signature unifiée (market, credentials)
export async function getFundingRate(market, credentials) {
  const nadoKey = market.keys?.nado ?? market.nadoKey
  if (!nadoKey) return { rate: null, bid: null, ask: null }
  const [rates, priceData] = await Promise.all([
    getFunding(),
    getPrices(),
  ])
  return {
    rate: rates[nadoKey]            ?? null,
    bid:  priceData.bidPrices?.[nadoKey] ?? null,
    ask:  priceData.askPrices?.[nadoKey] ?? null,
  }
}

// setLeverage — Nado ne supporte pas le levier → ne pas exporter
// (le composant LeverageSlider détecte l'absence de setLeverage et reste silencieux)

// roundPrice — arrondi Nado : entier pour les TradFi/FX, sinon identité
export const roundPrice = (p) => Math.round(p)

// getSzDecimals
export function getSzDecimals(market) {
  return market.nadoSzDecimals ?? 6
}

// ───────────────────────────────────────────────────────── Interface unifiée ──


/*
function roundToTick(value, increment) {
  const tickX18  = BigInt(increment)
  const valueX18 = BigInt(Math.round(value * 1e18))
  const rem      = valueX18 % tickX18
  const half     = tickX18 / 2n
  return rem >= half ? valueX18 - rem + tickX18 : valueX18 - rem
}


function roundToTick(value, increment) {
  const tickX18  = BigInt(increment);
  // Convertit via string pour éviter la perte de précision des floats
  const [intPart, decPart = ''] = value.toFixed(18).split('.');
  const valueX18 = BigInt(intPart) * BigInt(1e18) + BigInt(decPart.padEnd(18, '0').slice(0, 18));
  const rem  = valueX18 % tickX18;
  const half = tickX18 / 2n;
  return rem >= half ? valueX18 - rem + tickX18 : valueX18 - rem;
}
*/

function roundToTick(value, increment) {
  const isNeg   = value < 0
  const abs     = Math.abs(value)
  const tickX18 = BigInt(increment)
  const [intPart, decPart = ''] = abs.toFixed(18).split('.')
  let absX18 = BigInt(intPart) * BigInt(1e18) + BigInt(decPart.padEnd(18, '0').slice(0, 18))
  const rem  = absX18 % tickX18
  const half = tickX18 / 2n
  absX18 = rem >= half ? absX18 - rem + tickX18 : absX18 - rem
  return isNeg ? -absX18 : absX18   // ← signe restauré
}

function buildNonce() {
  const recvTime = BigInt(Math.floor(serverNow()) + 5000)
  const rand     = BigInt(Math.floor(Math.random() * 1024))
  return (recvTime << 20n) | rand
}

function buildAppendix({ reduceOnly = false, orderType = 'DEFAULT' } = {}) {
  const otMap = { DEFAULT: 0n, IOC: 1n, FOK: 2n, POST_ONLY: 3n }
  return 1n | ((otMap[orderType] ?? 0n) << 9n) | ((reduceOnly ? 1n : 0n) << 11n)
}

let _endpointAddress = null
async function getEndpointAddress() {
  if (_endpointAddress) return _endpointAddress
  const data = await gatewayPost({ type: 'contracts' })
  _endpointAddress = data?.data?.endpoint
  return _endpointAddress
}

async function signTyped(agentPk, domain, types, value) {
  const account = privateKeyToAccount(agentPk)
  return account.signTypedData({ domain, types, primaryType: Object.keys(types)[0], message: value })
}

export async function getAvailableKeys() {
  const cached = getCached('nado_keys')
  if (cached) return cached
  const raw  = await archiveGet('/v2/symbols')
  const keys = new Set(
    Object.values(raw)
      .filter(m => !DEAD.has(m.trading_status))
      .map(m => m.symbol.replace(/-PERP$/, '').replace(/-SPOT$/, ''))
  )
  setCached('nado_keys', keys)
  return keys
}

export async function getSymbols() {
  const cached = getCached('nado_symbols')
  if (cached) return cached
  const raw   = await archiveGet('/v2/symbols')
  const index = {}
  Object.values(raw).forEach(data => {
    if (data.type !== 'perp' || DEAD.has(data.trading_status)) return
    const base     = data.symbol.replace(/-PERP$/, '')
    const priceInc = Number(data.price_increment_x18) / 1e18
    const sizeInc  = Number(data.size_increment)      / 1e18
    index[base] = {
      nadoProductId:         data.product_id ?? data.productId,
      nadoPriceIncrementX18: data.price_increment_x18,
      nadoSizeIncrement:     data.size_increment,
      nadoMinSize: data.min_size,
      nadoPxDecimals: priceInc > 0 ? Math.max(0, Math.ceil(-Math.log10(priceInc))) : 2,
      nadoSzDecimals: sizeInc  > 0 ? Math.max(0, Math.ceil(-Math.log10(sizeInc)))  : 6,
      nadoIsolatedOnly:      data.isolated_only === true,
    }
  })
  if (Object.keys(index).length > 0) setCached('nado_symbols', index)
  return index
}

/*
export async function getPrices() {
  const cached = getCached('nado_prices')
  if (cached) return cached
  const symbolsRaw = await archiveGet('/v2/symbols')
  const idToKey = {}, productIds = []
  Object.values(symbolsRaw).forEach(s => {
    const pid = s.product_id ?? s.productId ?? null
    if (pid != null && pid !== 0) { idToKey[pid] = s.symbol.replace(/-PERP$/, '').replace(/-SPOT$/, ''); productIds.push(pid) }
  })
  const pricesRaw = await gatewayPost({ type: 'market_prices', product_ids: productIds })
  const prices    = {}
  ;(pricesRaw?.data?.market_prices || []).forEach(p => {
    const key = idToKey[p.product_id]
    if (!key) return
    const bid = parseFloat(p.bid_x18), ask = parseFloat(p.ask_x18)
    if (!bid || !ask || ask > 1e35) return
    prices[key] = (bid + ask) / 2 / 1e18
  })
  if (Object.keys(prices).length > 0) setCached('nado_prices', prices)
  return prices
}
*/

export async function getPrices() {
  const cached = getCached('nado_prices')
  if (cached) return cached
  const symbolsRaw = await archiveGet('/v2/symbols')
  const idToKey = {}, productIds = []
  Object.values(symbolsRaw).forEach(s => {
    const pid = s.product_id ?? s.productId ?? null
    if (pid != null && pid !== 0) {
      idToKey[pid] = s.symbol.replace(/-PERP$/, '').replace(/-SPOT$/, '')
      productIds.push(pid)
    }
  })
  const pricesRaw = await gatewayPost({ type: 'market_prices', product_ids: productIds })
  const prices = {}, bidPrices = {}, askPrices = {}
  ;(pricesRaw?.data?.market_prices || []).forEach(p => {
    const key = idToKey[p.product_id]
    if (!key) return
    const bid = parseFloat(p.bid_x18), ask = parseFloat(p.ask_x18)
    if (!bid || !ask || ask > 1e35) return
    const bidVal = bid / 1e18, askVal = ask / 1e18
    prices[key]    = (bidVal + askVal) / 2
    bidPrices[key] = bidVal
    askPrices[key] = askVal
  })
  const result = { prices, bidPrices, askPrices }
  if (Object.keys(prices).length > 0) setCached('nado_prices', result)
  return result
}

let _nadoIdToKey = null
/*
export async function getFunding() {
  try {
    if (!_nadoIdToKey) {
      const raw = await archiveGet('/v2/symbols')
      _nadoIdToKey = {}
      Object.values(raw).forEach(s => {
        const pid = s.product_id ?? null
        if (pid != null && pid !== 0) _nadoIdToKey[pid] = s.symbol.replace(/-PERP$/, '').replace(/-SPOT$/, '')
      })
    }
    const productIds = Object.keys(_nadoIdToKey).map(Number)
    const res = await fetch(`${ARCHIVE}/v1`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funding_rates: { product_ids: productIds } }),
    })
    
    if (!res.ok) return {}
    const raw   = await res.json()
    const rates = {}
    Object.values(raw).forEach(p => {
      const key = _nadoIdToKey[p.product_id]
      if (key) rates[key] = parseFloat(p.funding_rate_x18) / 1e18
    })
    return rates
  } catch (e) { console.warn('[Nado getFunding]', e.message); return {} }
}
*/

export async function getFunding() {
  try {
    if (!_nadoIdToKey) {
      const raw = await archiveGet('/v2/symbols')
      _nadoIdToKey = {}
      Object.values(raw).forEach(s => {
        const pid = s.product_id ?? null
        if (pid != null && pid !== 0) _nadoIdToKey[pid] = s.symbol.replace(/-PERP$/, '').replace(/-SPOT$/, '')
      })
    }
    const productIds = Object.keys(_nadoIdToKey).map(Number)
    const res = await fetch(`${ARCHIVE}&path=${encodeURIComponent('/v1')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funding_rates: { product_ids: productIds } }),
    })
    if (!res.ok) return {}
    const raw   = await res.json()
    const rates = {}
    Object.values(raw).forEach(p => {
      const key = _nadoIdToKey[p.product_id]
      if (key) rates[key] = parseFloat(p.funding_rate_x18) / 1e18
    })
    return rates
  } catch (e) { console.warn('[Nado getFunding]', e.message); return {} }
}

export async function getMargin(credentials) {
  const { nadoAddress, nadoSubaccount } = credentials
  if (!nadoAddress || !/^0x[0-9a-fA-F]{40}$/i.test(nadoAddress.trim())) return null
  try {
    const sub  = buildSubaccount(nadoAddress.trim(), nadoSubaccount || 'default')
    const data = await gatewayPost({ type: 'subaccount_info', subaccount: sub })
    if (data?.status !== 'success' || !data?.data?.exists) return null
    const health = data.data.healths?.[0]?.health
    return health != null ? parseFloat(health) / 1e18 : null
  } catch (e) { console.warn('[Nado getMargin]', e.message); return null }
}

/*
export async function getPositions(credentials, markets = []) {
  const { nadoAddress, nadoSubaccount } = credentials
  if (!nadoAddress || !/^0x[0-9a-fA-F]{40}$/i.test(nadoAddress.trim())) {
    console.log('[Nado getPositions] adresse invalide ou manquante:', nadoAddress)
    return []
  }
  try {
    const sub = buildSubaccount(nadoAddress.trim(), nadoSubaccount || 'default')
    console.log('[Nado getPositions] nadoAddress:', nadoAddress)
    console.log('[Nado getPositions] sub:', sub)

    const data = await gatewayPost({ type: 'subaccount_info', subaccount: sub })
    console.log('[Nado getPositions] data.status:', data?.status, '| exists:', data?.data?.exists)

    if (data?.status !== 'success' || !data?.data?.exists) return []

    const balances = data.data.perp_balances || []
    console.log('[Nado getPositions] perp_balances count:', balances.length)
    console.log('[Nado getPositions] raw balances:', JSON.stringify(balances.slice(0, 2)))

    return balances
      .filter(p => {
        const keep = parseFloat(p.balance.amount) !== 0
        if (!keep) console.log('[Nado] filtré (amount=0):', p.product_id)
        return keep
      })
      .map(p => {
        const szi    = parseFloat(p.balance.amount) / 1e18
        const market = markets.find(m => m.nadoProductId === p.product_id)
        const vQuote = parseFloat(p.balance.v_quote_balance) / 1e18

        console.log('[Nado getPositions] product_id cherché:', p.product_id, '| market trouvé:', market?.id ?? 'NULL')
        console.log('[Nado getPositions] markets[0]:', JSON.stringify(markets[0]))

        return {
          platform: 'nado',
          coin: market?.keys?.nado ?? `product_${p.product_id}`,
          marketId: market?.id ?? null,
          label: market?.label ?? `product_${p.product_id}`,
          side: szi > 0 ? 'LONG' : 'SHORT',
          szi: Math.abs(szi),
          entryPx: szi !== 0 ? Math.abs(vQuote / szi) : 0,
          unrealizedPnl: 0,
        }
      })
  } catch (e) {
    console.warn('[Nado getPositions] erreur:', e.message)
    return []
  }
}
*/

export async function getPositions(credentials, markets = []) {
  const { nadoAddress, nadoSubaccount } = credentials
  if (!nadoAddress || !/^0x[0-9a-fA-F]{40}$/i.test(nadoAddress.trim())) return []
  try {
    const sub  = buildSubaccount(nadoAddress.trim(), nadoSubaccount || 'default')
    const [crossData, isoData] = await Promise.all([
      gatewayPost({ type: 'subaccount_info', subaccount: sub }),
      gatewayPost({ type: 'isolated_positions', subaccount: sub }),
    ])

    const positions = []

   // ── Positions CROSS ──────────────────────────────────────────────────────
if (crossData?.status === 'success' && crossData?.data?.exists) {

  // ← COLLE ICI — map productId → oraclePrice
  const priceMap = {}
  for (const prod of (crossData.data.perp_products || [])) {
    priceMap[prod.product_id] = parseFloat(prod.oracle_price_x18) / 1e18
  }

  for (const p of (crossData.data.perp_balances || [])) {
    if (parseFloat(p.balance.amount) === 0) continue

    const szi    = parseFloat(p.balance.amount) / 1e18
    const vQuote = parseFloat(p.balance.v_quote_balance) / 1e18

    // ← ET ICI — utilise le priceMap dans la boucle
    const oraclePx      = priceMap[p.product_id] ?? 0
    const unrealizedPnl = szi * oraclePx + vQuote

    const market = markets.find(m => m.nadoProductId === p.product_id)
    positions.push({
      platform:      'nado',
      coin:          market?.keys?.nado ?? `product_${p.product_id}`,
      marketId:      market?.id ?? null,
      label:         market?.label ?? `product_${p.product_id}`,
      side:          szi > 0 ? 'LONG' : 'SHORT',
      szi:           Math.abs(szi),
      entryPx:       szi !== 0 ? Math.abs(vQuote) / Math.abs(szi) : 0,
      unrealizedPnl, // ← plus hardcodé à 0
    })
  }
}

    // ── Positions ISOLÉES ─────────────────────────────────────────────────────
if (isoData?.status === 'success') {
  for (const p of (isoData.data?.isolated_positions || [])) {
    const baseBalance = p.base_balance?.balance
    if (!baseBalance) continue

    const szi        = parseFloat(baseBalance.amount)     / 1e18
    const vQuote     = parseFloat(baseBalance.v_quote_balance) / 1e18
    const pid        = p.base_balance?.product_id ?? p.base_product?.product_id
    const market     = markets.find(m => m.nadoProductId === pid)

    // Oracle price depuis base_product (déjà dans la réponse isolated_positions)
    const oraclePx   = parseFloat(p.base_product?.oracle_price_x18 ?? 0) / 1e18

    // Formule doc Nado : unsettledQuote = amount × oraclePrice + vquoteBalance
    const unrealizedPnl = szi !== 0 ? szi * oraclePx + vQuote : 0

    // entryPx : |vquoteBalance| / |amount|  (average entry cost)
    const entryPx    = szi !== 0 ? Math.abs(vQuote) / Math.abs(szi) : 0

    if (Math.abs(szi) === 0) continue

    positions.push({
      platform:      'nado',
      coin:          market?.keys?.nado ?? `product_${pid}`,
      marketId:      market?.id ?? null,
      label:         market?.label ?? `product_${pid}`,
      side:          szi > 0 ? 'LONG' : 'SHORT',
      szi:           Math.abs(szi),
      entryPx,
      unrealizedPnl, // ← maintenant calculé correctement
    })
  }
}

    return positions
  } catch (e) {
    console.warn('[Nado getPositions] erreur:', e.message)
    return []
  }
}

export async function placeOrder(order, credentials) {
  const { isBuy, limitPrice, orderType, reduceOnly, market } = order
  const { nadoAgentPk, nadoAddress, nadoSubaccount } = credentials
  if (!nadoAgentPk || !nadoAddress) throw new Error('Clé agent ou adresse Nado manquante')
  if (!market.nadoProductId) throw new Error(`${market.label} non disponible sur Nado`)

  await syncClock()

  const sender    = buildSubaccount(nadoAddress, nadoSubaccount || 'default')
  const isMaker   = orderType !== 'taker'
  //const adjPrice  = isMaker ? (isBuy ? limitPrice * 0.9995 : limitPrice * 1.0005) : limitPrice
  const adjPrice = isMaker
  ? (isBuy ? limitPrice * 0.9995 : limitPrice * 1.0005)   // maker : en dessous/au-dessus du mid
  : (isBuy ? limitPrice * 1.005  : limitPrice * 0.995)    // taker IOC : +/- 0.5% pour croiser
  const signedSize = isBuy ? Math.abs(order.size) : -Math.abs(order.size)

  const priceX18  = roundToTick(adjPrice,    market.nadoPriceIncrementX18 ?? '1000000000000000000')
  const amountX18 = roundToTick(signedSize,  market.nadoSizeIncrement     ?? '1000000000000000')

  /*
  // Après roundToTick(...)
const notional = (amountX18 < 0n ? -amountX18 : amountX18) * priceX18 / BigInt(1e18);
const minSize  = BigInt(market.nadoMinSize ?? '100000000000000000000');
if (notional < minSize) {
  const cur = Number(notional) / 1e18;
  const min = Number(minSize) / 1e18;
  throw new Error(`Notionnel trop faible : $${cur.toFixed(2)} < minimum $${min.toFixed(2)}`);
}
  
  const expiration = BigInt(Math.floor(serverNow() / 1000) + 150)
  const nonce      = buildNonce()
  const appendix   = buildAppendix({ reduceOnly, orderType: isMaker ? 'DEFAULT' : 'IOC' })
*/

  // Vérification notionnel minimum
  const notional = (amountX18 < 0n ? -amountX18 : amountX18) * priceX18 / BigInt(1e18)
  const minSize  = BigInt(market.nadoMinSize ?? '100000000000000000000')
  if (notional < minSize) {
    const cur = Number(notional) / 1e18
    const min = Number(minSize) / 1e18
    throw new Error(`Notionnel trop faible : $${cur.toFixed(2)} < minimum $${min.toFixed(2)}`)
  }

  //const expiration = BigInt(Math.floor(serverNow() / 1000) + 150)
  // Expiration 4294967295n = illimité pour les ordres limites
  const expiration = isMaker
    ? 4294967295n                                            // GTC — limit maker
    : BigInt(Math.floor(serverNow() / 1000) + 30)           // 30s pour IOC taker
   
  const nonce      = buildNonce()

  // ── AJOUT : isolated margin si leverage fourni ─────────────────────────
  const leverage = order.leverage ?? null
  let appendix
  if (leverage && leverage > 0) {
    const notionalUsd    = Math.abs(order.size) * adjPrice
    const marginUsdt     = notionalUsd / leverage
    const isolatedMargin = BigInt(Math.ceil(marginUsdt * 1e6))  // x6 precision
    // Reconstruit l'appendix avec isolated=true et isolatedMargin
    appendix = 1n                                     // version
      | ((isMaker ? 0n : 1n) << 9n)                  // orderType : DEFAULT ou IOC
      | ((reduceOnly ? 1n : 0n) << 11n)               // reduce_only
      | (1n << 8n)                                    // isolated = true
      | (isolatedMargin << 64n)                       // isolated margin en x6
  } else {
    appendix = buildAppendix({ reduceOnly, orderType: isMaker ? 'DEFAULT' : 'IOC' })
  }
  // ──────────────────────────────────────────────────────────────────────

  
  const domain = { name: 'Nado', version: '0.0.1', chainId: CHAIN_ID, verifyingContract: productIdToAddress(market.nadoProductId) }
  const types  = {
    Order: [
      { name: 'sender',     type: 'bytes32' },
      { name: 'priceX18',   type: 'int128'  },
      { name: 'amount',     type: 'int128'  },
      { name: 'expiration', type: 'uint64'  },
      { name: 'nonce',      type: 'uint64'  },
      { name: 'appendix',   type: 'uint128' },
    ],
  }
  const value     = { sender, priceX18, amount: amountX18, expiration, nonce, appendix }
  const signature = await signTyped(nadoAgentPk, domain, types, value)

  const isIsolated = market.nadoIsolatedOnly === true || market.category !== 'Crypto'
  
  const res = await fetch(NADO_EXECUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
    /*
    body: JSON.stringify({
      place_order: {
        product_id: market.nadoProductId,
        order: {
          sender, priceX18: String(priceX18), amount: String(amountX18),
          expiration: String(expiration), nonce: String(nonce), appendix: String(appendix),
        },
        signature,
      },
    }),
    */
    body: JSON.stringify({
      place_order: {
        product_id:  market.nadoProductId,
        margin_type: isIsolated ? 'isolated' : 'cross',  // ← ajout
        order: {
          sender, priceX18: String(priceX18), amount: String(amountX18),
          expiration: String(expiration), nonce: String(nonce), appendix: String(appendix),
        },
        signature,
      },
    }),
  })
  
  const data = await res.json()
  console.log('[Nado] status:', res.status, '| response:', JSON.stringify(data))
  if (data.status !== 'success') throw new Error(`[Nado] ${data.error ?? 'place_order failed'}`)
  return data
}

// -- TP/SL --------------------------------------------------------------------

async function signTriggerOrder(order, productId, credentials) {
  const domain = {
    name: 'Nado', version: '0.0.1', chainId: CHAIN_ID,
    verifyingContract: productIdToAddress(productId)
  }
  const types = {
    Order: [
      { name: 'sender',     type: 'bytes32' },
      { name: 'priceX18',   type: 'int128'  },
      { name: 'amount',     type: 'int128'  },
      { name: 'expiration', type: 'uint64'  },
      { name: 'nonce',      type: 'uint64'  },
      { name: 'appendix',   type: 'uint128' },
    ],
  }
  const value = {
    sender:     order.sender,
    priceX18:   BigInt(order.priceX18),
    amount:     BigInt(order.amount),
    expiration: BigInt(order.expiration),
    nonce:      BigInt(order.nonce),
    appendix:   BigInt(order.appendix),
  }
  return signTyped(credentials.nadoAgentPk, domain, types, value)
}

async function placeTriggerOrder(payload) {
  const res = await fetch(TRIGGER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  console.log('[Nado Trigger]', res.status, JSON.stringify(data))
  if (data.status !== 'success') throw new Error(`[Nado Trigger] ${data.error ?? 'failed'}`)
  return data
}

/*
async function placeTriggerOrder(payload, signature) {
  return fetch(`${TRIGGER_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, signature })
  })
}
*/

function buildTriggerAppendix({ isolated = false } = {}) {
  const TRIGGER_PRICE = 1n  // bits 12-13 : type = PRICE (1)
  return 1n                              // version (bit 0)
    | (1n << 11n)                        // reduce_only (bit 11) — OBLIGATOIRE pour TP/SL
    | ((isolated ? 1n : 0n) << 8n)      // isolated
    | (TRIGGER_PRICE << 12n)            // 4096

  /*
  return 1n                             // version
    | ((isolated ? 1n : 0n) << 8n)     // bit 8
    | (1n << 11n)                       // reduce_only OBLIGATOIRE pour TP/SL
    | (TRIGGER_PRICE << 12n)            // = 4096
    */
}
    
// Résultat normal : 4096 + 2048 (reduceOnly) = 6144

/*
async function placeTPSL({ productId, subaccount, side, size, tpPrice, slPrice, isolated }) {
  const isBuy = side === 'sell' // pour fermer un long → buy ; fermer un short → sell

  const buildTriggerOrder = (triggerPrice, isTP) => {
    const closeAmount = side === 'buy'
      ? toX18(size)          // fermer un short → positif
      : toX18(-size)         // fermer un long → négatif

    const pricereq = side === 'buy'
      ? (isTP ? { oraclepricebelow: toX18(triggerPrice) }
              : { oraclepriceabove: toX18(triggerPrice) })
      : (isTP ? { oraclepriceabove: toX18(triggerPrice) }
              : { oraclepricebelow: toX18(triggerPrice) })

    return {
      productid: productId,
      order: {
        sender: subaccount,
        priceX18: isTP ? toX18(triggerPrice * 0.99) : toX18(triggerPrice * 1.01),
        amount: closeAmount,
        expiration: 4294967295,
        nonce: genOrderNonce(),
        appendix: buildTriggerAppendix({ isolated }).toString()
      },
      trigger: { pricetrigger: { pricerequirement: pricereq } }
    }
  }

  const orders = []
  if (tpPrice) orders.push(buildTriggerOrder(tpPrice, true))
  if (slPrice) orders.push(buildTriggerOrder(slPrice, false))
  
  // Envoyer via placeorders (batch) sur trigger endpoint
  return placeTriggerOrder({
    placeorders: {
      orders: await Promise.all(orders.map(async o => ({
        ...o,
        signature: await signOrder(o.order, productId)
      }))),
      stoponfailure: false
    }
  })
}
*/

export async function placeTPSL({ productId, subaccount, side, size, tpPrice, slPrice, isolated, market, credentials }) {
  
  console.log('[TPSL] 1 - début', { productId, subaccount, side, size, tpPrice, slPrice, isolated })  // ← manquant
  await syncClock()

  const buildTriggerOrder = (triggerPrice, isTP) => {
    //const closeAmount = side === 'buy' ? Math.abs(size) : -Math.abs(size)
    // Position LONG → clôture = SELL → amount négatif
    // Position SHORT → clôture = BUY → amount positif
    const closeAmount = side === 'long' ? -Math.abs(size) : Math.abs(size)
    
    const slippage    = isTP ? 0.99 : 1.01
    /*
    const execPrice   = side === 'buy'
      ? (isTP ? triggerPrice * (2 - slippage) : triggerPrice * slippage)
      : (isTP ? triggerPrice * slippage        : triggerPrice * (2 - slippage))
      */

    // Pour un ordre de CLÔTURE, on veut toujours être sûr d'être rempli :
    // - Clôture LONG (sell) : prix d'exec en dessous du trigger → * 0.99
    // - Clôture SHORT (buy) : prix d'exec au-dessus du trigger  → * 1.01
    const execPrice = side === 'short'
      ? triggerPrice * 1.01   // ferme un SHORT → buy au-dessus
      : triggerPrice * 0.99   // ferme un LONG  → sell en dessous


    const pricereq = side === 'short'
      ? (isTP ? { oracle_price_below: String(roundToTick(triggerPrice, market.nadoPriceIncrementX18)) }
              : { oracle_price_above: String(roundToTick(triggerPrice, market.nadoPriceIncrementX18)) })
      : (isTP ? { oracle_price_above: String(roundToTick(triggerPrice, market.nadoPriceIncrementX18)) }
              : { oracle_price_below: String(roundToTick(triggerPrice, market.nadoPriceIncrementX18)) })

    return {
      product_id: productId,
      order: {
        sender:     subaccount,
        priceX18:   String(roundToTick(execPrice,    market.nadoPriceIncrementX18)),
        amount:     String(roundToTick(closeAmount,  market.nadoSizeIncrement)),
        expiration: '4294967295',
        nonce:      String(buildNonce()),
        appendix:   String(buildTriggerAppendix({ isolated })),
      },
      trigger: { price_trigger: { price_requirement: pricereq } }
    }
  }

  /*
  const orders = []
  if (tpPrice) orders.push(buildTriggerOrder(tpPrice, true))
  if (slPrice) orders.push(buildTriggerOrder(slPrice, false))
  if (!orders.length) return

  const signedOrders = await Promise.all(orders.map(async o => ({
    ...o,
    signature: await signTriggerOrder(o.order, productId, credentials),
  })))

// ← AJOUTE CES LIGNES
console.log('[Trigger payload]', JSON.stringify({
  place_orders: { orders: signedOrders, stop_on_failure: false }
}, null, 2))
  
  return placeTriggerOrder({
    placeorders: {
      orders: signedOrders,
      stoponfailure: false,
    }
  })
  */

   const orders = []
  if (tpPrice) orders.push(buildTriggerOrder(tpPrice, true))
  if (slPrice) orders.push(buildTriggerOrder(slPrice, false))
  console.log('[TPSL] 3 - orders built', orders.length)
  if (!orders.length) { console.warn('[TPSL] aucun ordre, return'); return }

  let signedOrders
  try {
    signedOrders = await Promise.all(orders.map(async o => {
      console.log('[TPSL] 4 - signing order', o.order)
      const sig = await signTriggerOrder(o.order, productId, credentials)
      console.log('[TPSL] 5 - signed', sig?.slice(0, 20))
      return { ...o, signature: sig }
    }))
  } catch (e) {
    console.error('[TPSL] ERREUR signature:', e.message)
    throw e
  }

  console.log('[TPSL] 6 - envoi trigger', JSON.stringify(signedOrders, null, 2))
  return placeTriggerOrder({
    place_orders: { orders: signedOrders, stop_on_failure: false }
  })
}

/*
export async function placeTpSl(order, credentials) {
  const { isBuy, size, tpSlConfig, market } = order
  await placeTPSL({
    productId:  market.nadoProductId,
    subaccount: buildSubaccount(
      credentials.nadoAddress,
      credentials.nadoSubaccount || 'default'
    ),
    side:       isBuy ? 'long' : 'short',
    size,
    tpPrice:    tpSlConfig.prices.tp ?? null,
    slPrice:    tpSlConfig.prices.sl ?? null,
    isolated:   market.nadoIsolatedOnly ?? false,
    market,
    credentials,
  })
}
*/

export async function placeTpSl(order, credentials) {
  const { isBuy, size, tpSlConfig, market } = order
  const prices = tpSlConfig.prices
  // Normalise les deux formats possibles
  const tpPrice = prices.tp ?? (isBuy ? prices.upPrice : prices.downPrice) ?? null
  const slPrice = prices.sl ?? (isBuy ? prices.downPrice : prices.upPrice) ?? null

  await placeTPSL({
    productId:  market.nadoProductId,
    subaccount: buildSubaccount(credentials.nadoAddress, credentials.nadoSubaccount || 'default'),
    side:       isBuy ? 'long' : 'short',
    size,
    tpPrice,
    slPrice,
    isolated:   market.nadoIsolatedOnly ?? false,
    market,
    credentials,
  })
}
// -------------------------------------------------------------------- TP/SL --


export async function cancelOrders({ nadoAgentPk, nadoAddress, nadoSubaccount, productIds, digests }) {
  await syncClock()
  const sender   = buildSubaccount(nadoAddress, nadoSubaccount || 'default')
  const nonce    = buildNonce()
  const endpoint = await getEndpointAddress()
  const domain   = { name: 'Nado', version: '0.0.1', chainId: CHAIN_ID, verifyingContract: endpoint }
  const types    = {
    Cancellation: [
      { name: 'sender',     type: 'bytes32'   },
      { name: 'productIds', type: 'uint32[]'  },
      { name: 'digests',    type: 'bytes32[]' },
      { name: 'nonce',      type: 'uint64'    },
    ],
  }
  const value     = { sender, productIds, digests, nonce }
  const signature = await signTyped(nadoAgentPk, domain, types, value)
  const res = await fetch(NADO_EXECUTE, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
    body: JSON.stringify({ cancel_orders: { sender, product_ids: productIds, digests, nonce: String(nonce), signature } }),
  })
  const data = await res.json()
  if (data.status !== 'success') throw new Error(`[Nado] ${data.error ?? 'cancel failed'}`)
  return data
}

// ─── Stats fetch ──────────────────────────────────────────────────────────────

const BASE_URL = 'https://archive.prod.nado.xyz'

function addressToSubaccount(address, name = 'default') {
  const addrHex    = address.toLowerCase().replace('0x', '')
  const nameHex    = Array.from(name).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  const namePadded = nameHex.padEnd(24, '0').slice(0, 24)
  return '0x' + addrHex + namePadded
}


async function getSubmissionIdxAtTime(timestampMs) {
  try {
    const res = await fetch(`${BASE_URL}/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        indexer: { submission_idx: { timestamp: Math.floor(timestampMs / 1000) } }
      })
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.indexer?.submission_idx ?? null
  } catch { return null }
}


// Décode le timestamp (ms) encodé dans le nonce Nado
// nonce = (recvTime_ms << 20) | rand_10bit
function nonceToMs(nonce) {
  try {
    return Number(BigInt(nonce) >> 20n)
  } catch { return 0 }
}

/* avant suppression logs
async function fetchMatches(subaccountBytes32, startTime, endTime) {
  let cursor = null, all = [], json = null
  while (true) {
    const query = { subaccounts: [subaccountBytes32], limit: 500 }
    if (cursor) query.cursor = cursor

    const res = await fetch(`${BASE_URL}/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matches: query })
    })
    if (!res.ok) break

    json = await res.json()
    const matches = json.matches || []
    if (matches.length === 0) break

    // ← log ici, dans la boucle, sur le premier batch uniquement
    if (all.length === 0 && matches.length > 0) {
      const m0 = matches[0]
      const ts = nonceToMs(m0.order?.nonce)
      console.log('[nonce→ts] brut:', m0.order?.nonce, '→', ts, '=', new Date(ts).toLocaleString('fr-FR'))
      console.log('[fetchMatches] startTime:', new Date(startTime).toLocaleString('fr-FR'))
      console.log('[fetchMatches] endTime:  ', new Date(endTime).toLocaleString('fr-FR'))
    }

    let reachedStart = false
    for (const m of matches) {
      const ts = nonceToMs(m.order?.nonce)
      if (ts === 0 || (endTime > 0 && ts > endTime)) continue
      if (startTime > 0 && ts < startTime) { reachedStart = true; break }
      all.push(m)
    }

    if (reachedStart) break
    if (!json.cursor || matches.length < 500) break
    cursor = json.cursor
  }

  console.log(`[fetchMatches] ${all.length} matches dans la plage`)
  return all
}
*/

async function fetchMatches(subaccountBytes32, startTime, endTime) {
  let cursor = null, all = []
  while (true) {
    const query = { subaccounts: [subaccountBytes32], limit: 500 }
    if (cursor) query.cursor = cursor

    const res = await fetch(`${BASE_URL}/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matches: query })
    })
    if (!res.ok) break

    const json    = await res.json()
    const matches = json.matches || []
    if (matches.length === 0) break

    let reachedStart = false
    for (const m of matches) {
      const ts = nonceToMs(m.order?.nonce)
      if (ts === 0 || (endTime > 0 && ts > endTime)) continue
      if (startTime > 0 && ts < startTime) { reachedStart = true; break }
      all.push(m)
    }

    if (reachedStart) break
    if (!json.cursor || matches.length < 500) break
    cursor = json.cursor
  }
  return all
}
/*
//avant tracking ordres
export async function fetchStats(address, subaccountName, startTime, endTime) {
  const subBytes = addressToSubaccount(address, subaccountName || 'default')
  const matches  = await fetchMatches(subBytes, startTime, endTime)
  console.log(`[Nado fetchStats] ${matches.length} matches trouvés`)
  return {
    pnlGross: matches.reduce((s, m) => s + parseFloat(m.realized_pnl || 0) / 1e18, 0),
    fees:     matches.reduce((s, m) => s + Math.abs(parseFloat(m.fee  || 0) / 1e18), 0),
    volume:   matches.reduce((s, m) => s + Math.abs(parseFloat(m.quote_filled || 0) / 1e18), 0),
    trades:   matches.length,
  }
}


export async function fetchStats(address, subaccountName, startTime, endTime) {
  const subBytes = addressToSubaccount(address, subaccountName || 'default')
  const matches  = await fetchMatches(subBytes, startTime, endTime)
  console.log(`[Nado fetchStats] ${matches.length} matches trouvés`)

  const rawTrades = matches.map(m => ({
    ...m,
    // champs normalisés pour matchDnGroups
    timestamp: nonceToMs(m.order?.nonce),
    market:    m.product_id != null ? String(m.product_id) : null,
    size:      Math.abs(parseFloat(m.base_filled  ?? 0) / 1e18),
    orderId:   m.order?.nonce ?? m.digest,
    pnlGross:  parseFloat(m.realized_pnl ?? 0) / 1e18,
    fees:      Math.abs(parseFloat(m.fee ?? 0) / 1e18),
  }))

  return {
    pnlGross: matches.reduce((s, m) => s + parseFloat(m.realized_pnl || 0) / 1e18, 0),
    fees:     matches.reduce((s, m) => s + Math.abs(parseFloat(m.fee  || 0) / 1e18), 0),
    volume:   matches.reduce((s, m) => s + Math.abs(parseFloat(m.quote_filled || 0) / 1e18), 0),
    trades:   matches.length,
    rawTrades,
  }
}
*/

export async function fetchStats(address, subaccountName, startTime, endTime) {
  const subBytes = addressToSubaccount(address, subaccountName ?? 'default')
  const matches  = await fetchMatches(subBytes, startTime, endTime)

  return {
    pnlGross: matches.reduce((s, m) => s + parseFloat(m.realizedpnl || 0) / 1e18, 0),
    fees:     matches.reduce((s, m) => s + Math.abs(parseFloat(m.fee || 0) / 1e18), 0),
    volume:   matches.reduce((s, m) => s + Math.abs(parseFloat(m.quotefilled || 0) / 1e18), 0),
    trades:   matches.length,
    rawTrades: matches.map(m => ({
      ...m,
      timestamp: nonceToMs(m.order?.nonce),          // ← reconstitue le timestamp
      market:    m.productid ?? m.order?.productid,
      size:      Math.abs(parseFloat(m.basefilled || 0) / 1e18),
      orderId:   m.order?.nonce?.toString() ?? null,  // ← clé unique
      pnlGross:  parseFloat(m.realizedpnl || 0) / 1e18,
      fees:      Math.abs(parseFloat(m.fee || 0) / 1e18),
    })),
  }
}
