import api from '../lib/api';

// Mappé sur routes/api.php > /service-providers (public)
const serviceProviderService = {
  professions: () => api.get('/service-providers/professions').then((r) => r.data),
  apply: (payload) => api.post('/service-providers', payload).then((r) => r.data),
};

export default serviceProviderService;
