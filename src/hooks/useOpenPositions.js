// src/hooks/useOpenPositions.js
// Charge les positions de toutes les plateformes actives
// et enrichit chaque position avec le prix mark courant via getPrice

import { useState, useCallback, useRef } from 'react'
import { PLATFORMS } from '../platforms/index.js'

/**
 * @param {object}   credentials - creds complets de l'utilisateur
 * @param {Array}    markets     - liste unifiee des marches (depuis useLivePrices)
 * @param {Function} getPrice    - (marketId, platformId) => number|null
 * @returns {{ positions, loading, reload }}
 */
export function useOpenPositions(credentials, markets = [], getPrice = null) {
  const [positions, setPositions] = useState([])
  const [loading,   setLoading]   = useState(false)
  const credsRef = useRef(credentials)
  credsRef.current = credentials

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const results = await Promise.allSettled(
        PLATFORMS.map(p =>
          typeof p.adapter.getPositions === 'function'
            ? p.adapter.getPositions(credsRef.current, markets).catch(() => [])
            : Promise.resolve([])
        )
      )

      // Normalise et dedup
      const seen = new Set()
      const all  = results.flatMap((r, i) => {
        if (r.status !== 'fulfilled') return []
        return r.value.map(pos => {
          // Enrichissement : markPx depuis useLivePrices si disponible
          const mId     = pos.marketId ?? null
          const markPx  = (mId && getPrice) ? (getPrice(mId, pos.platform) ?? pos.entryPx) : pos.entryPx
          const notional = pos.szi * (markPx || 0)

          // Cle de dedup : wallet + platform + coin
          const dedupKey = `${pos.wallet ?? 'default'}-${pos.platform}-${pos.coin}`
          if (seen.has(dedupKey)) return null
          seen.add(dedupKey)

          return {
            ...pos,
            markPx,
            notional,
            fundingPnl: pos.fundingPnl ?? 0,
            // Identifiant unique stable pour les listes React
            _id: dedupKey,
          }
        }).filter(Boolean)
      })

      setPositions(all)
    } catch (e) {
      console.warn('[useOpenPositions]', e.message)
    } finally {
      setLoading(false)
    }
  }, [markets, getPrice])

  return { positions, loading, reload }
}
