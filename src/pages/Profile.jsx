import { useState } from 'react';
import useAuthStore from '../store/useAuthStore';
import profileService from '../services/profileService';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import AvatarUploader from '../components/common/AvatarUploader';
import { categoryLabel } from '../lib/navigation';

// Erreurs de validation Laravel (422) : une phrase par champ, plus un message général de repli.
function readErrors(err, fallback) {
  const raw = err.response?.data?.errors ?? {};
  const fields = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v[0]]));
  return { fields, message: err.response ? (err.response.data?.message ?? fallback) : 'Serveur injoignable. Réessayez.' };
}

function InfoCard({ user }) {
  const [form, setForm] = useState({
    first_name: user.first_name ?? '',
    last_name: user.last_name ?? '',
    company_name: user.company_name ?? '',
    sex: user.sex ?? '',
    phone: user.phone ?? '',
    address: user.address ?? '',
  });
  const [state, setState] = useState({ busy: false, saved: false, fields: {}, message: '' });
  const setUser = useAuthStore((s) => s.setUser);
  const isEntreprise = user.role === 'client' && ['entreprise', 'conciergerie'].includes(user.account_type);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, saved: false, fields: {}, message: '' });
    try {
      const updated = await profileService.update({ ...form, sex: form.sex || null });
      setUser(updated);
      setState({ busy: false, saved: true, fields: {}, message: '' });
    } catch (err) {
      setState({ busy: false, saved: false, ...readErrors(err, 'Enregistrement impossible.') });
    }
  }

  const { fields } = state;
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Informations personnelles</h2>
      <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={submit}>
        {isEntreprise && (
          <Input className="sm:col-span-2" label={user.account_type === 'conciergerie' ? 'Nom de la conciergerie' : "Nom de l'entreprise"} required value={form.company_name} onChange={set('company_name')} error={fields.company_name} />
        )}
        <Input label="Prénom" name="first_name" required value={form.first_name} onChange={set('first_name')} error={fields.first_name} />
        <Input label="Nom" name="last_name" required value={form.last_name} onChange={set('last_name')} error={fields.last_name} />
        <div>
          <label htmlFor="sex" className="mb-1.5 block text-sm font-semibold">Sexe</label>
          <select id="sex" className="input-field" value={form.sex} onChange={set('sex')}>
            <option value="">Non précisé</option>
            <option value="homme">Homme</option>
            <option value="femme">Femme</option>
          </select>
        </div>
        <Input label="Téléphone" name="phone" type="tel" required value={form.phone} onChange={set('phone')} error={fields.phone} />
        <Input className="sm:col-span-2" label="Adresse" name="address" value={form.address} onChange={set('address')} error={fields.address} />
        <Input className="sm:col-span-2" label="E-mail" value={user.email} disabled hint="L'adresse e-mail ne peut pas être modifiée." readOnly />

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={state.busy}>{state.busy ? 'Enregistrement…' : 'Enregistrer'}</Button>
          {state.saved && <span role="status" className="text-sm font-semibold text-primary">Profil mis à jour.</span>}
          {state.message && <span role="alert" className="text-sm font-medium text-error">{state.message}</span>}
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const empty = { current_password: '', password: '', password_confirmation: '' };
  const [form, setForm] = useState(empty);
  const [state, setState] = useState({ busy: false, saved: false, fields: {}, message: '' });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, saved: false, fields: {}, message: '' });
    try {
      await profileService.updatePassword(form);
      setForm(empty);
      setState({ busy: false, saved: true, fields: {}, message: '' });
    } catch (err) {
      setState({ busy: false, saved: false, ...readErrors(err, 'Changement impossible.') });
    }
  }

  const { fields } = state;
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Mot de passe</h2>
      <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={submit}>
        <Input className="sm:col-span-2" label="Mot de passe actuel" type="password" name="current_password" autoComplete="current-password" required value={form.current_password} onChange={set('current_password')} error={fields.current_password} />
        <Input label="Nouveau mot de passe" type="password" name="password" autoComplete="new-password" required value={form.password} onChange={set('password')} error={fields.password} hint="8 caractères minimum, avec majuscule, minuscule et chiffre." />
        <Input label="Confirmation" type="password" name="password_confirmation" autoComplete="new-password" required value={form.password_confirmation} onChange={set('password_confirmation')} />
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={state.busy}>{state.busy ? 'Modification…' : 'Changer le mot de passe'}</Button>
          {state.saved && <span role="status" className="text-sm font-semibold text-primary">Mot de passe modifié. Vos autres appareils seront déconnectés.</span>}
          {state.message && !Object.keys(fields).length && <span role="alert" className="text-sm font-medium text-error">{state.message}</span>}
        </div>
      </form>
    </Card>
  );
}

// Profil commun à tous les rôles : informations, mot de passe. Les infos propres au livreur
// (véhicule, pièces) restent dans son tableau de bord.
export default function Profile() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Mon profil</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Compte {categoryLabel(user).toLowerCase()} · {user.email}</p>
      </div>
      <Card>
        <h2 className="font-display text-lg font-bold">Photo de profil</h2>
        <div className="mt-4">
          <AvatarUploader user={user} required={user.role === 'livreur'} />
        </div>
      </Card>
      <InfoCard user={user} />
      <PasswordCard />
    </div>
  );
}
