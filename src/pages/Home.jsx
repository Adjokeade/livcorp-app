import { Link } from 'react-router-dom';
import Button from '../components/common/Button';

// Reprend fidèlement la structure de stitch_liv_corp_delivery_platform/accueil_liv_corp/code.html
export default function Home() {
  return (
    <>
      <section className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:grid-cols-2 sm:px-10 sm:py-24">
        <div>
          <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-5xl">
            Livraison de repas &amp; courses au Bénin —{' '}
            <span className="text-primary">L'humain au cœur de chaque trajet</span>
          </h1>
          <p className="mt-5 text-lg text-on-surface-variant">
            Energique, fiable et chaleureuse : votre plateforme de proximité qui vous connecte aux marchés locaux et
            aux services essentiels, en toute simplicité.
          </p>

          <form
            className="mt-8 flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => e.preventDefault()}
          >
            <input
              type="text"
              placeholder="Entrez votre adresse de livraison..."
              className="input-field flex-1"
            />
            <Button type="submit">Trouver</Button>
          </form>
        </div>

        <div className="relative rounded-lg bg-primary-fixed p-4">
          <div className="flex h-full min-h-[260px] items-center justify-center rounded-md bg-surface-container text-on-surface-variant">
            Livreur remettant un colis — illustration
          </div>
          <div className="absolute bottom-8 left-8 flex items-center gap-2 rounded-lg bg-surface-container-lowest px-4 py-3 shadow-modal">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-on-secondary">
              ✓
            </span>
            <div>
              <p className="text-sm font-semibold">Paiement Sécurisé</p>
              <p className="text-xs text-on-surface-variant">100% fiable</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface-container-low py-16">
        <div className="mx-auto max-w-[1200px] px-4 text-center sm:px-10">
          <h2 className="font-display text-3xl font-bold">
            Pour tous vos besoins, <span className="text-secondary">nous sommes là</span>
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-on-surface-variant">
            Choisissez votre profil pour découvrir comment LIV corp peut faciliter votre quotidien ou développer
            votre activité.
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <ProfileCard
              icon="🛍️"
              title="Client"
              description="Commandez vos repas préférés ou faites vos courses en quelques clics. Livraison rapide et fiable à votre porte."
              cta="Commander maintenant"
              to="/inscription?role=client"
            />
            <ProfileCard
              icon="🏬"
              title="Merchant"
              description="Augmentez vos ventes en rejoignant notre plateforme. Touchez de nouveaux clients et gérez vos commandes facilement."
              cta="Devenir partenaire"
              to="/inscription?role=commercant"
            />
            <ProfileCard
              icon="🏍️"
              title="Delivery"
              description="Générez des revenus à votre rythme. Rejoignez notre flotte de livreurs et profitez d'une flexibilité totale."
              cta="Rejoindre la flotte"
              to="/inscription/livreur"
            />
          </div>
        </div>
      </section>
    </>
  );
}

function ProfileCard({ icon, title, description, cta, to }) {
  return (
    <div className="card text-left">
      <span className="flex h-12 w-12 items-center justify-center rounded-md bg-primary-fixed text-2xl">
        {icon}
      </span>
      <h3 className="mt-4 font-display text-xl font-bold">{title}</h3>
      <p className="mt-2 text-sm text-on-surface-variant">{description}</p>
      <Link to={to} className="btn-tertiary mt-4 inline-block">
        {cta} →
      </Link>
    </div>
  );
}
