import { formatTime } from '../../lib/format';
import Card from '../common/Card';

const STEPS = [
  { key: 'creee', label: 'Commande confirmée' },
  { key: 'acceptee', label: 'Prise en charge' },
  { key: 'colis_recupere', label: 'Colis récupéré' },
  { key: 'en_cours_livraison', label: 'En route vers le destinataire' },
  { key: 'livree', label: 'Livré' },
];

// Frise du parcours du colis, avec l'heure de chaque étape franchie. En litige, on garde la dernière étape
// atteinte avant le litige plutôt que de tout décocher.
export default function OrderTimeline({ order }) {
  const history = order.status_history ?? [];
  const timeOf = (key) => (key === 'creee' ? order.created_at : history.find((h) => h.status === key)?.created_at);

  let current = order.status;
  if (current === 'litige') {
    current = [...history].reverse().find((h) => !['litige', 'annulee'].includes(h.status))?.status ?? 'creee';
  }
  const reached = STEPS.findIndex((s) => s.key === current);
  const name = order.deliverer?.user?.first_name;

  return (
    <Card>
      <h2 className="text-sm font-semibold text-on-surface-variant">SUIVI DE COMMANDE</h2>
      {order.status === 'litige' && (
        <p className="mt-2 rounded bg-error-container px-3 py-2 text-xs text-on-error-container">
          Un souci est survenu : notre équipe vous accompagne. Vous pouvez aussi nous écrire depuis la page Contact.
        </p>
      )}
      <ol className="mt-3">
        {STEPS.map((step, i) => {
          const done = i <= reached;
          const isCurrent = i === reached && order.status !== 'livree';
          const time = done ? timeOf(step.key) : null;
          return (
            <li key={step.key} className="relative flex items-start gap-3 pb-4 last:pb-0" aria-current={isCurrent ? 'step' : undefined}>
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" className={`absolute left-[9px] top-5 h-full w-0.5 ${i < reached ? 'bg-secondary' : 'bg-surface-container-high'}`} />
              )}
              <span
                className={`relative z-[1] mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  done ? 'bg-secondary text-on-secondary' : 'bg-surface-container-high text-on-surface-variant'
                } ${isCurrent ? 'ring-4 ring-secondary/25' : ''}`}
              >
                {done ? '✓' : ''}
              </span>
              <div className="flex flex-1 items-baseline justify-between gap-3">
                <span className={done ? 'font-medium' : 'text-on-surface-variant'}>
                  {step.key === 'acceptee' && name && done ? `Pris en charge par ${name}` : step.label}
                </span>
                {time && <span className="flex-shrink-0 text-xs text-on-surface-variant">{formatTime(time)}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
