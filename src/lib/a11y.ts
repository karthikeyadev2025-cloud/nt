import type { KeyboardEvent } from 'react';

/*
  Keyboard activation for a clickable non-button element.

  Ten cards in this app — a ticket row, a lead card, a payslip, a document,
  a meeting, a notification — are `<div onClick>`. A div is not focusable
  and does not respond to Enter or Space, so opening any of those records
  required a mouse: a keyboard user could tab through the page and never
  reach the thing the page exists to show them.

  The correct fix is a real <button>, but these cards already contain their
  own buttons (call, WhatsApp, reschedule) and a button cannot nest inside a
  button. So they take the standard alternative — role="button", tabIndex=0
  and this handler — which gives them the same focus, semantics and key
  behavior without changing the markup they wrap.
*/
export function onActivateKeyDown(activate: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    // Only when the card itself has focus. Without this, pressing Space on a
    // nested "Call" button would fire the card's open action as well.
    if (e.target !== e.currentTarget) return;
    // Space scrolls the page by default; Enter can submit a surrounding form.
    e.preventDefault();
    activate();
  };
}
