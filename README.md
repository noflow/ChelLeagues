# Chel Leagues

Public league hub for chelleagues.com. Each league is served from its own directory: /CVHL/, /NBHL/, /CWHL/. Only public website files belong here; account data, credentials, and backend configuration stay in API-Toolbox.

Source sites are noflow/CVHL, noflow/nbshl, and noflow/cwhl-stats. When those websites change, copy their index.html, player-centre.js, player-centre.css, and images/ to the matching league directory here. Keep shared player-centre assets aligned with API-Toolbox/website_template.

Hosting: GitHub Pages, main branch, root directory. Custom domain must be connected after DNS is configured. Toolkit remains separately hosted on Render.

The hub and all league pages share `manifest.webmanifest`, `app.js`, `mobile-app.css`, and the root `sw.js`. Preserve the manifest, app script, stylesheet, Apple icon, and viewport metadata when copying updated league HTML from source sites. The CL home-screen icon is the existing approved artwork. One installed app covers all league paths; live account features require a connection. The service worker caches only the generic offline screen and public icon, never API replies, account pages, or availability. Run `node --test tests/pwa.test.cjs` to check those boundaries.
