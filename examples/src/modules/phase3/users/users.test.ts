/**
 * Example test file for the Users module.
 * Shows how to use @restjs/testing with the full stack.
 */

import {
  beforeAll,
  describe,
  it,
  expect,
  createTestClient
} from '@restjs/testing';

import { Application, cors } from '@restjs/core';
import { validate, v }       from '@restjs/validation';
import { JWT, authenticate } from '@restjs/auth';

// ─── State ────────────────────────────────────────────────────────────────────

let app:       Application;
let jwt:       JWT;
let authToken: string;

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  jwt = new JWT(
    process.env.JWT_SECRET || 'test-secret-minimum-32-characters!!'
  );

  authToken = jwt.sign(
    { sub: '1', role: 'admin' },
    { expiresIn: '1h' }
  );

  app = new Application({ server: { port: 0 } });

  app.use(cors());

  // ── GET /users ──────────────────────────────────────────────────────────────

  app.get(
    '/users',
    authenticate(jwt),
    (req, res) => {
      res.json({
        data: [{ id: 1, name: 'Tariq' }]
      });
    }
  );

  // ── POST /users ─────────────────────────────────────────────────────────────

  app.post(
    '/users',
    authenticate(jwt),
    validate({
      body: v.object({
        name:  v.string().min(2).max(100),
        email: v.string().email()
      })
    }),
    (req, res) => {
      // ✅ Cast req.body to Record<string, unknown> before spreading
      // req.body is typed as unknown — we know it's an object after validation
      const body = req.body as Record<string, unknown>;

      res.status(201).json({
        data: {
          id: 2,
          ...body
        }
      });
    }
  );

  // ── GET /users/:id ──────────────────────────────────────────────────────────

  app.get(
    '/users/:id',
    authenticate(jwt),
    (req, res) => {
      const id = Number(req.params.id);

      if (id !== 1) {
        res
          .status(404)
          .json({
            error: {
              code:    'NOT_FOUND',
              message: 'User not found'
            }
          });
        return;
      }

      res.json({
        data: { id: 1, name: 'Tariq' }
      });
    }
  );
});

// ─── Tests: GET /users ────────────────────────────────────────────────────────

describe('GET /users', () => {
  it('should return 401 without a token', async () => {
    const client = createTestClient(app);
    const res    = await client.get('/users');

    expect(res.status).toBe(401);
  });

  it('should return users with valid token', async () => {
    const client = createTestClient(app);
    const res    = await client.get('/users').auth(authToken);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Tariq');
  });
});

// ─── Tests: POST /users ───────────────────────────────────────────────────────

describe('POST /users', () => {
  it('should return 422 with invalid body', async () => {
    const client = createTestClient(app);
    const res    = await client
      .post('/users')
      .auth(authToken)
      .send({ name: 'T' }); // name too short, email missing

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should create user with valid body', async () => {
    const client = createTestClient(app);
    const res    = await client
      .post('/users')
      .auth(authToken)
      .send({ name: 'New User', email: 'new@restjs.dev' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('New User');
    expect(res.body.data.email).toBe('new@restjs.dev');
  });
});

// ─── Tests: GET /users/:id ────────────────────────────────────────────────────

describe('GET /users/:id', () => {
  it('should return 404 for unknown user', async () => {
    const client = createTestClient(app);
    const res    = await client.get('/users/999').auth(authToken);

    expect(res.status).toBe(404);
  });

  it('should return user by id', async () => {
    const client = createTestClient(app);
    const res    = await client.get('/users/1').auth(authToken);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(1);
    expect(res.body.data.name).toBe('Tariq');
  });
});

// ─── Tests: JWT ───────────────────────────────────────────────────────────────

describe('JWT', () => {
  it('should sign and verify a token', () => {
    const token   = jwt.sign({ sub: '42', role: 'user' }, { expiresIn: '1h' });
    const payload = jwt.verify(token);

    expect(payload.sub).toBe('42');
    expect(payload.role).toBe('user');
  });

  it('should reject an expired token', () => {
    const token = jwt.sign({ sub: '42' }, { expiresIn: '0s' });

    expect(() => jwt.verify(token)).toThrow('expired');
  });
});

// ─── Tests: Validation ────────────────────────────────────────────────────────

describe('Validation', () => {
  it('should validate a correct object', () => {
    const schema = v.object({
      name:  v.string().min(2),
      email: v.string().email(),
      age:   v.number().min(0).optional()
    });

    const result = schema.parse({
      name:  'Tariq',
      email: 'tariq@restjs.dev'
    });

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('Tariq');
  });

  it('should return errors for invalid data', () => {
    const schema = v.object({
      name:  v.string().min(5),
      email: v.string().email()
    });

    const result = schema.parse({
      name:  'T',
      email: 'not-an-email'
    });

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});