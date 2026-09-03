import api from '../lib/api';

// Mappé sur routes/api.php > Route::prefix('client') (role:client, verified.email)
const clientOrderService = {
  list: (page = 1) => api.get('/client/orders', { params: { page } }).then((r) => r.data),

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

  create: (draft) =>
    api
      .post('/client/orders', {
        type: draft.type,
        merchant_id: draft.merchantId ?? null,
        pickup_address: draft.pickupAddress,
        pickup_lat: draft.pickupLat,
        pickup_lng: draft.pickupLng,
        dropoff_address: draft.dropoffAddress,
        dropoff_lat: draft.dropoffLat,
        dropoff_lng: draft.dropoffLng,
        package_type: draft.packageType || null,
        instructions: draft.instructions || null,
        urgency: draft.urgency,
      })
      .then((r) => r.data), // { order, payment }

  show: (orderId) => api.get(`/client/orders/${orderId}`).then((r) => r.data),

  track: (orderId) => api.get(`/client/orders/${orderId}/track`).then((r) => r.data),
};

export default clientOrderService;
