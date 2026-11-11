// Compiled with `declaration: true` by declaration-emit.test.ts: every
// exported schema's inferred type must be nameable from the package index
// (TS4094/TS4023 otherwise).
import { v } from '../../src/index';

export const userSchema = v.object({
  name: v.string().min(1),
  age: v.number().integer().optional(),
  admin: v.boolean().default(false),
  tags: v.array(v.string()),
  role: v.enum(['admin', 'user']),
  kind: v.literal('person'),
  id: v.union([v.string(), v.number()]),
  meta: v.record(v.number())
});

export const pageSchema = v.number().integer().min(1);
export const upper = v.string().transform(s => s.toUpperCase());
