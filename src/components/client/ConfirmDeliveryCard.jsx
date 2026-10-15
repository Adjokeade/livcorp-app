import { useState } from 'react';
import clientOrderService from '../../services/clientOrderService';
import { formatDate, formatTime } from '../../lib/format';
import Button from '../common/Button';
import Card from '../common/Card';
import PhotoViewer from '../common/PhotoViewer';
import Sheet from '../common/Sheet';

const REASONS = [
  ['colis_non_livre', "Le colis n'est pas arrivé à destination"],
  ['colis_endommage', 'Le colis est abîmé ou incomplet'],
  ['autre', 'Autre problème'],
];

// Colis remis : le livreur a envoyé la photo de réception. C'est l'EXPÉDITEUR qui confirme (le destinataire n'a pas
// forcément l'application). Sans réponse avant l'échéance, la réception est confirmée automatiquement.
export default function ConfirmDeliveryCard({ order, delivererName, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [problemOpen, setProblemOpen] = useState(false);
  const [reason, setReason] = useState('colis_non_livre');
  const [description, setDescription] = useState('');

  if (order.status !== 'remise') return null;

  const name = delivererName ?? 'Votre livreur';
  const deadline = order.auto_confirm_at ? new Date(order.auto_confirm_at) : null;
  const sameDay = deadline && deadline.toDateString() === new Date().toDateString();

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      onChanged(await clientOrderService.confirmDelivery(order.id));
    } catch (err) {
      setError(err.response?.data?.message ?? 'Impossible de confirmer. Réessayez.');
      setBusy(false);
    }
  }

  async function report() {
    setBusy(true);
    setError('');
    try {
      onChanged(await clientOrderService.reportProblem(order.id, { reason, description: description.trim() }));
      setProblemOpen(false);
    } catch (err) {
      setError(err.response?.data?.errors?.description?.[0] ?? err.response?.data?.message ?? 'Envoi impossible. Réessayez.');
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden border-2 border-primary !p-0">
      {order.delivery_photo_url && <PhotoViewer src={order.delivery_photo_url} alt="Photo de réception" className="h-56 rounded-none sm:h-72" />}
      <div className="p-4">
        <h2 className="font-display text-lg font-bold">Votre colis a été remis</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {name} a envoyé la photo de réception ci-dessus. Si le colis est bien arrivé, confirmez : l'argent sera alors versé à {name}.
        </p>
        {deadline && (
          <p className="mt-2 text-xs text-on-surface-variant">
            Sans réponse de votre part, la réception sera confirmée automatiquement {sameDay ? `aujourd'hui à ${formatTime(deadline)}` : `le ${formatDate(deadline)} à ${formatTime(deadline)}`}.
          </p>
        )}

        {error && !problemOpen && <p role="alert" className="mt-3 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
          <Button onClick={confirm} disabled={busy} className="flex-1">{busy && !problemOpen ? 'Confirmation…' : 'Confirmer la réception'}</Button>
          <Button variant="secondary" onClick={() => setProblemOpen(true)} disabled={busy} className="flex-1">Signaler un problème</Button>
        </div>
      </div>

      <Sheet
        open={problemOpen}
        onClose={() => !busy && setProblemOpen(false)}
        title="Signaler un problème"
        subtitle={`#${order.reference}`}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button onClick={report} disabled={busy || description.trim().length < 5} className="flex-1">{busy ? 'Envoi…' : 'Envoyer le signalement'}</Button>
            <Button variant="secondary" onClick={() => setProblemOpen(false)} disabled={busy} className="flex-1">Annuler</Button>
          </div>
        }
      >
        <p className="rounded-lg bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
          L'argent reste bloqué chez LIV corp le temps que notre équipe examine la situation. Le livreur n'est pas payé tant qu'elle n'a pas tranché.
        </p>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Que s'est-il passé ?</legend>
          <div className="mt-2 flex flex-col gap-2">
            {REASONS.map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-3 rounded border border-outline-variant px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-fixed">
                <input type="radio" name="problem-reason" value={value} checked={reason === value} onChange={() => setReason(value)} className="h-4 w-4 accent-primary" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor="problem-description" className="mt-4 block text-sm font-semibold">Décrivez le problème</label>
        <textarea id="problem-description" rows={3} maxLength={1000} className="textarea-field mt-1.5" value={description} onChange={(e) => setDescription(e.target.value)} />
        {error && <p role="alert" className="mt-3 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}
      </Sheet>
    </Card>
  );
}
