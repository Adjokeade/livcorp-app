import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Sheet from '../common/Sheet';
import Button from '../common/Button';
import { formatDuration, formatFcfa, formatKm, timeAgo } from '../../lib/format';

// Fiche détaillée d'une annonce de la page Annonces, ouverte à tous. Les adresses exactes, le destinataire
// et les consignes ne sont donnés qu'au livreur retenu : on n'affiche ici que les zones.
export default function PublicAnnouncementSheet({ open, order, viewer, onClose }) {
  const location = useLocation();
  const [copied, setCopied] = useState(false);

  if (!order) {
    return (
      <Sheet open={open} onClose={onClose} title="Annonce indisponible">
        <p className="text-sm text-on-surface-variant">
          Cette annonce n'est plus disponible : un livreur l'a peut-être déjà prise en charge.
        </p>
        <Button onClick={onClose} className="mt-4 w-full">
          Voir les autres annonces
        </Button>
      </Sheet>
    );
  }

  const rows = [
    ['Départ', order.pickup_area],
    ['Destination', order.dropoff_area],
    ['Distance', order.distance_km != null ? `${formatKm(order.distance_km)}${order.duration_min ? ` · environ ${formatDuration(order.duration_min)}` : ''}` : null],
    ['Urgence', order.urgency === 'express' ? 'Express (prioritaire)' : 'Standard'],
    ['Description', order.package_type],
    ['Publiée', timeAgo(order.created_at)],
    ['Paiement', order.payment_method === 'especes' ? 'En espèces, remis au livreur au retrait du colis' : 'Payé d\'avance par le client, versé au livreur après confirmation de réception'],
  ].filter(([, value]) => value);

  const role = viewer?.role;

  // Lien direct vers cette fiche : partage natif sur mobile, copie dans le presse-papiers sinon.
  async function share() {
    const url = `${window.location.origin}/annonces?annonce=${order.id}`;
    try {
      if (navigator.share) await navigator.share({ title: `Livraison ${order.pickup_area} → ${order.dropoff_area}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // partage annulé : rien à faire
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${order.pickup_area} → ${order.dropoff_area}`}
      subtitle={`${order.type === 'course' ? 'Course' : 'Colis'} · #${order.reference}`}
      footer={
        role === 'livreur' ? (
          <Link to="/deliverer/tableau-de-bord" className="btn-primary w-full">
            {viewer.deliverer?.verification_status === 'approved' ? 'Voir dans mon tableau de bord' : 'Compléter mon dossier pour accepter des courses'}
          </Link>
        ) : role === 'client' ? (
          <Link to="/client/commander" className="btn-primary w-full">
            Commander une livraison
          </Link>
        ) : !viewer ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link to="/connexion" state={{ from: location }} className="btn-primary flex-1">
              Se connecter
            </Link>
            <Link to="/inscription/livreur" className="btn-secondary flex-1">
              Rejoindre la flotte
            </Link>
          </div>
        ) : null
      }
    >
      {order.photo_url ? (
        <a href={order.photo_url} target="_blank" rel="noreferrer" aria-label="Voir la photo du colis en grand">
          <img src={order.photo_url} alt="Photo du colis" className="max-h-72 w-full rounded-lg bg-surface-container object-contain" />
        </a>
      ) : (
        <p className="rounded-lg bg-primary-fixed px-4 py-3 text-sm text-on-primary-fixed-variant">
          Cette annonce n'a pas de photo.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <p className="font-display text-3xl font-extrabold text-primary">{formatFcfa(order.price)}</p>
        <p className="text-xs text-on-surface-variant">Prix imposé par LIV corp selon la distance</p>
      </div>

      <dl className="mt-4 divide-y divide-outline-variant rounded-lg border border-outline-variant text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 px-3 py-2.5">
            <dt className="flex-shrink-0 text-on-surface-variant">{label}</dt>
            <dd className="break-words text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <button type="button" onClick={share} className="mt-4 text-sm font-semibold text-secondary">
        {copied ? 'Lien copié ✓' : 'Partager cette annonce'}
      </button>

      <p className="mt-3 text-xs text-on-surface-variant">
        {!viewer
          ? 'Livreur ? Connectez-vous pour proposer vos services. '
          : ''}
        L'adresse exacte, le destinataire et les consignes sont communiqués au livreur retenu.
      </p>
    </Sheet>
  );
}
