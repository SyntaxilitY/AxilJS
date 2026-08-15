const fs   = require('fs')
const path = require('path')

const content = `
# Source files — only dist/ is published
src/
*.ts
!*.d.ts

# Config files
tsconfig.json
tsconfig.tsbuildinfo

# Development
node_modules/
*.log
.env
.env.*

# Tests
**/*.test.ts
**/*.spec.ts
tests/
`.trim()

const packagesDir = path.join(__dirname, '..', 'packages')
const packages    = fs.readdirSync(packagesDir)

for (const pkg of packages) {
  const filePath = path.join(packagesDir, pkg, '.npmignore')
  fs.writeFileSync(filePath, content + '\n', 'utf-8')
  console.log(`  ✓ Created .npmignore for ${pkg}`)
}