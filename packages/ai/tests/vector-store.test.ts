import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VectorStore, VectorDocument } from '../src/vector/vector-store';

const doc = (id: string, embedding: number[], metadata?: Record<string, unknown>): VectorDocument =>
  ({ id, content: `content ${id}`, embedding, metadata });

describe('VectorStore', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axil-vs-'));

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds, gets, replaces, upserts and deletes by id', async () => {
    const store = new VectorStore();
    await store.add([doc('a', [1, 0]), doc('b', [0, 1])]);
    expect(store.size).toBe(2);
    expect((await store.get('a'))!.embedding).toEqual([1, 0]);

    await store.add([doc('a', [0.5, 0.5])]);
    expect(store.size).toBe(2);
    expect((await store.get('a'))!.embedding).toEqual([0.5, 0.5]);
    // Replacing keeps the original position
    expect(store.getAll().map(d => d.id)).toEqual(['a', 'b']);

    await store.upsert([doc('c', [1, 1]), doc('b', [2, 2])]);
    expect(store.getAll().map(d => d.id)).toEqual(['a', 'b', 'c']);
    expect((await store.get('b'))!.embedding).toEqual([2, 2]);

    expect(await store.delete('b')).toBe(true);
    expect(await store.delete('b')).toBe(false);
    expect(await store.get('b')).toBeNull();
    expect(store.size).toBe(2);

    await store.addOne(doc('d', [3, 3]));
    expect(store.size).toBe(3);
    await store.clear();
    expect(store.size).toBe(0);
  });

  it('enforces maxDocuments by evicting the oldest', async () => {
    const store = new VectorStore({ maxDocuments: 2 });
    await store.add([doc('1', [1]), doc('2', [2]), doc('3', [3])]);
    expect(store.getAll().map(d => d.id)).toEqual(['2', '3']);
    await store.add([doc('4', [4])]);
    expect(store.getAll().map(d => d.id)).toEqual(['3', '4']);
  });

  it('searches with cosine, dot and euclidean metrics, filters and thresholds', async () => {
    const docs = [doc('x', [1, 0], { lang: 'en' }), doc('y', [0, 1], { lang: 'de' }), doc('z', [0.9, 0.1], { lang: 'en' })];

    const cosine = new VectorStore();
    await cosine.add(docs);
    const res = await cosine.search([1, 0], { topK: 2 });
    expect(res.map(r => r.document.id)).toEqual(['x', 'z']);
    expect(res[0].score).toBeCloseTo(1);

    const filtered = await cosine.search([0, 1], { filter: { lang: 'en' } });
    expect(filtered.every(r => r.document.metadata!.lang === 'en')).toBe(true);
    expect(await cosine.search([0, 1], { minScore: 0.9 })).toHaveLength(1);

    const dot = new VectorStore({ metric: 'dot' });
    await dot.add(docs);
    expect((await dot.search([2, 0]))[0]).toMatchObject({ document: { id: 'x' }, score: 2 });

    const euclid = new VectorStore({ metric: 'euclidean' });
    await euclid.add(docs);
    const e = await euclid.search([0, 1]);
    expect(e[0]).toMatchObject({ document: { id: 'y' }, score: 1 });
  });

  it('reports raw cosine similarity (-1..1) and has no default threshold', async () => {
    const store = new VectorStore();
    await store.add([doc('same', [1, 0]), doc('ortho', [0, 1]), doc('opp', [-1, 0])]);
    const res = await store.search([2, 0]);
    expect(res.map(r => r.document.id)).toEqual(['same', 'ortho', 'opp']);
    expect(res[0].score).toBeCloseTo(1);
    expect(res[1].score).toBeCloseTo(0);   // unrelated = 0, not 0.5
    expect(res[2].score).toBeCloseTo(-1);
    expect((await store.search([2, 0], { minScore: 0.3 })).map(r => r.document.id)).toEqual(['same']);
  });

  it('throws on dimension mismatch for every metric', async () => {
    for (const metric of ['cosine', 'dot', 'euclidean'] as const) {
      const store = new VectorStore({ metric });
      await store.add([doc('a', [1, 2, 3])]);
      await expect(store.search([1, 2])).rejects.toThrow('Vector dimension mismatch: 2 vs 3');
    }
  });

  it('round-trips through toJSON / fromJSON', async () => {
    const store = new VectorStore({ metric: 'dot', maxDocuments: 10 });
    await store.add([doc('a', [1, 2], { k: 1 }), doc('b', [3, 4])]);

    const json = store.toJSON();
    expect(json).toMatchObject({ version: 1, metric: 'dot', maxDocuments: 10 });

    const copy = VectorStore.fromJSON(JSON.stringify(json));
    expect(copy.getAll()).toEqual(store.getAll());
    expect((await copy.search([1, 0]))[0].score).toBe(3); // still dot metric

    // Unlimited stores serialize maxDocuments as null
    expect(new VectorStore().toJSON().maxDocuments).toBeNull();
    expect(() => VectorStore.fromJSON({} as any)).toThrow(/Invalid VectorStore data/);
  });

  it('saves to and loads from disk', async () => {
    const file = path.join(tmpDir, 'nested', 'dir', 'store.json');
    const store = new VectorStore();
    await store.add([doc('a', [1, 0], { source: 'x.md' }), doc('b', [0, 1])]);
    await store.save(file);

    expect(fs.existsSync(file)).toBe(true);
    // No temp files left behind
    expect(fs.readdirSync(path.dirname(file))).toEqual(['store.json']);

    const loaded = await new VectorStore().load(file);
    expect(loaded.size).toBe(2);
    expect(await loaded.get('a')).toEqual(doc('a', [1, 0], { source: 'x.md' }));

    // Saving again overwrites
    await store.delete('b');
    await store.save(file);
    expect((await new VectorStore().load(file)).size).toBe(1);

    await expect(new VectorStore().load(path.join(tmpDir, 'missing.json'))).rejects.toThrow();
  });
});
