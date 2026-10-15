// Charge le widget KKiaPay à la demande (uniquement sur l'écran de paiement, pas sur tout le site) et garde la
// promesse de chargement pour ne pas injecter le script plusieurs fois.
// Cf. https://docs.kkiapay.me : openKkiapayWidget, addSuccessListener, addFailedListener.
const SDK_URL = 'https://cdn.kkiapay.me/k.js';

let loadingPromise = null;

export function loadKkiapay() {
  if (typeof window.openKkiapayWidget === 'function') return Promise.resolve(window);

  if (!loadingPromise) {
    loadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.onload = () => (typeof window.openKkiapayWidget === 'function' ? resolve(window) : reject(new Error('Widget de paiement KKiaPay indisponible.')));
      script.onerror = () => {
        loadingPromise = null; // permet de réessayer plus tard
        reject(new Error('Impossible de charger le widget de paiement KKiaPay.'));
      };
      document.head.appendChild(script);
    });
  }

  return loadingPromise;
}

// Les écouteurs du widget sont globaux à la page : on les branche UNE fois, et ils appellent les derniers gestionnaires.
let listenersReady = false;
let current = { onSuccess: null, onFailed: null };

/**
 * Ouvre le widget KKiaPay pour un paiement préparé par le serveur ({ reference, amount, public_key, sandbox, customer }).
 * `onSuccess(transactionId)` : le client a payé (le serveur vérifiera auprès de KKiaPay) ; `onFailed()` : échec ou refus.
 */
export async function openKkiapayPayment(payment, { onSuccess, onFailed }) {
  const kkiapay = await loadKkiapay();
  current = { onSuccess, onFailed };

  if (!listenersReady) {
    kkiapay.addSuccessListener?.((response) => current.onSuccess?.(response?.transactionId));
    kkiapay.addFailedListener?.(() => current.onFailed?.());
    listenersReady = true;
  }

  kkiapay.openKkiapayWidget({
    amount: payment.amount,
    key: payment.public_key,
    sandbox: payment.sandbox,
    partnerId: payment.reference, // retrouvé par le serveur au retour et par le webhook
    name: payment.customer?.name,
    email: payment.customer?.email,
    phone: payment.customer?.phone,
    countries: ['BJ'],
    position: 'center',
    theme: '#f5721e',
    data: payment.description,
  });
}
