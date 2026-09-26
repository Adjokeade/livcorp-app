import { useState } from 'react';

// Champ de formulaire — cf. DESIGN.md "Components > Input Fields".
// Les champs mot de passe reçoivent un bouton Afficher/Masquer : sur téléphone,
// une saisie à l'aveugle est la première cause d'échec d'inscription.
export default function Input({ label, error, hint, className = '', id, ...props }) {
  const [revealed, setRevealed] = useState(false);
  const inputId = id ?? props.name;
  const isPassword = props.type === 'password';

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-on-surface">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          className={`input-field ${isPassword ? 'pr-24' : ''}`}
          {...props}
          type={isPassword && revealed ? 'text' : props.type}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="absolute inset-y-0 right-0 px-4 text-xs font-semibold text-secondary"
          >
            {revealed ? 'Masquer' : 'Afficher'}
          </button>
        )}
      </div>
      {error ? (
        <p className="mt-1 text-xs font-medium text-error">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>
      )}
    </div>
  );
}
