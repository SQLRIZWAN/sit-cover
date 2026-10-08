const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error('CONFIG ERROR: ' + msg);
  process.exit(1);
}

const raw = process.env.FIREBASE_CONFIG;
if (!raw || !raw.trim()) fail('Secret FIREBASE_CONFIG is empty or missing.');
let fb;
try {
  fb = JSON.parse(raw);
} catch (e) {
  fail('Secret FIREBASE_CONFIG must be valid JSON. Parse error: ' + e.message);
}
for (const key of ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId']) {
  if (!fb[key]) fail('FIREBASE_CONFIG is missing field: ' + key);
}

const cfg = {
  firebase: {
    apiKey: fb.apiKey,
    authDomain: fb.authDomain,
    databaseURL: fb.databaseURL,
    projectId: fb.projectId,
    storageBucket: fb.storageBucket || '',
    messagingSenderId: fb.messagingSenderId || '',
    appId: fb.appId,
    measurementId: fb.measurementId || ''
  },
  geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),
  geminiModels: ['gemini-3.5-flash-lite', 'gemini-2.5-flash'],
  cloudinary: {
    cloudName: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    uploadPreset: (process.env.CLOUDINARY_UPLOAD_PRESET || '').trim()
  }
};

const out = path.join(__dirname, '..', 'js', 'config.js');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, 'window.APP_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n');
console.log('config.js injected');
console.log('  firebase  : ' + cfg.firebase.projectId + ' @ ' + cfg.firebase.databaseURL);
console.log('  gemini    : ' + (cfg.geminiApiKey ? 'set (key …' + cfg.geminiApiKey.slice(-6) + ')' : 'MISSING'));
console.log('  cloudinary: ' + (cfg.cloudinary.cloudName ? cfg.cloudinary.cloudName + ' / ' + cfg.cloudinary.uploadPreset : 'not set (uploads disabled)'));
