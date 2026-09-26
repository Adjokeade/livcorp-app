import { useEffect, useId, useRef, useState } from 'react';
import { getCurrentPosition, reverseGeocode, searchPlaces } from '../../lib/geocoding';

// Champ d'adresse avec suggestions. Tant que le client n'a pas choisi une suggestion (ou déplacé le
// repère sur la carte), l'adresse n'est PAS localisée : le parent bloque la suite. C'est ce qui évite
// d'envoyer un livreur au mauvais "Fidjrossè".
export default function AddressField({ label, value, located, onTextChange, onSelect, error, placeholder, near }) {
  const inputId = useId();
  const listId = `${inputId}-list`;
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const skipNextSearch = useRef(false);

  // Une erreur de localisation n'a plus lieu d'être dès que le point est placé (carte, liste ou saisie).
  useEffect(() => {
    setGpsError('');
  }, [located, value]);

  // Recherche différée : on attend une pause de frappe et on annule les requêtes périmées.
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return undefined;
    }
    const query = value.trim();
    if (query.length < 3 || located) {
      setSuggestions([]);
      setSearched(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchPlaces(query, { near, signal: controller.signal });
        setSuggestions(results);
        setSearched(true);
        setActive(-1);
        setOpen(true);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setSuggestions([]);
          setSearched(true);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, located, near]);

  function choose(place) {
    skipNextSearch.current = true;
    setOpen(false);
    setSuggestions([]);
    setGpsError('');
    onSelect({ address: place.label, lat: place.lat, lng: place.lng });
  }

  async function useMyPosition() {
    setGpsBusy(true);
    setGpsError('');
    try {
      const { lat, lng } = await getCurrentPosition();
      const address = await reverseGeocode(lat, lng);
      skipNextSearch.current = true;
      setOpen(false);
      onSelect({ address, lat, lng });
    } catch (err) {
      setGpsError(err.message);
    } finally {
      setGpsBusy(false);
    }
  }

  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showEmpty = open && searched && !searching && suggestions.length === 0 && !located && value.trim().length >= 3;

  return (
    <div className="relative">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-semibold text-on-surface">
          {label}
        </label>
        <button
          type="button"
          onClick={useMyPosition}
          disabled={gpsBusy}
          className="text-xs font-semibold text-secondary disabled:opacity-60"
        >
          {gpsBusy ? 'Localisation…' : 'Ma position'}
        </button>
      </div>

      <input
        id={inputId}
        className="input-field"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        required
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
      />

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-auto rounded-lg border border-outline-variant bg-surface-container-lowest shadow-modal"
        >
          {suggestions.map((place, i) => (
            <li
              key={`${place.label}-${place.lat}-${place.lng}`}
              role="option"
              aria-selected={i === active}
              // onMouseDown : le clic doit passer avant le blur du champ, qui ferme la liste.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(place);
              }}
              className={`cursor-pointer px-3 py-2.5 ${i === active ? 'bg-primary-fixed' : 'hover:bg-surface-container'}`}
            >
              <p className="text-sm font-semibold">{place.title}</p>
              {place.subtitle && <p className="text-xs text-on-surface-variant">{place.subtitle}</p>}
            </li>
          ))}
        </ul>
      )}

      {searching && <p className="mt-1 text-xs text-on-surface-variant">Recherche…</p>}
      {showEmpty && (
        <p className="mt-1 text-xs text-on-surface-variant">
          Aucun résultat : essayez le quartier ou un lieu connu, ou touchez la carte pour placer le repère.
        </p>
      )}
      {located && !error && <p className="mt-1 text-xs font-semibold text-primary">Adresse localisée sur la carte</p>}
      {!located && value.trim().length >= 3 && !searching && suggestions.length > 0 && !open && (
        <p className="mt-1 text-xs text-on-surface-variant">Choisissez une adresse dans la liste pour la localiser.</p>
      )}
      {gpsError && <p className="mt-1 text-xs font-medium text-error">{gpsError}</p>}
      {error && <p className="mt-1 text-xs font-medium text-error">{error}</p>}
    </div>
  );
}
