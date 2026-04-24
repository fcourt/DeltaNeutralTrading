import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'fr', label: 'FR', flag: '🇫🇷' },
]

export default function LanguageSelector() {
  const { i18n } = useTranslation()
  const current = i18n.language?.slice(0, 2)

  return (
    <div className="lang-selector" role="group" aria-label="Language selector">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={`lang-selector__btn${current === lang.code ? ' lang-selector__btn--active' : ''}`}
          aria-pressed={current === lang.code}
          aria-label={`Switch to ${lang.label}`}
        >
          <span aria-hidden="true">{lang.flag}</span>
          {lang.label}
        </button>
      ))}
    </div>
  )
}
