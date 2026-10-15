import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import adminService from '../../services/adminService';
import Avatar from '../../components/common/Avatar';
import Card from '../../components/common/Card';
import StatusBadge from '../../components/common/StatusBadge';
import Stars from '../../components/common/Stars';
import Button from '../../components/common/Button';
import { formatDate, formatFcfa, formatKm, shortPlace, timeAgo } from '../../lib/format';
import { Badge, DOC_LABEL, openDocument } from './adminUi';
import { Loading } from './AdminBackOffice';

const VERIFICATION = { pending: ['Dossier en attente', 'warn'], approved: ['Dossier validé', 'ok'], rejected: ['Dossier refusé', 'bad'] };
const DOC_STATUS = { pending: ["À examiner", 'warn'], approved: ['Validé', 'ok'], rejected: ['Refusé', 'bad'] };
const VEHICLE = { moto: 'Moto', velo: 'Vélo', voiture: 'Voiture', a_pied: 'À pied' };
const REASON = { panne: 'Panne', trop_loin: 'Trop loin', colis_different: 'Colis différent', client_injoignable: 'Client injoignable', autre: 'Autre' };
const ACTION = {
  'deliverer.approved': 'Dossier validé',
  'deliverer.rejected': 'Dossier refusé',
  'admin.user.deactivated': 'Compte suspendu',
  'admin.user.activated': 'Compte réactivé',
  'user.registered': 'Inscription',
};
const PAYOUT = { pending: 'En attente', processing: 'En cours', paid: 'Versé', failed: 'Échoué' };

function Section({ title, children, aside }) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-on-surface-variant">{label}</dt>
      <dd className="break-words text-sm font-semibold">{children || <span className="font-normal text-on-surface-variant">Non renseigné</span>}</dd>
    </div>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div className={`rounded-lg p-3 text-center ${tone === 'bad' ? 'bg-error-container' : 'bg-surface-container'}`}>
      <p className="font-display text-xl font-bold">{value}</p>
      <p className="text-xs text-on-surface-variant">{label}</p>
    </div>
  );
}

// Fiche complète d'un livreur : identité, dossier, fiabilité, gains, dernières livraisons et avis, historique.
export default function AdminDelivererDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminService.deliverer(id).then((d) => { setData(d); setError(''); }).catch((err) => setError(err.response?.status === 404 ? 'Livreur introuvable.' : 'Impossible de charger ce profil.'));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function run(action) {
    setBusy(true);
    try {
      await action();
      load();
    } catch (err) {
      window.alert(err.response?.data?.message ?? 'Action impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>;
  if (!data) return <Loading />;

  const { deliverer: d, user: u, documents, stats, earnings } = data;
  const [verifLabel, verifTone] = VERIFICATION[d.verification_status] ?? [d.verification_status, 'neutral'];
  const maxBar = Math.max(1, ...Object.values(stats.rating_distribution));

  function reject() {
    const reason = window.prompt('Motif du refus (visible par le livreur) :');
    if (reason) run(() => adminService.rejectDeliverer(d.id, reason));
  }

  function toggleActive() {
    if (u.is_active && !window.confirm(`Suspendre ${u.first_name} ${u.last_name} ? Il sera déconnecté et ne recevra plus de courses.`)) return;
    run(() => adminService.setUserActive(u.id, !u.is_active));
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/livreurs" className="text-sm font-semibold text-secondary">‹ Tous les livreurs</Link>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar src={u.avatar_url} name={u.first_name} size="xl" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold">{u.first_name} {u.last_name}</h2>
          <p className="mt-1 flex flex-wrap gap-1.5">
            <Badge tone={verifTone}>{verifLabel}</Badge>
            {d.is_available && d.verification_status === 'approved' && <Badge tone="ok">Disponible</Badge>}
            {!u.is_active && <Badge tone="bad">Compte suspendu</Badge>}
            {!u.avatar_url && <Badge tone="bad">Sans photo de profil</Badge>}
            {!u.email_verified_at && <Badge tone="warn">E-mail non vérifié</Badge>}
          </p>
          <p className="mt-2 text-sm text-on-surface-variant">Inscrit le {formatDate(u.created_at)}{u.last_login_at ? ` · dernière connexion ${timeAgo(u.last_login_at)}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.verification_status === 'pending' && (
            <>
              <Button onClick={() => run(() => adminService.approveDeliverer(d.id))} disabled={busy}>Valider le dossier</Button>
              <Button variant="secondary" onClick={reject} disabled={busy}>Refuser</Button>
            </>
          )}
          <button type="button" onClick={toggleActive} disabled={busy} className={`rounded border px-3 py-2 text-sm font-semibold ${u.is_active ? 'border-error text-error' : 'border-secondary text-secondary'}`}>
            {u.is_active ? 'Suspendre le compte' : 'Réactiver le compte'}
          </button>
        </div>
      </Card>

      {d.verification_status === 'rejected' && d.rejection_reason && (
        <p className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container"><strong>Motif du refus :</strong> {d.rejection_reason}</p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="Identité et contact">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Fact label="E-mail"><a href={`mailto:${u.email}`} className="text-secondary">{u.email}</a></Fact>
            <Fact label="Téléphone"><a href={`tel:${u.phone}`} className="text-secondary">{u.phone}</a></Fact>
            <Fact label="Sexe">{u.sex === 'femme' ? 'Femme' : u.sex === 'homme' ? 'Homme' : null}</Fact>
            <Fact label="Adresse">{u.address}</Fact>
            <Fact label="Contact d'urgence">{d.emergency_phone && <a href={`tel:${d.emergency_phone}`} className="text-secondary">{d.emergency_phone}</a>}</Fact>
            <Fact label="Mobile Money (versements)">{d.mobile_money_number}</Fact>
          </dl>
        </Section>

        <Section title="Véhicule et dossier">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Fact label="Véhicule">{VEHICLE[d.vehicle_type] ?? d.vehicle_type}</Fact>
            <Fact label="Plaque">{d.vehicle_plate}</Fact>
            <Fact label="Dossier validé">{d.verified_at ? `${formatDate(d.verified_at)}${d.verified_by ? ` par ${d.verified_by}` : ''}` : null}</Fact>
            <Fact label="Dernière position connue">{d.location ? `${timeAgo(d.location.updated_at)} (${d.location.lat.toFixed(4)}, ${d.location.lng.toFixed(4)})` : null}</Fact>
          </dl>
          <ul className="mt-4 flex flex-col gap-2">
            {documents.length === 0 && <li className="text-sm text-on-surface-variant">Aucune pièce déposée.</li>}
            {documents.map((doc) => {
              const [label, tone] = DOC_STATUS[doc.status] ?? [doc.status, 'neutral'];
              return (
                <li key={doc.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-container px-3 py-2 text-sm">
                  <span>{DOC_LABEL[doc.type] ?? doc.type} <span className="text-xs text-on-surface-variant">· {formatDate(doc.created_at)}</span></span>
                  <span className="flex items-center gap-3">
                    <Badge tone={tone}>{label}</Badge>
                    <button type="button" onClick={() => openDocument(doc)} className="font-semibold text-secondary underline">Voir</button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>

      <Section title="Performances">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Livrées" value={stats.delivered} />
          <Metric label="En cours" value={stats.in_progress} />
          <Metric label="Annulées" value={stats.cancelled} />
          <Metric label="Désistements" value={stats.releases} tone={stats.releases > 0 ? 'bad' : undefined} />
          <Metric label="Litiges" value={stats.disputes} tone={stats.disputes > 0 ? 'bad' : undefined} />
          <Metric label="Courses menées à terme" value={stats.completion_rate == null ? '—' : `${stats.completion_rate} %`} />
          <Metric label="Distance livrée" value={formatKm(stats.total_km)} />
          <Metric label="Note moyenne" value={stats.reviews_count ? `${stats.average_rating.toFixed(1)}/5` : '—'} />
        </div>

        {Object.keys(stats.releases_by_reason).length > 0 && (
          <p className="mt-3 text-sm text-on-surface-variant">
            Motifs de désistement : {Object.entries(stats.releases_by_reason).map(([k, n]) => `${REASON[k] ?? k} (${n})`).join(', ')}.
          </p>
        )}

        {stats.reviews_count > 0 && (
          <div className="mt-4" aria-label="Répartition des notes">
            {[5, 4, 3, 2, 1].map((n) => (
              <div key={n} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-right">{n}★</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(stats.rating_distribution[n] / maxBar) * 100}%` }} />
                </div>
                <span className="w-6 text-on-surface-variant">{stats.rating_distribution[n]}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="Gains et versements">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Gagné (net de commission)" value={formatFcfa(earnings.earned_total)} />
            <Metric label="Commission LIV corp" value={formatFcfa(earnings.commission_total)} />
            <Metric label="Solde à verser" value={formatFcfa(earnings.balance_due)} />
            <Metric label="Déjà versé" value={formatFcfa(earnings.paid_out)} />
          </div>
          {data.payouts.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {data.payouts.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 rounded bg-surface-container px-3 py-1.5">
                  <span>{formatDate(p.period_start)} → {formatDate(p.period_end)}</span>
                  <span className="font-semibold">{formatFcfa(p.total_amount)} · {PAYOUT[p.status] ?? p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Derniers avis" aside={stats.reviews_count > 0 && <span className="text-sm text-on-surface-variant">{stats.reviews_count} au total</span>}>
          {data.recent_reviews.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Aucun avis pour le moment.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.recent_reviews.map((r, i) => (
                <li key={i} className="rounded-lg bg-surface-container p-3 text-sm">
                  <p className="flex items-center gap-2"><Stars value={r.rating} /><span className="text-xs text-on-surface-variant">{r.client} · {formatDate(r.created_at)}</span></p>
                  {r.comment && <p className="mt-1 break-words">« {r.comment} »</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Dernières livraisons">
        {data.recent_orders.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Aucune livraison.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.recent_orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-container px-3 py-2 text-sm">
                <span className="min-w-0">
                  <strong>#{o.reference}</strong> · {shortPlace(o.pickup_address)} → {shortPlace(o.dropoff_address)}
                  <span className="block text-xs text-on-surface-variant">{formatDate(o.created_at)} · {o.client ?? '—'}{o.distance_km != null ? ` · ${formatKm(o.distance_km)}` : ''}</span>
                </span>
                <span className="flex items-center gap-3"><span className="font-semibold">{formatFcfa(o.price)}</span><StatusBadge status={o.status} forDeliverer /></span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Historique des décisions">
        {data.history.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Aucune décision enregistrée.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {data.history.map((h, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 rounded bg-surface-container px-3 py-1.5">
                <span><strong>{ACTION[h.action] ?? h.action}</strong>{h.meta?.reason ? ` : ${h.meta.reason}` : ''}</span>
                <span className="text-xs text-on-surface-variant">{h.by ?? 'Système'} · {formatDate(h.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
