import { api, state, view, escapeHtml, navigate, heading, errorMessage } from './core.js';
import { registerQuizRoutes } from './quiz-ui.js';
import { historyView } from './history-ui.js';

const routes = new Map();
export function registerRoute(name, render) { routes.set(name, render); }
let renderVersion = 0;
function shell() {
  const active = location.hash.split('/')[1];
  document.querySelector('#navigation').innerHTML = state.user ? [['catalog','Explore'],['history','My history']].map(([route,label]) => `<a href="#/${route}" ${active === route ? 'aria-current="page"' : ''}>${label}</a>`).join('') : '<span class="nav-tagline">GOOD QUESTIONS. GREAT POSSIBILITIES.</span>';
  document.querySelector('#account').innerHTML = state.user ? `<span class="account-name">${escapeHtml(state.user.username)}</span><button class="button small ghost" id="logout">Log out ↗</button>` : '<span class="pill">A little wiser, every day</span>';
  document.querySelector('#logout')?.addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST', body: {} }); state.user = null; navigate('#/login'); } catch (error) { view.insertAdjacentHTML('afterbegin', errorMessage(error)); }
  });
}
function authView() {
  let registering = false;
  function renderForm() {
    view.innerHTML = `<section class="auth-layout"><div class="auth-story"><p class="eyebrow"><span class="small-star">✳</span> THE CURIOUS MIND CLUB</p><h1>Small questions.<br>Big <em>possibilities.</em></h1><p>From the court to the boardroom. Discover something new, challenge what you know, and get a little wiser.</p><div class="orbit-art" aria-hidden="true"><div class="orbit-ring"></div><span class="orbit-star">✳</span><span class="orbit-label">STAY CURIOUS</span><span class="orbit-dot"></span></div><div class="auth-note"><span>01 — 05</span><span>Five topics. Endless curiosity.</span></div></div><div class="auth-card"><p class="eyebrow">YOUR NEXT CHAPTER</p><h2>${registering ? 'Make yourself at home.' : 'Good to see you.'}</h2><p>${registering ? 'A new perspective starts with a simple question.' : 'A little learning looks good on you.'}</p><div class="auth-tabs" role="group" aria-label="Account action"><button id="login-tab" class="${registering ? '' : 'selected'}" type="button">Log in</button><button id="register-tab" class="${registering ? 'selected' : ''}" type="button">Create account</button></div><form id="auth-form"><div id="auth-error" role="alert"></div><label>Username<input name="username" autocomplete="username" placeholder="Your username" required minlength="3" maxlength="30" pattern="[A-Za-z0-9_-]+"></label>${registering ? '<label>Email address<input type="email" name="email" autocomplete="email" placeholder="you@example.com" required maxlength="100"></label>' : ''}<label>Password<input type="password" name="password" autocomplete="${registering ? 'new-password' : 'current-password'}" placeholder="At least 10 characters" required minlength="10" maxlength="72"></label><button class="button primary full" type="submit">${registering ? 'Start exploring' : 'Welcome back'} <span>↗</span></button><p class="form-note">${registering ? 'Your own progress. Your own pace.' : 'Your next discovery is waiting.'}</p></form></div></section>`;
    document.querySelector('#login-tab').onclick = () => { registering = false; renderForm(); };
    document.querySelector('#register-tab').onclick = () => { registering = true; renderForm(); };
    document.querySelector('#auth-form').onsubmit = async event => {
      event.preventDefault(); const button = event.target.querySelector('[type=submit]'); button.disabled = true;
      try { state.user = await api(`/auth/${registering ? 'register' : 'login'}`, { method: 'POST', body: Object.fromEntries(new FormData(event.target)) }); navigate('#/catalog'); }
      catch (error) { document.querySelector('#auth-error').innerHTML = errorMessage(error); }
      finally { button.disabled = false; }
    };
  }
  renderForm();
}
registerRoute('catalog', async () => { view.innerHTML = `${heading('YOUR SPACE TO GROW', `Welcome, ${state.user.username}.`, 'Your next discovery starts here.')}<div class="empty-state"><span class="large-star">✳</span><h2>A curious beginning.</h2><p>Your account is ready. Quiz collections are coming in the next phase.</p></div>`; });
registerQuizRoutes(routes);
registerRoute('history', historyView);

export async function render() {
  const version = ++renderVersion;
  let [, route = 'catalog', parameter] = location.hash.split('/');
  if (!state.user && route !== 'login') { navigate('#/login'); return; }
  if (state.user && route === 'login') { navigate('#/catalog'); return; }
  shell();
  document.title = `${route === 'login' ? 'Welcome' : route.charAt(0).toUpperCase() + route.slice(1)} · Hosh Quiz`;
  if (route === 'login') { authView(); return; }
  const renderer = routes.get(route);
  if (!renderer) { view.innerHTML = `${heading('A SMALL DETOUR', 'Page not found.')}<a class="button primary" href="#/catalog">Back to explore ↗</a>`; return; }
  view.innerHTML = '<p class="loading">A moment of curiosity…</p>';
  try { await renderer(parameter, () => version === renderVersion); }
  catch (error) { if (version === renderVersion) view.innerHTML = `${errorMessage(error)}<a class="button" href="#/catalog">Back to explore</a>`; }
}
window.addEventListener('hashchange', render);
try { state.user = (await api('/auth/me')).user; await render(); }
catch (error) { view.innerHTML = `${heading('LET’S TRY AGAIN', 'We couldn’t connect.')}${errorMessage(error)}<button class="button primary" id="reload">Try again</button>`; document.querySelector('#reload').onclick = () => location.reload(); }
