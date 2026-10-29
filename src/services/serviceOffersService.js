import api from '../lib/api';

// Mappé sur routes/api.php : /provider/* (role:prestataire, dossier validé) et /client/service-requests.
const serviceOffersService = {
  // Prestataire
  offers: (params = {}) => api.get('/provider/offers', { params }).then((r) => r.data),
  myOffers: () => api.get('/provider/offers/mine').then((r) => r.data),
  accept: (id) => api.post(`/provider/offers/${id}/accept`).then((r) => r.data),

  // Client
  requests: () => api.get('/client/service-requests').then((r) => r.data),
  createRequest: (payload) => api.post('/client/service-requests', payload).then((r) => r.data),
  cancelRequest: (id) => api.post(`/client/service-requests/${id}/cancel`).then((r) => r.data),
};

export default serviceOffersService;
