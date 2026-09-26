import { useEffect, useState } from 'react';
import adminService from '../../services/adminService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';

const TABS = [
  { key: 'overview', label: 'Vue d\'ensemble' },
  { key: 'deliverers', label: 'Validation livreurs' },
  { key: 'messages', label: 'Messages' },
  { key: 'disputes', label: 'Litiges' },
  { key: 'tasks', label: 'Tâches internes' },
];

export default function AdminBackOffice() {
  const [tab, setTab] = useState('overview');
  const [newMessages, setNewMessages] = useState(0);

  // Badge de l'onglet Messages : chargé dès l'arrivée sur le back-office.
  useEffect(() => {
    adminService
      .messages({ status: 'nouveau' })
      .then((r) => setNewMessages(r.new_count ?? 0))
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Back-office LIV corp</h1>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-outline-variant">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-1 pb-3 text-sm font-semibold transition ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'
            }`}
          >
            {t.label}
            {t.key === 'messages' && newMessages > 0 && (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-xs font-bold text-on-primary">
                {newMessages}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'overview' && <Overview />}
        {tab === 'deliverers' && <DelivererValidation />}
        {tab === 'messages' && <Messages onCountChange={setNewMessages} />}
        {tab === 'disputes' && <Disputes />}
        {tab === 'tasks' && <Tasks />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Vue d'ensemble — GET /admin/dashboard/stats
// ------------------------------------------------------------------
function Overview() {
  const [stats, setStats] = useState(null);
  const [period, setPeriod] = useState('month');

  useEffect(() => {
    adminService.stats(period).then(setStats);
  }, [period]);

  if (!stats) return <Loading />;

  return (
    <div>
      <div className="flex justify-end gap-2">
        {['day', 'week', 'month'].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded px-3 py-1 text-xs font-semibold ${
              period === p ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {{ day: 'Jour', week: 'Semaine', month: 'Mois' }[p]}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Utilisateurs" value={stats.users_total} sub={`+${stats.users_new} récents`} />
        <StatCard label="Commandes totales" value={stats.orders_total} />
        <StatCard label="Commandes (période)" value={stats.orders_period} />
        <StatCard label="En cours" value={stats.orders_in_progress} accent />
        <StatCard label="En litige" value={stats.orders_disputed} danger={stats.orders_disputed > 0} />
        <StatCard label="Revenu (période)" value={`${stats.revenue_period} FCFA`} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Validation des comptes livreurs — GET/POST /admin/deliverers/*
// ------------------------------------------------------------------
function DelivererValidation() {
  const [pending, setPending] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    const data = await adminService.pendingDeliverers();
    setPending(data.data ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleApprove(id) {
    setBusyId(id);
    try {
      await adminService.approveDeliverer(id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function openDocument(doc) {
    // L'onglet doit être ouvert de façon synchrone au clic, sinon le navigateur bloque la fenêtre.
    const tab = window.open('', '_blank');
    try {
      const blob = await adminService.documentBlob(doc.id);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab?.close();
      window.alert('Impossible d\'ouvrir ce document.');
    }
  }

  async function handleReject(id) {
    const reason = window.prompt('Motif du refus (visible par le livreur) :');
    if (!reason) return;
    setBusyId(id);
    try {
      await adminService.rejectDeliverer(id, reason);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (!pending) return <Loading />;

  return (
    <div className="flex flex-col gap-3">
      {pending.length === 0 && <p className="text-on-surface-variant">Aucun compte livreur en attente.</p>}
      {pending.map((deliverer) => (
        <Card key={deliverer.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold">
              {deliverer.user?.first_name} {deliverer.user?.last_name}
            </p>
            <p className="text-sm text-on-surface-variant">
              {deliverer.vehicle_type} · {deliverer.vehicle_plate} · {deliverer.user?.documents?.length ?? 0} pièce(s)
              jointe(s)
            </p>
            {deliverer.user?.documents?.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {deliverer.user.documents.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => openDocument(doc)}
                    className="font-semibold text-secondary underline"
                  >
                    {doc.type === 'piece_identite' ? "Voir la pièce d'identité" : doc.type === 'permis_conduire' ? 'Voir le permis' : 'Voir le document'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Button
              variant="secondary"
              onClick={() => handleReject(deliverer.id)}
              disabled={busyId === deliverer.id}
              className="flex-1 sm:flex-none"
            >
              Refuser
            </Button>
            <Button
              onClick={() => handleApprove(deliverer.id)}
              disabled={busyId === deliverer.id}
              className="flex-1 sm:flex-none"
            >
              {busyId === deliverer.id ? '…' : 'Approuver'}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// Messages du formulaire Contactez-nous — GET /admin/messages
// ------------------------------------------------------------------
function Messages({ onCountChange }) {
  const [filter, setFilter] = useState('nouveau'); // 'nouveau' | 'tous'
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load(nextFilter = filter, nextPage = page) {
    try {
      const data = await adminService.messages({ status: nextFilter === 'tous' ? undefined : nextFilter, page: nextPage });
      setResult(data);
      onCountChange(data.new_count ?? 0);
      setError('');
    } catch {
      setError('Impossible de charger les messages. Réessayez.');
    }
  }

  useEffect(() => {
    load(filter, page);
  }, [filter, page]);

  function changeFilter(next) {
    setResult(null);
    setPage(1);
    setFilter(next);
  }

  async function toggleStatus(message) {
    setBusyId(message.id);
    try {
      await adminService.setMessageStatus(message.id, message.status === 'nouveau' ? 'traite' : 'nouveau');
      await load();
    } catch {
      setError('La mise à jour a échoué. Réessayez.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        {[
          { key: 'nouveau', label: 'Nouveaux' },
          { key: 'tous', label: 'Tous' },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => changeFilter(f.key)}
            className={`rounded border px-3 py-1.5 text-sm font-semibold transition ${
              filter === f.key
                ? 'border-primary bg-primary-fixed text-on-primary-fixed-variant'
                : 'border-outline-variant text-on-surface-variant'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}

      {!result && !error && <Loading />}

      {result && (
        <div className="mt-4 flex flex-col gap-3">
          {result.data.length === 0 && (
            <p className="text-on-surface-variant">
              {filter === 'nouveau' ? 'Aucun nouveau message.' : 'Aucun message reçu pour le moment.'}
            </p>
          )}

          {result.data.map((message) => (
            <Card key={message.id}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{message.subject}</p>
                  <p className="text-sm text-on-surface-variant">
                    {message.name} ·{' '}
                    <a href={`mailto:${message.email}`} className="break-all text-secondary underline">
                      {message.email}
                    </a>
                    {message.phone && (
                      <>
                        {' '}
                        ·{' '}
                        <a href={`tel:${message.phone}`} className="text-secondary underline">
                          {message.phone}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <p className="flex-shrink-0 text-xs text-on-surface-variant">
                  {new Date(message.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>

              <p className="mt-3 whitespace-pre-wrap break-words text-sm">{message.message}</p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <a
                  href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}
                  className="btn-primary flex-1 sm:flex-none"
                >
                  Répondre
                </a>
                <Button
                  variant="secondary"
                  onClick={() => toggleStatus(message)}
                  disabled={busyId === message.id}
                  className="flex-1 sm:flex-none"
                >
                  {busyId === message.id ? '…' : message.status === 'nouveau' ? 'Marquer comme traité' : 'Rouvrir'}
                </Button>
              </div>
            </Card>
          ))}

          {result.last_page > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2 text-sm">
              <Button variant="secondary" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
                Précédent
              </Button>
              <span className="text-on-surface-variant">
                Page {result.current_page} sur {result.last_page}
              </span>
              <Button variant="secondary" onClick={() => setPage((p) => p + 1)} disabled={page >= result.last_page}>
                Suivant
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Litiges — GET /admin/disputes, POST .../resolve
// ------------------------------------------------------------------
function Disputes() {
  const [disputes, setDisputes] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    const data = await adminService.disputes();
    setDisputes(data.data ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleResolve(id) {
    setBusyId(id);
    try {
      await adminService.resolveDispute(id, 'sans_suite', 'Traité depuis le back-office.');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (!disputes) return <Loading />;

  return (
    <div className="flex flex-col gap-3">
      {disputes.length === 0 && <p className="text-on-surface-variant">Aucun litige ouvert.</p>}
      {disputes.map((dispute) => (
        <Card key={dispute.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold">Commande #{dispute.order?.reference}</p>
            <p className="text-sm text-on-surface-variant">{dispute.reason}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <span className="rounded-full bg-error-container px-3 py-1 text-xs font-semibold text-on-error-container">
              {dispute.status}
            </span>
            {dispute.status !== 'resolu' && (
              <Button onClick={() => handleResolve(dispute.id)} disabled={busyId === dispute.id}>
                {busyId === dispute.id ? '…' : 'Marquer résolu'}
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// Tâches internes — GET/POST /admin/tasks
// ------------------------------------------------------------------
const TASK_COLUMNS = [
  { key: 'a_faire', label: 'À faire' },
  { key: 'en_cours', label: 'En cours' },
  { key: 'traite', label: 'Traité' },
];

function Tasks() {
  const [tasks, setTasks] = useState(null);

  async function refresh() {
    const data = await adminService.tasks();
    setTasks(data.data ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function moveTask(task, status) {
    await adminService.updateTaskStatus(task.id, status);
    await refresh();
  }

  if (!tasks) return <Loading />;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {TASK_COLUMNS.map((col) => (
        <div key={col.key}>
          <h3 className="mb-3 text-sm font-semibold text-on-surface-variant">{col.label}</h3>
          <div className="flex flex-col gap-2">
            {tasks
              .filter((t) => t.status === col.key)
              .map((task) => (
                <Card key={task.id} className="!p-4">
                  <p className="text-sm font-semibold">{task.title}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-on-surface-variant">{task.priority}</p>
                  <div className="mt-3 flex gap-2">
                    {TASK_COLUMNS.filter((c) => c.key !== col.key).map((c) => (
                      <button
                        key={c.key}
                        onClick={() => moveTask(task, c.key)}
                        className="rounded bg-surface-container px-2 py-1 text-xs font-semibold text-on-surface-variant hover:bg-secondary-fixed"
                      >
                        → {c.label}
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
            {tasks.filter((t) => t.status === col.key).length === 0 && (
              <p className="text-xs text-on-surface-variant">Rien ici.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, accent, danger }) {
  return (
    <div className={`card ${danger ? 'bg-error-container' : accent ? 'bg-primary-fixed' : ''}`}>
      <p className="text-xs font-semibold text-on-surface-variant">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-on-surface-variant">{sub}</p>}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
