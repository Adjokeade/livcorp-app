import { useEffect } from 'react';

// Demande aux moteurs de recherche de ne pas référencer la page (espace administrateur).
export default function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}
