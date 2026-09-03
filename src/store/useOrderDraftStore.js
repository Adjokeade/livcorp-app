import { create } from 'zustand';

// Brouillon de commande en cours de création côté client (tunnel multi-étapes :
// adresses → estimation → paiement). Vidé après création réussie de la commande.
const useOrderDraftStore = create((set) => ({
  type: 'colis', // 'colis' | 'course'
  pickupAddress: '',
  pickupLat: null,
  pickupLng: null,
  dropoffAddress: '',
  dropoffLat: null,
  dropoffLng: null,
  packageType: '',
  instructions: '',
  urgency: 'standard', // 'standard' | 'express'
  estimate: null, // { distance_km, estimated_price }

  setField: (field, value) => set({ [field]: value }),
  setEstimate: (estimate) => set({ estimate }),
  reset: () =>
    set({
      type: 'colis',
      pickupAddress: '',
      pickupLat: null,
      pickupLng: null,
      dropoffAddress: '',
      dropoffLat: null,
      dropoffLng: null,
      packageType: '',
      instructions: '',
      urgency: 'standard',
      estimate: null,
    }),
}));

export default useOrderDraftStore;
