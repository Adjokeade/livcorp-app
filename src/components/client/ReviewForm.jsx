import { useState } from 'react';
import clientOrderService from '../../services/clientOrderService';
import Button from '../common/Button';

const LABELS = ['', 'Décevant', 'Moyen', 'Bien', 'Très bien', 'Excellent'];

// Avis du client sur une livraison terminée : 1 à 5 étoiles + commentaire facultatif.
export default function ReviewForm({ orderId, delivererName, onSaved }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const review = await clientOrderService.review(orderId, { rating, comment: comment.trim() || null });
      onSaved(review);
    } catch (err) {
      setError(
        err.response?.data?.errors?.rating?.[0] ??
          err.response?.data?.message ??
          "Impossible d'envoyer votre avis. Réessayez.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="font-display text-lg font-bold">Comment s'est passée la livraison ?</h2>
      <p className="mt-1 text-sm text-on-surface-variant">
        Votre avis aide {delivererName ?? 'votre livreur'} et les prochains clients.
      </p>

      <div role="radiogroup" aria-label="Note de 1 à 5" className="mt-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} sur 5, ${LABELS[n]}`}
            onClick={() => setRating(n)}
            className={`flex h-11 w-11 items-center justify-center rounded text-3xl leading-none transition ${
              n <= rating ? 'text-primary' : 'text-outline-variant'
            }`}
          >
            ★
          </button>
        ))}
      </div>
      <p className="mt-1 h-5 text-sm font-semibold text-primary">{LABELS[rating]}</p>

      <label htmlFor="review-comment" className="mt-3 block text-sm font-semibold">
        Un commentaire ? (facultatif)
      </label>
      <textarea
        id="review-comment"
        rows={3}
        maxLength={500}
        className="textarea-field mt-1.5"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Ponctualité, soin du colis, amabilité…"
      />

      {error && (
        <p role="alert" className="mt-3 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}

      <Button type="submit" disabled={!rating || sending} className="mt-4 w-full">
        {sending ? 'Envoi…' : 'Envoyer mon avis'}
      </Button>
    </form>
  );
}
