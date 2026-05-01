// src/hooks/useFundingRates.js
import { useState, useEffect, useRef } from 'react'
import { getFundingRate } from '../services/priceService.js'
import { getPlatform }    from '../platforms/index.js'

export function useFundingRates(
  marketId, platform1Id, platform2Id, extApiKey = '', markets = [], intervalMs = 60_000
) {
  const [rates, setRates] = useState({
    p1: null, p2: null,
    p1Bid: null, p1Ask: null,
    p2Bid: null, p2Ask: null,
    extBid: null, extAsk: null,  // conservé pour compat
  })

  // Stabiliser credentials sans déclencher de re-renders inutiles
  const credentialsRef = useRef({ extApiKey })
  credentialsRef.current = { extApiKey }

  useEffect(() => {
    if (!marketId || !platform1Id || !markets.length) return

    const refresh = async () => {
      try {
        const market = markets.find(m => m.id === marketId)
        if (!market) return

        const credentials = credentialsRef.current

        const [r1, r2] = await Promise.all([
          getFundingRate(platform1Id, market, credentials),
          platform2Id
            ? getFundingRate(platform2Id, market, credentials)
            : Promise.resolve({ rate: null, bid: null, ask: null }),
        ])

        // extBid/extAsk : cherche la plateforme dont la source est 'ext'
        // sans hardcoder le platformId 'extended'
        const p1Source = getPlatform(platform1Id)?.source
        const p2Source = getPlatform(platform2Id)?.source
        const extR = p1Source === 'ext' ? r1 : p2Source === 'ext' ? r2 : null

        setRates({
          p1: r1.rate,  p2: r2.rate,
          p1Bid: r1.bid, p1Ask: r1.ask,
          p2Bid: r2.bid, p2Ask: r2.ask,
          extBid: extR?.bid ?? null,
          extAsk: extR?.ask ?? null,
        })
      } catch (e) { console.warn('[useFundingRates]', e.message) }
    }

    refresh()
    const t = setInterval(refresh, intervalMs)
    return () => clearInterval(t)
  }, [marketId, platform1Id, platform2Id, markets, intervalMs])
  //  ^ extApiKey retiré des deps : géré via credentialsRef

  return rates
}
