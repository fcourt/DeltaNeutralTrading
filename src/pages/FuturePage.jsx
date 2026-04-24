import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card.jsx'

export default function FuturePage() {
  const { t } = useTranslation()
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t('future.title')}</h1>
        <p className="page-desc">{t('future.description')}</p>
      </div>
      <Card>
        <div className="future-card">
          <div className="future-card__orb" aria-hidden="true" />
          <div className="future-card__icon" aria-hidden="true">◈</div>
          <p className="future-card__msg">{t('future.comingSoon')}</p>
        </div>
      </Card>
    </>
  )
}
