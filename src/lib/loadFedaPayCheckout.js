// Charge le widget Checkout.js FedaPay à la demande (uniquement sur l'écran
// de paiement, pas sur tout le site) et met en cache la promesse de
// chargement pour éviter d'injecter le script plusieurs fois.
// Cf. https://docs.fedapay.com/introduction/fr/checkoutjs-fr
const CHECKOUT_JS_URL = 'https://cdn.fedapay.com/checkout.js?v=1.1.7';

let loadingPromise = null;

export function loadFedaPayCheckout() {
  if (window.FedaPay) {
    return Promise.resolve(window.FedaPay);
  }

  if (!loadingPromise) {
    loadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CHECKOUT_JS_URL;
      script.async = true;
      script.onload = () => resolve(window.FedaPay);
      script.onerror = () => {
        loadingPromise = null; // permet de réessayer plus tard
        reject(new Error('Impossible de charger le widget de paiement FedaPay.'));
      };
      document.head.appendChild(script);
    });
  }

  return loadingPromise;
}
