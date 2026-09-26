// Page d'accueil de chaque rôle après connexion (mêmes valeurs que User.role côté backend).
export const ROLE_HOME = {
  client: '/client/commander',
  commercant: '/merchant/tableau-de-bord',
  livreur: '/deliverer/tableau-de-bord',
  admin: '/admin',
};

// Destination après connexion : la page demandée avant la redirection vers /connexion,
// seulement si elle appartient bien à l'espace du rôle (sinon ProtectedRoute renverrait à "/").
export function homeAfterLogin(user, requestedPath) {
  const home = ROLE_HOME[user.role] ?? '/';
  const space = home.split('/')[1];
  if (requestedPath && space && requestedPath.startsWith(`/${space}`)) return requestedPath;
  return home;
}
