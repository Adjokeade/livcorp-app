import { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import serviceOffersService from '../../services/serviceOffersService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import OffersBoard from '../../components/offers/OffersBoard';

const API = {
  offers: serviceOffersService.missions,
  mine: serviceOffersService.myMissions,
  accept: serviceOffersService.acceptMission,
};

// Espace de la conciergerie : statut du compte tant qu'il n'est pas validé, puis les missions publiées par les clients.
export default function ConciergerieMissions() {
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.bootstrap);
  const [busy, setBusy] = useState(false);
  const status = user?.conciergerie_status;

  if (user?.account_type !== 'conciergerie') {
    return <Card><p className="text-sm text-on-surface-variant">Cette page est réservée aux comptes conciergerie.</p></Card>;
  }

  async function refresh() {
    setBusy(true);
    await refreshUser();
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Missions de conciergerie</h1>
        <p className="text-sm text-on-surface-variant">{user.company_name || `${user.first_name} ${user.last_name}`}</p>
      </div>

      {status === 'approved' ? (
        <OffersBoard api={API} noun="mission" emptyText="Aucune mission ouverte pour le moment. Revenez bientôt." />
      ) : (
        <Card>
          <h2 className="font-display text-lg font-bold">{status === 'rejected' ? 'Votre compte conciergerie a été refusé' : 'Votre compte est en cours d\'examen'}</h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            {status === 'rejected'
              ? `${user.conciergerie_rejection_reason ? `Motif : ${user.conciergerie_rejection_reason}. ` : ''}Contactez-nous si vous pensez qu'il s'agit d'une erreur.`
              : 'Notre équipe vérifie votre structure. Les missions de conciergerie s\'afficheront ici dès la validation. En attendant, vous pouvez déjà commander des livraisons.'}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {status !== 'rejected' && <Button variant="secondary" onClick={refresh} disabled={busy}>{busy ? 'Actualisation…' : 'Actualiser mon statut'}</Button>}
            <Link to="/client/commander" className="btn-primary text-center">Nouvelle livraison</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
