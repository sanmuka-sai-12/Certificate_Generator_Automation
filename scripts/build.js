/**
 * Root Build Script:
 * 1. Builds the modern React.js frontend into dist/index.html via Vite Singlefile
 * 2. Copies all backend Google Apps Script (.gs) files and appsscript.json into dist/
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function build() {
  console.log('--- 1. Building React.js Frontend (Vite Singlefile) ---');
  execSync('npm run build', { cwd: FRONTEND_DIR, stdio: 'inherit' });

  console.log('--- 2. Copying Backend Apps Script Files to dist ---');
  if (fs.existsSync(BACKEND_DIR)) {
    const files = fs.readdirSync(BACKEND_DIR);
    files.forEach(file => {
      const src = path.join(BACKEND_DIR, file);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, path.join(DIST_DIR, file));
      }
    });
    console.log(`✓ Copied ${files.length} backend files (.gs and appsscript.json).`);
  }

  console.log(' All frontend and backend artifacts ready in /dist for clasp push!');
}

build();
