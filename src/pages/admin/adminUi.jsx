import { useEffect, useState } from 'react';
import adminService from '../../services/adminService';

// Valeur qui ne suit la saisie qu'après une courte pause : évite une requête à chaque touche.
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function Pager({ page, last, onChange }) {
  if (!last || last <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm">
      <button type="button" className="btn-secondary !px-3 !py-1.5" disabled={page <= 1} onClick={() => onChange(page - 1)}>Précédent</button>
      <span className="text-on-surface-variant">Page {page} sur {last}</span>
      <button type="button" className="btn-secondary !px-3 !py-1.5" disabled={page >= last} onClick={() => onChange(page + 1)}>Suivant</button>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="input-field sm:max-w-xs" />
  );
}

export function Select({ value, onChange, options, label }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="input-field !w-auto">
      {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  );
}

export function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'bg-surface-container text-on-surface-variant',
    ok: 'bg-secondary-fixed text-on-secondary-fixed',
    warn: 'bg-primary-fixed text-on-primary-fixed-variant',
    bad: 'bg-error-container text-on-error-container',
  };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

// Ouvre une pièce justificative (disque privé) dans un nouvel onglet. L'onglet doit être ouvert de façon synchrone
// au clic, sinon le navigateur bloque la fenêtre ; le fichier arrive ensuite en blob (le jeton Bearer ne passe pas par un lien).
export async function openDocument(doc) {
  const tab = window.open('', '_blank');
  try {
    const blob = await adminService.documentBlob(doc.id);
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    tab?.close();
    window.alert("Impossible d'ouvrir ce document.");
  }
}

export const DOC_LABEL = { piece_identite: "Pièce d'identité", permis_conduire: 'Permis de conduire', photo_profil: 'Photo de profil', rccm: 'RCCM', ifu: 'IFU' };
