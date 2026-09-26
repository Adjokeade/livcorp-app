import { create } from 'zustand';

// Brouillon de commande en cours de création côté client (tunnel multi-étapes :
// trajet → colis et prix → récapitulatif). Vidé après création réussie de la commande.
//
// Un point (départ ou destination) n'est "localisé" que si ses coordonnées sont renseignées :
// elles ne le sont qu'après le choix d'une suggestion, la position GPS ou le placement du repère
// sur la carte, jamais par simple saisie de texte.
const INITIAL = {
  type: 'colis', // 'colis' | 'course'
  pickupAddress: '',
  pickupDetails: '',
  pickupLat: null,
  pickupLng: null,
  dropoffAddress: '',
  dropoffDetails: '',
  dropoffLat: null,
  dropoffLng: null,
  recipientName: '',
  recipientPhone: '',
  packageType: '',
  instructions: '',
  urgency: 'standard', // 'standard' | 'express'
  photo: null, // File (déjà réduit par PhotoField)
  price: '', // FCFA, fixé par le client
  estimate: null, // { distance_km, duration_min, distance_source, route, suggested_prices, min_price }
};

const useOrderDraftStore = create((set) => ({
  ...INITIAL,
  setField: (field, value) => set({ [field]: value }),
  setEstimate: (estimate) => set({ estimate }),
  reset: () => set({ ...INITIAL }),
}));

export default useOrderDraftStore;
