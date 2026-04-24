import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '../components/ui/Logo.jsx'
import LanguageSelector from '../components/ui/LanguageSelector.jsx'
import ThemeToggle from '../components/ui/ThemeToggle.jsx'

export default function HomePage() {
  const { t } = useTranslation()
  return (
    <div className="home">
      {/* Top bar */}
      <header className="home__topbar">
        <div className="home__topbar-inner">
          <div className="home__logo-row">
            <Logo size={26} />
            <span className="home__brand">Delta Neutral</span>
          </div>
          <div className="home__topbar-actions">
            <LanguageSelector />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="home__hero">
        <div className="home__hero-content">
          <div className="home__hero-badge" aria-hidden="true">
            <Logo size={56} />
          </div>
          <h1 className="home__hero-title">{t('home.title')}</h1>
          <p className="home__hero-subtitle">{t('home.subtitle')}</p>
          <p className="home__hero-tagline">{t('home.tagline')}</p>
          <Link to="/app/open-trade" className="btn-primary">
            {t('home.cta')} →
          </Link>
        </div>

        {/* Stats */}
        <div className="home__stats">
          {[
            { value: '$2.4M', label: t('home.stats.tvl') },
            { value: '142',   label: t('home.stats.positions') },
            { value: '0.02',  label: t('home.stats.avgDelta') },
          ].map((s) => (
            <div key={s.label} className="home__stat-card">
              <span className="home__stat-value">{s.value}</span>
              <span className="home__stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
