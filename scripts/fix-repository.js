// scripts/fix-repository.js

const fs   = require('fs')
const path = require('path')

const PACKAGES_DIR = path.join(__dirname, '..', 'packages')

const packages = fs.readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)

for (const pkg of packages) {
  const pkgPath = path.join(PACKAGES_DIR, pkg, 'package.json')
  if (!fs.existsSync(pkgPath)) continue

  const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

  // Fix repository URL format
  pkgJson.repository = {
    type: 'git',
    url:  'git+https://github.com/SyntaxilitY/AxilJS.git'
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8')
  console.log(`  ✓ Fixed ${pkgJson.name}`)
}

console.log('\n  All repository URLs fixed.\n')