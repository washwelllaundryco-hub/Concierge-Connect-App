// Copy text to the clipboard with fallbacks for contexts where the
// async Clipboard API is unavailable, blocked, or not permitted
// (non-HTTPS, embedded webviews, installed PWAs, missing user-gesture, etc.).
//
// If `inputEl` (a visible <input>/<textarea> already showing `text`) is
// provided, the fallback selects ITS text instead of a hidden offscreen
// element. Some mobile/PWA webviews silently no-op execCommand("copy") on
// offscreen elements but DO respond to it (or at least leave the visible
// text selected so the user can long-press "Copy") on a real, visible field.
export async function copyToClipboard(text, inputEl) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy fallback
    }
  }

  let el = inputEl;
  let isTemp = false;
  if (!el) {
    el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    el.style.opacity = "0";
    document.body.appendChild(el);
    isTemp = true;
  }

  try {
    el.focus();
    el.select();
    if (el.setSelectionRange) el.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    return ok;
  } catch {
    return false;
  } finally {
    if (isTemp) document.body.removeChild(el);
  }
}

// Wires up a click handler that copies `text` and gives the clicked
// button temporary feedback. Pass `inputEl` (a ref to the visible input
// showing `text`) so that even if the clipboard write silently fails,
// the text is left selected for the user to copy manually.
export async function copyWithFeedback(e, text, inputEl) {
  const ok = await copyToClipboard(text, inputEl);
  const btn = e.currentTarget;
  const original = btn.textContent;
  if (ok) {
    btn.textContent = "Copied!";
  } else if (inputEl) {
    btn.textContent = "Selected — tap & hold to copy";
  } else {
    btn.textContent = "Copy failed";
  }
  setTimeout(() => { btn.textContent = original; }, 2000);
}
