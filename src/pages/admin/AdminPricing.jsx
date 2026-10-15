import { useEffect, useState } from 'react';
import adminService from '../../services/adminService';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { formatFcfa } from '../../lib/format';
import { Loading } from './AdminBackOffice';

// Barème de prix : prix = base + (km × prix au km), puis majoration pour une livraison express.
export default function AdminPricing() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ busy: false, saved: false, error: '', fields: {} });

  useEffect(() => {
    adminService.tariff().then((d) => {
      setData(d);
      setForm(Object.fromEntries(Object.entries(d.tariff).map(([k, v]) => [k, String(v)])));
    });
  }, []);

  if (!data || !form) return <Loading />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const base = Number(form.base_fare) || 0;
  const perKm = Number(form.per_km) || 0;
  const mult = Number(form.express_multiplier) || 1;
  const preview = (km, express) => Math.round((base + km * perKm) * (express ? mult : 1) / 10) * 10;

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, saved: false, error: '', fields: {} });
    try {
      const updated = await adminService.updateTariff({ base_fare: base, per_km: perKm, express_multiplier: mult });
      setData(updated);
      setState({ busy: false, saved: true, error: '', fields: {} });
    } catch (err) {
      const raw = err.response?.data?.errors ?? {};
      setState({ busy: false, saved: false, fields: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v[0]])), error: Object.keys(raw).length ? '' : (err.response?.data?.message ?? 'Enregistrement impossible.') });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="font-display text-lg font-bold">Barème des prix</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Prix d'une livraison = tarif de base + (distance × prix au km). Le résultat est arrondi à la dizaine de FCFA.
          Ce prix est imposé aux particuliers et non négociable. Une entreprise peut avoir un tarif négocié : voir « Utilisateurs ».
        </p>
        <form className="mt-4 flex flex-col gap-4" onSubmit={submit}>
          <Input label="Tarif de base (FCFA)" type="number" min="0" inputMode="numeric" required value={form.base_fare} onChange={set('base_fare')} error={state.fields.base_fare} />
          <Input label="Prix au kilomètre (FCFA)" type="number" min="0" inputMode="numeric" required value={form.per_km} onChange={set('per_km')} error={state.fields.per_km} />
          <Input label="Majoration express (multiplicateur)" type="number" min="1" max="5" step="0.05" inputMode="decimal" required value={form.express_multiplier} onChange={set('express_multiplier')} error={state.fields.express_multiplier} hint="1,4 = 40 % plus cher qu'une livraison standard." />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={state.busy}>{state.busy ? 'Enregistrement…' : 'Enregistrer le barème'}</Button>
            <button type="button" className="text-sm font-semibold text-secondary" onClick={() => setForm(Object.fromEntries(Object.entries(data.defaults).map(([k, v]) => [k, String(v)])))}>
              Remettre les valeurs d'origine
            </button>
            {state.saved && <span role="status" className="text-sm font-semibold text-primary">Barème enregistré.</span>}
            {state.error && <span role="alert" className="text-sm font-medium text-error">{state.error}</span>}
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-bold">Aperçu</h2>
        <p className="mt-1 text-sm text-on-surface-variant">Ce que donnent les valeurs saisies (avant enregistrement).</p>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant text-left text-on-surface-variant">
              <th className="py-2 font-semibold">Distance</th>
              <th className="py-2 font-semibold">Standard</th>
              <th className="py-2 font-semibold">Express</th>
            </tr>
          </thead>
          <tbody>
            {[2, 5, 10, 20].map((km) => (
              <tr key={km} className="border-b border-outline-variant last:border-0">
                <td className="py-2">{km} km</td>
                <td className="py-2 font-semibold">{formatFcfa(preview(km, false))}</td>
                <td className="py-2 font-semibold">{formatFcfa(preview(km, true))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
