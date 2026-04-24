// src/hooks/usePositions.js
import { useState, useCallback } from 'react'
import { getAllPositions } from '../services/accountService.js'

export function usePositions(credentials, markets = []) {
  const [positions, setPositions] = useState([])
  const [loading,   setLoading]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setPositions(await getAllPositions(credentials, markets)) }
    catch (e) { console.warn('[usePositions]', e.message) }
    finally { setLoading(false) }
  }, [
    credentials.hlAddress, credentials.hlVaultAddress,
    credentials.extApiKey, credentials.nadoAddress, credentials.nadoSubaccount,
    markets,
  ])

  return { positions, loading, load }
}
