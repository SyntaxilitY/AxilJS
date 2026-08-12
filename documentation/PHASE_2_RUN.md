# Build in dependency order
cd packages/common  && npm install && npm run build
cd ../config        && npm install && npm run build
cd ../security      && npm install && npm run build
cd ../pm            && npm install && npm run build
cd ../core          && npm install && npm run build
cd ../cli           && npm install && npm run build

# Or from root:
npm run build:all