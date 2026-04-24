import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '../components/ui/Logo.jsx'
import LanguageSelector from '../components/ui/LanguageSelector.jsx'
import ThemeToggle from '../components/ui/ThemeToggle.jsx'
import styles from './HomePage.module.css'

export default function HomePage() {
  const { t } = useTranslation()

  return (
    <div className={styles.root}>
      <div className={styles.glowTop} aria-hidden="true" />
      <div className={styles.glowBottom} aria-hidden="true" />

      <header className={styles.topBar}>
        <div className={styles.topBarInner}>
          <div className={styles.logoRow}>
            <Logo size={32} />
            <span className={styles.brandName}>Delta Neutral</span>
          </div>
          <div className={styles.topBarActions}>
            <LanguageSelector />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className={styles.hero} id="main-content">
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <Logo size={56} />
          </div>

          <h1 className={styles.heroTitle}>
            {t('home.title')}
          </h1>

          <p className={styles.heroSubtitle}>
            {t('home.subtitle')}
          </p>

          <p className={styles.heroTagline}>
            {t('home.tagline')}
          </p>

          <Link to="/app" className="btn-primary">
            {t('home.enterApp')}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </div>

        <div className={styles.statsRow}>
          {[
            { label: 'Delta', value: '≈ 0.00' },
            { label: 'Strategies', value: '3' },
            { label: 'Status', value: 'Live' },
          ].map((stat) => (
            <div key={stat.label} className={styles.statCard}>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
