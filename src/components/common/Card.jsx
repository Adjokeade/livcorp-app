// hover : la carte se soulève au survol (cartes cliquables ou mises en avant, pas les formulaires).
export default function Card({ className = '', hover = false, children }) {
  return <div className={`card ${hover ? 'card-hover' : ''} ${className}`}>{children}</div>;
}
