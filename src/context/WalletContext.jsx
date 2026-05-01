// src/contexts/WalletContext.jsx
import { createContext, useContext, useState, useCallback } from 'react'
import { canTrade } from '../services/orderService.js'

const WalletContext = createContext(null)

// ── Déclaration centralisée des champs credentials ──────────────────────────
// Pour ajouter une nouvelle plateforme : ajouter ses champs ici uniquement.
//
// key        : clé localStorage
// stateKey   : nom de la variable dans le context
// default    : valeur initiale si absent du localStorage
// trim       : true si la valeur doit être trimée à la sauvegarde
const CREDENTIAL_FIELDS = [
  { key: 'hl_address',       stateKey: 'hlAddress',       default: '',        trim: true  },
  { key: 'hl_vault_address', stateKey: 'hlVaultAddress',  default: '',        trim: true  },
  { key: 'hl_agent_pk',      stateKey: 'hlAgentPk',       default: '',        trim: false },
  { key: 'ext_api_key',      stateKey: 'extApiKey',       default: '',        trim: false },
  { key: 'ext_stark_pk',     stateKey: 'extStarkPk',      default: '',        trim: false },
  { key: 'ext_l2_vault',     stateKey: 'extL2Vault',      default: '',        trim: false },
  { key: 'nado_address',     stateKey: 'nadoAddress',     default: '',        trim: false },
  { key: 'nado_agent_pk',    stateKey: 'nadoAgentPk',     default: '',        trim: false },
  { key: 'nado_subaccount',  stateKey: 'nadoSubaccount',  default: 'default', trim: false },
  // ── Nouvelle plateforme ──
  // { key: 'maPf_api_key', stateKey: 'maPfApiKey', default: '', trim: false },
]
// ────────────────────────────────────────────────────────────────────────────

function readField(field) {
  const raw = localStorage.getItem(field.key) ?? field.default
  return field.trim ? raw.trim() : raw
}

export function WalletProvider({ children }) {
  // Un useState par champ, initialisé depuis localStorage
  const [values, setValues] = useState(() =>
    Object.fromEntries(CREDENTIAL_FIELDS.map(f => [f.stateKey, readField(f)]))
  )

  // Setter générique — utilisé par chaque saveXxx
  const save = useCallback((stateKey, value) => {
    const field = CREDENTIAL_FIELDS.find(f => f.stateKey === stateKey)
    const val   = field?.trim ? value.trim() : value
    setValues(prev => ({ ...prev, [stateKey]: val }))
    if (field) localStorage.setItem(field.key, val)
  }, [])

  // Sauvegarde individuelle — rétrocompat avec les composants existants
  const saveHlAddress      = (v) => save('hlAddress',      v)
  const saveHlVaultAddress = (v) => save('hlVaultAddress', v)
  const saveHlAgentPk      = (v) => save('hlAgentPk',      v)
  const saveExtApiKey      = (v) => save('extApiKey',      v)
  const saveExtStarkPk     = (v) => save('extStarkPk',     v)
  const saveExtL2Vault     = (v) => save('extL2Vault',     v)
  const saveNadoAddress    = (v) => save('nadoAddress',    v)
  const saveNadoAgentPk    = (v) => save('nadoAgentPk',    v)
  const saveNadoSubaccount = (v) => save('nadoSubaccount', v)
  // ── Nouvelle plateforme ──
  // const saveMaPfApiKey = (v) => save('maPfApiKey', v)

  // Statuts dérivés — délégués à orderService.canTrade (source de vérité unique)
  const canTradeHL   = canTrade('hyperliquid', values)
  const canTradeExt  = canTrade('extended',    values)
  const canTradeNado = canTrade('nado',        values)
  // ── Nouvelle plateforme ──
  // const canTradeMaPf = canTrade('maPf', values)

  const resetAll = useCallback(() => {
    CREDENTIAL_FIELDS.forEach(f => localStorage.removeItem(f.key))
    setValues(Object.fromEntries(CREDENTIAL_FIELDS.map(f => [f.stateKey, f.default])))
  }, [])

  return (
    <WalletContext.Provider value={{
      ...values,
      saveHlAddress, saveHlVaultAddress, saveHlAgentPk,
      saveExtApiKey, saveExtStarkPk, saveExtL2Vault,
      saveNadoAddress, saveNadoAgentPk, saveNadoSubaccount,
      // saveMaPfApiKey,
      canTradeHL, canTradeExt, canTradeNado,
      // canTradeMaPf,
      save,     // setter générique pour les nouveaux composants
      resetAll,
    }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}

/*
save(stateKey, value) — setter générique qui remplace les 9 setters individuels en interne ; les saveXxx sont conservés en rétrocompat

Pour la nouvelle plateforme, 3 lignes à décommenter : le champ dans CREDENTIAL_FIELDS, le saveXxx, et le canTradeXxx.
*/
