// Champ de formulaire — cf. DESIGN.md "Components > Input Fields".
export default function Input({ label, error, className = '', id, ...props }) {
  const inputId = id ?? props.name;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-on-surface">
          {label}
        </label>
      )}
      <input id={inputId} className="input-field" {...props} />
      {error && <p className="mt-1 text-xs font-medium text-error">{error}</p>}
    </div>
  );
}
