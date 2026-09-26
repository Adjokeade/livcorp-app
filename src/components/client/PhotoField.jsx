import { useEffect, useRef, useState } from 'react';

const MAX_SIDE = 1280;

// Réduit la photo avant l'envoi : un cliché de téléphone pèse 4 à 10 Mo, ce qui est long et coûteux
// en données mobiles. Le passage par un canvas applique aussi l'orientation et retire les données
// EXIF (dont la position GPS) de l'image envoyée.
async function compress(file, filename = 'colis.jpg') {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // un PNG transparent deviendrait noir en JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('compression');
  return new File([blob], filename, { type: 'image/jpeg' });
}

export default function PhotoField({ file, onChange, error, required, label = 'Photo du colis', hint = "Le livreur voit ce qu'il va transporter avant d'accepter.", filename = 'colis.jpg' }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handlePick(e) {
    const picked = e.target.files?.[0];
    e.target.value = ''; // permet de re-choisir le même fichier
    if (!picked) return;

    if (!picked.type.startsWith('image/')) {
      setLocalError('Ce fichier n\'est pas une image. Choisissez une photo (JPG ou PNG).');
      return;
    }

    setBusy(true);
    setLocalError('');
    try {
      onChange(await compress(picked, filename));
    } catch {
      setLocalError('Impossible de lire cette photo. Essayez-en une autre.');
    } finally {
      setBusy(false);
    }
  }

  const shownError = localError || error;

  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold">
        {label} {required ? <span className="text-error">*</span> : <span className="font-normal text-on-surface-variant">(facultatif)</span>}
      </span>

      <input ref={inputRef} type="file" accept="image/*" onChange={handlePick} className="sr-only" aria-label={label} />

      {file && preview ? (
        <div className="flex items-center gap-3 rounded border border-outline-variant p-2">
          <img src={preview} alt="Aperçu du colis" className="h-20 w-20 flex-shrink-0 rounded object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-primary">Photo ajoutée</p>
            <p className="text-xs text-on-surface-variant">{Math.round(file.size / 1024)} Ko après optimisation</p>
            <div className="mt-2 flex gap-4 text-sm font-semibold">
              <button type="button" onClick={() => inputRef.current?.click()} className="text-secondary">
                Changer
              </button>
              <button type="button" onClick={() => onChange(null)} className="text-error">
                Retirer
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-outline-variant bg-surface-container-lowest px-4 py-6 text-center transition hover:border-primary"
        >
          <span className="text-sm font-semibold text-secondary">{busy ? 'Optimisation…' : 'Prendre ou choisir une photo'}</span>
          <span className="text-xs text-on-surface-variant">{hint}</span>
        </button>
      )}

      {shownError && <p className="mt-1 text-xs font-medium text-error">{shownError}</p>}
    </div>
  );
}
