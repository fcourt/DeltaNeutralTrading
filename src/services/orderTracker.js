//src/services/orderTracker.js
/*
const STORAGE_KEY = 'order_groups_v1'
 // Sauvegarde un groupe d'ordres delta-neutral au moment de l'envoi.
 // @param {Object} group
 // @param {string} group.groupId       - ID unique du groupe (ex: crypto.randomUUID())
 // @param {Array}  group.legs          - [{ platformId, orderId, market, side, size, timestamp }]

export function saveOrderGroup({ groupId, legs }) {
  const existing = loadOrderGroups()
  existing.push({ groupId, legs, createdAt: Date.now() })
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(existing)) }
  catch (e) { console.warn('[orderTracker] save failed', e.message) }
}

export function loadOrderGroups() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [] }
  catch { return [] }
}

export function clearOrderGroups() {
  localStorage.removeItem(STORAGE_KEY)
}
*/

// src/services/orderTracker.js
const STORAGE_KEY = 'order_groups_v1'

// Store in-memory en fallback si localStorage est bloqué
let _memoryStore = null

function _read() {
  if (_memoryStore !== null) return _memoryStore
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    _memoryStore = []
    return _memoryStore
  }
}

function _write(data) {
  if (_memoryStore !== null) {
    _memoryStore = data
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // localStorage bloqué → bascule définitivement en mémoire
    _memoryStore = data
  }
}

/**
 * @param {Object} group
 * @param {string} group.groupId
 * @param {Array}  group.legs  — [{ platformId, orderId, market, side, size, timestamp }]
 *   orderId  = oid retourné par l'exchange (HL → data.response.data.statuses[0].resting?.oid
 *                                                ou .filled?.oid)
 */
export function saveOrderGroup({ groupId, legs }) {
  const existing = _read()
  existing.push({ groupId, legs, createdAt: Date.now() })
  _write(existing)
}

export function loadOrderGroups() {
  return _read()
}

export function clearOrderGroups() {
  if (_memoryStore !== null) {
    _memoryStore = []
  } else {
    try { localStorage.removeItem(STORAGE_KEY) }
    catch { _memoryStore = [] }
  }
}
