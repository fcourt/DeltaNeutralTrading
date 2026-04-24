import { useTranslation } from 'react-i18next'
import styles from './LanguageSelector.module.css'

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
]

export default function LanguageSelector() {
  const { i18n, t } = useTranslation()

  const handleChange = (code) => {
    i18n.changeLanguage(code)
    document.documentElement.lang = code
  }

  return (
    <div className={styles.wrapper} role="group" aria-label={t('home.selectLanguage')}>
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          className={`${styles.btn} ${i18n.language === lang.code ? styles.active : ''}`}
          onClick={() => handleChange(lang.code)}
          aria-pressed={i18n.language === lang.code}
        >
          <span aria-hidden="true">{lang.flag}</span>
          <span>{lang.label}</span>
        </button>
      ))}
    </div>
  )
}
