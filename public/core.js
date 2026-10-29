export const state = { user: null };
export const view = document.querySelector("#app-view");
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export async function api(path, { method = "GET", body } = {}) {
  const multipart = body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(!multipart ? { "Content-Type": "application/json" } : {}),
      "X-Hosh-Request": "1",
    },
    ...(body !== undefined
      ? { body: multipart ? body : JSON.stringify(body) }
      : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state.user) {
      state.user = null;
      location.hash = "#/login";
    }
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}
export function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    node.hidden = true;
  }, 4000);
}
export function navigate(hash) {
  location.hash = hash;
}
export function heading(eyebrow, title, description = "") {
  return `<section class="page-heading"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1>${description ? `<p class="lede">${escapeHtml(description)}</p>` : ""}</section>`;
}
export function errorMessage(error) {
  return `<div class="notice error" role="alert">${escapeHtml(error.message)}</div>`;
}
