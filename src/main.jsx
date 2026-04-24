import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WalletProvider } from './context/WalletContext'
import App from './App'
import './i18n'
import './styles/global.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <App />
      </WalletProvider>
    </BrowserRouter>
  </StrictMode>
)
