import api from '../lib/api';

// Mappé sur routes/api.php > Route::prefix('admin') (role:admin)
const adminService = {
  stats: (period = 'month') => api.get('/admin/dashboard/stats', { params: { period } }).then((r) => r.data),

  pendingDeliverers: (page = 1) => api.get('/admin/deliverers/pending', { params: { page } }).then((r) => r.data),
  approveDeliverer: (delivererId) => api.post(`/admin/deliverers/${delivererId}/approve`).then((r) => r.data),
  rejectDeliverer: (delivererId, reason) =>
    api.post(`/admin/deliverers/${delivererId}/reject`, { reason }).then((r) => r.data),

  // Annuaire des livreurs (tous statuts) et gestion des comptes.
  deliverers: (params = {}) => api.get('/admin/deliverers', { params }).then((r) => r.data),
  deliverer: (delivererId) => api.get(`/admin/deliverers/${delivererId}`).then((r) => r.data),
  // Finances : synthèse, commissions, versements, taux de commission.
  financeSummary: (period = 'month') => api.get('/admin/finance/summary', { params: { period } }).then((r) => r.data),
  financeCommissions: (params = {}) => api.get('/admin/finance/commissions', { params }).then((r) => r.data),
  financePayouts: (params = {}) => api.get('/admin/finance/payouts', { params }).then((r) => r.data),
  financeRefunds: () => api.get('/admin/finance/refunds').then((r) => r.data),
  markRefundDone: (transactionId) => api.post(`/admin/finance/refunds/${transactionId}/done`).then((r) => r.data),
  payPayout: (payoutId, reference) => api.post(`/admin/finance/payouts/${payoutId}/pay`, { reference: reference || null }).then((r) => r.data),
  cancelPayout: (payoutId) => api.post(`/admin/finance/payouts/${payoutId}/cancel`).then((r) => r.data),
  runPayouts: () => api.post('/admin/finance/payouts/run').then((r) => r.data),
  financeSettings: () => api.get('/admin/finance/settings').then((r) => r.data),
  updateFinanceSettings: (payload) => api.put('/admin/finance/settings', payload).then((r) => r.data),

  users: (params = {}) => api.get('/admin/users', { params }).then((r) => r.data),
  // Tarif négocié avec une entreprise (compte propriétaire) ; la suppression la ramène au barème standard.
  setUserTariff: (userId, tariff) => api.put(`/admin/users/${userId}/tariff`, tariff).then((r) => r.data),
  clearUserTariff: (userId) => api.delete(`/admin/users/${userId}/tariff`),
  setUserActive: (userId, isActive) => api.patch(`/admin/users/${userId}`, { is_active: isActive }).then((r) => r.data),

  // Toutes les livraisons de la plateforme ; l'annulation d'autorité exige un motif.
  orders: (params = {}) => api.get('/admin/orders', { params }).then((r) => r.data),
  cancelOrder: (orderId, reason) => api.post(`/admin/orders/${orderId}/cancel`, { reason }).then((r) => r.data),

  // Barème de prix.
  tariff: () => api.get('/admin/tariff').then((r) => r.data),
  updateTariff: (payload) => api.put('/admin/tariff', payload).then((r) => r.data),

  // Pièce justificative renvoyée en blob (le jeton Bearer ne passe pas par un simple lien).
  documentBlob: (documentId) =>
    api.get(`/admin/documents/${documentId}`, { responseType: 'blob' }).then((r) => r.data),

  // Messages du formulaire Contactez-nous ; la réponse porte aussi `new_count` (non lus).
  messages: ({ status, page = 1 } = {}) =>
    api.get('/admin/messages', { params: { page, ...(status ? { status } : {}) } }).then((r) => r.data),
  setMessageStatus: (messageId, status) =>
    api.patch(`/admin/messages/${messageId}/status`, { status }).then((r) => r.data),

  disputes: (status) => api.get('/admin/disputes', { params: status ? { status } : {} }).then((r) => r.data),
  assignDispute: (disputeId, assignedTo) =>
    api.post(`/admin/disputes/${disputeId}/assign`, { assigned_to: assignedTo }).then((r) => r.data),
  resolveDispute: (disputeId, resolution, resolutionNote) =>
    api
      .post(`/admin/disputes/${disputeId}/resolve`, { resolution, resolution_note: resolutionNote })
      .then((r) => r.data),

  tasks: (params = {}) => api.get('/admin/tasks', { params }).then((r) => r.data),
  createTask: (payload) => api.post('/admin/tasks', payload).then((r) => r.data),
  assignTask: (taskId, assignedTo) =>
    api.patch(`/admin/tasks/${taskId}/assign`, { assigned_to: assignedTo }).then((r) => r.data),
  updateTaskStatus: (taskId, status) =>
    api.patch(`/admin/tasks/${taskId}/status`, { status }).then((r) => r.data),
};

export default adminService;
