import api from '../lib/api';

// Mappé sur routes/api.php > Route::prefix('marketplace') (tout utilisateur connecté)
const marketplaceService = {
  orders: () => api.get('/marketplace/orders').then((r) => r.data),

  deliverers: (coords) =>
    api
      .get('/marketplace/deliverers', {
        params: coords ? { lat: coords.lat, lng: coords.lng } : {},
      })
      .then((r) => r.data),
};

export default marketplaceService;
