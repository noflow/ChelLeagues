# Chel Leagues

Public league hub for chelleagues.com. Each league is served from its own directory: /CVHL/, /NBHL/, /CWHL/. Only public website files belong here; account data, credentials, and backend configuration stay in API-Toolbox.

Source sites are noflow/CVHL, noflow/nbshl, and noflow/cwhl-stats. When those websites change, copy their index.html, player-centre.js, player-centre.css, and images/ to the matching league directory here. Keep shared player-centre assets aligned with API-Toolbox/website_template.

Hosting: GitHub Pages, main branch, root directory. Custom domain must be connected after DNS is configured. Toolkit remains separately hosted on Render.

The hub and all league pages share `manifest.webmanifest`, `app.js`, `mobile-app.css`, and the root `sw.js`. Preserve the manifest, app script, stylesheet, Apple icon, and viewport metadata when copying updated league HTML from source sites. The CL home-screen icon is the existing approved artwork. One installed app covers all league paths; live account features require a connection. The service worker caches only the generic offline screen and public icon, never API replies, account pages, or availability. Run `node --test tests/pwa.test.cjs` to check those boundaries.

Player rank presentation is shared in `player-ranks.js` and `player-ranks.css`. Preserve their head references and the `renderOverallBadge`/`makeClickable` integration when updating league HTML. The approved concept artwork is retained intact in `assets/player-ranks-v1.png`; SVG viewports display individual badges without regenerating the artwork. The existing scoring formula remains in use: its skater 70–96 scale maps to the 15 tiers at thresholds `[70,72,74,76,78,80,82,84,86,88,90,92,94,95,96]`. The goalie 72–95 scale is normalized to the same endpoints before mapping. Existing qualification thresholds (4 skater games, 3 goalie games) produce Provisional badges below qualification. This adapter does not implement the proposed position-balanced scoring redesign. Thresholds can be tuned separately in the shared file.
