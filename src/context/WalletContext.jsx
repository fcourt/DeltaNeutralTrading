import { createContext, useContext, useState } from 'react'

const WalletContext = createContext(null)

export function WalletProvider({ children }) {
  const [hlAddress,      setHlAddress]      = useState(() => localStorage.getItem('hl_address')?.trim()       || '')
  const [hlVaultAddress, setHlVaultAddress] = useState(() => localStorage.getItem('hl_vault_address')?.trim() || '')
  const [hlAgentPk,      setHlAgentPk]      = useState(() => localStorage.getItem('hl_agent_pk')              || '')
  const [extApiKey,      setExtApiKey]      = useState(() => localStorage.getItem('ext_api_key')              || '')
  const [extStarkPk,     setExtStarkPk]     = useState(() => localStorage.getItem('ext_stark_pk')             || '')
  const [extL2Vault,     setExtL2Vault]     = useState(() => localStorage.getItem('ext_l2_vault')             || '')
  const [nadoAddress,    setNadoAddress]    = useState(() => localStorage.getItem('nado_address')             || '')
  const [nadoAgentPk,    setNadoAgentPk]    = useState(() => localStorage.getItem('nado_agent_pk')            || '')
  const [nadoSubaccount, setNadoSubaccount] = useState(() => localStorage.getItem('nado_subaccount')          || 'default')

  const saveHlAddress      = (v) => { const val = v.trim(); setHlAddress(val);      localStorage.setItem('hl_address',       val) }
  const saveHlVaultAddress = (v) => { const val = v.trim(); setHlVaultAddress(val); localStorage.setItem('hl_vault_address', val) }
  const saveHlAgentPk      = (v) => { setHlAgentPk(v);      localStorage.setItem('hl_agent_pk',    v) }
  const saveExtApiKey      = (v) => { setExtApiKey(v);       localStorage.setItem('ext_api_key',    v) }
  const saveExtStarkPk     = (v) => { setExtStarkPk(v);      localStorage.setItem('ext_stark_pk',   v) }
  const saveExtL2Vault     = (v) => { setExtL2Vault(v);      localStorage.setItem('ext_l2_vault',   v) }
  const saveNadoAddress    = (v) => { setNadoAddress(v);     localStorage.setItem('nado_address',    v) }
  const saveNadoAgentPk    = (v) => { setNadoAgentPk(v);     localStorage.setItem('nado_agent_pk',   v) }
  const saveNadoSubaccount = (v) => { setNadoSubaccount(v);  localStorage.setItem('nado_subaccount', v) }

  // Statuts dérivés — passent au vert dès que les champs requis sont remplis
  const canTradeHL   = !!hlAgentPk
  const canTradeExt  = !!extStarkPk && !!extL2Vault
  const canTradeNado = !!nadoAddress && !!nadoAgentPk

  const resetAll = () => {
    [
      'hl_address', 'hl_agent_pk', 'hl_vault_address',
      'ext_stark_pk', 'ext_l2_vault', 'ext_api_key',
      'nado_address', 'nado_agent_pk', 'nado_subaccount',
    ].forEach(k => localStorage.removeItem(k))
    setHlAddress('');      setHlVaultAddress(''); setHlAgentPk('')
    setExtApiKey('');      setExtStarkPk('');     setExtL2Vault('')
    setNadoAddress('');    setNadoAgentPk('');    setNadoSubaccount('default')
  }

  return (
    <WalletContext.Provider value={{
      hlAddress,      saveHlAddress,
      hlVaultAddress, saveHlVaultAddress,
      hlAgentPk,      saveHlAgentPk,
      extApiKey,      saveExtApiKey,
      extStarkPk,     saveExtStarkPk,
      extL2Vault,     saveExtL2Vault,
      nadoAddress,    saveNadoAddress,
      nadoAgentPk,    saveNadoAgentPk,
      nadoSubaccount, saveNadoSubaccount,
      canTradeHL,
      canTradeExt,
      canTradeNado,
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
