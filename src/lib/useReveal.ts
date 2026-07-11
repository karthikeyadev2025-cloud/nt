import { useEffect, useRef } from 'react';

/**
 * Activates the .scroll-reveal / .active CSS pair (already defined in index.css)
 * via IntersectionObserver. Attach the returned ref to any element with the
 * `scroll-reveal` class and it fades/slides in the first time it enters the viewport.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('active');
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
