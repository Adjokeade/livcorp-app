import { useEffect, useState } from 'react';
import adminService from '../../services/adminService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';

const TABS = [
  { key: 'overview', label: 'Vue d\'ensemble' },
  { key: 'deliverers', label: 'Validation livreurs' },
  { key: 'disputes', label: 'Litiges' },
  { key: 'tasks', label: 'Tâches internes' },
];

export default function AdminBackOffice() {
  const [tab, setTab] = useState('overview');

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
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'overview' && <Overview />}
        {tab === 'deliverers' && <DelivererValidation />}
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
        <Card key={deliverer.id} className="flex items-center justify-between">
          <div>
            <p className="font-semibold">
              {deliverer.user?.first_name} {deliverer.user?.last_name}
            </p>
            <p className="text-sm text-on-surface-variant">
              {deliverer.vehicle_type} · {deliverer.vehicle_plate} · {deliverer.user?.documents?.length ?? 0} pièce(s)
              jointe(s)
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => handleReject(deliverer.id)} disabled={busyId === deliverer.id}>
              Refuser
            </Button>
            <Button onClick={() => handleApprove(deliverer.id)} disabled={busyId === deliverer.id}>
              {busyId === deliverer.id ? '…' : 'Approuver'}
            </Button>
          </div>
        </Card>
      ))}
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
        <Card key={dispute.id} className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Commande #{dispute.order?.reference}</p>
            <p className="text-sm text-on-surface-variant">{dispute.reason}</p>
          </div>
          <div className="flex items-center gap-3">
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
