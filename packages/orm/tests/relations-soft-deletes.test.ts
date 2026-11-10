import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  Entity, PrimaryKey, Column, DeletedAt, HasOne, HasMany, BelongsTo, ManyToMany, getEntityMetadata
} from '../src/decorators/entity';
import { BaseModel } from '../src/model/base-model';
import { BaseRepository } from '../src/repository/base-repository';
import { ConnectionManager } from '../src/connection/connection-manager';
import { memoryDb, quietConsole } from './helpers';

@Entity('authors')
class Author extends BaseModel {
  @PrimaryKey() id!: number;
  @Column() name!: string;
  @HasMany(() => Post) posts?: Post[];
  @HasOne(() => Profile) profile?: Profile | null;
}

@Entity('profiles')
class Profile extends BaseModel {
  @PrimaryKey() id!: number;
  @Column({ type: 'integer' }) author_id!: number;
  @Column() bio!: string;
}

@Entity('posts')
class Post extends BaseModel {
  @PrimaryKey() id!: number;
  @Column({ name: 'author_id', type: 'integer', nullable: true }) authorId!: number | null;
  @Column() title!: string;
  @DeletedAt() deletedAt!: Date | string | null;
  @BelongsTo(() => Author) author?: Author | null;
  @HasMany(() => Comment) comments?: Comment[];
  @ManyToMany(() => Tag, { pivotTable: 'post_tags' }) tags?: Tag[];
}

@Entity('tags')
class Tag extends BaseModel {
  @PrimaryKey() id!: number;
  @Column() name!: string;
  @ManyToMany(() => Post, { pivotTable: 'post_tags' }) posts?: Post[];
}

@Entity('comments')
class Comment extends BaseModel {
  @PrimaryKey() id!: number;
  @Column({ type: 'integer' }) post_id!: number;
  @Column() body!: string;
}

let db: ConnectionManager;

async function exec(sql: string) {
  await db.getDriver().query(sql);
}

beforeAll(async () => {
  quietConsole();
  db = await memoryDb();
  BaseModel.setDriver(db.getDriver(), 'sqlite');

  await exec('CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT)');
  await exec('CREATE TABLE profiles (id INTEGER PRIMARY KEY, author_id INTEGER, bio TEXT)');
  await exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, author_id INTEGER, title TEXT, deleted_at TIMESTAMP)');
  await exec('CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT)');
  await exec('CREATE TABLE post_tags (post_id INTEGER, tag_id INTEGER)');
  await exec('CREATE TABLE comments (id INTEGER PRIMARY KEY, post_id INTEGER, body TEXT)');

  await exec(`INSERT INTO authors (id, name) VALUES (1, 'ann'), (2, 'bob'), (3, 'cy')`);
  await exec(`INSERT INTO profiles (id, author_id, bio) VALUES (1, 1, 'ann bio'), (2, 2, 'bob bio')`);
  await exec(`INSERT INTO posts (id, author_id, title) VALUES (1, 1, 'p1'), (2, 1, 'p2'), (3, 2, 'p3'), (4, NULL, 'orphan')`);
  await exec(`INSERT INTO tags (id, name) VALUES (1, 'red'), (2, 'blue')`);
  await exec(`INSERT INTO post_tags (post_id, tag_id) VALUES (1, 1), (1, 2), (3, 2)`);
  await exec(`INSERT INTO comments (id, post_id, body) VALUES (1, 1, 'c1'), (2, 1, 'c2'), (3, 3, 'c3')`);
});

afterAll(async () => {
  await db.disconnect();
});

describe('relation metadata', () => {
  it('records relations and the soft-delete column', () => {
    const meta = getEntityMetadata(Post)!;
    expect(meta.relations.get('tags')).toMatchObject({ type: 'manyToMany', pivotTable: 'post_tags' });
    expect(meta.softDelete).toEqual({ propertyKey: 'deletedAt', columnName: 'deleted_at' });
    expect(getEntityMetadata(Author)!.softDelete).toBeUndefined();
  });
});

describe('eager loading (BaseModel)', () => {
  it('hasMany / hasOne with one batched query per relation', async () => {
    const spy = vi.spyOn(db.getDriver(), 'query');
    const authors = await Author.all({ with: ['posts', 'profile'] });
    expect(spy).toHaveBeenCalledTimes(3); // authors + posts + profiles — no N+1
    spy.mockRestore();

    const [ann, bob, cy] = authors;
    expect(ann.posts!.map(p => p.title)).toEqual(['p1', 'p2']);
    expect(ann.posts![0]).toBeInstanceOf(Post);
    expect(bob.posts!.map(p => p.title)).toEqual(['p3']);
    expect(cy.posts).toEqual([]);
    expect(ann.profile).toBeInstanceOf(Profile);
    expect(ann.profile!.bio).toBe('ann bio');
    expect(cy.profile).toBeNull();

    const json = ann.toJSON();
    expect((json.posts as Array<Record<string, unknown>>)[0]).toMatchObject({ title: 'p1', author_id: 1 });
  });

  it('belongsTo (incl. null foreign key)', async () => {
    const posts = await Post.all({ with: ['author'] });
    expect(posts.map(p => p.author?.name ?? null)).toEqual(['ann', 'ann', 'bob', null]);
  });

  it('manyToMany through the pivot table, both directions', async () => {
    const posts = await Post.all({ with: ['tags'] });
    expect(posts.map(p => p.tags!.map(t => t.name).sort())).toEqual([['blue', 'red'], [], ['blue'], []]);

    const tags = await Tag.all({ with: ['posts'] });
    expect(tags.map(t => t.posts!.map(p => p.title))).toEqual([['p1'], ['p1', 'p3']]);
  });

  it('nested relations with dot paths', async () => {
    const spy = vi.spyOn(db.getDriver(), 'query');
    const authors = await Author.all({ with: ['posts.comments'] });
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
    expect(authors[0].posts!.map(p => p.comments!.map(c => c.body))).toEqual([['c1', 'c2'], []]);
  });

  it('with() on the query builder attaches raw rows', async () => {
    const rows = await Author.with('posts').where('name', '=', 'bob').get();
    expect(rows).toHaveLength(1);
    expect((rows[0].posts as Array<Record<string, unknown>>).map(p => p.title)).toEqual(['p3']);
  });

  it('find() with relations and instance load()', async () => {
    const ann = (await Author.find(1, { with: ['posts'] }))!;
    expect(ann.posts).toHaveLength(2);
    const bob = (await Author.find(2))!;
    expect(bob.posts).toBeUndefined();
    await bob.load('profile', 'posts');
    expect(bob.profile!.bio).toBe('bob bio');
    expect(bob.posts).toHaveLength(1);
  });

  it('rejects unknown relations', async () => {
    await expect(Author.all({ with: ['nope'] })).rejects.toThrow(/Unknown relation "nope"/);
  });
});

describe('eager loading (BaseRepository)', () => {
  it('findWithRelations / find({ with })', async () => {
    const repo = new BaseRepository(Author, db);
    const rows = await repo.findWithRelations(undefined, ['posts', 'profile']) as unknown as Array<Record<string, any>>;
    expect(rows.map(r => r.posts.length)).toEqual([2, 1, 0]);
    expect(rows[0].profile.bio).toBe('ann bio');

    const one = await repo.findById(2, { with: ['posts'] }) as unknown as Record<string, any>;
    expect(one.posts.map((p: Record<string, unknown>) => p.title)).toEqual(['p3']);

    const page = await repo.paginate({ perPage: 1, with: ['posts'] });
    expect((page.data[0] as unknown as Record<string, any>).posts).toHaveLength(2);
  });
});

describe('soft deletes (BaseModel)', () => {
  it('delete() sets deleted_at and hides the row', async () => {
    const p2 = (await Post.find(2))!;
    await p2.delete();
    expect(p2.trashed()).toBe(true);

    expect(await Post.find(2)).toBeNull();
    expect(await Post.count()).toBe(3);
    expect((await Post.all()).map(p => p.id)).toEqual([1, 3, 4]);
    const raw = await db.getDriver().query<{ deleted_at: string | null }>('SELECT deleted_at FROM posts WHERE id = 2');
    expect(raw.rows[0].deleted_at).not.toBeNull();
  });

  it('withTrashed / onlyTrashed', async () => {
    expect((await Post.withTrashed().get()).length).toBe(4);
    expect((await Post.onlyTrashed().get()).map(r => r.id)).toEqual([2]);
    expect((await Post.find(2, { withTrashed: true }))!.title).toBe('p2');
    expect((await Post.all({ onlyTrashed: true })).map(p => p.id)).toEqual([2]);
  });

  it('eager loading skips trashed related rows', async () => {
    const ann = (await Author.find(1, { with: ['posts'] }))!;
    expect(ann.posts!.map(p => p.title)).toEqual(['p1']);
  });

  it('restore()', async () => {
    const p2 = (await Post.find(2, { withTrashed: true }))!;
    await p2.restore();
    expect(p2.trashed()).toBe(false);
    expect((await Post.find(2))!.title).toBe('p2');
  });

  it('query().delete() soft-deletes, restore() and forceDelete() on the builder', async () => {
    expect(await Post.query().where('title', '=', 'orphan').delete()).toBe(1);
    expect(await Post.where('title', '=', 'orphan').first()).toBeNull();
    expect(await Post.query().where('title', '=', 'orphan').restore()).toBe(1);
    expect(await Post.where('title', '=', 'orphan').first()).not.toBeNull();

    await Post.deleteWhere({ title: 'orphan' } as Partial<Post>);
    expect(await Post.withTrashed().where('title', '=', 'orphan').count()).toBe(1);
    expect(await Post.query().where('title', '=', 'orphan').forceDelete()).toBe(1);
    expect(await Post.withTrashed().where('title', '=', 'orphan').count()).toBe(0);
  });

  it('instance forceDelete() removes the row', async () => {
    const p = await Post.create({ title: 'tmp', authorId: 3 } as Partial<Post>);
    await p.forceDelete();
    expect(await Post.withTrashed().where('title', '=', 'tmp').count()).toBe(0);
  });

  it('restore() throws for entities without @DeletedAt', async () => {
    const c = (await Comment.find(3))!;
    await expect(c.restore()).rejects.toThrow(/no @DeletedAt/);
    expect(c.trashed()).toBe(false);
  });

  it('entities without @DeletedAt still hard-delete', async () => {
    const c = (await Comment.find(3))!;
    await c.delete();
    const raw = await db.getDriver().query('SELECT * FROM comments WHERE id = 3');
    expect(raw.rows).toHaveLength(0);
  });
});

describe('soft deletes (BaseRepository)', () => {
  it('delete / find / withTrashed / onlyTrashed / restore / forceDelete', async () => {
    const repo = new BaseRepository(Post, db);
    const created = await repo.create({ title: 'repo-post' } as Partial<Post>) as unknown as Record<string, unknown>;
    const id = created.id as number;

    await repo.delete(id);
    expect(await repo.findById(id)).toBeNull();
    expect(await repo.findById(id, { withTrashed: true })).not.toBeNull();
    expect((await repo.find(undefined, { onlyTrashed: true })).length).toBe(1);
    expect(await repo.count({ title: 'repo-post' } as Partial<Post>)).toBe(0);
    expect(await repo.count({ title: 'repo-post' } as Partial<Post>, { withTrashed: true })).toBe(1);
    await expect(repo.update(id, { title: 'x' } as Partial<Post>)).rejects.toThrow(/not found/);

    expect(await repo.restore(id)).toBe(true);
    expect(await repo.findById(id)).not.toBeNull();

    expect(await repo.deleteWhere({ title: 'repo-post' } as Partial<Post>)).toBe(1);
    expect((await repo.paginate({ where: { title: 'repo-post' } as Partial<Post> })).total).toBe(0);

    await repo.forceDelete(id);
    expect(await repo.findById(id, { withTrashed: true })).toBeNull();
  });

  it('restore() throws without @DeletedAt', async () => {
    const repo = new BaseRepository(Comment, db);
    await expect(repo.restore(1)).rejects.toThrow(/no @DeletedAt/);
  });
});
