import api from '../lib/api';

// Mappé sur routes/api.php > POST /contact (public)
const contactService = {
  send: (payload) => api.post('/contact', payload).then((r) => r.data),
};

export default contactService;
