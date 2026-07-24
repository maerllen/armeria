/**
 * Root entry point for Node.js runtime environments (Hostinger, cPanel, PM2, Docker).
 * Delegates execution to the compiled server bundle in dist/server.cjs or dist/server.js.
 */
const path = require('path');
const fs = require('fs');

const cjsBundle = path.join(__dirname, 'dist', 'server.cjs');
const jsBundle = path.join(__dirname, 'dist', 'server.js');

if (fs.existsSync(cjsBundle)) {
  require(cjsBundle);
} else if (fs.existsSync(jsBundle)) {
  require(jsBundle);
} else {
  console.log('[Armeria] Build bundle not found in ./dist. Starting build process...');
  try {
    const { execSync } = require('child_process');
    execSync('npm run build', { stdio: 'inherit' });
    if (fs.existsSync(cjsBundle)) {
      require(cjsBundle);
    } else if (fs.existsSync(jsBundle)) {
      require(jsBundle);
    }
  } catch (err) {
    console.error('[Armeria] Error: Could not automatically build project. Please run "npm run build" manually.', err);
    process.exit(1);
  }
}
