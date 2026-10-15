import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import adminService from '../../services/adminService';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { formatDate, formatFcfa } from '../../lib/format';
import { Badge, Pager, SearchInput, Select, useDebounced } from './adminUi';
import { Loading } from './AdminBackOffice';

const PERIODS = [['week', '7 jours'], ['month', '30 jours'], ['year', '12 mois'], ['all', 'Tout']];
const COMMISSION_STATUS = { due: ['À verser', 'warn'], included_in_payout: ['Versement en cours', 'warn'], paid: ['Réglée', 'ok'] };
const PAYOUT_STATUS = { pending: ['À payer', 'warn'], processing: ['En cours', 'warn'], paid: ['Versé', 'ok'], failed: ['Annulé', 'neutral'] };

function Metric({ label, value, hint, tone }) {
  return (
    <div className={`rounded-xl p-4 shadow-card ${tone === 'bad' ? 'bg-error-container' : tone === 'accent' ? 'bg-primary-fixed' : 'bg-surface-container-lowest'}`}>
      <p className="text-xs font-semibold text-on-surface-variant">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-on-surface-variant">{hint}</p>}
    </div>
  );
}

function Overview({ onNavigate }) {
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    adminService.financeSummary(period).then((d) => { setData(d); setError(''); }).catch(() => setError('Impossible de charger la synthèse.'));
  }, [period]);

  if (error) return <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>;
  if (!data) return <Loading />;

  const peak = Math.max(1, ...data.by_day.map((d) => d.commission));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Select label="Période" value={period} onChange={setPeriod} options={PERIODS} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Argent bloqué chez LIV corp" value={formatFcfa(data.held_amount)} hint="Payé d'avance, réception pas encore confirmée" tone={data.held_amount > 0 ? 'accent' : undefined} />
        <Metric label="Remboursements à faire" value={data.refunds_to_do} hint="À la main, depuis KKiaPay" tone={data.refunds_to_do > 0 ? 'bad' : undefined} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Commissions perçues" value={formatFcfa(data.commission_total)} hint={`Taux actuel : ${data.commission_rate} %`} tone="accent" />
        <Metric label="Volume des livraisons" value={formatFcfa(data.volume)} hint={`${data.deliveries} livraison${data.deliveries > 1 ? 's' : ''} payée${data.deliveries > 1 ? 's' : ''}`} />
        <Metric label="Payé en ligne" value={formatFcfa(data.volume_online)} hint="Encaissé par LIV corp" />
        <Metric label="Payé en espèces" value={formatFcfa(data.volume_cash)} hint="Encaissé par les livreurs" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="À verser aux livreurs" value={formatFcfa(data.owed_to_deliverers)} hint="Paiements en ligne, net de commission" />
        <Metric label="Commissions espèces à recouvrer" value={formatFcfa(data.owed_by_deliverers)} hint="Imputées sur leurs prochains versements" />
        <Metric label="Versé aux livreurs" value={formatFcfa(data.paid_out)} hint="Sur la période" />
        <Metric label="Versements à payer" value={data.processing_payouts} hint="En Mobile Money, à la main" tone={data.processing_payouts > 0 ? 'accent' : undefined} />
      </div>

      <Card>
        <h2 className="font-display text-lg font-bold">Commissions par jour</h2>
        {data.by_day.length === 0 ? (
          <p className="mt-3 text-sm text-on-surface-variant">Aucune commission sur cette période.</p>
        ) : (
          <div className="mt-4 flex h-36 items-end gap-1 overflow-x-auto" role="img" aria-label={`Commissions par jour, total ${formatFcfa(data.commission_total)}`}>
            {data.by_day.map((d) => (
              <div key={d.day} className="flex min-w-6 max-w-16 flex-1 flex-col items-center justify-end gap-1" title={`${formatDate(d.day)} : ${formatFcfa(d.commission)} (${d.deliveries} livraison${d.deliveries > 1 ? 's' : ''})`}>
                <div className="w-full rounded-t bg-primary" style={{ height: `${(d.commission / peak) * 100}px`, minHeight: 2 }} />
                <span className="text-[10px] text-on-surface-variant">{formatDate(d.day).split(' ').slice(0, 2).join(' ')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Soldes des livreurs</h2>
          <button type="button" onClick={() => onNavigate('payouts')} className="text-sm font-semibold text-secondary">Voir les versements ›</button>
        </div>
        {data.top_balances.length === 0 ? (
          <p className="mt-3 text-sm text-on-surface-variant">Aucun solde en attente.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {data.top_balances.map((b, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-container px-3 py-2 text-sm">
                <span className="min-w-0">
                  {b.deliverer_id ? <Link to={`/admin/livreurs/${b.deliverer_id}`} className="font-semibold text-secondary underline">{b.name}</Link> : <strong>{b.name}</strong>}
                  <span className="ml-2 text-xs text-on-surface-variant">{b.entries} écriture{b.entries > 1 ? 's' : ''}</span>
                  {!b.has_mobile_money && b.balance > 0 && <span className="ml-2"><Badge tone="bad">Pas de Mobile Money</Badge></span>}
                </span>
                <span className={`font-semibold ${b.balance < 0 ? 'text-error' : ''}`}>
                  {b.balance < 0 ? `doit ${formatFcfa(-b.balance)}` : `à verser ${formatFcfa(b.balance)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Commissions() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const term = useDebounced(q);

  useEffect(() => setPage(1), [term, status, kind]);
  useEffect(() => {
    adminService.financeCommissions({ page, q: term || undefined, status: status || undefined, kind: kind || undefined }).then(setResult).catch(() => setResult({ data: [], total: 0 }));
  }, [page, term, status, kind]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Référence ou livreur…" />
        <Select label="Statut" value={status} onChange={setStatus} options={[['', 'Tous les statuts'], ['due', 'À verser'], ['included_in_payout', 'Versement en cours'], ['paid', 'Réglées']]} />
        <Select label="Mode de paiement" value={kind} onChange={setKind} options={[['', 'Tous les paiements'], ['en_ligne', 'En ligne'], ['especes', 'Espèces']]} />
        {result && <span className="text-sm text-on-surface-variant">{result.total} écriture{result.total > 1 ? 's' : ''}</span>}
      </div>
      {!result ? <Loading /> : result.data.length === 0 ? (
        <p className="mt-6 text-on-surface-variant">Aucune commission ne correspond.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {result.data.map((c) => {
            const [label, tone] = COMMISSION_STATUS[c.status] ?? [c.status, 'neutral'];
            return (
              <li key={c.id} className="rounded-xl bg-surface-container-lowest p-3 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">#{c.order_reference} · {c.deliverer.id ? <Link to={`/admin/livreurs/${c.deliverer.id}`} className="text-secondary underline">{c.deliverer.name}</Link> : c.deliverer.name}</p>
                    <p className="text-xs text-on-surface-variant">{formatDate(c.created_at)} · {c.kind === 'especes' ? 'Payé en espèces' : 'Payé en ligne'} · taux {c.rate} %</p>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-surface-container p-2"><dt className="text-on-surface-variant">Course</dt><dd className="text-sm font-bold">{formatFcfa(c.order_amount)}</dd></div>
                  <div className="rounded bg-surface-container p-2"><dt className="text-on-surface-variant">Commission</dt><dd className="text-sm font-bold">{formatFcfa(c.commission_amount)}</dd></div>
                  <div className="rounded bg-surface-container p-2"><dt className="text-on-surface-variant">{c.net_amount < 0 ? 'Livreur doit' : 'Net livreur'}</dt><dd className={`text-sm font-bold ${c.net_amount < 0 ? 'text-error' : ''}`}>{formatFcfa(Math.abs(c.net_amount))}</dd></div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={result?.current_page ?? 1} last={result?.last_page} onChange={setPage} />
    </div>
  );
}

function Payouts() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => adminService.financePayouts({ page, status: status || undefined }).then(setResult).catch(() => setResult({ data: [], total: 0 }));
  useEffect(() => setPage(1), [status]);
  useEffect(() => { load(); }, [page, status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pay(p) {
    const reference = window.prompt(`Après avoir envoyé ${formatFcfa(p.total_amount)} au ${p.mobile_money_number} en Mobile Money, saisissez la référence de l'opérateur (facultatif) :`, '');
    if (reference === null) return;
    try {
      await adminService.payPayout(p.id, reference.trim());
      setNotice(`Versement de ${formatFcfa(p.total_amount)} marqué comme versé. ${p.deliverer.name} est prévenu.`);
      load();
    } catch (err) {
      setNotice(err.response?.data?.message ?? 'Action impossible.');
    }
  }

  async function cancel(p) {
    if (!window.confirm('Annuler ce versement ? Ses commissions reviennent « à verser » et seront regroupées au prochain passage.')) return;
    try {
      await adminService.cancelPayout(p.id);
      load();
    } catch (err) {
      setNotice(err.response?.data?.message ?? 'Action impossible.');
    }
  }

  async function run() {
    if (!window.confirm('Préparer maintenant les versements dus aux livreurs ? Ils sont d\'ordinaire préparés chaque soir à 20 h. Rien n\'est envoyé : vous les payez ensuite en Mobile Money.')) return;
    setBusy(true);
    try {
      const r = await adminService.runPayouts();
      setNotice(r.message);
      setTimeout(load, 4000);
    } catch (err) {
      setNotice(err.response?.data?.message ?? 'Lancement impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Select label="Statut" value={status} onChange={setStatus} options={[['', 'Tous les versements'], ['pending', 'À payer'], ['paid', 'Versés'], ['failed', 'Annulés']]} />
        {result && <span className="text-sm text-on-surface-variant">{result.total} versement{result.total > 1 ? 's' : ''}</span>}
        <Button variant="secondary" onClick={run} disabled={busy} className="ml-auto !px-4 !py-2 text-sm">{busy ? 'Préparation…' : 'Préparer les versements maintenant'}</Button>
      </div>
      {notice && <p role="status" className="mt-3 rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">{notice}</p>}

      {!result ? <Loading /> : result.data.length === 0 ? (
        <p className="mt-6 text-on-surface-variant">Aucun versement.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {result.data.map((p) => {
            const [label, tone] = PAYOUT_STATUS[p.status] ?? [p.status, 'neutral'];
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container-lowest p-3 shadow-card">
                <div className="min-w-0">
                  <p className="font-semibold">{p.deliverer.id ? <Link to={`/admin/livreurs/${p.deliverer.id}`} className="text-secondary underline">{p.deliverer.name}</Link> : p.deliverer.name}</p>
                  <p className="text-xs text-on-surface-variant">{formatDate(p.period_start)} → {formatDate(p.period_end)} · {p.mobile_money_number ?? 'Mobile Money manquant'}{p.paid_at ? ` · versé le ${formatDate(p.paid_at)}` : ''}</p>
                </div>
                <div className="flex items-center gap-3"><span className="font-display text-lg font-bold">{formatFcfa(p.total_amount)}</span><Badge tone={tone}>{label}</Badge></div>
                {p.status === 'pending' && (
                  <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-2">
                    <span className="text-sm">
                      Envoyer par Mobile Money au <strong>{p.mobile_money_number ?? 'numéro manquant'}</strong>
                      {p.mobile_money_number && (
                        <button type="button" onClick={() => navigator.clipboard?.writeText(p.mobile_money_number)} className="ml-2 text-xs font-semibold text-secondary underline">Copier</button>
                      )}
                    </span>
                    <span className="flex gap-3">
                      <button type="button" onClick={() => cancel(p)} className="text-sm font-semibold text-error">Annuler</button>
                      <Button onClick={() => pay(p)} className="!px-4 !py-1.5 text-sm">Marquer comme versé</Button>
                    </span>
                  </div>
                )}
                {p.reference && <p className="w-full text-xs text-on-surface-variant">Référence opérateur : {p.reference}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={result?.current_page ?? 1} last={result?.last_page} onChange={setPage} />
    </div>
  );
}

function Refunds() {
  const [list, setList] = useState(null);
  const load = () => adminService.financeRefunds().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  async function done(t) {
    if (!window.confirm(`Avez-vous bien remboursé ${formatFcfa(t.amount)} à ${t.client} depuis le tableau de bord KKiaPay ?`)) return;
    await adminService.markRefundDone(t.id);
    load();
  }

  if (!list) return <Loading />;
  return (
    <div>
      <p className="text-sm text-on-surface-variant">Remboursements que l'API ne sait pas faire seule (paiement par carte, envoi en lot, remboursement partiel, panne). À régler depuis le tableau de bord KKiaPay, puis à marquer comme faits ici.</p>
      {list.length === 0 ? (
        <p className="mt-6 text-on-surface-variant">Aucun remboursement en attente.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {list.map((t) => (
            <li key={t.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{t.client} · {formatFcfa(t.amount)}</p>
                  <p className="text-xs text-on-surface-variant">Livraison{t.orders.length > 1 ? 's' : ''} {t.orders.map((o) => `#${o}`).join(', ')} · {t.method === 'carte' ? 'carte' : 'Mobile Money'} · transaction KKiaPay {t.provider_transaction_id ?? '—'}</p>
                  {t.note && <p className="mt-1 text-sm">{t.note}</p>}
                </div>
                <Button onClick={() => done(t)} className="!px-4 !py-1.5 text-sm">Marquer comme remboursé</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Rate() {
  const [data, setData] = useState(null);
  const [value, setValue] = useState('');
  const [state, setState] = useState({ busy: false, saved: false, error: '' });

  useEffect(() => {
    adminService.financeSettings().then((d) => { setData(d); setValue(String(d.commission_rate)); });
  }, []);

  if (!data) return <Loading />;

  const rate = Number(value);
  const example = (price) => ({ commission: Math.round((price * rate) / 100), net: price - Math.round((price * rate) / 100) });

  async function save(e) {
    e.preventDefault();
    setState({ busy: true, saved: false, error: '' });
    try {
      const updated = await adminService.updateFinanceSettings({ commission_rate: rate });
      setData(updated);
      setState({ busy: false, saved: true, error: '' });
    } catch (err) {
      setState({ busy: false, saved: false, error: err.response?.data?.errors?.commission_rate?.[0] ?? err.response?.data?.message ?? 'Enregistrement impossible.' });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="font-display text-lg font-bold">Taux de commission</h2>
        <p className="mt-1 text-sm text-on-surface-variant">Part du prix de chaque livraison conservée par LIV corp. Le livreur reçoit le reste.</p>
        <form className="mt-4 flex flex-col gap-4" onSubmit={save}>
          <Input label="Commission LIV corp (%)" type="number" min="0" max="50" step="0.5" inputMode="decimal" required value={value} onChange={(e) => setValue(e.target.value)} error={state.error} hint="Entre 0 et 50 %." />
          <p className="-mt-2 text-xs text-on-surface-variant">Valeur d'origine ({data.default_rate} %) définie dans la configuration du serveur.</p>
          <div className="rounded-lg bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
            Le nouveau taux ne s'applique qu'aux <strong>livraisons à venir</strong> : chaque commission déjà enregistrée garde son taux d'origine.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={state.busy || !Number.isFinite(rate)}>{state.busy ? 'Enregistrement…' : 'Enregistrer le taux'}</Button>
            {state.saved && <span role="status" className="text-sm font-semibold text-primary">Taux enregistré : {data.commission_rate} %.</span>}
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-bold">Aperçu</h2>
        <table className="mt-4 w-full text-sm">
          <thead><tr className="border-b border-outline-variant text-left text-on-surface-variant"><th className="py-2 font-semibold">Prix</th><th className="py-2 font-semibold">Commission</th><th className="py-2 font-semibold">Livreur</th></tr></thead>
          <tbody>
            {[1000, 2000, 5000, 10000].map((price) => {
              const e = Number.isFinite(rate) ? example(price) : { commission: 0, net: price };
              return (
                <tr key={price} className="border-b border-outline-variant last:border-0">
                  <td className="py-2">{formatFcfa(price)}</td>
                  <td className="py-2">{formatFcfa(e.commission)}</td>
                  <td className="py-2 font-semibold">{formatFcfa(e.net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const VIEWS = [['overview', 'Vue d\'ensemble'], ['commissions', 'Commissions'], ['payouts', 'Versements'], ['refunds', 'Remboursements'], ['rate', 'Taux de commission']];

// Finances : situation de la plateforme, écritures de commissions, versements aux livreurs, taux de commission.
export default function AdminFinance() {
  const [view, setView] = useState('overview');

  return (
    <div>
      <div role="group" aria-label="Affichage" className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-outline-variant p-0.5 sm:inline-flex">
        {VIEWS.map(([key, label]) => (
          <button type="button" key={key} onClick={() => setView(key)} aria-pressed={view === key} className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold ${view === key ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {view === 'overview' && <Overview onNavigate={setView} />}
        {view === 'commissions' && <Commissions />}
        {view === 'payouts' && <Payouts />}
        {view === 'refunds' && <Refunds />}
        {view === 'rate' && <Rate />}
      </div>
    </div>
  );
}
