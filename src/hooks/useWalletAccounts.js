// src/hooks/useWalletAccounts.js
/**
 * Hook qui gère la persistance (localStorage) et la sélection
 * des comptes wallet par platformGroup (keysField).
 *
 * Retourne tout ce dont WalletFilter a besoin.
 *
 * Structure localStorage :
 *   "walletAccounts" → JSON de :
 *   {
 *     hl:   [ { key: "hl::0xABCD",  label: "Principal",  address: "0xABCD1234..." } ],
 *     ext:  [ { key: "ext::0xEF01", label: "Vault",      address: "0xEF012345..." } ],
 *     nado: [ { key: "nado::0xGH02",label: "Subaccount", address: "0xGH023456..." } ],
 *   }
 *
 *   "walletSelected" → JSON de Array<string> (les keys cochées)
 */

import { useState, useCallback, useMemo } from 'react'

const LS_ACCOUNTS = 'walletAccounts'
const LS_SELECTED = 'walletSelected'

/* ── helpers localStorage ── */
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback }
  catch { return fallback }
}
const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

export function useWalletAccounts() {
  const [savedAccounts, setSavedAccounts] = useState(() =>
    load(LS_ACCOUNTS, {})
  )

  const [selectedKeys, setSelectedKeys] = useState(() => {
    const arr = load(LS_SELECTED, null)
    if (arr) return new Set(arr)
    /* Par défaut : tout cocher */
    const all = Object.values(load(LS_ACCOUNTS, {}))
      .flat()
      .map(a => a.key)
    return new Set(all)
  })

  /* ── Ajouter une adresse ── */
  const handleAddAddress = useCallback((keysField, label, address) => {
    const key = `${keysField}::${address}`
    setSavedAccounts(prev => {
      const list = prev[keysField] ?? []
      /* Pas de doublon */
      if (list.some(a => a.key === key)) return prev
      const next = { ...prev, [keysField]: [...list, { key, label, address }] }
      save(LS_ACCOUNTS, next)
      return next
    })
    /* Auto-cocher la nouvelle adresse */
    setSelectedKeys(prev => {
      const next = new Set(prev)
      next.add(key)
      save(LS_SELECTED, [...next])
      return next
    })
  }, [])

  /* ── Supprimer une adresse ── */
  const handleRemoveAddress = useCallback((keysField, key) => {
    setSavedAccounts(prev => {
      const list = (prev[keysField] ?? []).filter(a => a.key !== key)
      const next = { ...prev, [keysField]: list }
      save(LS_ACCOUNTS, next)
      return next
    })
    setSelectedKeys(prev => {
      const next = new Set(prev)
      next.delete(key)
      save(LS_SELECTED, [...next])
      return next
    })
  }, [])

  /* ── Toggle sélection ── */
  const handleToggle = useCallback((key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      save(LS_SELECTED, [...next])
      return next
    })
  }, [])

  /* ── Liste à plat des adresses actives (pour les requêtes API) ── */
  const activeAddresses = useMemo(() => {
    const result = {}
    Object.entries(savedAccounts).forEach(([field, list]) => {
      result[field] = list
        .filter(a => selectedKeys.has(a.key))
        .map(a => a.address)
    })
    return result
  }, [savedAccounts, selectedKeys])

  return {
    savedAccounts,
    selectedAccounts: selectedKeys,
    activeAddresses,
    onToggle:         handleToggle,
    onAddAddress:     handleAddAddress,
    onRemoveAddress:  handleRemoveAddress,
  }
}
