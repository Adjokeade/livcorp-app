import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import Spinner from '../components/common/Spinner';

// Garde de route par rôle — cf. prompt frontend §2 "Gestion des rôles côté client".
// `roles` optionnel : liste des rôles autorisés (mêmes valeurs que User.role côté
// backend : client | commercant | livreur | admin). Sans `roles`, n'importe quel
// utilisateur connecté passe.
export default function ProtectedRoute({ roles, children }) {
  const { status, user } = useAuthStore();
  const location = useLocation();

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/connexion" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
