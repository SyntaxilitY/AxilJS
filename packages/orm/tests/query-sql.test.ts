import { describe, it, expect } from 'vitest';
import { QueryBuilder as ModelQueryBuilder } from '../src/query/query-builder';
import { QueryBuilder } from '../src/query-builder/query-builder';
import { recordingDriver } from './helpers';

const mqb = (driverType = 'postgres') =>
  new ModelQueryBuilder(recordingDriver(), driverType).from('users');
const rqb = (driverType = 'postgres') =>
  new QueryBuilder(recordingDriver(), driverType).select('*').from('users');

describe('ModelQueryBuilder SQL', () => {
  it('keeps the plain where output unchanged', () => {
    const { sql, params } = mqb('sqlite').where('a', '=', 1).orWhere('b', '>', 2).toSQL();
    expect(sql).toBe('SELECT * FROM users WHERE a = ? OR b > ?');
    expect(params).toEqual([1, 2]);
  });

  it('parenthesises grouped wheres', () => {
    const { sql, params } = mqb('sqlite')
      .where('active', '=', 1)
      .where(q => q.where('role', '=', 'admin').orWhere('role', '=', 'owner'))
      .toSQL();
    expect(sql).toBe('SELECT * FROM users WHERE active = ? AND (role = ? OR role = ?)');
    expect(params).toEqual([1, 'admin', 'owner']);
  });

  it('supports orWhere groups and nested groups', () => {
    const { sql } = mqb('sqlite')
      .where('a', '=', 1)
      .orWhere(q => q.where('b', '=', 2).where(q2 => q2.where('c', '=', 3).orWhere('d', '=', 4)))
      .toSQL();
    expect(sql).toBe('SELECT * FROM users WHERE a = ? OR (b = ? AND (c = ? OR d = ?))');
  });

  it('skips empty groups', () => {
    const { sql } = mqb('sqlite').where(() => {}).where('a', '=', 1).toSQL();
    expect(sql).toBe('SELECT * FROM users WHERE a = ?');
  });

  it('numbers postgres placeholders across groups, IN and BETWEEN', () => {
    const { sql, params } = mqb('postgres')
      .where('a', '=', 1)
      .where(q => q.whereIn('b', [2, 3]).orWhere('c', '=', 4))
      .whereBetween('d', 5, 6)
      .whereNotBetween('e', 7, 8)
      .whereNotIn('f', [9])
      .whereLike('g', '%x%')
      .toSQL();
    expect(sql).toBe(
      'SELECT * FROM users WHERE a = $1 AND (b IN ($2, $3) OR c = $4) AND d BETWEEN $5 AND $6' +
      ' AND e NOT BETWEEN $7 AND $8 AND f NOT IN ($9) AND g LIKE $10'
    );
    expect(params).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, '%x%']);
  });

  it('numbers update SET params before grouped wheres', async () => {
    const driver = recordingDriver();
    await new ModelQueryBuilder(driver, 'postgres').from('users')
      .where(q => q.where('a', '=', 1).orWhere('b', '=', 2))
      .update({ name: 'x' });
    expect(driver.queries[0].sql).toBe('UPDATE users SET name = $1 WHERE (a = $2 OR b = $3)');
    expect(driver.queries[0].params).toEqual(['x', 1, 2]);
  });

  it('whereNull / whereNotNull / null equality', () => {
    const { sql } = mqb('sqlite').whereNull('a').whereNotNull('b').where('c', '=', null).toSQL();
    expect(sql).toBe('SELECT * FROM users WHERE a IS NULL AND b IS NOT NULL AND c IS NULL');
  });

  it('count() drops ORDER BY and restores the builder', async () => {
    const driver = recordingDriver([{ _count: 3 }]);
    const qb = new ModelQueryBuilder(driver, 'postgres').from('users').select('id', 'name').orderBy('name');
    expect(await qb.count()).toBe(3);
    expect(driver.queries[0].sql).toBe('SELECT COUNT(*) AS _count FROM users');
    expect(qb.toSQL().sql).toBe('SELECT id, name FROM users ORDER BY name ASC');
  });

  it('sum/avg/min/max/pluck do not mutate the selected columns', async () => {
    const driver = recordingDriver([{ _sum: 1, _avg: 1, _min: 1, _max: 1, id: 1 }]);
    const qb = new ModelQueryBuilder(driver, 'sqlite').from('t').select('id', 'name').orderBy('id', 'DESC');
    await qb.sum('n');
    await qb.avg('n');
    await qb.min('n');
    await qb.max('n');
    await qb.pluck('id');
    expect(driver.queries.map(q => q.sql)).toEqual([
      'SELECT SUM(n) AS _sum FROM t',
      'SELECT AVG(n) AS _avg FROM t',
      'SELECT MIN(n) AS _min FROM t',
      'SELECT MAX(n) AS _max FROM t',
      'SELECT id FROM t ORDER BY id DESC'
    ]);
    expect(qb.toSQL().sql).toBe('SELECT id, name FROM t ORDER BY id DESC');
  });

  it('soft-delete scope wraps user conditions', () => {
    const { sql } = mqb('sqlite').useSoftDeletes().where('a', '=', 1).orWhere('b', '=', 2).toSQL();
    expect(sql).toBe('SELECT * FROM users WHERE (a = ? OR b = ?) AND deleted_at IS NULL');
    expect(mqb('sqlite').useSoftDeletes().withTrashed().toSQL().sql).toBe('SELECT * FROM users');
    expect(mqb('sqlite').useSoftDeletes().onlyTrashed().toSQL().sql)
      .toBe('SELECT * FROM users WHERE deleted_at IS NOT NULL');
    expect(mqb('sqlite').useSoftDeletes().join('posts', 'posts.user_id = users.id').toSQL().sql)
      .toBe('SELECT * FROM users INNER JOIN posts ON posts.user_id = users.id WHERE users.deleted_at IS NULL');
  });

  it('mysql uses ? placeholders', () => {
    const { sql } = mqb('mysql').where(q => q.where('a', '=', 1).orWhere('b', '=', 2)).toSQL();
    expect(sql).toBe('SELECT * FROM users WHERE (a = ? OR b = ?)');
  });
});

describe('Repository QueryBuilder SQL', () => {
  it('keeps the plain where output unchanged', () => {
    const { sql, params } = rqb('sqlite').where('a', 1).where('b', '>', 2).toSQL();
    expect(sql).toBe('SELECT * FROM users WHERE a = ? AND b > ?');
    expect(params).toEqual([1, 2]);
  });

  it('supports orWhere and grouped wheres', () => {
    const { sql, params } = rqb('sqlite')
      .where('active', 1)
      .where(q => q.where('role', 'admin').orWhere('role', 'owner'))
      .orWhere('id', '=', 9)
      .toSQL();
    expect(sql).toBe('SELECT * FROM users WHERE active = ? AND (role = ? OR role = ?) OR id = ?');
    expect(params).toEqual([1, 'admin', 'owner', 9]);
  });

  it('numbers postgres placeholders across groups and every where variant', () => {
    const { sql, params } = rqb('postgres')
      .where('a', 1)
      .where(q => q.whereIn('b', [2, 3]).orWhere(q2 => q2.whereBetween('c', 4, 5)))
      .whereNotBetween('d', 6, 7)
      .whereNotIn('e', [8])
      .whereLike('f', '%y')
      .whereNull('g')
      .whereNotNull('h')
      .toSQL();
    expect(sql).toBe(
      'SELECT * FROM users WHERE a = $1 AND (b IN ($2, $3) OR (c BETWEEN $4 AND $5))' +
      ' AND d NOT BETWEEN $6 AND $7 AND e NOT IN ($8) AND f LIKE $9 AND g IS NULL AND h IS NOT NULL'
    );
    expect(params).toEqual([1, 2, 3, 4, 5, 6, 7, 8, '%y']);
  });

  it('numbers UPDATE placeholders SET first, then grouped wheres (postgres)', () => {
    const { sql, params } = new QueryBuilder(recordingDriver(), 'postgres')
      .update('users').set({ name: 'n', age: 3 })
      .where(q => q.where('id', 1).orWhere('id', 2))
      .toSQL();
    expect(sql).toBe('UPDATE users SET name = $1, age = $2 WHERE (id = $3 OR id = $4)');
    expect(params).toEqual(['n', 3, 1, 2]);
  });

  it("where(col, 'IN', [...]) binds the list", () => {
    const { sql, params } = rqb('sqlite').where('id', 'IN', [1, 2]).toSQL();
    expect(sql).toBe('SELECT * FROM users WHERE id IN (?, ?)');
    expect(params).toEqual([1, 2]);
  });

  it('count() drops ORDER BY and restores selected columns', async () => {
    const driver = recordingDriver([{ count: '4' }]);
    const qb = new QueryBuilder(driver, 'postgres').select('id').from('users').orderBy('id', 'DESC');
    expect(await qb.count()).toBe(4);
    expect(driver.queries[0].sql).toBe('SELECT COUNT(*) as count FROM users');
    expect(qb.toSQL().sql).toBe('SELECT id FROM users ORDER BY id DESC');
  });

  it('soft-delete scope', () => {
    expect(rqb('sqlite').useSoftDeletes().where('a', 1).orWhere('b', 2).toSQL().sql)
      .toBe('SELECT * FROM users WHERE (a = ? OR b = ?) AND deleted_at IS NULL');
    expect(rqb('sqlite').useSoftDeletes().onlyTrashed().toSQL().sql)
      .toBe('SELECT * FROM users WHERE deleted_at IS NOT NULL');
    expect(rqb('sqlite').useSoftDeletes().withTrashed().toSQL().sql).toBe('SELECT * FROM users');
  });
});

describe('identifier validation', () => {
  const attacks = [
    'id; DROP TABLE users',
    'id DESC',
    'name) OR (1=1',
    '1=1 OR id',
    'id--',
    '(SELECT 1)',
    'a.b.c',
    '"x"" OR 1=1"',
    ''
  ];

  it.each(attacks)('ModelQueryBuilder.orderBy rejects %j', bad => {
    expect(() => mqb().orderBy(bad)).toThrow(/Unsafe SQL/);
  });

  it.each(attacks)('QueryBuilder.orderBy rejects %j', bad => {
    expect(() => rqb().orderBy(bad)).toThrow(/Unsafe SQL/);
  });

  it.each(attacks)('where columns reject %j', bad => {
    expect(() => mqb().where(bad, '=', 1)).toThrow(/Unsafe SQL/);
    expect(() => rqb().where(bad, 1)).toThrow(/Unsafe SQL/);
    expect(() => mqb().whereIn(bad, [1])).toThrow(/Unsafe SQL/);
    expect(() => rqb().whereNull(bad)).toThrow(/Unsafe SQL/);
  });

  it('rejects bad sort directions and operators', () => {
    expect(() => mqb().orderBy('id', 'DESC; DROP TABLE x' as 'DESC')).toThrow(/sort direction/);
    expect(() => rqb().orderBy('id', 'sideways' as 'ASC')).toThrow(/sort direction/);
    expect(() => mqb().where('id', '= 1 OR 1 =' as '=', 1)).toThrow(/operator/);
    expect(() => rqb().where('id', 'OR', 1)).toThrow(/operator/);
  });

  it('accepts plain, qualified, quoted and star identifiers', () => {
    const { sql } = mqb('sqlite')
      .where('users.id', '>', 1)
      .where('"MixedCase"', '=', 2)
      .orderBy('users.created_at', 'desc' as 'DESC')
      .orderBy('`name`')
      .toSQL();
    expect(sql).toBe('SELECT * FROM users WHERE users.id > ? AND "MixedCase" = ? ORDER BY users.created_at DESC, `name` ASC');
  });

  it('accepts lower-case operators', () => {
    expect(mqb('sqlite').where('name', 'like' as 'LIKE', '%a').toSQL().sql)
      .toBe('SELECT * FROM users WHERE name LIKE ?');
  });

  it('leaves raw selects and whereRaw alone', () => {
    const { sql } = mqb('sqlite').select('count(*) as c', 'MAX(id) AS m').whereRaw('1 = 1').toSQL();
    expect(sql).toBe('SELECT count(*) as c, MAX(id) AS m FROM users WHERE 1 = 1');
    expect(rqb('sqlite').select('count(*) as c').toSQL().sql).toBe('SELECT count(*) as c FROM users');
  });
});
