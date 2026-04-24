import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '../ui/Logo.jsx'
import ThemeToggle from '../ui/ThemeToggle.jsx'
import styles from './AppHeader.module.css'

export default function AppHeader() {
  const { t } = useTranslation()

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.logoLink} aria-label="Delta Neutral — Home">
          <Logo size={28} />
          <span className={styles.brandName}>Delta Neutral</span>
          <span className={styles.badge}>{t('common.beta')}</span>
        </Link>

        <div className={styles.actions}>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
