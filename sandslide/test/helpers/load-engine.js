// Loads the pure engine modules in index.html order and returns globalThis.TB.
'use strict';
const path = require('path');
const files = ['build-flags', 'ads-ids.prod', 'ads-ids.test', 'config', 'rng', 'board', 'pieces', 'tilt', 'scoring', 'daily', 'game'];
for (const f of files) require(path.join(__dirname, '..', '..', 'www', 'js', f + '.js'));
module.exports = globalThis.TB;
