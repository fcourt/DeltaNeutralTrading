import { useTranslation } from 'react-i18next'
import styles from './LoadingSpinner.module.css'

export default function LoadingSpinner() {
  const { t } = useTranslation()
  return (
    <div className={styles.wrapper} role="status" aria-live="polite">
      <div className={styles.spinner} aria-hidden="true" />
      <span className={styles.label}>{t('common.loading')}</span>
    </div>
  )
}
