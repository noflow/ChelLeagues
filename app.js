/* One installable app across all league paths. No account data is stored here. */
(() => {
  'use strict';
  const script = document.currentScript;
  const base = new URL('./', script.src);
  const standalone = matchMedia('(display-mode: standalone)');
  let installPrompt;
  let installed = false;
  const tools = document.createElement('aside');
  tools.className = 'cl-app-tools';
  tools.setAttribute('aria-label', 'Chel Leagues app');
  const home = document.createElement('a');
  home.href = base.href;
  home.textContent = 'All leagues';
  if (location.pathname !== base.pathname) tools.append(home);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Add to home screen';
  tools.append(button);
  const dialog = document.createElement('dialog');
  dialog.className = 'cl-install-dialog';
  dialog.setAttribute('aria-labelledby', 'cl-install-title');
  dialog.innerHTML = `<form method="dialog"><button class="cl-dialog-close" aria-label="Close installation instructions">Close</button></form>
    <img src="${new URL('assets/chel-leagues-icon.png', base).href}" alt="" width="64" height="64">
    <h2 id="cl-install-title">Chel Leagues on your phone</h2>
    <p>Your leagues, profile, and availability—one tap from your home screen.</p>
    <h3>iPhone or iPad</h3><ol><li>Open this website in Safari.</li><li>Open the Share menu, then choose <strong>Add to Home Screen</strong>.</li><li>Keep <strong>Open as Web App</strong> on if shown, then tap <strong>Add</strong>.</li></ol>
    <h3>Android</h3><ol><li>Open this website in Chrome.</li><li>Open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li><li>Confirm to add Chel Leagues.</li></ol>
    <p class="cl-install-note">An internet connection is needed for live stats, sign-in, and saving availability. On a computer, look for the install option in your browser's menu.</p>`;
  const main = document.querySelector('main');
  if (main) main.before(tools);
  document.body.append(dialog);
  const update = () => {
    button.hidden = installed || standalone.matches || navigator.standalone === true;
    tools.hidden = !tools.querySelector('a') && button.hidden;
  };
  update();
  standalone.addEventListener('change', update);
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });
  addEventListener('appinstalled', () => { installPrompt = null; installed = true; update(); });
  button.addEventListener('click', async () => {
    if (!installPrompt) { dialog.showModal(); return; }
    const prompt = installPrompt;
    installPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { dialog.showModal(); }
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(new URL('sw.js', base), {scope: base.pathname, updateViaCache: 'none'})
      .catch(() => { /* Installation instructions still work if offline support is unavailable. */ });
  }
})();
