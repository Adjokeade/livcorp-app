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
    if (draft.favoritesFirst) add('favorites_first', 1);
    add('payment_method', draft.paymentMethod);
    if (draft.photo) form.append('photo', draft.photo);
    return api.post('/client/orders', form).then((r) => r.data); // { order }
  },

  // Équipe de l'entreprise (propriétaire et responsables uniquement).
  listTeam: () => api.get('/client/team').then((r) => r.data),
  addTeamMember: (payload) => api.post('/client/team', payload).then((r) => r.data),
  updateTeamMember: (id, payload) => api.patch(`/client/team/${id}`, payload).then((r) => r.data),

  // Livreurs favoris (partagés par l'équipe). On ajoute depuis une livraison où le livreur est intervenu.
  listFavorites: () => api.get('/client/favorites').then((r) => r.data),
  addFavorite: (orderId) => api.post(`/client/orders/${orderId}/favorite`).then((r) => r.data),
  removeFavorite: (delivererId) => api.delete(`/client/favorites/${delivererId}`),

  stats: () => api.get('/client/stats').then((r) => r.data),

  // Carnet de destinataires (adresses toujours localisées).
  listRecipients: () => api.get('/client/recipients').then((r) => r.data),
  createRecipient: (payload) => api.post('/client/recipients', payload).then((r) => r.data),
  deleteRecipient: (id) => api.delete(`/client/recipients/${id}`),

  // Envoi en lot (entreprises) : un point de départ commun, une livraison par ligne. Tout ou rien.
  // Répond { orders, payment } : un seul paiement couvre tout l'envoi (à ouvrir dans le widget KKiaPay).
  createBatch: (pickup, rows, { favoritesFirst = false, paymentMethod = 'en_ligne' } = {}) => {
    const form = new FormData();
    const add = (key, value) => {
      if (value !== null && value !== undefined && value !== '') form.append(key, value);
    };
    add('pickup_address', pickup.address);
    add('pickup_lat', pickup.lat);
    add('pickup_lng', pickup.lng);
    add('pickup_details', pickup.details?.trim());
    if (favoritesFirst) add('favorites_first', 1);
    add('payment_method', paymentMethod);
    rows.forEach((row, i) => {
      const k = (field) => `orders[${i}][${field}]`;
      add(k('type'), row.type);
      add(k('dropoff_address'), row.recipient.address);
      add(k('dropoff_lat'), row.recipient.lat);
      add(k('dropoff_lng'), row.recipient.lng);
      add(k('dropoff_details'), row.recipient.details);
      add(k('recipient_name'), row.recipient.name);
      add(k('recipient_phone'), row.recipient.phone);
      add(k('package_type'), row.packageType);
      if (row.photo) form.append(k('photo'), row.photo);
    });
    return api.post('/client/orders/batch', form).then((r) => r.data);
  },

  show: (orderId) => api.get(`/client/orders/${orderId}`).then((r) => r.data),

  // Annulation, possible tant que le livreur n'a pas récupéré le colis. `reason` est facultatif.
  cancel: (orderId, reason) => api.post(`/client/orders/${orderId}/cancel`, { reason: reason || null }).then((r) => r.data),

  // « Retirer » une demande annulée de sa liste (elle doit d'abord être annulée).
  hide: (orderId) => api.delete(`/client/orders/${orderId}`),

  // Après un "destinataire injoignable" : le client confirme qu'il est joignable, la remise reprend.
  retryDelivery: (orderId) => api.post(`/client/orders/${orderId}/retry-delivery`).then((r) => r.data.order),

  // Paiement à la CRÉATION : l'argent reste bloqué chez LIV corp jusqu'à la confirmation de réception.
  // Reprise du paiement d'une livraison non payée : renvoie { order, payment } (de quoi ouvrir le widget KKiaPay).
  pay: (orderId) => api.post(`/client/orders/${orderId}/payment`).then((r) => r.data),

  // Retour du widget : le serveur vérifie la transaction auprès de KKiaPay avant de publier la livraison.
  // Répond { status: 'approved' | 'failed' | 'pending', orders } ; 'pending' = confirmation à venir par webhook.
  confirmPayment: (reference, transactionId) =>
    api.post('/client/payments/confirm', { reference, transaction_id: transactionId }).then((r) => r.data),

  // Réception : le livreur a remis le colis et envoyé la photo ; l'expéditeur confirme (argent versé au livreur)
  // ou signale un problème (litige, argent gardé chez LIV corp). reason ∈ colis_endommage | colis_non_livre | autre.
  confirmDelivery: (orderId) => api.post(`/client/orders/${orderId}/confirm-delivery`).then((r) => r.data.order),
  reportProblem: (orderId, { reason, description }) =>
    api.post(`/client/orders/${orderId}/report-problem`, { reason, description }).then((r) => r.data.order),

  // Avis sur une commande livrée : { rating: 1..5, comment? }, une seule fois par commande.
  review: (orderId, { rating, comment }) =>
    api.post(`/client/orders/${orderId}/review`, { rating, comment }).then((r) => r.data),

  track: (orderId) => api.get(`/client/orders/${orderId}/track`).then((r) => r.data),
};

export default clientOrderService;
