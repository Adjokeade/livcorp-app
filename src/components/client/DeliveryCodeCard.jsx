import { useState } from 'react';
import Card from '../common/Card';

// Code de remise : le destinataire le donne au livreur EN MAIN PROPRE, à la réception. C'est ce code, et non un
// simple clic du livreur, qui déclare le colis livré : il protège le client d'un faux "livré".
// Le destinataire n'est pas forcément le client (colis envoyé à quelqu'un) : le bouton Partager lui transmet le code.
export default function DeliveryCodeCard({ order, delivererName }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const code = order.delivery_code;

  if (!code || !['creee', 'acceptee', 'colis_recupere', 'en_cours_livraison', 'litige'].includes(order.status)) return null;

  const arrived = order.status === 'en_cours_livraison';
  // Discret tant que le livreur n'est pas là : on n'affiche pas le code à l'écran d'un téléphone posé sur une table.
  const visible = shown || arrived;
  const message = `Code de remise LIV corp pour votre colis (commande ${order.reference}) : ${code}. Donnez-le au livreur uniquement quand vous avez le colis en main.`;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Code de remise LIV corp', text: message });
        return;
      }
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // partage annulé : sans conséquence
    }
  }

  return (
    <Card className={arrived ? 'border-2 border-primary' : ''}>
      <h2 className="text-sm font-semibold text-on-surface-variant">CODE DE REMISE</h2>
      <p className="mt-2 text-sm">
        {arrived
          ? `Donnez ce code à ${delivererName ?? 'votre livreur'} quand vous avez reçu votre colis.`
          : 'À donner au livreur à la réception du colis, pas avant. Il sera demandé pour confirmer la livraison.'}
      </p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p
          aria-label={visible ? `Code ${code.split('').join(' ')}` : 'Code masqué'}
          className="font-display text-4xl font-extrabold tracking-[0.35em] text-primary"
        >
          {visible ? code : '••••'}
        </p>
        {!arrived && (
          <button type="button" onClick={() => setShown((v) => !v)} className="text-sm font-semibold text-secondary underline">
            {shown ? 'Masquer' : 'Afficher'}
          </button>
        )}
      </div>

      <button type="button" onClick={share} className="mt-3 text-sm font-semibold text-secondary underline">
        {copied ? 'Copié, à coller dans un message' : 'Envoyer le code au destinataire'}
      </button>
      <p className="mt-2 text-xs text-on-surface-variant">
        Ne le communiquez jamais par message au livreur ni à quelqu'un qui vous le demande : un livreur honnête l'attend devant vous.
      </p>
    </Card>
  );
}
