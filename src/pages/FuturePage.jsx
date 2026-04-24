import { useTranslation } from 'react-i18next'
import styles from './FuturePage.module.css'

export default function FuturePage() {
  const { t } = useTranslation()

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('future.title')}</h1>
        <p className={styles.desc}>{t('future.description')}</p>
      </div>

      <div className={styles.comingSoon}>
        <div className={styles.orb} aria-hidden="true" />
        <div className={styles.icon} aria-hidden="true">◎</div>
        <p className={styles.message}>{t('future.comingSoon')}</p>
        <button className="btn-ghost">{t('future.notifyMe')}</button>
      </div>
    </div>
  )
}
