// Copy text to the clipboard with a fallback for contexts where the
// async Clipboard API is unavailable, blocked, or not permitted
// (non-HTTPS, embedded webviews, missing user-gesture, etc.).
export async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy fallback
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

// Wires up a click handler that copies `text` and gives the clicked
// button temporary "Copied!" / "Copy failed" feedback.
export async function copyWithFeedback(e, text) {
  const ok = await copyToClipboard(text);
  const btn = e.currentTarget;
  const original = btn.textContent;
  btn.textContent = ok ? "Copied!" : "Copy failed";
  setTimeout(() => { btn.textContent = original; }, 1500);
}
