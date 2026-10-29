import { useState } from 'react';
import useAuthStore from '../../store/useAuthStore';
import serviceOffersService from '../../services/serviceOffersService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import OffersBoard from '../../components/offers/OffersBoard';
import { PROFESSION_LABEL } from '../../lib/professions';

const API = {
  offers: serviceOffersService.offers,
  mine: serviceOffersService.myOffers,
  accept: serviceOffersService.accept,
};

// Espace du prestataire : statut du dossier tant qu'il n'est pas validé, puis les offres de prestation de son métier.
export default function ProviderOffers() {
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.bootstrap);
  const provider = user?.service_provider;
  const status = provider?.status;

  if (!provider) {
    return <Card><p className="text-sm text-on-surface-variant">Aucun dossier prestataire n'est rattaché à ce compte.</p></Card>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Bonjour, {user.first_name}</h1>
        <p className="text-sm text-on-surface-variant">
          {PROFESSION_LABEL[provider.profession] ?? provider.profession}
          {provider.profession === 'autre' && provider.profession_other ? ` : ${provider.profession_other}` : ''} · {provider.city}
        </p>
      </div>

      {status === 'approved' ? <OffersBoard api={API} emptyText="Aucune offre ouverte pour votre métier pour le moment. Revenez bientôt." /> : <PendingCard status={status} reason={provider.rejection_reason} onRefresh={refreshUser} />}
    </div>
  );
}

function PendingCard({ status, reason, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const rejected = status === 'rejected';

  async function refresh() {
    setBusy(true);
    await onRefresh();
    setBusy(false);
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">{rejected ? 'Votre dossier a été refusé' : 'Votre dossier est en cours d\'examen'}</h2>
      <p className="mt-2 text-sm text-on-surface-variant">
        {rejected
          ? `${reason ? `Motif : ${reason}. ` : ''}Contactez-nous si vous pensez qu'il s'agit d'une erreur.`
          : 'Notre équipe vérifie votre profil. Les offres de prestation de votre métier s\'afficheront ici dès la validation.'}
      </p>
      {!rejected && (
        <Button variant="secondary" onClick={refresh} disabled={busy} className="mt-4 w-full sm:w-auto">
          {busy ? 'Actualisation…' : 'Actualiser mon statut'}
        </Button>
      )}
    </Card>
  );
}
