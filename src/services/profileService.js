import api from '../lib/api';

// Mappé sur routes/api.php : /profile et /addresses (tous rôles connectés).
const profileService = {
  update: (payload) => api.patch('/profile', payload).then((r) => r.data),
  // Photo de profil (multipart). Obligatoire pour un livreur.
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('avatar', file);
    return api.post('/profile/avatar', form).then((r) => r.data);
  },
  deleteAvatar: () => api.delete('/profile/avatar'),

  updatePassword: (payload) => api.put('/profile/password', payload).then((r) => r.data),

  listAddresses: () => api.get('/addresses').then((r) => r.data),
  createAddress: (payload) => api.post('/addresses', payload).then((r) => r.data),
  deleteAddress: (id) => api.delete(`/addresses/${id}`),
};

export default profileService;
