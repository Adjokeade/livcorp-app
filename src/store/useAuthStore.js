import { create } from 'zustand';
import api from '../lib/api';
import { disconnectEcho } from '../lib/echo';
import { detachPushFromServer, syncPushSubscription } from '../lib/push';

// Message lisible pour l'utilisateur à partir d'une erreur Axios. Les erreurs de
// validation (422) sont aussi détaillées champ par champ dans les formulaires
// d'inscription, qui masquent alors ce message global.
function describeError(err, fallback) {
  const status = err.response?.status;
  if (!err.response) return 'Serveur injoignable. Vérifiez votre connexion internet puis réessayez.';
  if (status === 429) return 'Trop de tentatives. Patientez une minute puis réessayez.';
  return err.response.data?.message ?? fallback;
}

// Gestion d'état globale — Zustand, cf. architecture_structure_technique.md §3
// "État : Zustand (Léger et performant pour l'état global)".
// Le user connecté, son rôle, et le token sont ici plutôt que dispersés en Context,
// pour que n'importe quel composant (Header, ProtectedRoute, services) y accède
// sans prop-drilling ni Provider imbriqué.
const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('livcorp_token'),
  status: 'idle', // idle | loading | authenticated | guest
  error: null,

  isAuthenticated: () => Boolean(get().token && get().user),

  async bootstrap() {
    const token = localStorage.getItem('livcorp_token');
    if (!token) {
      set({ status: 'guest' });
      return;
    }
    set({ status: 'loading', token });

    // Seul un 401 prouve que la session est finie. Une coupure réseau ou une erreur passagère du serveur
    // (fréquent sur mobile) ne doit pas déconnecter : on réessaie, et on garde le jeton pour le prochain lancement.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data } = await api.get('/auth/me');
        set({ user: data, status: 'authenticated' });
        syncPushSubscription();
        return;
      } catch (err) {
        if (err.response?.status === 401) {
          localStorage.removeItem('livcorp_token');
          set({ user: null, token: null, status: 'guest' });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }
    set({ user: null, status: 'guest' });
  },

  async login(email, password) {
    set({ status: 'loading', error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('livcorp_token', data.token);
      set({ user: data.user, token: data.token, status: 'authenticated' });
      syncPushSubscription();
      return data.user;
    } catch (err) {
      set({ status: 'guest', error: describeError(err, 'Connexion impossible. Vérifiez vos identifiants.') });
      throw err;
    }
  },

  // Connexion de l'espace administrateur (point d'entrée distinct). Si une autre session est ouverte sur cet
  // appareil, elle est fermée proprement une fois la nouvelle connexion acceptée : l'appareil ne doit plus
  // recevoir les notifications de l'ancien compte.
  async adminLogin(email, password) {
    // Un échec ne doit pas déconnecter la session déjà ouverte (un client qui se trompe de page reste connecté).
    const previousStatus = get().status;
    set({ status: 'loading', error: null });
    try {
      const { data } = await api.post('/admin/auth/login', { email, password });
      const previousToken = get().token;
      if (previousToken) {
        await detachPushFromServer();
        await api.post('/auth/logout').catch(() => {});
      }
      localStorage.setItem('livcorp_token', data.token);
      set({ user: data.user, token: data.token, status: 'authenticated' });
      syncPushSubscription();
      return data.user;
    } catch (err) {
      set({ status: previousStatus === 'authenticated' ? 'authenticated' : 'guest', error: describeError(err, 'Connexion impossible.') });
      throw err;
    }
  },

  // Crée le compte puis connecte aussitôt l'utilisateur avec les mêmes
  // identifiants : il arrive directement dans son espace, sans repasser par
  // le formulaire de connexion. Si la connexion automatique échoue alors que
  // le compte est créé, on renvoie quand même { user: null } sans erreur.
  async register(payload) {
    set({ status: 'loading', error: null });
    try {
      await api.post('/auth/register', payload);
    } catch (err) {
      set({ status: 'guest', error: describeError(err, "L'inscription a échoué.") });
      throw err;
    }

    try {
      const { data } = await api.post('/auth/login', { email: payload.email, password: payload.password });
      localStorage.setItem('livcorp_token', data.token);
      set({ user: data.user, token: data.token, status: 'authenticated' });
      syncPushSubscription();
      return { user: data.user };
    } catch {
      set({ status: 'guest' });
      return { user: null };
    }
  },

  // Recharge le profil (statut de validation livreur, e-mail vérifié…) sans
  // repasser par l'état "loading", qui afficherait le spinner plein écran.
  async refreshUser() {
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data });
      return data;
    } catch {
      return null;
    }
  },

  async resendVerification() {
    await api.post('/auth/email/verification-notification');
  },

  async logout() {
    // Avant l'appel de déconnexion : il faut encore le jeton pour retirer l'appareil du compte.
    await detachPushFromServer();
    try {
      await api.post('/auth/logout');
    } catch {
      // on déconnecte localement même si l'appel réseau échoue
    }
    disconnectEcho();
    localStorage.removeItem('livcorp_token');
    set({ user: null, token: null, status: 'guest' });
  },

  clearError() {
    set({ error: null });
  },
}));

// Déconnexion forcée si l'API renvoie 401 (token expiré/révoqué) — cf. lib/api.js
window.addEventListener('livcorp:unauthorized', () => {
  localStorage.removeItem('livcorp_token');
  useAuthStore.setState({ user: null, token: null, status: 'guest' });
});

export default useAuthStore;
