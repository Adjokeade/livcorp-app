// Métiers des prestataires (mêmes valeurs que ServiceProvider::PROFESSIONS côté serveur).
export const PROFESSION_LABEL = {
  plombier: 'Plombier',
  electricien: 'Électricien',
  coiffeur: 'Coiffeur / coiffeuse',
  informaticien: 'Informaticien',
  menuisier: 'Menuisier',
  macon: 'Maçon',
  mecanicien: 'Mécanicien',
  couturier: 'Couturier / couturière',
  peintre: 'Peintre',
  climatisation: 'Frigoriste / climatisation',
  menage: 'Ménage et entretien',
  autre: 'Autre métier',
  conciergerie: 'Mission de conciergerie',
};

export const PROFESSION_OPTIONS = Object.entries(PROFESSION_LABEL).map(([value, label]) => ({ value, label }));
