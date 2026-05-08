//src/services/orderTracker.js
const STORAGE_KEY = 'order_groups_v1'

/**
 * Sauvegarde un groupe d'ordres delta-neutral au moment de l'envoi.
 * @param {Object} group
 * @param {string} group.groupId       - ID unique du groupe (ex: crypto.randomUUID())
 * @param {Array}  group.legs          - [{ platformId, orderId, market, side, size, timestamp }]
 */
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
