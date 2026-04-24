import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AppHeader from './AppHeader.jsx'

export default function AppLayout() {
  const { t } = useTranslation()

  const tabs = [
    { to: '/app/open-trade',        label: t('nav.openTrade'),        icon: '↗' },
    { to: '/app/manage-positions',  label: t('nav.managePositions'),  icon: '⊞' },
    { to: '/app/future',            label: t('nav.future'),           icon: '◈' },
    { to: '/app/configuration',     label: t('nav.configuration'),    icon: '⚙' },
  ]

  return (
    <div className="app-root">
      <AppHeader />

      <nav className="tab-nav" aria-label="Main navigation">
        <div className="tab-nav__list" role="tablist">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `tab-nav__item${isActive ? ' tab-nav__item--active' : ''}`
              }
              role="tab"
            >
              <span className="tab-nav__icon" aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="page-main">
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
