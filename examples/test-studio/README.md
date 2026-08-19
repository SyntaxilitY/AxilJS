# test-studio

Built with [AxilJS](https://github.com/SyntaxilitY/AxilJS).

## Features

- HTTP server
- Routing
- Middleware
- Built-in response handling
- ORM (sqlite)
- Database migrations
- JWT authentication
- Role-based access control (RBAC)

## Getting started

```bash
npm install
cp .env.example .env
```

Set `JWT_SECRET` in `.env` to a securely generated random string (32+ characters).

```bash
npm run dev
```

**Windows PowerShell**

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The server starts at <http://localhost:3000>.

## Available scripts

| Script            | Description                        |
| ----------------- | ---------------------------------- |
| `npm run dev`   | Start the development server       |
| `npm run build` | Compile TypeScript to `dist/`    |
| `npm start`     | Run the compiled application       |
| `npm test`      | Run the test suite                 |

## Project structure

```
src/
  config/              Application configuration
  db/                  Database connection
  migrations/          Schema migrations
  modules/
    users/
      controllers/     Route handlers
      services/        Business logic
  main.ts              Application entry point
```

## Documentation

- <https://github.com/SyntaxilitY/AxilJS>
- <https://www.npmjs.com/org/axiljs>
