import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import useOrderDraftStore from '../store/useOrderDraftStore';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Reveal from '../components/common/Reveal';
import HowItWorks from '../components/home/HowItWorks';
import deliveryHandoffPhoto from '../assets/images/delivery-handoff.jpg';
import profileParticulierPhoto from '../assets/images/profile-particulier.jpg';
import profileEntreprisePhoto from '../assets/images/profile-entreprise.jpg';
import profileLivreurPhoto from '../assets/images/profile-livreur.jpg';
import serviceColisPhoto from '../assets/images/service-colis.jpg';
import serviceCoursiersPhoto from '../assets/images/service-coursiers.jpg';
import serviceConciergeriePhoto from '../assets/images/service-conciergerie.jpg';
import serviceSuiviPhoto from '../assets/images/service-suivi.jpg';
import serviceVipPhoto from '../assets/images/service-vip.jpg';
import serviceSurMesurePhoto from '../assets/images/service-sur-mesure.jpg';

// Entrée échelonnée des éléments du hero (le délai s'ajoute à l'animation fade-up).
const enter = (ms) => ({ animationDelay: `${ms}ms` });

// Reprend l'esprit de stitch_liv_corp_delivery_platform/accueil_liv_corp/code.html.
export default function Home() {
  return (
    <>
      <Hero />
      <Services />
      <MarketTeaser />
      <HowItWorks />
      <Profiles />
      <FinalCta />
    </>
  );
}

function Hero() {
  const navigate = useNavigate();
  const setDraftField = useOrderDraftStore((s) => s.setField);
  const [address, setAddress] = useState('');

  function handleSearch(e) {
    e.preventDefault();
    if (address.trim()) {
      setDraftField('pickupAddress', address.trim());
    }
    navigate('/client/commander');
  }

  return (
    <section className="relative overflow-hidden">
      {/* Photo en arrière-plan, plein cadre : elle se pose en douceur (léger zoom arrière) à l'ouverture de la page. */}
      <img
        src={deliveryHandoffPhoto}
        alt="Un livreur LIV corp remet un colis à une cliente"
        loading="eager"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover motion-safe:animate-hero-zoom"
      />
      {/* Voile de lisibilité : opaque sur mobile (le texte occupe toute la
          largeur), en dégradé horizontal à partir de sm (le texte tient sur
          la moitié gauche, la photo reste visible à droite). */}
      <div className="absolute inset-0 bg-gradient-to-b from-surface via-surface/95 to-surface/90 sm:bg-gradient-to-r sm:from-surface sm:via-surface/92 sm:to-surface/35" />

      <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-10 sm:py-28">
        <div className="max-w-xl">
          <h1 className="font-display text-4xl font-extrabold leading-tight motion-safe:animate-fade-up sm:text-5xl">
            Colis, courses et courriers, livrés partout au Bénin.{' '}
            <span className="text-primary">L'humain au cœur de chaque trajet.</span>
          </h1>
          <p className="mt-5 text-lg text-on-surface-variant motion-safe:animate-fade-up" style={enter(140)}>
            La plateforme qui connecte particuliers, entreprises et livreurs vérifiés : suivi en temps réel,
            paiement à la réception, du départ jusqu'à la remise en main propre.
          </p>

          <form className="mt-8 flex flex-col gap-3 motion-safe:animate-fade-up sm:flex-row" style={enter(280)} onSubmit={handleSearch}>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Entrez votre adresse de livraison…"
              className="input-field flex-1"
            />
            <Button type="submit" className="group">
              Envoyer un colis
              <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
                →
              </span>
            </Button>
          </form>
          <p className="mt-3 text-sm text-on-surface-variant motion-safe:animate-fade-up" style={enter(380)}>
            Vous êtes livreur ?{' '}
            <Link to="/inscription/livreur" className="btn-tertiary">
              Rejoignez la flotte →
            </Link>
          </p>

          <div
            className="mt-8 flex items-center gap-2 rounded-lg bg-surface-container-lowest px-4 py-3 shadow-card motion-safe:animate-fade-up sm:inline-flex"
            style={enter(480)}
          >
            <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
              <span aria-hidden="true" className="absolute inset-0 rounded-full bg-primary opacity-40 motion-safe:animate-ping" />
              <span className="relative">✓</span>
            </span>
            <div>
              <p className="text-sm font-semibold text-on-surface">Paiement à la réception</p>
              <p className="text-xs text-on-surface-variant">Mobile Money, carte ou espèces, devant le livreur</p>
            </div>
          </div>
        </div>

        {/* Aperçu du suivi et de la remise : deux cartes flottantes, sur grand écran seulement. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-10 hidden w-64 lg:block">
          <div className="absolute right-0 top-20 motion-safe:animate-fade-up" style={enter(700)}>
            <div className="motion-safe:animate-float">
              <div className="flex items-center gap-3 rounded-xl bg-surface-container-lowest/95 px-4 py-3 shadow-modal backdrop-blur">
                <span className="deliverer-dot !h-9 !w-9 flex-shrink-0">L</span>
                <div>
                  <p className="text-sm font-bold text-on-surface">Votre livreur arrive</p>
                  <p className="text-xs text-on-surface-variant">À 6 min · 1,4 km</p>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute bottom-16 right-8 motion-safe:animate-fade-up" style={enter(900)}>
            <div className="motion-safe:animate-float" style={{ animationDelay: '-2.5s' }}>
              <div className="flex items-center gap-3 rounded-xl bg-surface-container-lowest/95 px-4 py-3 shadow-modal backdrop-blur">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary font-bold text-on-primary">✓</span>
                <div>
                  <p className="text-sm font-bold text-on-surface">Colis remis</p>
                  <p className="text-xs text-on-surface-variant">Code de remise confirmé</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Reprend les deux blocs du flyer officiel LIV corp : "Ce que nous vous
// offrons" (bandeau bleu) et "Le plus avec nous" (bandeau orange).
function Services() {
  const offers = [
    {
      image: serviceColisPhoto,
      imageAlt: "Une livreuse souriante tient un carton et des enveloppes",
      title: 'Colis, marchandises & courriers',
      text: 'Récupération et livraison express partout au Bénin, pour vous ou pour votre entreprise.',
    },
    {
      image: serviceCoursiersPhoto,
      imageAlt: "Un coursier à moto avec une caisse de livraison dans une rue animée",
      title: 'Coursiers à la demande',
      text: 'Commandez un coursier pour vos courses personnelles ou professionnelles, avec une prise en charge immédiate.',
    },
    {
      image: serviceConciergeriePhoto,
      imageAlt: "Une cloche de réception posée sur un comptoir en bois",
      title: 'Conciergerie',
      text: 'Des professionnels dédiés à vos besoins quotidiens ou spécifiques, avec une flexibilité horaire.',
    },
  ];

  const extras = [
    {
      image: serviceSuiviPhoto,
      imageAlt: "Une main tient un téléphone qui affiche une carte de suivi",
      title: 'Suivi en temps réel',
      text: 'Une transparence totale sur vos livraisons, avec des délais garantis.',
    },
    {
      image: serviceVipPhoto,
      imageAlt: "Des mains dénouent le ruban noir d'un paquet cadeau blanc",
      title: 'Conciergerie VIP',
      text: 'Le traitement de vos courses importantes, en toute discrétion et sécurité.',
    },
    {
      image: serviceSurMesurePhoto,
      imageAlt: "Un livreur consulte sa tablette devant des cartons empilés",
      title: 'Service sur-mesure',
      text: 'Des solutions logistiques personnalisées, adaptées à vos besoins spécifiques.',
    },
  ];

  return (
    <section className="border-y border-outline-variant bg-surface-container">
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-10">
        <ServiceGroup badge="Ce que nous vous offrons" badgeClass="bg-secondary text-on-secondary" accent="secondary" items={offers} />
        <ServiceGroup
          badge="Le plus avec nous"
          badgeClass="bg-primary text-on-primary"
          accent="primary"
          items={extras}
          className="mt-12"
        />
      </div>
    </section>
  );
}

function ServiceGroup({ badge, badgeClass, accent, items, className = '' }) {
  // Liseré sous la photo : il s'étire sur toute la largeur quand la carte est survolée.
  const bar = accent === 'primary' ? 'bg-primary' : 'bg-secondary';

  return (
    <div className={className}>
      <Reveal variant="left">
        <span className={`inline-block rounded-lg px-4 py-2 text-sm font-semibold ${badgeClass}`}>{badge}</span>
      </Reveal>
      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        {items.map((item, index) => (
          <Reveal key={item.title} delay={index * 120} className="h-full">
            <Card hover className="group flex h-full flex-col overflow-hidden !p-0">
              <div className="aspect-[16/10] overflow-hidden bg-surface-container">
                <img
                  src={item.image}
                  alt={item.imageAlt}
                  width="800"
                  height="500"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
              </div>
              <div aria-hidden="true" className="h-1 bg-outline-variant/40">
                <div className={`h-full w-1/4 transition-all duration-500 group-hover:w-full ${bar}`} />
              </div>
              <div className="flex-1 p-6">
                <p className="font-semibold text-on-surface">{item.title}</p>
                <p className="mt-1 text-sm text-on-surface-variant">{item.text}</p>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

// Bandeau de renvoi vers /annonces (public) : preuve sociale, montre que la
// plateforme est active, sans exiger de compte pour la découvrir.
function MarketTeaser() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-10 sm:px-10">
      <Reveal>
        <Link
          to="/annonces"
          className="card-hover group flex flex-col items-start justify-between gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest px-6 py-6 shadow-card sm:flex-row sm:items-center sm:px-8"
        >
          <div>
            <p className="font-display text-lg font-bold">Voir les annonces en direct</p>
            <p className="mt-1 text-sm text-on-surface-variant">
              Colis en attente et livreurs disponibles, en temps réel, sans compte requis.
            </p>
          </div>
          <span className="btn-tertiary flex-shrink-0 group-hover:[background-size:100%_1.5px]">
            Découvrir les annonces{' '}
            <span aria-hidden="true" className="inline-block transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </span>
        </Link>
      </Reveal>
    </section>
  );
}

function Profiles() {
  return (
    <section className="bg-surface-container py-16">
      <div className="mx-auto max-w-[1200px] px-4 text-center sm:px-10">
        <Reveal>
          <h2 className="font-display text-3xl font-bold">
            Pour tous vos besoins, <span className="text-tertiary">nous sommes là</span>
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-on-surface-variant">
            Choisissez votre profil pour découvrir comment LIV corp peut faciliter votre quotidien ou développer
            votre activité.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-6 text-left sm:grid-cols-3">
          <ProfileCard
            delay={0}
            image={profileParticulierPhoto}
            imageAlt="Un client reçoit son colis avec le sourire"
            title="Particulier"
            description="Envoyez vos colis ou faites livrer vos courses en quelques clics."
            points={['Livraison rapide à votre porte', 'Suivi en direct sur la carte', 'Livreur vérifié et noté']}
            cta="Commander maintenant"
            to="/inscription?account_type=particulier"
          />
          <ProfileCard
            delay={150}
            image={profileEntreprisePhoto}
            imageAlt="Une équipe en entreprise organise ses envois depuis un ordinateur"
            title="Entreprise"
            description="Confiez-nous vos livraisons régulières et vos coursiers à la demande."
            points={['Colis, courriers & marchandises', 'Prise en charge immédiate', 'Suivi centralisé de vos envois']}
            cta="Créer un compte entreprise"
            to="/inscription?account_type=entreprise"
          />
          <ProfileCard
            delay={300}
            image={profileLivreurPhoto}
            imageAlt="Un livreur souriant, casque et sacoche de livraison, prêt à partir"
            title="Livreur"
            description="Générez des revenus à votre rythme, sans exclusivité."
            points={['Courses près de chez vous', 'Gains crédités après chaque livraison', 'Disponible quand vous le voulez']}
            cta="Rejoindre la flotte"
            to="/inscription/livreur"
          />
        </div>
      </div>
    </section>
  );
}

function ProfileCard({
  illustration: Illustration,
  image,
  imageAlt,
  imagePosition = 'center 18%',
  title,
  description,
  points,
  cta,
  to,
  delay = 0,
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <div className="card-hover group flex h-full flex-col overflow-hidden rounded-xl bg-surface-container-lowest text-left shadow-card">
        <div className="h-40 w-full overflow-hidden">
          {image ? (
            <img
              src={image}
              alt={imageAlt}
              loading="lazy"
              decoding="async"
              style={{ objectPosition: imagePosition }}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
            />
          ) : (
            <Illustration className="h-full w-full" />
          )}
        </div>
        <div className="flex flex-1 flex-col p-6">
          <h3 className="font-display text-xl font-bold">{title}</h3>
          <p className="mt-2 text-sm text-on-surface-variant">{description}</p>

          <ul className="mt-4 flex flex-col gap-2 text-sm text-on-surface">
            {points.map((point, index) => (
              <li
                key={point}
                style={{ transitionDelay: `${index * 60}ms` }}
                className="flex items-start gap-2 transition duration-300 group-hover:translate-x-1"
              >
                <span className="mt-0.5 text-secondary">✓</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <Link to={to} className="btn-tertiary mt-6 self-start">
            {cta}{' '}
            <span aria-hidden="true" className="inline-block transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>
    </Reveal>
  );
}

function FinalCta() {
  const user = useAuthStore((s) => s.user);
  const orderHref = user?.role === 'client' ? '/client/commander' : '/inscription?account_type=particulier';

  return (
    <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-10">
      <Reveal variant="scale">
        <div className="group relative overflow-hidden rounded-2xl">
          <img
            src={deliveryHandoffPhoto}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/95 to-primary/75" />
          {/* Bulles décoratives qui flottent doucement */}
          <div aria-hidden="true" className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10 motion-safe:animate-float" />
          <div
            aria-hidden="true"
            style={{ animationDelay: '-2.5s' }}
            className="absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-white/10 motion-safe:animate-float"
          />

          <div className="relative flex flex-col items-center gap-6 px-6 py-10 text-center sm:flex-row sm:justify-between sm:px-12 sm:py-14 sm:text-left">
            <div>
              <h2 className="font-display text-2xl font-bold text-on-primary sm:text-3xl">
                Prêt à essayer LIV corp ?
              </h2>
              <p className="mt-2 text-on-primary/90">
                Envoyez un colis ou faites vos courses en quelques clics, où que vous soyez au Bénin.
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-col gap-3 sm:flex-row">
              <Link to={orderHref} className="btn-light">
                Commander maintenant
              </Link>
              <Link to="/inscription/livreur" className="btn-outline-light">
                Devenir livreur
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
