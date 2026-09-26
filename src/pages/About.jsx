import { Link } from 'react-router-dom';

export default function About() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-10 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-4xl font-extrabold">
          À propos de <span className="text-primary">LIV</span> <span className="italic text-secondary">corp</span>
        </h1>
        <p className="mt-4 text-lg text-on-surface-variant">
          Une plateforme béninoise de livraison de colis et de courses, pensée pour rapprocher les gens des
          services dont ils ont besoin, avec des livreurs vérifiés et un suivi transparent de bout en bout.
        </p>
      </div>

      <div className="mt-12 grid gap-8 sm:grid-cols-3">
        <AboutPoint
          title="Des livreurs vérifiés"
          text="Chaque compte livreur est validé par notre équipe (pièce d'identité, informations) avant sa première course."
        />
        <AboutPoint
          title="Un suivi transparent"
          text="Position en temps réel, notifications à chaque étape, jusqu'à la remise en main propre."
        />
        <AboutPoint
          title="Pour tous"
          text="Particuliers et entreprises envoient leurs colis, les livreurs les prennent en charge, tout au même endroit."
        />
      </div>

      <div className="mt-16 rounded-2xl bg-primary px-6 py-10 text-center sm:px-12">
        <h2 className="font-display text-2xl font-bold text-on-primary sm:text-3xl">
          Envie de rejoindre l'aventure ?
        </h2>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/inscription"
            className="inline-flex items-center justify-center rounded-lg bg-surface-container-lowest px-5 py-3 text-sm font-semibold text-primary transition hover:opacity-90"
          >
            Créer un compte
          </Link>
          <Link
            to="/inscription/livreur"
            className="inline-flex items-center justify-center rounded-lg border border-on-primary/40 px-5 py-3 text-sm font-semibold text-on-primary transition hover:bg-on-primary/10"
          >
            Devenir livreur
          </Link>
        </div>
      </div>
    </div>
  );
}

function AboutPoint({ title, text }) {
  return (
    <div className="text-center">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm text-on-surface-variant">{text}</p>
    </div>
  );
}
