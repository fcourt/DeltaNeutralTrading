// src/hooks/useMargins.js
import { useState, useEffect, useCallback } from 'react'
import { getAllMargins }  from '../services/accountService.js'
import { PLATFORMS }     from '../platforms/index.js'

// État initial dynamique : { hyperliquid: null, xyz: null, nado: null, … }
const INITIAL_MARGINS = Object.fromEntries(PLATFORMS.map(p => [p.id, null]))

export function useMargins(credentials, intervalMs = 15_000) {
  const [margins, setMargins] = useState(INITIAL_MARGINS)

  const refresh = useCallback(async () => {
    try { setMargins(await getAllMargins(credentials)) }
    catch (e) { console.warn('[useMargins]', e.message) }
  }, [
    credentials?.hlAddress,
    credentials?.hlVaultAddress,
    credentials?.extApiKey,
    credentials?.nadoAddress,
    credentials?.nadoSubaccount,
  ])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, intervalMs)
    return () => clearInterval(t)
  }, [refresh, intervalMs])

  return { margins, refresh }
}
