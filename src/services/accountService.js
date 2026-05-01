// src/services/accountService.js
import { PLATFORMS } from '../platforms/index.js'

export async function getAllMargins(credentials) {
  const results = await Promise.allSettled(
    PLATFORMS.map(p => p.adapter.getMargin({ ...credentials, platformId: p.id }))
  )
  return Object.fromEntries(
    PLATFORMS.map((p, i) => [
      p.id,
      results[i].status === 'fulfilled' ? results[i].value : null,
    ])
  )
}

export async function getAllPositions(credentials, markets = []) {
  // Dédupliquer par source pour éviter d'appeler le même adapter plusieurs fois
  const seen    = new Set()
  const sources = PLATFORMS.filter(p => {
    if (seen.has(p.source)) return false
    seen.add(p.source)
    return typeof p.adapter.getPositions === 'function'
  })

  const results = await Promise.allSettled(
    sources.map(p => p.adapter.getPositions(credentials, markets))
  )

  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
}
