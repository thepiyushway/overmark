// Copies the single-file Overmark page (the same one published as the Claude app) into the Electron bundle.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', '..', 'index.html');
const dst = path.join(__dirname, '..', 'app', 'index.html');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);
console.log('Synced', path.relative(process.cwd(), src), '→', path.relative(process.cwd(), dst));
