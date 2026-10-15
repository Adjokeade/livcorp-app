import { useEffect, useState } from 'react';
import delivererService from '../../services/delivererService';
import { formatDuration, formatFcfa, formatKm, formatTime } from '../../lib/format';
import Button from '../common/Button';
import Card from '../common/Card';
import ChatSheet from '../common/ChatSheet';
import Sheet from '../common/Sheet';
import StatusBadge from '../common/StatusBadge';
import PhotoField from '../client/PhotoField';
import RouteInfo from './RouteInfo';

const NEXT_STATUS = {
  acceptee: { next: 'colis_recupere', label: "J'ai récupéré le colis" },
  colis_recupere: { next: 'en_cours_livraison', label: 'Je pars en livraison' },
};

const UNREACHABLE_WAIT_MIN = 10; // même valeur que le serveur (services.orders.unreachable_wait_min)

const RELEASE_REASONS = [
  { value: 'panne', label: 'Panne ou problème de véhicule' },
  { value: 'trop_loin', label: 'Trop loin pour moi' },
  { value: 'colis_different', label: 'Le colis ne correspond pas à la description' },
  { value: 'client_injoignable', label: 'Client injoignable' },
  { value: 'autre', label: 'Autre raison' },
];

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function errorText(err, fallback = 'Action impossible. Réessayez.') {
  const errors = err.response?.data?.errors;
  return (errors && Object.values(errors)[0]?.[0]) ?? err.response?.data?.message ?? fallback;
}

// Une course acceptée, côté livreur : où aller, ce qu'il reste à faire, et les actions de chaque étape
// (arrivée, remise avec photo de réception, désistement, destinataire injoignable, discussion avec le client).
export default function MyOrderCard({ order, nextStop = null, busy, onAdvance, onChanged, onMessagesRead, autoOpenChat = false, onChatShown }) {
  const now = useNow();
  const [chatOpen, setChatOpen] = useState(autoOpenChat);

  // Ouverte par une notification ("?chat=…") : on prévient le tableau de bord pour qu'elle ne se rouvre pas au retour sur l'onglet.
  useEffect(() => {
    if (autoOpenChat) onChatShown?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [working, setWorking] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const status = order.status;
  const inProgress = ['acceptee', 'colis_recupere', 'en_cours_livraison'].includes(status);
  // Livraison payée en espèces et pas encore encaissée : on ne récupère pas le colis avant d'avoir reçu l'argent.
  const cashToCollect = status === 'acceptee' && order.payment_method === 'especes' && order.payment_status !== 'paye';
  const conversationOpen = inProgress || status === 'remise' || status === 'litige';
  const failed = status === 'litige' && order.failed_delivery_at;

  // Attente sur place : elle compte à partir du "Je suis arrivé" à la destination.
  const arrivedAtDropoff = order.dropoff_arrived_at ? new Date(order.dropoff_arrived_at).getTime() : null;
  const waitedSec = arrivedAtDropoff ? Math.max(0, Math.floor((now - arrivedAtDropoff) / 1000)) : 0;
  const waitedMin = Math.floor(waitedSec / 60);
  const canDeclareUnreachable = waitedMin >= UNREACHABLE_WAIT_MIN;

  async function run(key, action, successNotice = '') {
    setWorking(key);
    setError('');
    setNotice('');
    try {
      await action();
      if (successNotice) setNotice(successNotice);
      await onChanged();
    } catch (err) {
      setError(errorText(err));
      await onChanged();
    } finally {
      setWorking(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            #{order.reference} <span className="font-normal text-on-surface-variant">· {formatFcfa(order.price)}</span>
          </p>
          <div className="mt-2 flex gap-3">
            {order.photo_url && (
              <a href={order.photo_url} target="_blank" rel="noreferrer" className="flex-shrink-0" aria-label="Voir la photo du colis en grand">
                <img src={order.photo_url} alt="Photo du colis" loading="lazy" className="h-16 w-16 rounded object-cover" />
              </a>
            )}
            <div className="min-w-0 flex-1">
              <RouteInfo
                order={order}
                highlight={status === 'acceptee' ? 'pickup' : status === 'annulee' || status === 'livree' ? undefined : 'dropoff'}
              />
            </div>
          </div>

          {inProgress && nextStop && (
            <p className="mt-2 rounded bg-secondary-fixed px-3 py-2 text-sm text-on-secondary-fixed">
              {nextStop.type === 'pickup' ? 'Jusqu\'au point de collecte' : 'Jusqu\'à la destination'} :{' '}
              <strong>{formatKm(nextStop.distance_km)}</strong> · {nextStop.eta_min > 0 ? `environ ${formatDuration(nextStop.eta_min)}` : 'vous y êtes'}
              {nextStop.order > 1 && <span className="text-xs"> (arrêt n°{nextStop.order} de votre tournée)</span>}
            </p>
          )}

          {order.recipient_name && (
            <p className="mt-2 text-sm text-on-surface-variant">
              Destinataire : {order.recipient_name}
              {order.recipient_phone && (
                <>
                  {' · '}
                  <a href={`tel:${order.recipient_phone}`} className="font-semibold text-secondary underline">
                    {order.recipient_phone}
                  </a>
                </>
              )}
            </p>
          )}

          {status === 'annulee' && (
            <p className="mt-2 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
              Le client a annulé cette course : ne vous déplacez pas.
            </p>
          )}
          {(inProgress || status === 'remise') && (
            order.payment_method === 'especes' ? (
              <p className="mt-2 rounded bg-secondary-fixed px-3 py-2 text-sm text-on-secondary-fixed">
                {order.payment_status === 'paye'
                  ? `Payé en espèces : vous avez encaissé ${formatFcfa(order.price)}. Votre commission sera déduite de vos prochains versements.`
                  : `Paiement en espèces : ${formatFcfa(order.price)} à encaisser auprès de l'expéditeur au retrait.`}
              </p>
            ) : (
              <p className="mt-2 rounded bg-secondary-fixed px-3 py-2 text-sm text-on-secondary-fixed">
                Déjà payé par le client et bloqué chez LIV corp. Vous serez crédité de <strong>{formatFcfa(order.estimated_earnings ?? order.price)}</strong> dès que l'expéditeur confirmera la réception.
              </p>
            )
          )}
        </div>
        <StatusBadge status={status} forDeliverer className="self-start sm:self-center" />
      </div>

      {order.instructions && inProgress && (
        <p className="break-words rounded bg-surface-container px-3 py-2 text-sm">
          <span className="font-semibold">Consignes du client : </span>
          {order.instructions}
        </p>
      )}

      {/* ------------------------------------------------------------ Actions selon l'étape */}
      {status === 'acceptee' && (
        <div className="flex flex-col gap-2">
          {order.pickup_arrived_at ? (
            <p className="text-sm text-on-surface-variant">Arrivé au retrait à {formatTime(order.pickup_arrived_at)}.</p>
          ) : (
            <Button variant="secondary" onClick={() => run('arrive-pickup', () => delivererService.arrived(order.id, 'pickup'))} disabled={working !== null}>
              {working === 'arrive-pickup' ? '…' : 'Je suis arrivé au point de retrait'}
            </Button>
          )}
          {cashToCollect && (
            <div className="rounded-lg border-2 border-primary p-3">
              <p className="text-sm font-semibold">Paiement en espèces : encaissez {formatFcfa(order.price)}</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Auprès de l'expéditeur, en main propre, avant de récupérer le colis. Vous gardez cet argent : seule votre commission ({formatFcfa(Math.round(order.price - (order.estimated_earnings ?? order.price)))}) est due à LIV corp, déduite de vos prochains versements.
              </p>
              <Button onClick={() => run('cash', () => delivererService.cashCollected(order.id), 'Encaissement confirmé : vous pouvez récupérer le colis.')} disabled={working !== null} className="mt-3 w-full">
                {working === 'cash' ? '…' : `J'ai encaissé ${formatFcfa(order.price)} en espèces`}
              </Button>
            </div>
          )}
          <Button onClick={() => onAdvance(order)} disabled={busy || working !== null || cashToCollect}>
            {busy ? '…' : NEXT_STATUS.acceptee.label}
          </Button>
        </div>
      )}

      {status === 'colis_recupere' && (
        <Button onClick={() => onAdvance(order)} disabled={busy || working !== null}>
          {busy ? '…' : NEXT_STATUS.colis_recupere.label}
        </Button>
      )}

      {status === 'en_cours_livraison' && (
        <div className="flex flex-col gap-2">
          {order.dropoff_arrived_at ? (
            <p role="status" className="rounded bg-secondary-fixed px-3 py-2 text-sm text-on-secondary-fixed">
              Sur place depuis <strong>{waitedMin > 0 ? `${waitedMin} min ${String(waitedSec % 60).padStart(2, '0')} s` : `${waitedSec} s`}</strong>. Le client est prévenu.
            </p>
          ) : (
            <Button variant="secondary" onClick={() => run('arrive-dropoff', () => delivererService.arrived(order.id, 'dropoff'))} disabled={working !== null}>
              {working === 'arrive-dropoff' ? '…' : 'Je suis arrivé chez le destinataire'}
            </Button>
          )}

          <Button onClick={() => setDeliverOpen(true)} disabled={working !== null}>
            Remettre le colis (photo de réception)
          </Button>

          {order.dropoff_arrived_at && (
            <div className="flex flex-col gap-1 text-sm">
              {canDeclareUnreachable ? (
                <button
                  type="button"
                  onClick={() => run('unreachable', () => delivererService.unreachable(order.id))}
                  disabled={working !== null}
                  className="self-start font-semibold text-error underline"
                >
                  {working === 'unreachable' ? '…' : 'Le destinataire est injoignable'}
                </button>
              ) : (
                <p className="text-xs text-on-surface-variant">
                  Destinataire injoignable ? Essayez de l'appeler et de lui écrire. Vous pourrez le déclarer après {UNREACHABLE_WAIT_MIN} minutes d'attente
                  (encore {UNREACHABLE_WAIT_MIN - waitedMin} min).
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {status === 'remise' && (
        <p role="status" className="rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
          Photo de réception envoyée{order.handed_over_at ? ` à ${formatTime(order.handed_over_at)}` : ''}. En attente de la confirmation de l'expéditeur : sans réponse de sa part, elle sera confirmée automatiquement.
        </p>
      )}

      {failed && (
        <p role="status" className="rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
          Le client a été prévenu que le destinataire est injoignable. Dès qu'il confirme l'être de nouveau, vous pouvez reprendre la remise.
        </p>
      )}

      {conversationOpen && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-outline-variant pt-2 text-sm">
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            aria-haspopup="dialog"
            className="relative font-semibold text-secondary underline"
          >
            Écrire au client
            {order.unread_messages_count > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary no-underline">
                {order.unread_messages_count}
              </span>
            )}
          </button>
          {status === 'acceptee' && (
            <button type="button" onClick={() => setReleaseOpen(true)} aria-haspopup="dialog" className="font-semibold text-error underline">
              Se désister
            </button>
          )}
        </div>
      )}

      {notice && (
        <p role="status" className="text-sm font-semibold text-primary">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}

      <ChatSheet
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        orderId={order.id}
        otherName={order.client?.first_name ?? 'le client'}
        quickMessages={['Je suis en route', 'Je suis arrivé', 'Je suis devant le portail', "Pouvez-vous m'appeler ?", "Je n'arrive pas à trouver l'adresse"]}
        onRead={() => onMessagesRead?.(order.id)}
      />
      <DeliverSheet
        open={deliverOpen}
        order={order}
        onClose={() => setDeliverOpen(false)}
        onDelivered={async () => {
          setDeliverOpen(false);
          await onChanged();
        }}
      />
      <ReleaseSheet
        open={releaseOpen}
        onClose={() => setReleaseOpen(false)}
        order={order}
        onReleased={async () => {
          setReleaseOpen(false);
          await onChanged();
        }}
      />
    </Card>
  );
}

// Remise du colis : la photo de réception est OBLIGATOIRE. Le destinataire n'a pas besoin de l'application : c'est l'expéditeur
// qui voit cette photo et confirme la réception, ce qui déclenche le paiement du livreur.
function DeliverSheet({ open, order, onClose, onDelivered }) {
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setPhoto(null);
      setError('');
    }
  }, [open]);

  async function submit(e) {
    e?.preventDefault();
    if (!photo) {
      setError('Prenez une photo du colis remis : elle prouve la réception.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await delivererService.deliver(order.id, { photo });
      onDelivered();
    } catch (err) {
      setError(errorText(err, 'Remise impossible. Réessayez.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !busy && onClose()}
      title="Remettre le colis"
      subtitle={`#${order.reference}`}
      footer={
        <Button onClick={submit} disabled={busy || !photo} className="w-full">
          {busy ? 'Envoi…' : 'Envoyer la photo et valider la remise'}
        </Button>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-on-surface-variant">
          Photographiez le colis une fois <strong className="text-on-surface">remis au destinataire</strong> (on doit voir le colis et, si possible, son lieu de remise).
          L'expéditeur la verra et confirmera la réception : vous serez alors crédité.
        </p>

        <PhotoField file={photo} onChange={setPhoto} required label="Photo de réception" hint="Obligatoire : c'est votre preuve de livraison." filename="reception.jpg" />

        {error && (
          <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </p>
        )}
        <button type="submit" className="sr-only">
          Valider
        </button>
      </form>
    </Sheet>
  );
}

// Désistement avant le retrait du colis : la course repart en circulation, le client est prévenu.
function ReleaseSheet({ open, order, onClose, onReleased }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setNote('');
      setError('');
    }
  }, [open]);

  async function confirm() {
    if (!reason) {
      setError('Choisissez le motif de votre désistement.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await delivererService.release(order.id, reason, note.trim());
      onReleased();
    } catch (err) {
      setError(errorText(err, 'Désistement impossible. Réessayez.'));
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !busy && onClose()}
      title="Se désister de cette course ?"
      subtitle={`#${order.reference}`}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button onClick={confirm} disabled={busy} className="flex-1 !bg-error !text-on-error">
            {busy ? '…' : 'Oui, me désister'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy} className="flex-1">
            Garder la course
          </Button>
        </div>
      }
    >
      <p className="rounded-lg bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
        La course sera proposée à d'autres livreurs, au prix fixé par LIV corp, et il sera prévenu. Vous ne pourrez plus la reprendre.
        Les désistements répétés peuvent limiter votre accès aux courses.
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">Motif</legend>
        <div className="mt-2 flex flex-col gap-2">
          {RELEASE_REASONS.map((r) => (
            <label
              key={r.value}
              className="flex cursor-pointer items-center gap-3 rounded border border-outline-variant px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-fixed"
            >
              <input type="radio" name="release-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="h-4 w-4 accent-primary" />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="release-note" className="mt-4 block text-sm font-semibold">
        Précision (facultatif)
      </label>
      <textarea id="release-note" rows={2} maxLength={300} className="textarea-field mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} />

      {error && (
        <p role="alert" className="mt-3 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}
    </Sheet>
  );
}
