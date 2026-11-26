// Apple Silicon only runs signed code. With no Developer ID available, sign ad hoc so local
// and downloaded builds launch (users still approve the first open in Privacy & Security).
// With a Developer ID (CSC_LINK / CSC_NAME set), electron-builder signs properly instead.
const { execFileSync } = require('child_process');
const path = require('path');
exports.default = async function (context) {
  if (process.platform !== 'darwin') return;
  if (process.env.CSC_LINK || process.env.CSC_NAME) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  console.log('Ad-hoc signed', app);
};
