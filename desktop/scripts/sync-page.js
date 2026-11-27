// Copies the single-file Overmark page (the same one published as the Claude app) into the Electron bundle,
// and swaps the Google Fonts link for bundled font files so the app looks right offline.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', '..', 'index.html');
const appDir = path.join(__dirname, '..', 'app');
const dst = path.join(appDir, 'index.html');
fs.mkdirSync(path.join(appDir, 'fonts'), { recursive: true });

let html = fs.readFileSync(src, 'utf8');
const googleFonts = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet">/;
let fontsBundled = false;
try {
  const files = path.join(path.dirname(require.resolve('@fontsource/schibsted-grotesk/package.json')), 'files');
  const faces = [400, 500, 600, 700, 800].map((w) => {
    const name = `schibsted-grotesk-latin-${w}-normal.woff2`;
    fs.copyFileSync(path.join(files, name), path.join(appDir, 'fonts', name));
    return `@font-face{font-family:'Schibsted Grotesk';font-style:normal;font-weight:${w};font-display:swap;src:url(${name}) format('woff2')}`;
  });
  fs.writeFileSync(path.join(appDir, 'fonts', 'fonts.css'), faces.join('\n') + '\n');
  if (!googleFonts.test(html)) throw new Error('Google Fonts link not found in index.html');
  html = html.replace(googleFonts, '<link href="fonts/fonts.css" rel="stylesheet">');
  fontsBundled = true;
} catch (e) {
  console.warn('Fonts not bundled (' + e.message + '); the app will load them online.');
}
fs.writeFileSync(dst, html);
console.log('Synced', path.relative(process.cwd(), src), '→', path.relative(process.cwd(), dst), fontsBundled ? '(fonts bundled)' : '');
