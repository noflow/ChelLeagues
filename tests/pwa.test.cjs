const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function worker(options = {}) {
  const handlers = {}, stored = [], matched = [], deleted = [], fetched = [];
  const context = {
    URL, Promise,
    self: {registration: {scope: 'https://chelleagues.com/'}, location: {origin: 'https://chelleagues.com'},
      clients: {claim: async () => {}}, addEventListener: (type, handler) => handlers[type] = handler},
    caches: {
      open: async () => ({addAll: async urls => stored.push(...urls)}),
      match: async url => {matched.push(url); return {offline: true};},
      keys: async () => ['chel-offline-v0', 'chel-offline-v1', 'other-app'],
      delete: async key => deleted.push(key)
    },
    fetch: async request => {fetched.push(request.url); if (options.offline) throw Error('Offline'); return {live: true};}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), context);
  return {handlers, stored, matched, deleted, fetched};
}
test('offline storage contains only generic public assets and cleans up only its own old cache', async () => {
  const w = worker();
  let task;
  w.handlers.install({waitUntil: value => task = value}); await task;
  assert.deepEqual(w.stored, ['https://chelleagues.com/offline.html', 'https://chelleagues.com/assets/chel-leagues-icon.png']);
  w.handlers.activate({waitUntil: value => task = value}); await task;
  assert.deepEqual(w.deleted, ['chel-offline-v0']);
});
test('account API reads, writes, and external Discord requests bypass the worker', () => {
  const w = worker();
  for (const request of [
    {url: 'https://api-toolbox.onrender.com/api/website/cvhl/profile', method: 'GET', mode: 'cors'},
    {url: 'https://chelleagues.com/api/availability', method: 'POST', mode: 'cors'},
    {url: 'https://chelleagues.com/api/profile', method: 'GET', mode: 'cors'},
    {url: 'https://discord.com/oauth2/authorize', method: 'GET', mode: 'navigate'}
  ]) w.handlers.fetch({request, respondWith: () => assert.fail('Private/API request intercepted')});
  assert.deepEqual(w.stored, []);
  assert.deepEqual(w.fetched, []);
});
test('navigations always use the network; offline fallback never stores account pages', async () => {
  for (const offline of [false, true]) {
    const w = worker({offline});
    let response;
    w.handlers.fetch({request: {url: 'https://chelleagues.com/CVHL/', method: 'GET', mode: 'navigate'}, respondWith: value => response = value});
    assert.deepEqual(await response, offline ? {offline: true} : {live: true});
    assert.deepEqual(w.stored, []);
    assert.deepEqual(w.matched, offline ? ['https://chelleagues.com/offline.html'] : []);
  }
});
test('hub and each league share one standalone app with a correctly declared square icon', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest')));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.start_url, './?source=homescreen');
  const icon = fs.readFileSync(path.join(root, manifest.icons[0].src));
  assert.equal(manifest.icons[0].sizes, `${icon.readUInt32BE(16)}x${icon.readUInt32BE(20)}`);
  assert.equal(icon.readUInt32BE(16), icon.readUInt32BE(20));
  assert.ok(icon.readUInt32BE(16) >= 512);
  for (const site of ['', 'CVHL', 'NBHL', 'CWHL']) {
    const html = fs.readFileSync(path.join(root, site, 'index.html'), 'utf8');
    for (const asset of ['manifest.webmanifest', 'mobile-app.css', 'app.js']) assert.ok(html.includes(asset), `${site}: missing ${asset}`);
    assert.ok(html.includes('viewport-fit=cover'));
  }
  assert.ok(fs.readFileSync(path.join(root, 'offline.html'), 'utf8').includes('<base href="/">'));
});
