import api from '../lib/api';

// Conversation client / livreur d'une commande (mêmes routes pour les deux rôles).
const orderChatService = {
  // after : ne renvoyer que les messages plus récents ; open : la conversation est à l'écran, ce que l'autre a
  // écrit est marqué lu.
  list: (orderId, { after, open } = {}) =>
    api
      .get(`/orders/${orderId}/messages`, { params: { ...(after ? { after } : {}), ...(open ? { open: 1 } : {}) } })
      .then((r) => r.data), // { data: [{ id, mine, body, created_at }], writable }

  send: (orderId, body) => api.post(`/orders/${orderId}/messages`, { body }).then((r) => r.data.message),
};

export default orderChatService;
