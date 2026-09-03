import axios from 'axios';

// Couche service API centralisée — cf. prompt frontend §2 "Couche service API".
// Toutes les requêtes passent par cette instance : baseURL unique, injection du
// token Sanctum, gestion centralisée des erreurs 401 (session expirée).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1',
  headers: {
    Accept: 'application/json',
  },
});

// Intercepteur de requête : injecte le token Bearer Sanctum stocké en mémoire/store.
// Le token n'est jamais lu depuis localStorage directement ici — cf. useAuthStore,
// qui décide lui-même de la persistance (voir commentaire de sécurité dans ce fichier).
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('livcorp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Intercepteur de réponse : centralise le cas "session expirée / token invalide".
// Chaque appelant peut toujours catcher l'erreur pour un message spécifique ;
// ceci ne fait que déclencher un événement global que AuthContext écoute pour
// forcer une déconnexion propre (cf. useAuthStore.js).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('livcorp:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export default api;
