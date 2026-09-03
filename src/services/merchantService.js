import api from '../lib/api';

// Mappé sur routes/api.php > Route::prefix('merchant') (role:commercant, verified.email)
const merchantService = {
  getShop: () => api.get('/merchant/shop').then((r) => r.data),

  updateShop: (payload) => api.put('/merchant/shop', payload).then((r) => r.data),

  orders: (page = 1) => api.get('/merchant/orders', { params: { page } }).then((r) => r.data),

  stats: () => api.get('/merchant/orders/stats').then((r) => r.data),
};

export default merchantService;
