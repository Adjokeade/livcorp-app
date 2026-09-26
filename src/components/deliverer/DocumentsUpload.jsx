import { useState } from 'react';
import delivererService from '../../services/delivererService';
import Button from '../common/Button';

// Formulaire de dépôt des pièces justificatives (POST /deliverer/documents).
// Utilisé à la dernière étape de l'inscription livreur et depuis le tableau
// de bord tant que le dossier n'est pas complet.
export default function DocumentsUpload({ onDone, submitLabel = 'Envoyer mon dossier' }) {
  const [files, setFiles] = useState({ id_card: null, driving_license: null });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (!files.id_card && !files.driving_license) {
      setError('Ajoutez au moins un document avant d\'envoyer.');
      return;
    }

    const formData = new FormData();
    if (files.id_card) formData.append('id_card', files.id_card);
    if (files.driving_license) formData.append('driving_license', files.driving_license);

    setSending(true);
    try {
      const data = await delivererService.uploadDocument(formData);
      onDone?.(data);
    } catch (err) {
      setFieldErrors(err.response?.data?.errors ?? {});
      setError(
        err.response
          ? 'Certains fichiers ont été refusés.'
          : 'Serveur injoignable. Vérifiez votre connexion puis réessayez.',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      {error && (
        <p role="alert" className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}
      <FileField
        label="Pièce d'identité (CNI / passeport)"
        file={files.id_card}
        error={fieldErrors.id_card?.[0]}
        onChange={(f) => setFiles((s) => ({ ...s, id_card: f }))}
      />
      <FileField
        label="Permis de conduire"
        file={files.driving_license}
        error={fieldErrors.driving_license?.[0]}
        onChange={(f) => setFiles((s) => ({ ...s, driving_license: f }))}
      />
      <p className="text-xs text-on-surface-variant">Formats acceptés : JPG, PNG ou PDF, 5 Mo maximum par fichier.</p>
      <Button type="submit" disabled={sending} className="w-full">
        {sending ? 'Envoi…' : submitLabel}
      </Button>
    </form>
  );
}

function FileField({ label, file, error, onChange }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <input
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block w-full rounded border border-dashed border-outline-variant bg-surface-container-lowest px-3 py-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary-fixed file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-on-primary-fixed-variant"
        aria-label={label}
      />
      {file && <p className="mt-1 truncate text-xs text-on-surface-variant">{file.name}</p>}
      {error && <p className="mt-1 text-xs font-medium text-error">{error}</p>}
    </div>
  );
}
