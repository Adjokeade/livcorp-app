import { useEffect, useState } from 'react';
import delivererService from '../../services/delivererService';
import Card from '../common/Card';
import Input from '../common/Input';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import { formatDate, formatFcfa } from '../../lib/format';

// Paiement en ligne : LIV corp doit le net au livreur. Paiement en espèces : le livreur a déjà
// encaissé, seule sa commission est à déduire de ses prochains versements.
const EARNING_STATUS = {
  en_ligne: {
    due: { label: 'À verser', color: 'bg-primary-fixed text-on-primary-fixed-variant' },
    included_in_payout: { label: 'Versement en cours', color: 'bg-secondary-fixed text-on-secondary-fixed' },
    paid: { label: 'Versé', color: 'bg-surface-container-high text-on-surface-variant' },
  },
  especes: {
    due: { label: 'À déduire', color: 'bg-error-container text-on-error-container' },
    included_in_payout: { label: 'Déduction en cours', color: 'bg-secondary-fixed text-on-secondary-fixed' },
    paid: { label: 'Déduit', color: 'bg-surface-container-high text-on-surface-variant' },
  },
};

const PAYOUT_STATUS = {
  pending: 'En attente',
  processing: 'En cours',
  paid: 'Versé',
  failed: 'Échec, nouvel essai automatique',
};

// Portefeuille du livreur : solde à recevoir, numéro Mobile Money, gains par course, versements.
export default function WalletPanel() {
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    delivererService
      .wallet()
      .then(setWallet)
      .catch(() => setError('Impossible de charger votre portefeuille. Réessayez.'));
  }, []);

  if (error) {
    return (
      <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
        {error}
      </p>
    );
  }

  if (!wallet) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {wallet.balance < 0 ? (
          <Card className="bg-error-container sm:col-span-1">
            <p className="text-sm font-semibold text-on-error-container">Commissions à régulariser</p>
            <p className="mt-1 font-display text-3xl font-extrabold text-error">{formatFcfa(Math.abs(wallet.balance))}</p>
          </Card>
        ) : (
          <Card className="bg-primary-fixed sm:col-span-1">
            <p className="text-sm font-semibold text-on-primary-fixed-variant">Solde à recevoir</p>
            <p className="mt-1 font-display text-3xl font-extrabold text-primary">{formatFcfa(wallet.balance)}</p>
          </Card>
        )}
        <Card>
          <p className="text-sm font-semibold text-on-surface-variant">Total gagné</p>
          <p className="mt-1 font-display text-2xl font-bold">{formatFcfa(wallet.total_earned)}</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-on-surface-variant">Déjà versé</p>
          <p className="mt-1 font-display text-2xl font-bold">{formatFcfa(wallet.total_paid)}</p>
        </Card>
      </div>

      {(wallet.balance < 0 || wallet.cash_collected > 0) && (
        <p className="rounded bg-surface-container px-3 py-2 text-sm text-on-surface-variant">
          {wallet.cash_collected > 0 && (
            <>
              Vous avez encaissé <strong className="text-on-surface">{formatFcfa(wallet.cash_collected)}</strong> en
              espèces auprès de vos clients : cet argent est à vous, seule la commission de {wallet.commission_rate} %
              est due à LIV corp.{' '}
            </>
          )}
          {wallet.balance < 0 &&
            'Elle sera déduite automatiquement de vos prochains gains sur les paiements en ligne. Aucun versement n\'est fait tant que ce solde est négatif.'}
        </p>
      )}

      <Card>
        <h2 className="font-display text-lg font-bold">Numéro de versement Mobile Money</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Les gains des paiements en ligne sont versés automatiquement sur ce numéro. LIV corp prélève{' '}
          {wallet.commission_rate} % sur chaque course, les montants ci-dessous sont déjà nets.
        </p>
        {!wallet.mobile_money_number && (
          <p className="mt-3 rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
            Ajoutez votre numéro pour recevoir vos versements. Sans lui, vos gains restent en attente.
          </p>
        )}
        <MobileMoneyForm
          current={wallet.mobile_money_number}
          onSaved={(number) => setWallet((w) => ({ ...w, mobile_money_number: number }))}
        />
      </Card>

      <section>
        <h2 className="font-display text-lg font-bold">Mes gains</h2>
        <div className="mt-3 flex flex-col gap-3">
          {wallet.earnings.length === 0 && (
            <p className="text-on-surface-variant">Vos gains apparaîtront ici après votre première livraison.</p>
          )}
          {wallet.earnings.map((earning) => (
            <Card key={earning.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">#{earning.order_reference}</p>
                <p className="truncate text-sm text-on-surface-variant">
                  {earning.pickup_address} → {earning.dropoff_address}
                </p>
                <p className="text-xs text-on-surface-variant">
                  {formatDate(earning.created_at)} · {earning.payment_method === 'especes' ? 'encaissé en espèces' : 'payé en ligne'}{' '}
                  · course {formatFcfa(earning.order_amount)}, commission {formatFcfa(earning.commission_amount)}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center justify-between gap-3 sm:justify-end">
                <span
                  className={`font-display font-bold ${earning.net_amount < 0 ? 'text-error' : 'text-primary'}`}
                >
                  {earning.net_amount < 0 ? '− ' : '+ '}
                  {formatFcfa(Math.abs(earning.net_amount))}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    (EARNING_STATUS[earning.payment_method]?.[earning.status] ?? EARNING_STATUS.en_ligne.due).color
                  }`}
                >
                  {(EARNING_STATUS[earning.payment_method]?.[earning.status] ?? EARNING_STATUS.en_ligne.due).label}
                </span>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {wallet.payouts.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold">Mes versements</h2>
          <ul className="mt-3 divide-y divide-outline-variant rounded-lg bg-surface-container-lowest shadow-card">
            {wallet.payouts.map((payout) => (
              <li key={payout.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold">{formatFcfa(payout.total_amount)}</p>
                  <p className="text-xs text-on-surface-variant">{formatDate(payout.paid_at ?? payout.created_at)}</p>
                </div>
                <span className="text-right text-on-surface-variant">{PAYOUT_STATUS[payout.status] ?? payout.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MobileMoneyForm({ current, onSaved }) {
  const [value, setValue] = useState(current ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'ok' | 'error', text }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const { mobile_money_number } = await delivererService.setMobileMoney(value);
      setValue(mobile_money_number);
      onSaved(mobile_money_number);
      setMessage({ type: 'ok', text: 'Numéro enregistré.' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.errors?.mobile_money_number?.[0] ?? "Impossible d'enregistrer le numéro. Réessayez.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
      <Input
        className="flex-1"
        label="Numéro"
        name="mobile_money_number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+229 01 …"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={message?.type === 'error' ? message.text : undefined}
        hint={message?.type === 'ok' ? undefined : 'MTN ou Moov, avec ou sans +229.'}
      />
      <Button type="submit" disabled={saving} className="w-full sm:mt-7 sm:w-auto">
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
      {message?.type === 'ok' && (
        <p role="status" className="text-sm font-semibold text-primary sm:mt-9">
          {message.text}
        </p>
      )}
    </form>
  );
}
