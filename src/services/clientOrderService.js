import api from '../lib/api';

// Mappé sur routes/api.php > Route::prefix('client') (role:client, verified.email)
const clientOrderService = {
  list: (page = 1) => api.get('/client/orders', { params: { page } }).then((r) => r.data),

  // Distance routière, durée, tracé et prix conseillés d'un trajet.
  estimate: ({ pickupLat, pickupLng, dropoffLat, dropoffLng, urgency }) =>
    api
      .post('/client/orders/estimate', {
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
        dropoff_lat: dropoffLat,
        dropoff_lng: dropoffLng,
        urgency,
      })
      .then((r) => r.data),

  // Envoi en multipart (photo du colis). Les champs vides sont omis plutôt qu'envoyés à vide.
  create: (draft) => {
    const form = new FormData();
    const add = (key, value) => {
      if (value !== null && value !== undefined && value !== '') form.append(key, value);
    };
    add('type', draft.type);
    add('pickup_address', draft.pickupAddress);
    add('pickup_lat', draft.pickupLat);
    add('pickup_lng', draft.pickupLng);
    add('pickup_details', draft.pickupDetails.trim());
    add('dropoff_address', draft.dropoffAddress);
    add('dropoff_lat', draft.dropoffLat);
    add('dropoff_lng', draft.dropoffLng);
    add('dropoff_details', draft.dropoffDetails.trim());
    add('recipient_name', draft.recipientName);
    add('recipient_phone', draft.recipientPhone);
    add('package_type', draft.packageType);
    add('instructions', draft.instructions);
    add('urgency', draft.urgency);
    add('price', draft.price);
    if (draft.photo) form.append('photo', draft.photo);
    return api.post('/client/orders', form).then((r) => r.data); // { order }
  },

  show: (orderId) => api.get(`/client/orders/${orderId}`).then((r) => r.data),

  // Réponse aux propositions de prix des livreurs. Accepter fixe le prix (et assigne le livreur
  // si la course était libre) ; refuser laisse la course ouverte.
  acceptOffer: (orderId, offerId) =>
    api.post(`/client/orders/${orderId}/offers/${offerId}/accept`).then((r) => r.data),
  declineOffer: (orderId, offerId) =>
    api.post(`/client/orders/${orderId}/offers/${offerId}/decline`).then((r) => r.data),

  // Annulation, possible tant que le livreur n'a pas récupéré le colis. `reason` est facultatif.
  cancel: (orderId, reason) => api.post(`/client/orders/${orderId}/cancel`, { reason: reason || null }).then((r) => r.data),

  // Après un "destinataire injoignable" : le client confirme qu'il est joignable, la remise reprend.
  retryDelivery: (orderId) => api.post(`/client/orders/${orderId}/retry-delivery`).then((r) => r.data.order),

  // Validation du paiement à la réception : method = 'especes' | 'en_ligne'.
  // 'en_ligne' renvoie aussi { payment } (transaction FedaPay à ouvrir dans le widget).
  pay: (orderId, method) => api.post(`/client/orders/${orderId}/payment`, { method }).then((r) => r.data),

  // Avis sur une commande livrée : { rating: 1..5, comment? }, une seule fois par commande.
  review: (orderId, { rating, comment }) =>
    api.post(`/client/orders/${orderId}/review`, { rating, comment }).then((r) => r.data),

  track: (orderId) => api.get(`/client/orders/${orderId}/track`).then((r) => r.data),
};

export default clientOrderService;
