import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

// Fiche détaillée pilotée par l'URL (?annonce=12) : le bouton Retour du téléphone la ferme au lieu de quitter
// la page, et le lien peut être partagé ou ouvert depuis une autre page (ex. page Annonces vers tableau de bord).
export default function useDetailParam(key = 'annonce') {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const openId = params.get(key);

  const open = useCallback(
    (id) => {
      const next = new URLSearchParams(params);
      next.set(key, String(id));
      navigate({ search: `?${next}` }, { state: { sheet: true } });
    },
    [navigate, params, key],
  );

  const close = useCallback(() => {
    // Ouverte depuis la page : on revient en arrière. Ouverte par lien direct : on retire simplement le paramètre.
    if (location.state?.sheet) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(params);
    next.delete(key);
    navigate({ search: next.size ? `?${next}` : '' }, { replace: true });
  }, [navigate, location.state, params, key]);

  return { openId, open, close };
}
