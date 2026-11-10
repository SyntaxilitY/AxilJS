import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Entity, PrimaryKey, Column, getEntityMetadata } from '../src/decorators/entity';
import { BaseModel } from '../src/model/base-model';
import { BaseRepository } from '../src/repository/base-repository';
import { Schema } from '../src/schema/schema-builder';
import { MigrationRunner } from '../src/migrations/migration-runner';
import { Transaction } from '../src/transaction/transaction-manager';
import { ConnectionManager } from '../src/connection/connection-manager';
import { memoryDb, quietConsole } from './helpers';

@Entity('accounts')
class Account extends BaseModel {
  @PrimaryKey() id!: number;
  @Column() name!: string;
  @Column({ type: 'integer' }) age!: number;
  @Column({ nullable: true }) role!: string | null;
}

@Entity('products')
class Product {
  @PrimaryKey() id!: number;
  @Column() name!: string;
  @Column({ type: 'integer' }) price!: number;
}

class ProductRepository extends BaseRepository<Product> {
  constructor(db: ConnectionManager) {
    super(Product, db);
  }
}

let db: ConnectionManager;

beforeAll(async () => {
  quietConsole();
  db = await memoryDb();
  const driver = db.getDriver();
  BaseModel.setDriver(driver, 'sqlite');
  Transaction.setDriver(driver, 'sqlite');

  await Schema.create('accounts', t => {
    t.id();
    t.string('name');
    t.integer('age');
    t.string('role').nullable();
  }, driver, 'sqlite');

  await Schema.create('products', t => {
    t.id();
    t.string('name');
    t.integer('price');
  }, driver, 'sqlite');
});

afterAll(async () => {
  await db.disconnect();
});

describe('connection + decorators', () => {
  it('connects and pings', async () => {
    expect(db.isConnected()).toBe(true);
    expect(await db.getDriver().ping()).toBe(true);
  });

  it('records entity metadata with legacy decorators', () => {
    const meta = getEntityMetadata(Account)!;
    expect(meta.tableName).toBe('accounts');
    expect(meta.primaryKey).toBe('id');
    expect([...meta.columns.keys()]).toEqual(['id', 'name', 'age', 'role']);
  });
});

describe('Schema + migrations', () => {
  it('Schema.create builds a usable table', async () => {
    const res = await db.getDriver().query<{ name: string }>(`PRAGMA table_info(accounts)`);
    expect(res.rows.map(r => r.name)).toEqual(['id', 'name', 'age', 'role']);
  });

  it('MigrationRunner runs up and down', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'axil-orm-mig-'));
    writeFileSync(join(dir, '001_widgets.js'), `
      exports.up = async (db) => { await db.query('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)') }
      exports.down = async (db) => { await db.query('DROP TABLE widgets') }
    `);
    const stdout = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      const runner = new MigrationRunner(db.getDriver(), dir);
      await runner.up();
      const after = await db.getDriver().query(`SELECT name FROM sqlite_master WHERE name = 'widgets'`);
      expect(after.rows).toHaveLength(1);
      const recorded = await db.getDriver().query<{ name: string; batch: number }>('SELECT * FROM _migrations');
      expect(recorded.rows.map(r => [r.name, r.batch])).toEqual([['001_widgets', 1]]);

      await runner.up(); // idempotent
      await runner.down();
      const gone = await db.getDriver().query(`SELECT name FROM sqlite_master WHERE name = 'widgets'`);
      expect(gone.rows).toHaveLength(0);
    } finally {
      process.stdout.write = stdout;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('BaseRepository CRUD', () => {
  let repo: ProductRepository;

  beforeAll(async () => {
    repo = new ProductRepository(db);
  });

  it('create / findById / findOne / find / count', async () => {
    const a = await repo.create({ name: 'apple', price: 3 });
    expect(a).toMatchObject({ id: 1, name: 'apple', price: 3 });
    await repo.createMany([{ name: 'banana', price: 1 }, { name: 'cherry', price: 7 }]);

    expect(await repo.findById(1)).toMatchObject({ name: 'apple' });
    expect(await repo.findById(999)).toBeNull();
    expect(await repo.findOne({ name: 'cherry' })).toMatchObject({ price: 7 });
    expect(await repo.find()).toHaveLength(3);
    expect(await repo.find({ price: 1 })).toHaveLength(1);
    expect(await repo.count()).toBe(3);
    expect(await repo.count({ name: 'banana' })).toBe(1);
  });

  it('update / updateWhere / findByIdOrFail', async () => {
    const updated = await repo.update(2, { price: 2 });
    expect(updated).toMatchObject({ id: 2, price: 2 });
    expect(await repo.updateWhere({ name: 'cherry' }, { price: 8 })).toBe(1);
    expect((await repo.findByIdOrFail(3)).price).toBe(8);
    await expect(repo.findByIdOrFail(999)).rejects.toThrow(/not found/);
  });

  it('paginate with ordering', async () => {
    const page = await repo.paginate({ page: 2, perPage: 2, orderBy: { column: 'price', direction: 'DESC' } });
    expect(page.total).toBe(3);
    expect(page.totalPages).toBe(2);
    expect(page.data.map(p => p.name)).toEqual(['banana']);
  });

  it('rejects injection through where keys and sort keys', async () => {
    await expect(repo.find({ ['1=1 OR name']: 'x' } as unknown as Partial<Product>)).rejects.toThrow(/Unsafe SQL/);
    await expect(repo.paginate({ orderBy: { column: 'price; DROP TABLE products', direction: 'ASC' } }))
      .rejects.toThrow(/Unsafe SQL/);
    expect(await repo.count()).toBe(3);
  });

  it('delete / deleteWhere (hard delete without @DeletedAt)', async () => {
    await repo.delete(1);
    expect(await repo.findById(1)).toBeNull();
    expect(await repo.deleteWhere({ name: 'banana' })).toBe(1);
    const raw = await db.getDriver().query('SELECT * FROM products');
    expect(raw.rows).toHaveLength(1);
  });
});

describe('BaseModel', () => {
  it('create / find / save / isDirty', async () => {
    const a = await Account.create({ name: 'ann', age: 30, role: 'admin' });
    expect(a).toBeInstanceOf(Account);
    expect(a.id).toBe(1);
    expect(a.isNew()).toBe(false);
    expect(a.isDirty()).toBe(false);

    a.age = 31;
    expect(a.isDirty()).toBe(true);
    expect(a.isDirty('age')).toBe(true);
    expect(a.isDirty('name')).toBe(false);
    await a.save();
    expect(a.isDirty()).toBe(false);
    expect((await Account.find(1))!.age).toBe(31);

    const b = new Account();
    b.name = 'bob';
    b.age = 20;
    b.role = 'user';
    expect(b.isNew()).toBe(true);
    await b.save();
    expect(b.id).toBe(2);
    expect(b.isNew()).toBe(false);
    expect(await Account.find(2)).toMatchObject({ name: 'bob' });
    expect(b.toJSON()).toEqual({ id: 2, name: 'bob', age: 20, role: 'user' });
  });

  it('all / count / paginate / findOrFail', async () => {
    await Account.create({ name: 'cid', age: 40, role: null });
    await Account.create({ name: 'dee', age: 50, role: 'user' });
    expect(await Account.all()).toHaveLength(4);
    expect(await Account.count()).toBe(4);
    const page = await Account.paginate(2, 3);
    expect(page.data).toHaveLength(1);
    expect(page.lastPage).toBe(2);
    await expect(Account.findOrFail(99)).rejects.toThrow(/not found/);
  });

  it('every where variant against real rows', async () => {
    const names = async (qb: ReturnType<typeof Account.query>) =>
      (await qb.orderBy('id').get()).map(r => r.name);

    expect(await names(Account.where('age', '>', 35))).toEqual(['cid', 'dee']);
    expect(await names(Account.query().where('role', '=', 'user').orWhere('age', '<', 31))).toEqual(['bob', 'dee']);
    expect(await names(Account.query().whereIn('name', ['ann', 'dee']))).toEqual(['ann', 'dee']);
    expect(await names(Account.query().whereNotIn('name', ['ann', 'dee']))).toEqual(['bob', 'cid']);
    expect(await names(Account.query().whereNull('role'))).toEqual(['cid']);
    expect(await names(Account.query().whereNotNull('role'))).toEqual(['ann', 'bob', 'dee']);
    expect(await names(Account.query().whereBetween('age', 25, 45))).toEqual(['ann', 'cid']);
    expect(await names(Account.query().whereNotBetween('age', 25, 45))).toEqual(['bob', 'dee']);
    expect(await names(Account.query().whereLike('name', '%e%'))).toEqual(['dee']);
    expect(await names(Account.query().whereIn('name', []))).toEqual([]);
    expect(await names(
      Account.query()
        .where('age', '>', 25)
        .where(q => q.where('role', '=', 'admin').orWhere(q2 => q2.whereNull('role')))
    )).toEqual(['ann', 'cid']);
  });

  it('aggregates and builder reuse', async () => {
    const qb = Account.query().select('name').orderBy('age', 'DESC');
    expect(await qb.count()).toBe(4);
    expect(await qb.max('age')).toBe(50);
    expect(await qb.min('age')).toBe(20);
    expect(await qb.sum('age')).toBe(141);
    expect(await qb.pluck('name')).toEqual(['dee', 'cid', 'ann', 'bob']);
    expect((await qb.get())[0]).toEqual({ name: 'dee' });
  });

  it('updateWhere / increment / deleteWhere / delete (hard)', async () => {
    expect(await Account.updateWhere({ role: 'user' } as Partial<Account>, { age: 21 } as Partial<Account>)).toBe(2);
    await Account.query().where('name', '=', 'ann').increment('age', 2);
    expect((await Account.find(1))!.age).toBe(33);
    expect(await Account.deleteWhere({ name: 'dee' } as Partial<Account>)).toBe(1);
    const cid = (await Account.where('name', '=', 'cid').first())!;
    await (await Account.find(cid.id as number))!.delete();
    const raw = await db.getDriver().query('SELECT * FROM accounts');
    expect(raw.rows).toHaveLength(2);
  });
});

describe('transactions', () => {
  it('commits', async () => {
    await Transaction.run(async trx => {
      await trx.query('products').insert({ name: 'trx-commit', price: 1 });
    });
    const res = await db.getDriver().query(`SELECT * FROM products WHERE name = 'trx-commit'`);
    expect(res.rows).toHaveLength(1);
  });

  it('rolls back on error', async () => {
    await expect(Transaction.run(async trx => {
      await trx.query('products').insert({ name: 'trx-rollback', price: 1 });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    const res = await db.getDriver().query(`SELECT * FROM products WHERE name = 'trx-rollback'`);
    expect(res.rows).toHaveLength(0);
  });

  it('nested transactions use savepoints', async () => {
    const driver = db.getDriver();
    await driver.transaction(async outer => {
      await outer.query(`INSERT INTO products (name, price) VALUES ('outer', 1)`);
      await expect(driver.transaction(async inner => {
        await inner.query(`INSERT INTO products (name, price) VALUES ('inner', 1)`);
        throw new Error('inner failed');
      })).rejects.toThrow('inner failed');
      await driver.transaction(async inner => {
        await inner.query(`INSERT INTO products (name, price) VALUES ('inner-ok', 1)`);
      });
    });
    const res = await driver.query<{ name: string }>(
      `SELECT name FROM products WHERE name IN ('outer', 'inner', 'inner-ok') ORDER BY name`
    );
    expect(res.rows.map(r => r.name)).toEqual(['inner-ok', 'outer']);
  });
});
