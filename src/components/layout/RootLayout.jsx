import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'
import Logo from '../ui/Logo.jsx'
import LanguageSelector from '../ui/LanguageSelector.jsx'

export default function RootLayout() {
  const { t } = useTranslation('common')
  const location = useLocation()
  const isHome = location.pathname === '/'

  const navLinks = [
    { to: '/open-trade',       labelKey: 'nav.openTrade' },
    { to: '/manage-positions', labelKey: 'nav.managePositions' },
    { to: '/future',           labelKey: 'nav.future' },
    { to: '/setting-keys',     labelKey: 'nav.settingKeys' }, 
  ]

  return (
    <div className="root">
      <header className="header">
        <div className="header-inner">
          <div className="header-left">
            <NavLink to="/" className="logo-link" aria-label="Accueil">
              <Logo />
            </NavLink>
            <nav className="nav" aria-label="Navigation principale">
              {navLinks.map(({ to, labelKey }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' active' : ''}`
                  }
                >
                  {t(labelKey)}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="header-right">
            {isHome && <LanguageSelector />}
            <NavLink
              to="/configuration"
              className={({ isActive }) =>
                `config-btn${isActive ? ' active' : ''}`
              }
              aria-label={t('nav.configuration')}
              title={t('nav.configuration')}
            >
              <Settings size={20} strokeWidth={1.8} />
            </NavLink>
          </div>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
