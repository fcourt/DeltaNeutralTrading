// src/hooks/useWalletAccounts.js
/**
 * Persistance localStorage + état des comptes wallet.
 * Clé de regroupement = platformId (hyperliquid, xyz, hyena, extended, nado).
 *
 * Structure localStorage :
 *   "walletAccounts" →
 *   {
 *     hyperliquid: [ { key: "hyperliquid::0xABCD", label: "Principal",  address: "0xABCD…" } ],
 *     xyz:         [ { key: "xyz::0xEF01",         label: "Main",       address: "0xEF01…" } ],
 *     hyena:       [],
 *     extended:    [ { key: "extended::0xGH02",    label: "API Vault",  address: "0xGH02…" } ],
 *     nado:        [ { key: "nado::0xIJ03",        label: "Default",   address: "0xIJ03…" } ],
 *   }
 *
 *   "walletSelected" → JSON Array<string> des keys cochées
 *
 * Export :
 *   savedAccounts    – état courant (object par platformId)
 *   selectedAccounts – Set<string> des keys actives
 *   activeAddresses  – { platformId: string[] } adresses des comptes cochés
 *   onToggle         – (key) => void
 *   onAddAddress     – (platformId, label, address) => void
 *   onRemoveAddress  – (platformId, key) => void
 */

import { useState, useCallback, useMemo } from 'react'
import { PLATFORMS } from '../platforms/index.js'

const LS_ACCOUNTS = 'walletAccounts'
const LS_SELECTED = 'walletSelected'

/* ── Helpers localStorage ── */
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback }
  catch { return fallback }
}
const persist = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

/* ── État initial : toutes les plateformes ont un tableau (vide ou chargé) ── */
const initAccounts = () => {
  const saved = load(LS_ACCOUNTS, {})
  // Garantir que chaque platformId a au moins un tableau vide
  return PLATFORMS.reduce((acc, { id }) => {
    acc[id] = saved[id] ?? []
    return acc
  }, {})
}

const initSelected = (accounts) => {
  const arr = load(LS_SELECTED, null)
  if (arr) return new Set(arr)
  // Par défaut : tout cocher
  const all = Object.values(accounts).flat().map(a => a.key)
  return new Set(all)
}

/* ── Hook ─────────────────────────────────────── */
export function useWalletAccounts() {
  const [savedAccounts, setSavedAccounts] = useState(initAccounts)

  const [selectedKeys, setSelectedKeys] = useState(() =>
    initSelected(initAccounts())
  )

  /* ── Ajouter ── */
  const onAddAddress = useCallback((platformId, label, address) => {
    const key = `${platformId}::${address}`
    setSavedAccounts(prev => {
      const list = prev[platformId] ?? []
      if (list.some(a => a.key === key)) return prev       // doublon
      const next = { ...prev, [platformId]: [...list, { key, label, address }] }
      persist(LS_ACCOUNTS, next)
      return next
    })
    // Auto-cocher la nouvelle adresse
    setSelectedKeys(prev => {
      const next = new Set(prev)
      next.add(key)
      persist(LS_SELECTED, [...next])
      return next
    })
  }, [])

  /* ── Supprimer ── */
  const onRemoveAddress = useCallback((platformId, key) => {
    setSavedAccounts(prev => {
      const list = (prev[platformId] ?? []).filter(a => a.key !== key)
      const next = { ...prev, [platformId]: list }
      persist(LS_ACCOUNTS, next)
      return next
    })
    setSelectedKeys(prev => {
      const next = new Set(prev)
      next.delete(key)
      persist(LS_SELECTED, [...next])
      return next
    })
  }, [])

  /* ── Toggle sélection ── */
  const onToggle = useCallback((key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      persist(LS_SELECTED, [...next])
      return next
    })
  }, [])

  /* ── Adresses actives à plat, par platformId (pour les requêtes API) ── */
  const activeAddresses = useMemo(() =>
    Object.fromEntries(
      Object.entries(savedAccounts).map(([pid, list]) => [
        pid,
        list.filter(a => selectedKeys.has(a.key)).map(a => a.address),
      ])
    ),
  [savedAccounts, selectedKeys])

  return {
    savedAccounts,
    selectedAccounts: selectedKeys,
    activeAddresses,
    onToggle,
    onAddAddress,
    onRemoveAddress,
  }
}
