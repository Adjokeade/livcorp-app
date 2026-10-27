// Menu de l'espace connecté, par rôle (mêmes valeurs que User.role côté backend).
// `icon` référence une clé de ICONS dans Sidebar.jsx. `primary` : entrée gardée dans la barre du bas sur mobile (les
// autres passent dans « Plus ») ; `short` : libellé court pour cette barre étroite.
const PROFILE = { to: '/profil', label: 'Mon profil', short: 'Profil', icon: 'user', primary: true };
const ADDRESSES = { to: '/adresses', label: 'Mes adresses', icon: 'pin' };

const MENUS = {
  client: [
    { to: '/client/accueil', label: 'Accueil', icon: 'home', primary: true },
    { to: '/client/commander', label: 'Nouvelle livraison', short: 'Commander', icon: 'plus', primary: true },
    { to: '/client/commandes', label: 'Mes livraisons', short: 'Livraisons', icon: 'box', primary: true },
    { to: '/client/destinataires', label: 'Destinataires', icon: 'book' },
    { to: '/client/favoris', label: 'Livreurs favoris', icon: 'star' },
    ADDRESSES,
    PROFILE,
  ],
  livreur: [{ to: '/deliverer/tableau-de-bord', label: 'Tableau de bord', icon: 'home' }, PROFILE],
  commercant: [{ to: '/merchant/tableau-de-bord', label: 'Tableau de bord', icon: 'home' }, ADDRESSES, PROFILE],
};

// Propriétaire ou responsable d'une entreprise (miroir de User::isTeamManager côté serveur).
export function isTeamManager(user) {
  return user?.role === 'client' && user.account_type === 'entreprise' && (!user.company_id || user.team_role === 'responsable');
}

// L'envoi en lot est réservé aux comptes entreprise, juste après « Nouvelle livraison ».
const TEAM = { to: '/client/equipe', label: 'Mon équipe', icon: 'team' };
const BATCH = { to: '/client/lot', label: 'Envoi en lot', icon: 'layers' };

export function menuFor(user) {
  const menu = MENUS[user?.role] ?? [];
  if (user?.role !== 'client' || user.account_type !== 'entreprise') return menu;
  const at = menu.findIndex((item) => item.to === '/client/commander') + 1;
  const withBatch = [...menu.slice(0, at), BATCH, ...menu.slice(at)];
  if (!isTeamManager(user)) return withBatch;
  const beforeProfile = withBatch.findIndex((item) => item.to === '/profil');
  return [...withBatch.slice(0, beforeProfile), TEAM, ...withBatch.slice(beforeProfile)];
}

// Libellé de la catégorie du compte, affiché sous le nom dans le menu et sur le profil.
export function categoryLabel(user) {
  if (user?.role === 'client') return { entreprise: 'Entreprise', conciergerie: 'Conciergerie' }[user.account_type] ?? 'Particulier';
  if (user?.role === 'livreur') return 'Livreur';
  if (user?.role === 'commercant') return 'Commerçant';
  return '';
}
