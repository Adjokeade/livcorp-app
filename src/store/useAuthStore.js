import { create } from 'zustand';
import api from '../lib/api';
import { disconnectEcho } from '../lib/echo';

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
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, status: 'authenticated' });
    } catch {
      localStorage.removeItem('livcorp_token');
      set({ user: null, token: null, status: 'guest' });
    }
  },

  async login(email, password) {
    set({ status: 'loading', error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('livcorp_token', data.token);
      set({ user: data.user, token: data.token, status: 'authenticated' });
      return data.user;
    } catch (err) {
      const message = err.response?.data?.message ?? 'Connexion impossible. Vérifiez vos identifiants.';
      set({ status: 'guest', error: message });
      throw err;
    }
  },

  async register(payload) {
    set({ status: 'loading', error: null });
    try {
      const { data } = await api.post('/auth/register', payload);
      set({ status: 'guest' });
      return data;
    } catch (err) {
      const message = err.response?.data?.message ?? "L'inscription a échoué.";
      set({ status: 'guest', error: message });
      throw err;
    }
  },

  async logout() {
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
