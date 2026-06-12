// Copy text to the clipboard with fallbacks for contexts where the async
// Clipboard API is unavailable, blocked, or not permitted (non-HTTPS,
// embedded webviews, installed PWAs, missing user-gesture, etc.).
export async function copyToClipboard(text, inputEl) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy fallback
    }
  }

  // Use a fresh, WRITABLE, off-screen <textarea> for the execCommand
  // fallback -- never the visible (readOnly) input. On iOS Safari,
  // .select()/setSelectionRange() on a readOnly input often does not
  // create a real selection, so execCommand("copy") can "succeed" while
  // copying nothing. A temporary writable textarea is the reliable pattern.
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.top = "0";
  el.style.left = "0";
  el.style.width = "1px";
  el.style.height = "1px";
  el.style.padding = "0";
  el.style.border = "none";
  el.style.outline = "none";
  el.style.boxShadow = "none";
  el.style.background = "transparent";
  el.style.fontSize = "16px"; // avoid iOS auto-zoom on focus
  document.body.appendChild(el);

  let ok = false;
  try {
    el.focus();
    el.select();
    el.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(el);
  }

  // Best-effort: if the real copy failed, select the visible input anyway
  // so the user can long-press -> Copy manually.
  if (!ok && inputEl) {
    try {
      inputEl.focus();
      inputEl.select();
      if (inputEl.setSelectionRange) inputEl.setSelectionRange(0, text.length);
    } catch {
      // ignore
    }
  }

  return ok;
}

// Wires up a click handler that copies `text` and gives the clicked button
// temporary feedback. Pass `inputEl` (a ref to the visible input showing
// `text`) so that if the copy still fails, the text is left selected for
// the user to copy manually via long-press.
export async function copyWithFeedback(e, text, inputEl) {
  const btn = e.currentTarget;
  const original = btn.textContent;
  const ok = await copyToClipboard(text, inputEl);
  if (ok) {
    btn.textContent = "Copied!";
  } else if (inputEl) {
    btn.textContent = "Selected — tap & hold to copy";
  } else {
    btn.textContent = "Copy failed";
  }
  setTimeout(() => { btn.textContent = original; }, 2000);
}

// True if the Web Share API is available. Most mobile browsers support
// this -- including in-app browsers/webviews that block clipboard access
// entirely -- so it's a reliable second way to hand off a link.
export function canShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

// Opens the phone's native share sheet (Messages, WhatsApp, Mail, "Copy"...)
// so the technician can send the link directly or copy it from there.
export async function shareLink(e, text, title = "Payment link") {
  if (!canShare()) return;
  const btn = e.currentTarget;
  const original = btn.textContent;
  try {
    await navigator.share({ title, text, url: text });
  } catch (err) {
    if (err && err.name !== "AbortError") {
      btn.textContent = "Share failed";
      setTimeout(() => { btn.textContent = original; }, 2000);
    }
  }
}
