import { useEffect, useState } from 'react';
import delivererService from '../../services/delivererService';
import { formatFcfa, formatTime } from '../../lib/format';
import Button from '../common/Button';
import Card from '../common/Card';
import ChatSheet from '../common/ChatSheet';
import PaymentBadge from '../common/PaymentBadge';
import Sheet from '../common/Sheet';
import StatusBadge from '../common/StatusBadge';
import PhotoField from '../client/PhotoField';
import PriceOfferForm from './PriceOfferForm';
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
// (arrivée, remise avec code, désistement, destinataire injoignable, discussion avec le client).
export default function MyOrderCard({ order, busy, onAdvance, onOffer, onWithdraw, onChanged, onMessagesRead, autoOpenChat = false, onChatShown }) {
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
  const paid = order.payment_status === 'paye';
  const blockedByPayment = status === 'en_cours_livraison' && !paid;
  const conversationOpen = inProgress || status === 'litige';
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
          {inProgress && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <PaymentBadge order={order} />
              {!paid && (
                <span className="text-on-surface-variant">
                  À encaisser à la remise : <strong className="text-on-surface">{formatFcfa(order.price)}</strong>
                </span>
              )}
            </p>
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
          <Button onClick={() => onAdvance(order)} disabled={busy || working !== null}>
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

          {blockedByPayment && (
            <p role="status" className="rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
              En attente de la validation du paiement par le client. Le bouton de remise s'activera dès qu'il l'aura fait.
            </p>
          )}
          {paid && (
            <p role="status" className="rounded bg-secondary-fixed px-3 py-2 text-sm text-on-secondary-fixed">
              Paiement validé{order.payment_method === 'especes' ? ` : le client vous a remis ${formatFcfa(order.price)} en espèces.` : ' en ligne.'}{' '}
              Demandez le code de remise au destinataire.
            </p>
          )}

          <Button onClick={() => setDeliverOpen(true)} disabled={blockedByPayment || working !== null}>
            Remettre le colis
          </Button>

          {order.dropoff_arrived_at && (
            <div className="flex flex-col gap-1 text-sm">
              <button
                type="button"
                onClick={() => run('remind', () => delivererService.remindCode(order.id), 'Le client a été prévenu : il retrouve son code dans l\'application.')}
                disabled={working !== null}
                className="self-start font-semibold text-secondary underline"
              >
                {working === 'remind' ? '…' : 'Le destinataire a oublié son code'}
              </button>
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

      {failed && (
        <p role="status" className="rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
          Le client a été prévenu que le destinataire est injoignable. Dès qu'il confirme l'être de nouveau, vous pouvez reprendre la remise.
        </p>
      )}

      {status === 'acceptee' && <RevisionRequest order={order} onSubmit={onOffer} onWithdraw={onWithdraw} />}

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

// Remise du colis : le destinataire donne son code de remise au livreur (photo en plus pour un paiement en espèces).
function DeliverSheet({ open, order, onClose, onDelivered }) {
  const [code, setCode] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cashPhoto = order.payment_method === 'especes';

  useEffect(() => {
    if (open) {
      setCode('');
      setPhoto(null);
      setError('');
    }
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (!/^\d{4}$/.test(code)) {
      setError('Le code de remise comporte 4 chiffres.');
      return;
    }
    if (cashPhoto && !photo) {
      setError('Prenez une photo du colis remis : elle est obligatoire pour un paiement en espèces.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await delivererService.deliver(order.id, { code, photo });
      onDelivered();
    } catch (err) {
      setError(errorText(err, 'Remise impossible. Réessayez.'));
      setCode('');
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
        <Button onClick={submit} disabled={busy} className="w-full">
          {busy ? 'Vérification…' : 'Confirmer la livraison'}
        </Button>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-on-surface-variant">
          Demandez le <strong className="text-on-surface">code de remise à 4 chiffres</strong> au destinataire, en face de vous. C'est ce code qui
          confirme la livraison.
        </p>

        <div>
          <label htmlFor="delivery-code" className="mb-1.5 block text-sm font-semibold">
            Code du destinataire
          </label>
          <input
            id="delivery-code"
            className="input-field text-center font-display text-3xl font-extrabold tracking-[0.5em]"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            data-autofocus
            placeholder="••••"
          />
        </div>

        <PhotoField
          file={photo}
          onChange={setPhoto}
          required={cashPhoto}
          label="Photo du colis remis"
          hint={cashPhoto ? 'Obligatoire pour un paiement en espèces : elle protège le client et vous.' : 'Une preuve en plus en cas de doute.'}
          filename="remise.jpg"
        />

        {error && (
          <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </p>
        )}
        <button type="submit" className="sr-only">
          Confirmer
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
        La course sera proposée à d'autres livreurs, au prix fixé par le client, et il sera prévenu. Vous ne pourrez plus la reprendre.
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

// Avant le retrait du colis, le livreur peut demander un autre prix (colis plus lourd ou plus volumineux que
// sur la photo). Le client décide ; sans son accord, le prix reste celui convenu.
export function RevisionRequest({ order, onSubmit, onWithdraw }) {
  const [open, setOpen] = useState(false);
  const offer = order.my_offer;

  if (open) {
    return (
      <PriceOfferForm
        order={order}
        revision
        initialAmount={offer?.amount}
        initialMessage={offer?.message}
        onSubmit={async (amount, message) => {
          await onSubmit(order.id, amount, message);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    );
  }

  if (offer?.status === 'pending') {
    return (
      <div className="rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
        Demande de nouveau prix : <strong>{formatFcfa(offer.amount)}</strong>, en attente de la réponse du client.
        <span className="mt-1 flex gap-4 font-semibold">
          <button type="button" onClick={() => setOpen(true)} className="underline">
            Modifier
          </button>
          <button type="button" onClick={() => onWithdraw(order.id)} className="underline">
            Retirer
          </button>
        </span>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setOpen(true)} className="self-start text-sm font-semibold text-secondary underline">
      Demander une révision du prix
    </button>
  );
}
