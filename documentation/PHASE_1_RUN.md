# 1. Clone/create the @axiljs directory
mkdir @axiljs && cd @axiljs

# 2. Copy all files into their locations

# 3. Install dependencies
npm install

# 4. Build all packages (in order)
cd packages/common && npm install && npm run build
cd ../core && npm install && npm run build
cd ../cli && npm install && npm run build

# 5. Link CLI globally (optional)
cd packages/cli
npm link

# 6. Test it
@axil create my-test-app
cd my-test-app
npm install
npm run dev