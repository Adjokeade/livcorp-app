import { useRef, useState } from 'react';
import useAuthStore from '../../store/useAuthStore';
import profileService from '../../services/profileService';
import Avatar from './Avatar';

const MAX_BYTES = 8 * 1024 * 1024;

// Choix et envoi de la photo de profil. Le serveur la recadre au carré. Pour un livreur elle est obligatoire :
// on ne propose pas de la retirer, seulement de la remplacer.
export default function AvatarUploader({ user, required = false, onUploaded }) {
  const setUser = useAuthStore((s) => s.setUser);
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Choisissez une photo (JPG, PNG ou WebP).');
    if (file.size > MAX_BYTES) return setError('Cette photo est trop lourde (8 Mo maximum).');

    setError('');
    setBusy(true);
    setPreview(URL.createObjectURL(file));
    try {
      const { avatar_url: url } = await profileService.uploadAvatar(file);
      setUser({ ...useAuthStore.getState().user, avatar_url: url });
      onUploaded?.(url);
    } catch (err) {
      setPreview(null);
      setError(err.response?.data?.errors?.avatar?.[0] ?? err.response?.data?.message ?? "Envoi impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await profileService.deleteAvatar();
      setPreview(null);
      setUser({ ...useAuthStore.getState().user, avatar_url: null });
    } catch (err) {
      setError(err.response?.data?.message ?? 'Suppression impossible.');
    } finally {
      setBusy(false);
    }
  }

  const src = preview ?? user.avatar_url;

  return (
    <div className="flex items-center gap-4">
      <Avatar src={src} name={user.first_name} size="xl" />
      <div className="min-w-0">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={pick} className="sr-only" aria-label="Photo de profil" />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-secondary !px-4 !py-2 text-sm">
            {busy ? 'Envoi…' : src ? 'Changer la photo' : 'Ajouter une photo'}
          </button>
          {src && !required && !busy && (
            <button type="button" onClick={remove} className="text-sm font-semibold text-error hover:underline">Retirer</button>
          )}
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">
          {required
            ? 'Obligatoire : votre visage doit être bien visible, vos clients vous reconnaîtront à la remise du colis.'
            : 'Une photo de vous, de préférence de face.'}
        </p>
        {error && <p role="alert" className="mt-1 text-xs font-medium text-error">{error}</p>}
      </div>
    </div>
  );
}
