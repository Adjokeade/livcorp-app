import { useState } from 'react';
import delivererService from '../../services/delivererService';
import Button from '../common/Button';
import AvatarUploader from '../common/AvatarUploader';
import useAuthStore from '../../store/useAuthStore';

// Formulaire de dépôt des pièces justificatives (POST /deliverer/documents).
// Utilisé à la dernière étape de l'inscription livreur et depuis le tableau
// de bord tant que le dossier n'est pas complet.
export default function DocumentsUpload({ onDone, submitLabel = 'Envoyer mon dossier' }) {
  const user = useAuthStore((s) => s.user);
  const [files, setFiles] = useState({ id_card: null, driving_license: null, residence_certificate: null });
  // Un certificat déjà déposé n'est pas redemandé lors d'un renvoi de dossier.
  const hasCertificate = (user?.documents ?? []).some((d) => d.type === 'certificat_residence');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (!user?.avatar_url) {
      setError('Ajoutez votre photo de profil : elle est obligatoire pour les livreurs.');
      return;
    }

    if (!files.id_card && !files.driving_license) {
      setError('Ajoutez au moins une pièce d\'identité ou un permis avant d\'envoyer.');
      return;
    }

    if (!files.residence_certificate && !hasCertificate) {
      setFieldErrors({ residence_certificate: ['Le certificat de résidence est obligatoire.'] });
      setError('Ajoutez votre certificat de résidence avant d\'envoyer.');
      return;
    }

    const formData = new FormData();
    if (files.id_card) formData.append('id_card', files.id_card);
    if (files.driving_license) formData.append('driving_license', files.driving_license);
    if (files.residence_certificate) formData.append('residence_certificate', files.residence_certificate);

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
      <div>
        <span className="mb-2 block text-sm font-semibold">Photo de profil <span className="text-error">*</span></span>
        {user && <AvatarUploader user={user} required />}
      </div>
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
      <FileField
        label="Certificat de résidence"
        required={!hasCertificate}
        hint={hasCertificate ? 'Déjà reçu : ajoutez un fichier seulement pour le remplacer.' : 'Délivré par votre mairie ou votre chef de quartier.'}
        file={files.residence_certificate}
        error={fieldErrors.residence_certificate?.[0]}
        onChange={(f) => setFiles((s) => ({ ...s, residence_certificate: f }))}
      />
      <p className="text-xs text-on-surface-variant">Formats acceptés : JPG, PNG ou PDF, 5 Mo maximum par fichier.</p>
      <Button type="submit" disabled={sending} className="w-full">
        {sending ? 'Envoi…' : submitLabel}
      </Button>
    </form>
  );
}

function FileField({ label, file, error, onChange, required = false, hint }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold">
        {label}
        {required && <span className="text-error"> *</span>}
      </span>
      <input
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block w-full rounded border border-dashed border-outline-variant bg-surface-container-lowest px-3 py-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary-fixed file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-on-primary-fixed-variant"
        aria-label={label}
      />
      {hint && <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>}
      {file && <p className="mt-1 truncate text-xs text-on-surface-variant">{file.name}</p>}
      {error && <p className="mt-1 text-xs font-medium text-error">{error}</p>}
    </div>
  );
}
