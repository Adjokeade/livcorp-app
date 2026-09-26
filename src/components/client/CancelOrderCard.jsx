import { useState } from 'react';
import { Link } from 'react-router-dom';
import clientOrderService from '../../services/clientOrderService';
import Sheet from '../common/Sheet';
import Card from '../common/Card';
import Button from '../common/Button';

const REASONS = [
  "Je me suis trompé d'adresse",
  "Je n'ai plus besoin de cette livraison",
  'Le prix ne convient pas',
  'Autre raison',
];

// Annulation par le client. Possible tant que le livreur n'a pas récupéré le colis ; ensuite le colis est entre
// ses mains : on explique pourquoi le bouton disparaît et vers qui se tourner en cas de problème.
export default function CancelOrderCard({ order, delivererName, onCancelled }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cancellable = order.status === 'creee' || order.status === 'acceptee';
  const pickedUp = order.status === 'colis_recupere' || order.status === 'en_cours_livraison';

  if (pickedUp) {
    return (
      <p className="rounded-lg bg-surface-container px-4 py-3 text-sm text-on-surface-variant">
        Le livreur a récupéré votre colis : la commande ne peut plus être annulée. Un problème ?{' '}
        <Link to="/contact" className="font-semibold text-secondary underline">
          Contactez-nous
        </Link>
        .
      </p>
    );
  }
  if (!cancellable) return null;

  async function confirm() {
    setBusy(true);
    setError('');
    const text = [reason, details.trim()].filter(Boolean).join(' : ');
    try {
      const { order: updated } = await clientOrderService.cancel(order.id, text);
      setOpen(false);
      onCancelled(updated);
    } catch (err) {
      setError(err.response?.data?.message ?? "Impossible d'annuler la commande. Réessayez.");
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="!p-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="w-full text-center text-sm font-semibold text-error underline-offset-2 hover:underline"
        >
          Annuler la commande
        </button>
        <p className="mt-1 text-center text-xs text-on-surface-variant">Possible tant que le livreur n'a pas récupéré le colis.</p>
      </Card>

      <Sheet
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Annuler la commande ?"
        subtitle={`#${order.reference}`}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button onClick={confirm} disabled={busy} className="flex-1 !bg-error !text-on-error">
              {busy ? 'Annulation…' : 'Oui, annuler la commande'}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy} className="flex-1">
              Garder ma commande
            </Button>
          </div>
        }
      >
        <p className="rounded-lg bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
          {order.status === 'acceptee'
            ? `${delivererName ?? 'Votre livreur'} a déjà accepté votre course : il sera prévenu tout de suite.`
            : "Aucun livreur n'a encore accepté votre course. Les livreurs qui vous ont fait une proposition seront prévenus."}{' '}
          Rien n'est à payer : le règlement se fait à la réception du colis.
        </p>

        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Pourquoi annulez-vous ? (facultatif)</legend>
          <div className="mt-2 flex flex-col gap-2">
            {REASONS.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-3 rounded border border-outline-variant px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-fixed">
                <input type="radio" name="cancel-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4 accent-primary" />
                {r}
              </label>
            ))}
          </div>
        </fieldset>

        <label htmlFor="cancel-details" className="mt-4 block text-sm font-semibold">
          Un mot pour l'équipe ? (facultatif)
        </label>
        <textarea
          id="cancel-details"
          rows={2}
          maxLength={200}
          className="textarea-field mt-1.5"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />

        {error && (
          <p role="alert" className="mt-3 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </p>
        )}
      </Sheet>
    </>
  );
}
