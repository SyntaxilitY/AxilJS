import { describe, it, expect } from 'vitest'
import {
  tHttp,
  tParam,
  tBody,
  tAuth,
  tRole,
  tSaga,
  tStep,
  tCompensate,
  tOutbox,
  tInbox,
  tCheckpoint,
  tEmit,
  tTransaction,
  tPure,
  tSideEffect,
  getMetadata,
  getAllMetadata,
  getParamMetadata,
  getDecoratedMethods,
  hasMetadata,
  getAllEntries,
  listDecorators,
  getDecoratorInfo,
  searchDecorators,
  listCategories,
  validateComposition,
  defineDecorator,
  registerMetadata
} from '../src/index'

describe('metadata registry', () => {
  it('records class, method and parameter metadata', () => {
    @tAuth()
    class Users {
      @tHttp({ method: 'GET', path: '/users/:id' })
      @tRole('admin', 'editor')
      get(@tParam('id') _id: string, @tBody() _body: unknown) {}
    }

    expect(getMetadata('tAuth', Users)).toEqual({ required: true })
    expect(getMetadata('tHttp', Users.prototype, 'get')).toEqual({ method: 'GET', path: '/users/:id' })
    expect(getMetadata('tRole', Users.prototype, 'get')).toEqual({ roles: ['admin', 'editor'] })
    expect(hasMetadata('tRole', Users.prototype, 'get')).toBe(true)
    expect(hasMetadata('tRole', Users.prototype, 'missing')).toBe(false)
    expect(getParamMetadata('tParam', Users.prototype, 'get').map(p => p.index)).toEqual([0])
    expect(getParamMetadata('tBody', Users.prototype, 'get').map(p => p.index)).toEqual([1])
    expect(getDecoratedMethods(Users.prototype)).toEqual(['get'])
  })

  it('keeps subclass metadata out of the parent class', () => {
    @tSaga('base')
    class Base {
      @tStep('a') a() {}
    }
    @tSaga('child')
    class Child extends Base {
      @tStep('b') b() {}
      @tStep('a-override') a() {}
    }

    expect(getMetadata('tSaga', Base)).toEqual({ name: 'base' })
    expect(getMetadata('tSaga', Child)).toEqual({ name: 'child' })
    expect(getDecoratedMethods(Base.prototype)).toEqual(['a'])
    expect(getDecoratedMethods(Child.prototype).sort()).toEqual(['a', 'b'])
    expect(getMetadata('tStep', Base.prototype, 'a')).toEqual({ name: 'a' })
    expect(getMetadata('tStep', Child.prototype, 'a')).toEqual({ name: 'a-override' })
  })

  it('lets a subclass inherit parent metadata it does not override', () => {
    @tSaga('base')
    class Base {
      @tStep('a') a() {}
    }
    class Child extends Base {}

    expect(getMetadata('tSaga', Child)).toEqual({ name: 'base' })
    expect(getMetadata('tStep', Child.prototype, 'a')).toEqual({ name: 'a' })
  })
})

describe('distributed decorators', () => {
  it('describe a saga with steps and compensation', () => {
    @tSaga('checkout', { timeout: 30_000 })
    class Checkout {
      @tStep('reserve', { order: 1 }) reserve() {}
      @tStep('charge', { order: 2 }) @tCheckpoint('after-charge') charge() {}
      @tCompensate('charge') refund() {}
    }

    expect(getMetadata('tSaga', Checkout)).toEqual({ name: 'checkout', timeout: 30_000 })
    expect(getMetadata('tStep', Checkout.prototype, 'charge')).toEqual({ name: 'charge', order: 2 })
    expect(getMetadata('tCheckpoint', Checkout.prototype, 'charge')).toEqual({ name: 'after-charge' })
    expect(getMetadata('tCompensate', Checkout.prototype, 'refund')).toEqual({ step: 'charge' })
  })

  it('describe outbox publication and inbox consumption', () => {
    class Orders {
      @tTransaction() @tOutbox({ channel: 'domain' }) @tEmit('order.created') create() {}
      @tInbox({ key: 'event.id', ttl: 60_000 }) consume() {}
    }

    expect(getAllMetadata(Orders.prototype, 'create')).toEqual({
      tTransaction: {},
      tOutbox: { channel: 'domain' },
      tEmit: { event: 'order.created' }
    })
    expect(getMetadata('tInbox', Orders.prototype, 'consume')).toEqual({ key: 'event.id', ttl: 60_000 })
    expect(validateComposition(Orders.prototype, 'create').valid).toBe(true)
  })
})

describe('introspection', () => {
  it('lists every shipped decorator without any being applied first', () => {
    const before = getAllEntries().length
    const all = listDecorators()
    expect(all.length).toBeGreaterThanOrEqual(119)
    expect(getAllEntries().length).toBe(before)
    for (const name of ['tSaga', 'tOutbox', 'tPolicy', 'tHttp', 'tCacheStampede']) {
      expect(getDecoratorInfo(name)?.name).toBe(name)
    }
  })

  it('filters by category and searches', () => {
    const distributed = listDecorators({ category: 'Distributed' }).map(d => d.name).sort()
    expect(distributed).toEqual(['tCheckpoint', 'tCompensate', 'tInbox', 'tOutbox', 'tSaga', 'tStep'])
    expect(listCategories()).toContain('Distributed')
    expect(searchDecorators('outbox').map(d => d.name)).toContain('tOutbox')
  })

  it('gives every decorator a complete contract', () => {
    for (const info of listDecorators()) {
      expect(info.description, info.name).toBeTruthy()
      expect(info.purpose, info.name).toBeTruthy()
      expect(info.why, info.name).toBeTruthy()
      expect(info.whenToUse, info.name).toBeTruthy()
      expect(info.targets.length, info.name).toBeGreaterThan(0)
      expect(info.examples.length, info.name).toBeGreaterThan(0)
    }
  })
})

describe('composition validation', () => {
  it('reports declared conflicts', () => {
    class Svc {
      @tPure() @tSideEffect('writes') bad() {}
    }
    const result = validateComposition(Svc.prototype, 'bad')
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/tPure|tSideEffect/)
  })

  it('warns about metadata without a registered contract', () => {
    class Svc {}
    registerMetadata('tUnknownThing', Svc.prototype, 'x', {})
    expect(validateComposition(Svc.prototype, 'x').warnings[0]).toMatch(/Unknown decorator "tUnknownThing"/)
  })
})

describe('defineDecorator', () => {
  it('rejects incomplete contracts', () => {
    expect(() =>
      defineDecorator({ name: 'tBroken' } as any, () => {})
    ).toThrow(/description is required/)
  })

  it('returns the property descriptor for method decorators', () => {
    const dec = defineDecorator(
      {
        name: 'tCustomTest',
        description: 'd',
        purpose: 'p',
        why: 'w',
        whenToUse: 'u',
        category: 'Test',
        targets: ['method'],
        examples: ['@tCustomTest()']
      },
      (target, key) => registerMetadata('tCustomTest', target, key, { ok: true })
    )
    class Svc {
      @dec run() {
        return 42
      }
    }
    expect(new Svc().run()).toBe(42)
    expect(getMetadata('tCustomTest', Svc.prototype, 'run')).toEqual({ ok: true })
  })
})
