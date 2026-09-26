import { useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import DocumentsUpload from './DocumentsUpload';

const DOC_LABELS = { piece_identite: "Pièce d'identité", permis_conduire: 'Permis de conduire' };
const DOC_STATUS = { pending: "En cours d'examen", approved: 'Validé', rejected: 'Refusé' };

// Affiché à la place du tableau de bord tant que l'administrateur n'a pas validé
// le compte : les routes livreur répondent 403 (middleware deliverer.verified),
// inutile donc de les appeler.
export default function PendingValidation({ user, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  const deliverer = user?.deliverer;
  const documents = user?.documents ?? [];
  const rejected = deliverer?.verification_status === 'rejected';
  const hasDocuments = documents.length > 0;

  async function refresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-bold">Bonjour, {user?.first_name}</h1>

      <Card className="mt-6">
        <h2 className="font-display text-lg font-bold">
          {rejected ? 'Votre dossier a été refusé' : hasDocuments ? 'Votre dossier est en cours d\'examen' : 'Complétez votre dossier'}
        </h2>

        {rejected ? (
          <p className="mt-2 text-sm text-on-surface-variant">
            {deliverer?.rejection_reason
              ? `Motif : ${deliverer.rejection_reason}.`
              : 'Notre équipe n\'a pas pu valider vos pièces.'}{' '}
            Vous pouvez envoyer de nouveaux documents ci-dessous.
          </p>
        ) : hasDocuments ? (
          <p className="mt-2 text-sm text-on-surface-variant">
            Notre équipe vérifie vos pièces sous 24 à 48 h. Vous pourrez accepter des courses dès la validation de
            votre compte.
          </p>
        ) : (
          <p className="mt-2 text-sm text-on-surface-variant">
            Déposez votre pièce d'identité et votre permis pour que notre équipe valide votre compte livreur.
          </p>
        )}

        {hasDocuments && (
          <ul className="mt-4 divide-y divide-outline-variant rounded border border-outline-variant text-sm">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>{DOC_LABELS[doc.type] ?? doc.type}</span>
                <span className="font-semibold text-on-surface-variant">{DOC_STATUS[doc.status] ?? doc.status}</span>
              </li>
            ))}
          </ul>
        )}

        {(!hasDocuments || rejected) && (
          <div className="mt-4">
            <DocumentsUpload onDone={refresh} submitLabel={rejected ? 'Renvoyer mon dossier' : 'Envoyer mon dossier'} />
          </div>
        )}

        {hasDocuments && !rejected && (
          <Button variant="secondary" onClick={refresh} disabled={refreshing} className="mt-4 w-full">
            {refreshing ? 'Actualisation…' : 'Actualiser mon statut'}
          </Button>
        )}
      </Card>
    </div>
  );
}
