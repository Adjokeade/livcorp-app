// Recherche d'adresses et géolocalisation, basées sur OpenStreetMap.
//
// Pourquoi pas un simple "premier résultat" : "Fidjrossè" existe à Cotonou ET à Dangbo (30 km plus
// loin). Prendre le premier résultat sans demander confirmation envoie le livreur au mauvais
// endroit. On propose donc plusieurs suggestions avec quartier et commune, on biaise vers la
// zone de Cotonou, et le client confirme sur une carte où il peut déplacer le repère.
//
// Photon (komoot) est conçu pour la saisie au fil de la frappe ; Nominatim, plus strict sur ce point,
// n'est utilisé que pour le géocodage inverse (une requête à la fois, après un clic ou un glissé).
// En production, héberger ces services ou changer VITE_PHOTON_URL / VITE_NOMINATIM_URL.
const PHOTON_URL = import.meta.env.VITE_PHOTON_URL ?? 'https://photon.komoot.io/api/';
const NOMINATIM_URL = import.meta.env.VITE_NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';

// Rectangle englobant du Bénin, identique à la validation côté serveur.
export const BENIN_BOUNDS = { minLat: 6.2, maxLat: 12.45, minLng: 0.7, maxLng: 3.9 };
export const COTONOU = { lat: 6.3703, lng: 2.3912 };

export function isInBenin(lat, lng) {
  return (
    lat >= BENIN_BOUNDS.minLat && lat <= BENIN_BOUNDS.maxLat && lng >= BENIN_BOUNDS.minLng && lng <= BENIN_BOUNDS.maxLng
  );
}

function uniqueParts(parts) {
  return parts.filter((part, i) => part && parts.indexOf(part) === i);
}

export async function searchPlaces(query, { near = COTONOU, signal } = {}) {
  const params = new URLSearchParams({
    q: query,
    limit: '6',
    lang: 'fr',
    lat: String(near.lat),
    lon: String(near.lng),
    bbox: `${BENIN_BOUNDS.minLng},${BENIN_BOUNDS.minLat},${BENIN_BOUNDS.maxLng},${BENIN_BOUNDS.maxLat}`,
  });
  const res = await fetch(`${PHOTON_URL}?${params}`, { signal });
  if (!res.ok) throw new Error('Recherche d\'adresse indisponible.');
  const data = await res.json();

  const seen = new Set();
  return (data.features ?? [])
    .map((feature) => {
      const p = feature.properties ?? {};
      const [lng, lat] = feature.geometry.coordinates;
      const street = [p.housenumber, p.street].filter(Boolean).join(' ');
      const title = p.name ?? street;
      const subtitle = uniqueParts([street !== title ? street : null, p.district ?? p.locality, p.city ?? p.county, p.state]).join(', ');
      return { lat, lng, title, subtitle, label: uniqueParts([title, subtitle]).join(', ') };
    })
    .filter((place) => place.title && isInBenin(place.lat, place.lng))
    .filter((place) => {
      const key = `${place.label}|${place.lat.toFixed(4)}|${place.lng.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// Libellé lisible d'un point de la carte (géocodage inverse). Ne lève jamais : si le service ne
// répond pas, ou si le lieu n'a pas de nom dans OpenStreetMap, on garde les coordonnées.
export async function reverseGeocode(lat, lng, { signal } = {}) {
  const fallback = `Position ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(lat),
      lon: String(lng),
      zoom: '18',
      addressdetails: '1',
      'accept-language': 'fr',
    });
    const res = await fetch(`${NOMINATIM_URL}/reverse?${params}`, { signal });
    if (!res.ok) return fallback;
    const { address = {} } = await res.json();
    const label = uniqueParts([
      address.road,
      address.neighbourhood ?? address.suburb ?? address.quarter,
      address.city_district,
      address.city ?? address.town ?? address.village,
    ]).join(', ');
    return label || fallback;
  } catch {
    return fallback;
  }
}

// Position actuelle de l'appareil, vérifiée au Bénin. Rejette avec un message prêt à afficher.
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("La localisation n'est pas disponible sur cet appareil."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!isInBenin(coords.latitude, coords.longitude)) {
          reject(new Error("Votre position n'est pas au Bénin. Saisissez l'adresse à la main."));
          return;
        }
        resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
      },
      (err) =>
        reject(
          new Error(
            err.code === 1
              ? 'Autorisez la localisation dans votre navigateur pour utiliser votre position.'
              : 'Position introuvable. Réessayez ou saisissez l\'adresse.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );
  });
}

// Lien d'itinéraire qui ouvre l'application de cartes du téléphone (Google Maps, Waze via partage…).
export function navigationUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}
