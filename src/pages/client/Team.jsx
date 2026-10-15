import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import clientOrderService from '../../services/clientOrderService';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';
import { isTeamManager } from '../../lib/navigation';

const ROLES = { responsable: 'Responsable', operateur: 'Opérateur' };
const EMPTY = { first_name: '', last_name: '', email: '', phone: '', team_role: 'operateur', password: '' };

// Équipe de l'entreprise : le propriétaire et les responsables créent des comptes pour leurs collaborateurs.
export default function Team() {
  const user = useAuthStore((s) => s.user);
  const [members, setMembers] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [state, setState] = useState({ busy: false, error: '', fields: {}, added: '' });

  useEffect(() => {
    if (isTeamManager(user)) clientOrderService.listTeam().then(setMembers).catch(() => setMembers([]));
  }, [user]);

  if (!isTeamManager(user)) return <Navigate to="/client/accueil" replace />;

  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  async function add(e) {
    e.preventDefault();
    setState({ busy: true, error: '', fields: {}, added: '' });
    try {
      const created = await clientOrderService.addTeamMember(draft);
      setMembers(await clientOrderService.listTeam());
      setDraft(EMPTY);
      setState({ busy: false, error: '', fields: {}, added: `${created.first_name} peut maintenant se connecter avec son e-mail et le mot de passe provisoire.` });
    } catch (err) {
      const raw = err.response?.data?.errors ?? {};
      setState({
        busy: false,
        added: '',
        fields: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v[0]])),
        error: Object.keys(raw).length ? '' : (err.response?.data?.message ?? 'Création impossible.'),
      });
    }
  }

  async function patch(member, payload) {
    try {
      await clientOrderService.updateTeamMember(member.id, payload);
      setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, ...payload } : m)));
    } catch (err) {
      setState((s) => ({ ...s, error: err.response?.data?.message ?? 'Modification impossible.' }));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Mon équipe</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Un <strong>responsable</strong> voit toutes les livraisons de l'entreprise et gère l'équipe. Un <strong>opérateur</strong> crée des livraisons et ne voit que les siennes.
          Le carnet de destinataires et les livreurs favoris sont partagés.
        </p>
      </div>

      <Card>
        <h2 className="font-display text-lg font-bold">Ajouter un collaborateur</h2>
        <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={add}>
          <Input label="Prénom" required value={draft.first_name} onChange={set('first_name')} error={state.fields.first_name} />
          <Input label="Nom" required value={draft.last_name} onChange={set('last_name')} error={state.fields.last_name} />
          <Input label="E-mail" type="email" required value={draft.email} onChange={set('email')} error={state.fields.email} />
          <Input label="Téléphone" type="tel" required value={draft.phone} onChange={set('phone')} error={state.fields.phone} />
          <div>
            <label htmlFor="team-role" className="mb-1.5 block text-sm font-semibold">Rôle</label>
            <select id="team-role" className="input-field" value={draft.team_role} onChange={set('team_role')}>
              <option value="operateur">Opérateur</option>
              <option value="responsable">Responsable</option>
            </select>
          </div>
          <Input
            label="Mot de passe provisoire"
            type="password"
            autoComplete="new-password"
            required
            value={draft.password}
            onChange={set('password')}
            error={state.fields.password}
            hint="À communiquer au collaborateur, qui pourra le changer depuis son profil."
          />
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={state.busy}>{state.busy ? 'Création…' : 'Créer le compte'}</Button>
            {state.added && <span role="status" className="text-sm font-semibold text-primary">{state.added}</span>}
            {state.error && <span role="alert" className="text-sm font-medium text-error">{state.error}</span>}
          </div>
        </form>
      </Card>

      {members === null ? (
        <div className="flex justify-center py-8"><Spinner className="h-8 w-8" /></div>
      ) : (
        <ul className="flex flex-col gap-3">
          {members.map((m) => {
            const editable = !m.is_owner && m.id !== user.id;
            return (
              <li key={m.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-card ${m.is_active ? '' : 'opacity-60'}`}>
                <div className="min-w-0">
                  <p className="font-semibold">
                    {m.first_name} {m.last_name}
                    {m.is_owner && <span className="ml-2 rounded-full bg-primary-fixed px-2 py-0.5 text-xs text-on-primary-fixed-variant">Propriétaire</span>}
                    {!m.is_active && <span className="ml-2 rounded-full bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant">Désactivé</span>}
                  </p>
                  <p className="truncate text-sm text-on-surface-variant">{m.email} · {m.phone}</p>
                  <p className="text-xs text-on-surface-variant">{m.orders_count} livraison{m.orders_count > 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  {editable ? (
                    <>
                      <select
                        aria-label={`Rôle de ${m.first_name}`}
                        className="input-field !w-auto !py-1.5 text-sm"
                        value={m.team_role}
                        onChange={(e) => patch(m, { team_role: e.target.value })}
                      >
                        {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <button type="button" className={`text-sm font-semibold ${m.is_active ? 'text-error' : 'text-secondary'}`} onClick={() => patch(m, { is_active: !m.is_active })}>
                        {m.is_active ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </>
                  ) : (
                    <span className="text-sm text-on-surface-variant">{ROLES[m.team_role] ?? ''}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
