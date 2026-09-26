// Montant en francs CFA, séparateur de milliers à la française (ex. 12 500 FCFA).
export function formatFcfa(amount) {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(Number(amount) || 0))} FCFA`;
}

export function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Distance en km à la française, une décimale au plus (l'API renvoie "9.80").
export function formatKm(km) {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(Number(km) || 0)} km`;
}

// "il y a 5 min", "il y a 3 h", "il y a 2 j" : l'ancienneté d'une annonce.
export function timeAgo(dateString) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(dateString).getTime()) / 60000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

export function formatDuration(minutes) {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

// "Marché Dantokpa, Boulevard Saint-Michel, Cotonou" -> "Marché Dantokpa" : l'essentiel pour un titre de carte.
export function shortPlace(address) {
  return String(address ?? '').split(',')[0].trim() || 'Adresse';
}

// "14:32" : heure locale d'un événement ou d'une arrivée estimée.
export function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Ancienneté d'une mesure : "à l'instant", "il y a 25 s", "il y a 3 min".
export function formatAge(seconds) {
  if (seconds < 8) return "à l'instant";
  if (seconds < 60) return `il y a ${Math.round(seconds)} s`;
  return `il y a ${Math.round(seconds / 60)} min`;
}
