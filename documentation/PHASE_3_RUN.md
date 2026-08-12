# Build in dependency order
cd packages/common     && npm install && npm run build
cd ../config           && npm install && npm run build
cd ../security         && npm install && npm run build
cd ../pm               && npm install && npm run build
cd ../orm              && npm install && npm run build
cd ../auth             && npm install && npm run build
cd ../validation       && npm install && npm run build
cd ../core             && npm install && npm run build
cd ../testing          && npm install && npm run build
cd ../cli              && npm install && npm run build

# Or from root:
npm run build:all

---

Phase 3 Complete ✅
Component	Status	Details
@restjs/orm	✅	SQLite, PostgreSQL, MySQL drivers
ORM Decorators	✅	@Entity, @Column, @PrimaryKey, @CreatedAt
Query Builder	✅	SELECT, INSERT, UPDATE, DELETE, JOINs, WHERE, pagination
Base Repository	✅	find, findById, create, update, delete, paginate
Migrations	✅	up, down, status, batch tracking
@restjs/auth	✅	JWT sign/verify (zero deps), RBAC, password hashing
@restjs/validation	✅	Schema builder (v.string().email(), etc.)
Validate middleware	✅	body, params, query validation with 422 errors
@restjs/testing	✅	Test runner, describe/it/expect, HTTP test client
rest test	✅	Discovers and runs *.test.ts files
rest migrate	✅	Migration runner integration