import { useState } from 'react';
import { formatFcfa } from '../../lib/format';
import Button from '../common/Button';
import Input from '../common/Input';

// Le livreur propose un autre prix que celui du client, avec un mot d'explication.
// Le client voit la proposition et décide : rien n'est changé tant qu'il n'a pas accepté.
export default function PriceOfferForm({ order, initialAmount, initialMessage, revision, onSubmit, onCancel }) {
  const [amount, setAmount] = useState(initialAmount ?? order.price);
  const [message, setMessage] = useState(initialMessage ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Part du livreur sur le montant saisi, déduite du ratio gain/prix de la course (commission comprise).
  const ratio = Number(order.estimated_earnings) > 0 ? Number(order.estimated_earnings) / Number(order.price) : 0.85;
  const earnings = Number(amount) > 0 ? Math.round(Number(amount) * ratio) : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(Number(amount), message.trim());
    } catch (err) {
      setError(err.response?.data?.errors?.amount?.[0] ?? err.response?.data?.message ?? "Impossible d'envoyer la proposition.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
      <p className="text-sm font-semibold">{revision ? 'Demander un nouveau prix' : 'Proposer un autre prix'}</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">
        Le client demande {formatFcfa(order.price)}. Il verra votre proposition et décidera de l'accepter ou non.
      </p>

      {error && (
        <p role="alert" className="mt-2 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}

      <Input
        className="mt-3"
        label="Votre prix (FCFA)"
        type="number"
        inputMode="numeric"
        min="500"
        step="50"
        required
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        hint={earnings > 0 ? `Vous gagneriez environ ${formatFcfa(earnings)} après commission.` : undefined}
      />
      <Input
        className="mt-3"
        label="Message (facultatif)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={300}
        placeholder={revision ? 'Ex. Le colis est plus lourd que sur la photo' : 'Ex. Trajet plus long qu\'annoncé, bouchons'}
      />

      <div className="mt-3 flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy} className="flex-1">
          Annuler
        </Button>
        <Button type="submit" disabled={busy} className="flex-1">
          {busy ? 'Envoi…' : 'Envoyer'}
        </Button>
      </div>
    </form>
  );
}
