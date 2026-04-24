import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '../ui/Logo.jsx'
import ThemeToggle from '../ui/ThemeToggle.jsx'

export default function AppHeader() {
  const { t } = useTranslation()
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link to="/" className="app-header__logo" aria-label="Delta Neutral — Home">
          <Logo size={26} />
          <span className="app-header__brand">Delta Neutral</span>
          <span className="app-header__badge">{t('common.beta')}</span>
        </Link>
        <div className="app-header__actions">
          <button className="app-header__icon-btn" aria-label="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          </button>
          <ThemeToggle />
          <button className="app-header__connect">Connect wallet</button>
        </div>
      </div>
    </header>
  )
}
