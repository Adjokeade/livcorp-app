import api from '../lib/api';

// Mappé sur routes/api.php > Route::prefix('admin') (role:admin)
const adminService = {
  stats: (period = 'month') => api.get('/admin/dashboard/stats', { params: { period } }).then((r) => r.data),

  pendingDeliverers: (page = 1) => api.get('/admin/deliverers/pending', { params: { page } }).then((r) => r.data),
  approveDeliverer: (delivererId) => api.post(`/admin/deliverers/${delivererId}/approve`).then((r) => r.data),
  rejectDeliverer: (delivererId, reason) =>
    api.post(`/admin/deliverers/${delivererId}/reject`, { reason }).then((r) => r.data),

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
