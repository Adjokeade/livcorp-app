import api from '../lib/api';

// Mappé sur routes/api.php > Route::prefix('deliverer')
// (role:livreur, verified.email, deliverer.verified — cf. EnsureDelivererIsVerified)
const delivererService = {
  available: (page = 1) => api.get('/deliverer/orders/available', { params: { page } }).then((r) => r.data),

  mine: (page = 1) => api.get('/deliverer/orders/mine', { params: { page } }).then((r) => r.data),

  accept: (orderId) => api.post(`/deliverer/orders/${orderId}/accept`).then((r) => r.data),

  // status ∈ colis_recupere | en_cours_livraison | livree — cf. UpdateOrderStatusRequest
  updateStatus: (orderId, status, note) =>
    api.patch(`/deliverer/orders/${orderId}/status`, { status, note }).then((r) => r.data),

  pushLocation: (orderId, lat, lng) =>
    api.post(`/deliverer/orders/${orderId}/location`, { lat, lng }).then((r) => r.data),

  // NB : aucune route d'upload de pièces justificatives n'existe encore côté backend
  // (voir README > "Écarts backend connus"). Ce point d'entrée est prêt pour le jour
  // où POST /deliverer/documents (ou équivalent) sera exposé.
  uploadDocument: (formData) =>
    api
      .post('/deliverer/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),
};

export default delivererService;
