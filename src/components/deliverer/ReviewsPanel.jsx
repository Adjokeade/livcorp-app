import { useEffect, useState } from 'react';
import delivererService from '../../services/delivererService';
import Card from '../common/Card';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import Stars from '../common/Stars';
import { formatDate } from '../../lib/format';

// Avis reçus des clients : moyenne en tête, puis les commentaires, du plus récent au plus ancien.
export default function ReviewsPanel() {
  const [reviews, setReviews] = useState(null);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  async function load(nextPage) {
    try {
      const data = await delivererService.reviews(nextPage);
      setReviews((prev) => (nextPage === 1 ? data.data : [...(prev ?? []), ...data.data]));
      setSummary(data.summary);
      setPage(data.current_page);
      setLastPage(data.last_page);
      setError('');
    } catch {
      setError('Impossible de charger vos avis. Réessayez.');
    }
  }

  useEffect(() => {
    load(1);
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    await load(page + 1);
    setLoadingMore(false);
  }

  if (error && !reviews) {
    return (
      <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
        {error}
      </p>
    );
  }

  if (!reviews) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center gap-4">
        {summary.count > 0 ? (
          <>
            <p className="font-display text-4xl font-extrabold text-primary">{summary.average.toFixed(1)}</p>
            <div>
              <Stars value={summary.average} className="text-2xl" />
              <p className="text-sm text-on-surface-variant">
                {summary.count} avis de clients
              </p>
            </div>
          </>
        ) : (
          <p className="text-on-surface-variant">
            Pas encore d'avis. Ils apparaîtront ici dès que vos clients auront noté leurs livraisons.
          </p>
        )}
      </Card>

      {reviews.map((review) => (
        <Card key={review.id}>
          <div className="flex items-center justify-between gap-3">
            <Stars value={review.rating} className="text-lg" />
            <span className="text-xs text-on-surface-variant">{formatDate(review.created_at)}</span>
          </div>
          {review.comment ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{review.comment}</p>
          ) : (
            <p className="mt-2 text-sm text-on-surface-variant">Pas de commentaire.</p>
          )}
          <p className="mt-2 text-xs text-on-surface-variant">
            {review.client_first_name} · course #{review.order_reference}
          </p>
        </Card>
      ))}

      {page < lastPage && (
        <Button variant="secondary" onClick={loadMore} disabled={loadingMore} className="w-full sm:w-auto sm:self-center">
          {loadingMore ? 'Chargement…' : 'Voir plus d\'avis'}
        </Button>
      )}
    </div>
  );
}
