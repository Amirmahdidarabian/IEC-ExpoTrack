let locks = 0;
let originalOverflow = "";

/** Nested dialogs must not unlock the page until the last dialog closes. */
export function lockBodyScroll(body: HTMLElement) {
  if (locks === 0) originalOverflow = body.style.overflow;
  locks++;
  body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks--;
    if (locks === 0) body.style.overflow = originalOverflow;
  };
}
