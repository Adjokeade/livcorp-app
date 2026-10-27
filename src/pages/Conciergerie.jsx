import { Link } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import Card from '../components/common/Card';
import Reveal from '../components/common/Reveal';
import conciergeriePhoto from '../assets/images/profile-conciergerie.jpg';
import vipPhoto from '../assets/images/service-vip.jpg';

const SERVICES = [
  { title: 'Courses et achats', text: 'Un coursier fait vos achats ou récupère une commande, et vous la remet en main propre.' },
  { title: 'Colis et courriers', text: 'Envoi et réception de colis, documents et plis, partout au Bénin, avec suivi en direct.' },
  { title: 'Démarches du quotidien', text: 'Dépôt et retrait de documents, de clés ou de paquets, selon vos horaires.' },
  { title: 'Service VIP discret', text: 'Vos courses importantes traitées avec discrétion, sécurité et remise contre code.' },
];

const STEPS = [
  { title: 'Créez votre compte conciergerie', text: 'Quelques minutes suffisent : nom de votre structure, gérant, adresse.' },
  { title: 'Passez vos demandes', text: 'Indiquez le départ, la destination et le colis. Le prix est fixé selon la distance.' },
  { title: 'Suivez et encaissez la remise', text: 'Un livreur vérifié prend la course, vous le suivez sur la carte jusqu\'à la remise.' },
];

// Page de présentation du profil « Conciergerie », au même titre que Particulier et Entreprise sur l'accueil.
export default function Conciergerie() {
  const user = useAuthStore((s) => s.user);
  const isConciergerie = user?.role === 'client' && user.account_type === 'conciergerie';
  const cta = user?.role === 'client' ? { to: '/client/commander', label: isConciergerie ? 'Nouvelle livraison' : 'Commander' } : { to: '/inscription?account_type=conciergerie', label: 'Créer un compte conciergerie' };

  return (
    <>
      <section className="relative overflow-hidden">
        <img src={conciergeriePhoto} alt="Une cloche de réception sur un comptoir et un concierge au téléphone" loading="eager" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-surface via-surface/95 to-surface/90 sm:bg-gradient-to-r sm:from-surface sm:via-surface/92 sm:to-surface/35" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-10 sm:py-24">
          <div className="max-w-xl">
            <span className="inline-block rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-on-secondary">Conciergerie</span>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight sm:text-5xl">
              Des professionnels dédiés à <span className="text-primary">vos besoins du quotidien</span>
            </h1>
            <p className="mt-5 text-lg text-on-surface-variant">
              Conciergeries, résidences et hôtels : confiez courses, colis et démarches à des coursiers vérifiés, avec une flexibilité horaire.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={cta.to} className="btn-primary">
                {cta.label}
              </Link>
              {!user && (
                <Link to="/connexion" className="btn-secondary">
                  J'ai déjà un compte
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-outline-variant bg-surface-container">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-10">
          <Reveal>
            <h2 className="font-display text-3xl font-bold">Ce que la conciergerie prend en charge</h2>
          </Reveal>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((service, index) => (
              <Reveal key={service.title} delay={index * 100} className="h-full">
                <Card hover className="h-full">
                  <p className="font-semibold">{service.title}</p>
                  <p className="mt-1 text-sm text-on-surface-variant">{service.text}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-10">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <h2 className="font-display text-3xl font-bold">Comment ça marche</h2>
            <ol className="mt-6 flex flex-col gap-5">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary font-bold text-on-primary">{index + 1}</span>
                  <div>
                    <p className="font-semibold">{step.title}</p>
                    <p className="text-sm text-on-surface-variant">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal variant="scale">
            <img src={vipPhoto} alt="Un homme d'affaires élégant au téléphone devant un taxi jaune" loading="lazy" className="aspect-[4/3] w-full rounded-2xl object-cover" />
          </Reveal>
        </div>
        <p className="mt-12 text-center text-sm text-on-surface-variant">
          Vous êtes plombier, coiffeuse ou informaticien ?{' '}
          <Link to="/prestataires" className="font-semibold text-secondary">
            Inscrivez-vous comme prestataire
          </Link>
          .
        </p>
      </section>
    </>
  );
}
