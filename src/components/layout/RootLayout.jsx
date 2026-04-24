import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '../ui/Logo.jsx'
import ThemeToggle from '../ui/ThemeToggle.jsx'
import LanguageSelector from '../ui/LanguageSelector.jsx'

const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
)

export default function RootLayout() {
  const { t } = useTranslation()

  const tabs = [
    { to: '/',                 label: t('nav.home'),           end: true },
    { to: '/open-trade',       label: t('nav.openTrade'),      end: false },
    { to: '/manage-positions', label: t('nav.managePositions'),end: false },
    { to: '/future',           label: t('nav.future'),         end: false },
  ]

  return (
    <div className="app-root">
      {/* Header unique */}
      <header className="app-header">
        <div className="app-header__inner">

          {/* Logo + Nav dans la même barre */}
          <div className="app-header__left">
            <NavLink to="/" className="app-header__logo" aria-label="Delta Neutral">
              <Logo size={26} />
              <span className="app-header__brand">Delta Neutral</span>
            </NavLink>

            <nav className="app-header__nav" aria-label="Main navigation">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    `app-header__nav-item${isActive ? ' app-header__nav-item--active' : ''}`
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Actions droite */}
          <div className="app-header__actions">
            <LanguageSelector />
            <ThemeToggle />
            <NavLink
              to="/configuration"
              className={({ isActive }) =>
                `app-header__icon-btn${isActive ? ' app-header__icon-btn--active' : ''}`
              }
              aria-label={t('nav.configuration')}
            >
              <SettingsIcon />
            </NavLink>
          </div>

        </div>
      </header>

      {/* Contenu des pages */}
      <main className="page-main">
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
