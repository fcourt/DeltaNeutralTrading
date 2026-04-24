import styles from './Card.module.css'

export default function Card({ children, className = '', glass = false }) {
  return (
    <div className={`${styles.card} ${glass ? styles.glass : ''} ${className}`}>
      {children}
    </div>
  )
}
