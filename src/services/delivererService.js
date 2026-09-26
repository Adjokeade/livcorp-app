import api from '../lib/api';

// Mappé sur routes/api.php > Route::prefix('deliverer')
// (role:livreur, verified.email, deliverer.verified — cf. EnsureDelivererIsVerified),
// sauf POST /deliverer/documents, ouvert dès l'inscription.
const delivererService = {
  // coords = { lat, lng } requis quand isAvailable passe à true (position affichée
  // sur la carte des expéditeurs) — cf. AvailabilityController côté backend.
  setAvailability: (isAvailable, coords) =>
    api
      .patch('/deliverer/availability', {
        is_available: isAvailable,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      })
      .then((r) => r.data),

  available: (page = 1) => api.get('/deliverer/orders/available', { params: { page } }).then((r) => r.data),

  mine: (page = 1) => api.get('/deliverer/orders/mine', { params: { page } }).then((r) => r.data),

  // Déroulé de la course. "point" : 'pickup' (retrait) ou 'dropoff' (destination).
  arrived: (orderId, point) => api.post(`/deliverer/orders/${orderId}/arrived`, { point }).then((r) => r.data.order),

  // Remise contre le code du destinataire ; photo obligatoire pour un paiement en espèces (multipart).
  deliver: (orderId, { code, photo }) => {
    const form = new FormData();
    form.append('delivery_code', code);
    if (photo) form.append('delivery_photo', photo);
    return api.post(`/deliverer/orders/${orderId}/deliver`, form).then((r) => r.data.order);
  },
  remindCode: (orderId) => api.post(`/deliverer/orders/${orderId}/remind-code`).then((r) => r.data),

  // Désistement avant le retrait : reason ∈ panne | trop_loin | colis_different | client_injoignable | autre.
  release: (orderId, reason, note) =>
    api.post(`/deliverer/orders/${orderId}/release`, { reason, note: note || null }).then((r) => r.data.order),

  unreachable: (orderId) => api.post(`/deliverer/orders/${orderId}/unreachable`).then((r) => r.data.order),

  // Contre-proposition de prix (course libre) ou demande de révision (course acceptée, avant retrait).
  offer: (orderId, amount, message) =>
    api.post(`/deliverer/orders/${orderId}/offer`, { amount, message: message || null }).then((r) => r.data),
  withdrawOffer: (orderId) => api.delete(`/deliverer/orders/${orderId}/offer`).then((r) => r.data),

  accept: (orderId) => api.post(`/deliverer/orders/${orderId}/accept`).then((r) => r.data),

  // status ∈ colis_recupere | en_cours_livraison | livree — cf. UpdateOrderStatusRequest
  updateStatus: (orderId, status, note) =>
    api.patch(`/deliverer/orders/${orderId}/status`, { status, note }).then((r) => r.data),

  pushLocation: (orderId, lat, lng) =>
    api.post(`/deliverer/orders/${orderId}/location`, { lat, lng }).then((r) => r.data),

  // Portefeuille : solde, gains par course, versements, numéro Mobile Money.
  wallet: () => api.get('/deliverer/wallet').then((r) => r.data),
  setMobileMoney: (number) =>
    api.patch('/deliverer/wallet/mobile-money', { mobile_money_number: number }).then((r) => r.data),

  // Avis reçus des clients (+ { summary: { average, count } }).
  reviews: (page = 1) => api.get('/deliverer/reviews', { params: { page } }).then((r) => r.data),

  // Dépôt des pièces justificatives : accessible dès l'inscription (rôle livreur
  // seulement), avant la validation du compte par l'administrateur.
  uploadDocument: (formData) =>
    api
      .post('/deliverer/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),
};

export default delivererService;
