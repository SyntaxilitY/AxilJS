import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Entity, PrimaryKey, Column } from '../src/decorators/entity';
import { BaseModel } from '../src/model/base-model';
import { BaseRepository } from '../src/repository/base-repository';
import { observeLoaded } from '../src/connection/base-driver';
import type { ConnectionManager } from '../src/connection/connection-manager';
import { memoryDb, quietConsole } from './helpers';

// @axiljs/runtime's sensitive data lineage listens on this hook
const KEY = Symbol.for('axiljs.sensitive.observe');

@Entity('members')
class Member extends BaseModel {
  @PrimaryKey() id!: number;
  @Column() name!: string;
}

@Entity('contacts')
class Contact {
  @PrimaryKey() id!: number;
  @Column({ name: 'email_address' }) email!: string;
}

let db: ConnectionManager;
const seen: Array<[unknown, any]> = [];

beforeAll(async () => {
  quietConsole();
  db = await memoryDb();
  const driver = db.getDriver();
  await driver.query('CREATE TABLE members (id INTEGER PRIMARY KEY, name TEXT)');
  await driver.query('CREATE TABLE contacts (id INTEGER PRIMARY KEY, email_address TEXT)');
  await driver.query("INSERT INTO members (name) VALUES ('Ann')");
  await driver.query("INSERT INTO contacts (email_address) VALUES ('ann@example.com')");
  BaseModel.setDriver(driver, 'sqlite');
});

afterEach(() => {
  seen.length = 0;
  delete (globalThis as any)[KEY];
});

afterAll(async () => {
  await db.disconnect();
});

const listen = () => {
  (globalThis as any)[KEY] = (value: unknown, hint: unknown) => { seen.push([value, hint]); };
};

describe('sensitive data observe hook', () => {
  it('reports hydrated model instances', async () => {
    listen();
    const member = await Member.find(1);
    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toBe(member);
  });

  it('reports repository rows with the entity class and column names', async () => {
    listen();
    const repo = new BaseRepository(Contact, db);
    const rows = await repo.find();
    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toBe(rows);
    expect(seen[0][1].entity).toBe(Contact);
    expect(seen[0][1].columns).toMatchObject({ email: 'email_address' });

    await repo.findById(1);
    expect(seen).toHaveLength(2);
  });

  it('is a no-op without the hook', async () => {
    expect(() => observeLoaded([{ a: 1 }], Contact)).not.toThrow();
    const repo = new BaseRepository(Contact, db);
    await expect(repo.find()).resolves.toHaveLength(1);
    await expect(Member.find(1)).resolves.toBeTruthy();
  });
});
