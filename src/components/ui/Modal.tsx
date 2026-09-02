import { useCallback, useEffect, useRef, ReactNode, MouseEvent, KeyboardEvent } from 'react';

/*
  ModalOverlay — the accessibility shell every dialog in this app was missing.

  There were 46 hand-rolled `<div className="fixed inset-0 …">` overlays in
  the codebase and, between them, exactly one Escape handler and zero
  `role="dialog"`. That meant: a screen reader announced a modal as an
  anonymous group and happily read the page behind it, Tab walked straight
  out of the dialog into the form underneath, closing a modal dropped focus
  on `<body>` (so the next Tab restarted from the top of the page), and the
  background scrolled under the overlay on both mobile and desktop.

  This component deliberately does NOT render any layout of its own — it
  takes the overlay's original `className` verbatim and applies it to the
  same single div the old markup used. It is a pure behavior wrapper, so
  converting a modal to it cannot change how that modal looks.

  What it adds:
    • role="dialog" + aria-modal + an accessible name
    • Escape to close
    • a Tab/Shift-Tab focus trap
    • focus moved into the dialog on open, and restored to whatever opened
      it on close
    • background scroll lock, refcounted so nested/stacked modals don't
      unlock early, with scrollbar-width compensation so locking doesn't
      shift the page (CLS)
    • backdrop dismissal that requires press AND release on the backdrop,
      so selecting text inside the dialog and releasing outside it no
      longer throws the dialog (and the user's typing) away
*/

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Refcount, not a boolean: two stacked dialogs (e.g. a lead detail modal
// that opens an image lightbox) must not have the inner one's close
// unlock the page while the outer is still open.
let scrollLockCount = 0;

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
  }
  scrollLockCount += 1;
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    // Remove the inline values rather than setting them to a guessed
    // default — index.css sets `overflow-x: hidden` on body and that has
    // to come back into effect.
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
  }
}

export interface ModalOverlayProps {
  /** The overlay's original Tailwind classes, applied verbatim. */
  className?: string;
  /**
   * Close handler. Wired to Escape and (unless disabled) backdrop click.
   * Omit for dialogs the user must not dismiss, e.g. a forced password
   * change — they then correctly trap focus with no escape hatch.
   */
  onClose?: () => void;
  /** Accessible name, read when the dialog opens. Use the visible title. */
  label?: string;
  /** Use instead of `label` when the title element already has an id. */
  labelledBy?: string;
  /** Set false when a stray backdrop click would lose the user's work. */
  dismissOnBackdrop?: boolean;
  children: ReactNode;
}

export function ModalOverlay({
  className = '',
  onClose,
  label,
  labelledBy,
  dismissOnBackdrop = true,
  children,
}: ModalOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  // Whether the press that may become a backdrop "click" actually started
  // on the backdrop. A mousedown inside the panel that drifts out (text
  // selection) must not dismiss.
  const pressStartedOnBackdrop = useRef(false);

  // Keep the latest onClose without re-running the focus/scroll effects,
  // which would steal focus back on every parent re-render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    lockBodyScroll();

    // Move focus in — unless the dialog already placed it itself (several
    // forms here use autoFocus on their first field, which is better than
    // anything this generic code could pick).
    if (overlay && !overlay.contains(document.activeElement)) {
      const first = overlay.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? overlay).focus({ preventScroll: true });
    }

    return () => {
      unlockBodyScroll();
      // Restore focus to the trigger so the keyboard user resumes where
      // they left off instead of at the top of the document. Guard for the
      // trigger having been unmounted by the action they just took.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (!onCloseRef.current) return;
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (e.key !== 'Tab') return;

    const overlay = overlayRef.current;
    if (!overlay) return;
    const items = Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE))
      // offsetParent is null for anything display:none — a collapsed
      // section's fields must not swallow the tab stop.
      .filter(el => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (e.shiftKey && (active === first || !overlay.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
    pressStartedOnBackdrop.current = e.target === e.currentTarget;
  }, []);

  const handleClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!dismissOnBackdrop || !onCloseRef.current) return;
    if (e.target !== e.currentTarget) return;
    if (!pressStartedOnBackdrop.current) return;
    pressStartedOnBackdrop.current = false;
    onCloseRef.current();
  }, [dismissOnBackdrop]);

  return (
    <div
      ref={overlayRef}
      className={className}
      role="dialog"
      aria-modal="true"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {children}
    </div>
  );
}
