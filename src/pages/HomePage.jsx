import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '../components/ui/Logo.jsx'

export default function HomePage() {
  const { t } = useTranslation()

  return (
    <section className="home__hero">
      <div className="home__hero-content">
        <div className="home__hero-badge" aria-hidden="true">
          <Logo size={56} />
        </div>
        <h1 className="home__hero-title">{t('home.title')}</h1>
        <p className="home__hero-subtitle">{t('home.subtitle')}</p>
        <p className="home__hero-tagline">{t('home.tagline')}</p>
        <Link to="/open-trade" className="btn-primary">
          {t('home.cta')} →
        </Link>
      </div>

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
  )
}
