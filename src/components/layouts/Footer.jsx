export default function Footer() {
  return (
    <footer className="border-t border-outline-variant bg-surface-container-low">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-on-surface-variant sm:flex-row sm:px-10">
        <p>
          <span className="font-display font-bold text-primary">LIV corp</span> — © 2026 LIV corp. Tous droits
          réservés.
        </p>
        <nav className="flex flex-wrap items-center gap-4">
          <a href="#" className="hover:text-secondary">
            Devenir partenaire
          </a>
          <a href="#" className="hover:text-secondary">
            Centre d'aide
          </a>
          <a href="#" className="hover:text-secondary">
            Conditions d'utilisation
          </a>
          <a href="#" className="hover:text-secondary">
            Politique de confidentialité
          </a>
        </nav>
      </div>
    </footer>
  );
}
