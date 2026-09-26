import { useEffect, useRef, useState } from 'react';

const VARIANT_CLASS = { up: '', left: 'reveal-left', scale: 'reveal-scale' };

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Fait apparaître son contenu (fondu + glissement) quand il entre à l'écran, une seule fois.
// `delay` (ms) échelonne les éléments d'une même rangée. Sans IntersectionObserver ou avec le réglage
// "réduire les animations", le contenu est affiché tout de suite : rien n'est jamais caché.
// Les effets de survol se posent sur l'enfant, pas sur ce conteneur : sa transition porte le délai.
export default function Reveal({ as: Tag = 'div', variant = 'up', delay = 0, className = '', style, children, ...props }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined' || prefersReducedMotion());

  useEffect(() => {
    if (visible) return undefined;
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <Tag
      ref={ref}
      style={{ '--reveal-delay': `${delay}ms`, ...style }}
      className={`reveal ${VARIANT_CLASS[variant] ?? ''} ${visible ? 'is-visible' : ''} ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
