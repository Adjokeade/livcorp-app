import { useEffect, useRef, useState } from 'react';
import Reveal from '../common/Reveal';
import serviceColisPhoto from '../../assets/images/service-colis.jpg';

// Durée d'une étape quand le parcours défile tout seul.
const STEP_MS = 5000;

const STEPS = [
  {
    title: 'Décrivez votre besoin',
    text: 'Colis à envoyer ou courses à faire : indiquez simplement les adresses de collecte et de livraison.',
  },
  {
    title: 'Un livreur accepte',
    text: 'Un livreur vérifié à proximité prend en charge votre commande et se met en route.',
  },
  {
    title: 'Suivez en direct',
    text: "Suivez sa position sur la carte jusqu'à la remise en main propre.",
  },
];

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Les trois étapes à gauche, un téléphone qui montre l'écran correspondant à droite. Le parcours avance seul
// tant que la section est à l'écran (sauf réglage "réduire les animations") ; on peut cliquer une étape, et le
// survol à la souris ou le focus clavier met le défilement en pause pour laisser le temps de lire.
export default function HowItWorks() {
  const sectionRef = useRef(null);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const autoplay = inView && !paused && !reduced;

  useEffect(() => {
    if (!autoplay) return undefined;
    const timer = setTimeout(() => setActive((current) => (current + 1) % STEPS.length), STEP_MS);
    return () => clearTimeout(timer);
  }, [autoplay, active]);

  return (
    <section id="comment-ca-marche" ref={sectionRef} className="relative overflow-hidden">
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-10 sm:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold">Comment ça marche</h2>
          <p className="mt-3 text-on-surface-variant">Trois étapes, aucune complication.</p>
        </Reveal>

        <div className="mt-12 grid items-center justify-center gap-14 lg:grid-cols-[minmax(0,34rem)_auto] lg:gap-20">
          <ol
            className="mx-auto flex w-full max-w-xl flex-col gap-3"
            onPointerEnter={(e) => e.pointerType === 'mouse' && setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
            }}
          >
            {STEPS.map((step, index) => {
              const current = active === index;
              const done = active > index;

              return (
                <li key={step.title} className="relative">
                  {/* Trait qui relie cette étape à la suivante et se remplit quand on l'a passée */}
                  {index < STEPS.length - 1 && (
                    <div aria-hidden="true" className="absolute left-[37px] top-[60px] z-10 h-[calc(100%-32px)] w-0.5 overflow-hidden rounded bg-outline-variant/60">
                      <div className={`h-full w-full origin-top bg-primary transition-transform duration-500 ${done ? 'scale-y-100' : 'scale-y-0'}`} />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setActive(index)}
                    aria-current={current ? 'step' : undefined}
                    className={`relative flex w-full items-start gap-4 overflow-hidden rounded-xl p-4 text-left transition duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
                      current ? 'bg-surface-container-lowest shadow-lift' : 'hover:bg-surface-container-lowest/70'
                    }`}
                  >
                    <span
                      className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full font-display text-lg font-bold transition duration-300 ${
                        current || done ? 'bg-primary text-on-primary' : 'bg-primary-fixed text-primary'
                      } ${current ? 'scale-110' : ''}`}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg font-bold text-on-surface">{step.title}</span>
                      <span className="mt-1 block text-sm text-on-surface-variant">{step.text}</span>
                    </span>
                    {current && autoplay && (
                      <span aria-hidden="true" className="step-progress absolute bottom-0 left-0 h-1 w-full bg-primary/70" style={{ animationDuration: `${STEP_MS}ms` }} />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          <Reveal variant="scale" className="mx-auto">
            <PhoneMockup active={active} reduced={reduced} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// Illustration décorative : la vraie information est dans la liste des étapes, d'où aria-hidden.
function PhoneMockup({ active, reduced }) {
  return (
    <div aria-hidden="true" className="relative mx-auto w-[260px]">
      <div className="pointer-events-none absolute -left-12 top-10 h-44 w-44 rounded-full bg-primary/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-12 bottom-10 h-48 w-48 rounded-full bg-secondary/25 blur-3xl" />

      <div className="relative rounded-[2.4rem] bg-on-surface p-2.5 shadow-modal motion-safe:animate-float">
        <div className="relative h-[500px] overflow-hidden rounded-[1.9rem] bg-surface">
          <div className="absolute left-1/2 top-2 z-20 h-4 w-20 -translate-x-1/2 rounded-full bg-on-surface" />

          <Screen index={0} active={active}>
            <p className="font-display text-sm font-bold">Nouvelle commande</p>
            <div className="mt-3 flex flex-col gap-2">
              <Address pin="A" pinClass="bg-primary" label="Départ" value="Marché Dantokpa, Cotonou" />
              <Address pin="B" pinClass="bg-secondary" label="Destination" value="Fidjrossé, Cotonou" />
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-lg bg-surface-container-lowest p-2 shadow-card">
              <img src={serviceColisPhoto} alt="" className="h-12 w-12 rounded object-cover" />
              <div>
                <p className="text-[11px] font-semibold">Photo du colis</p>
                <p className="text-[10px] text-on-surface-variant">Le livreur voit ce qu'il transporte</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-container-lowest px-3 py-2.5 shadow-card">
              <span className="text-[11px] text-on-surface-variant">Votre prix</span>
              <strong className="font-display text-sm text-primary">1 800 FCFA</strong>
            </div>
            <p className="mt-2 text-[10px] text-on-surface-variant">Paiement à la réception : espèces, Mobile Money ou carte.</p>
            <div className="mt-auto rounded-lg bg-primary py-2.5 text-center text-xs font-semibold text-on-primary">Envoyer le colis</div>
          </Screen>

          <Screen index={1} active={active}>
            <p className="font-display text-sm font-bold">Livreur trouvé</p>
            <div className="mt-3 rounded-xl bg-surface-container-lowest p-3 shadow-card">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary font-display text-base font-bold text-on-secondary">L</span>
                <div>
                  <p className="text-xs font-bold">Votre livreur</p>
                  <p className="text-[10px] text-on-surface-variant">Moto · arrive au retrait dans 6 min</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <span className="rounded-full bg-secondary-fixed px-2.5 py-1 text-[10px] font-semibold text-on-secondary-fixed">Identité vérifiée</span>
                <span className="rounded-full bg-primary-fixed px-2.5 py-1 text-[10px] font-semibold text-on-primary-fixed-variant">Prix accepté</span>
              </div>
              <div className="mt-3 flex gap-2 text-center text-[11px] font-semibold">
                <span className="flex-1 rounded-full bg-primary-fixed py-1.5 text-on-primary-fixed-variant">Écrire</span>
                <span className="flex-1 rounded-full bg-surface-container py-1.5 text-secondary">Appeler</span>
              </div>
            </div>
            <ul className="mt-4 flex flex-col gap-3 text-[11px]">
              <MiniStep done>Commande confirmée</MiniStep>
              <MiniStep done>Pris en charge par le livreur</MiniStep>
              <MiniStep>Colis récupéré</MiniStep>
              <MiniStep>En route vers le destinataire</MiniStep>
            </ul>
          </Screen>

          <Screen index={2} active={active} bare>
            <MiniMap reduced={reduced} />
            <div className="absolute inset-x-3 top-9 rounded-full bg-surface-container-lowest/95 px-3 py-1.5 text-center text-[11px] font-bold shadow-card">Suivi en direct</div>
            <div className="absolute inset-x-3 bottom-3 rounded-xl bg-surface-container-lowest p-3 shadow-modal">
              <p className="text-xs font-bold">Votre livreur arrive</p>
              <p className="text-[10px] text-on-surface-variant">À 6 min · 1,4 km</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                <div className="h-full w-2/3 rounded-full bg-primary" />
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-container px-3 py-2 text-[10px]">
                <span className="text-on-surface-variant">Code de remise</span>
                <strong className="tracking-[0.3em]">••••</strong>
              </div>
            </div>
          </Screen>
        </div>
      </div>
    </div>
  );
}

// Un écran du téléphone : celui de l'étape en cours est visible, les autres attendent à gauche ou à droite.
function Screen({ index, active, bare = false, children }) {
  const position = index === active ? 'translate-x-0 opacity-100' : index < active ? '-translate-x-6 opacity-0' : 'translate-x-6 opacity-0';
  return (
    <div className={`absolute inset-0 flex flex-col transition duration-500 ${bare ? '' : 'px-4 pb-4 pt-10'} ${position}`}>{children}</div>
  );
}

function Address({ pin, pinClass, label, value }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-surface-container-lowest px-3 py-2 shadow-card">
      <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-on-primary ${pinClass}`}>{pin}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-on-surface-variant">{label}</p>
        <p className="truncate text-[11px] font-semibold">{value}</p>
      </div>
    </div>
  );
}

function MiniStep({ done = false, children }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${done ? 'bg-secondary text-on-secondary' : 'bg-surface-container-high text-transparent'}`}>✓</span>
      <span className={done ? 'font-semibold' : 'text-on-surface-variant'}>{children}</span>
    </li>
  );
}

// Carte stylisée : rues, lagune, trajet bleu et livreur qui le parcourt (fixe si les animations sont réduites).
function MiniMap({ reduced }) {
  const route = 'M60 260 V170 H150 V90 H200';
  // Le livreur ralentit juste avant B, sans le recouvrir.
  const ROUTE_TO_B = 'M60 260 V170 H150 V90 H180';

  return (
    <svg viewBox="0 0 240 480" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <rect width="240" height="480" fill="#e6edf5" />
      <path d="M0 300 C 40 285, 80 312, 125 300 S 200 288, 240 305 L240 480 L0 480 Z" fill="#b9d6ee" />
      <g fill="#f4f7fb">
        <rect x="8" y="100" width="44" height="62" rx="4" />
        <rect x="70" y="100" width="70" height="62" rx="4" />
        <rect x="160" y="100" width="60" height="62" rx="4" />
        <rect x="8" y="180" width="44" height="62" rx="4" />
        <rect x="70" y="180" width="70" height="62" rx="4" />
        <rect x="160" y="180" width="60" height="62" rx="4" />
        <rect x="70" y="20" width="70" height="62" rx="4" />
        <rect x="160" y="20" width="60" height="62" rx="4" />
      </g>
      <g stroke="#ffffff" strokeWidth="9" fill="none">
        <path d="M0 90 H240" />
        <path d="M0 170 H240" />
        <path d="M60 0 V290" />
        <path d="M150 0 V290" />
      </g>
      <path d={route} fill="none" stroke="#3871c2" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 8" />

      <g transform="translate(60 260)">
        <circle r="10" fill="#f5721e" stroke="#fff" strokeWidth="3" />
        <text textAnchor="middle" y="4" fontSize="10" fontWeight="800" fill="#fff">A</text>
      </g>
      <g transform="translate(200 90)">
        <circle r="10" fill="#3871c2" stroke="#fff" strokeWidth="3" />
        <text textAnchor="middle" y="4" fontSize="10" fontWeight="800" fill="#fff">B</text>
      </g>

      <g transform={reduced ? 'translate(150 130)' : undefined}>
        <circle r="8" fill="#3871c2" stroke="#fff" strokeWidth="3" />
        {!reduced && <animateMotion dur="8s" repeatCount="indefinite" path={ROUTE_TO_B} />}
      </g>
    </svg>
  );
}
