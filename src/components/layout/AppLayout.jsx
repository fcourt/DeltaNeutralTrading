import { Outlet, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AppHeader from './AppHeader.jsx'
import styles from './AppLayout.module.css'

const TABS = [
  { key: 'open-trade',       icon: '◈', translationKey: 'nav.openTrade' },
  { key: 'manage-positions', icon: '⊞', translationKey: 'nav.managePositions' },
  { key: 'future',           icon: '◎', translationKey: 'nav.future' },
  { key: 'configuration',    icon: '⚙', translationKey: 'nav.configuration' },
]

export default function AppLayout() {
  const { t } = useTranslation()

  return (
    <div className={styles.root}>
      <AppHeader />

      <nav className={styles.tabNav} role="navigation" aria-label="Main navigation">
        <div className={styles.tabList}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.key}
              to={`/app/${tab.key}`}
              className={({ isActive }) =>
                `${styles.tab} ${isActive ? styles.tabActive : ''}`
              }
            >
              <span className={styles.tabIcon} aria-hidden="true">{tab.icon}</span>
              <span className={styles.tabLabel}>{t(tab.translationKey)}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <main className={styles.main} id="main-content">
        <div className={styles.contentWrapper}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
