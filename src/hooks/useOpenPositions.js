// src/hooks/useOpenPositions.js
// Charge les positions de toutes les plateformes actives
// et enrichit chaque position avec le prix mark courant via getPrice
//
// FIX boucle infinie : markets et getPrice sont stockes en refs
// pour que reload() ait une reference STABLE et ne relance pas
// le useEffect du parent a chaque tick de useLivePrices.

import { useState, useCallback, useRef } from 'react'
import { PLATFORMS } from '../platforms/index.js'

/**
 * @param {object}   credentials - creds complets de l'utilisateur
 * @param {Array}    markets     - liste unifiee des marches (depuis useLivePrices)
 * @param {Function} getPrice    - (marketId, platformId) => number|null
 * @returns {{ positions, loading, reload }}
 *
 * reload() a une reference STABLE (ne change jamais).
 * Les valeurs fraîches de markets et getPrice sont lues via refs au moment de l'appel.
 */
export function useOpenPositions(credentials, markets = [], getPrice = null) {
  const [positions, setPositions] = useState([])
  const [loading,   setLoading]   = useState(false)

  // Refs pour eviter de recreer reload() a chaque changement de markets/getPrice
  const credsRef    = useRef(credentials)
  const marketsRef  = useRef(markets)
  const getPriceRef = useRef(getPrice)

  // Mise a jour des refs sans recrer reload
  credsRef.current    = credentials
  marketsRef.current  = markets
  getPriceRef.current = getPrice

  // reload() est stable : [] comme deps
  const reload = useCallback(async () => {
    const currentCreds    = credsRef.current
    const currentMarkets  = marketsRef.current
    const currentGetPrice = getPriceRef.current

    setLoading(true)
    try {
      const results = await Promise.allSettled(
        PLATFORMS.map(p =>
          typeof p.adapter.getPositions === 'function'
            ? p.adapter.getPositions(currentCreds, currentMarkets).catch(() => [])
            : Promise.resolve([])
        )
      )

      const seen = new Set()
      const all  = results.flatMap(r => {
        if (r.status !== 'fulfilled') return []
        return r.value.map(pos => {
          const mId      = pos.marketId ?? null
          const markPx   = (mId && currentGetPrice)
            ? (currentGetPrice(mId, pos.platform) ?? pos.entryPx)
            : pos.entryPx
          const notional = pos.szi * (markPx || 0)

          const dedupKey = `${pos.wallet ?? 'default'}-${pos.platform}-${pos.coin}`
          if (seen.has(dedupKey)) return null
          seen.add(dedupKey)

          return {
            ...pos,
            markPx,
            notional,
            fundingPnl : pos.fundingPnl ?? 0,
            _id        : dedupKey,
          }
        }).filter(Boolean)
      })

      setPositions(all)
    } catch (e) {
      console.warn('[useOpenPositions]', e.message)
    } finally {
      setLoading(false)
    }
  }, []) // <- deps vides : reload ne change JAMAIS de reference

  return { positions, loading, reload }
}
