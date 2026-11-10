/**
 * Mock functions and spies.
 *
 * Usage:
 *   const send = fn().mockReturnValue(true)
 *   send('a', 1)
 *   expect(send).toHaveBeenCalledWith('a', 1)
 *   send.mock.calls  // [['a', 1]]
 *
 *   const spy = spyOn(console, 'log').mockImplementation(() => {})
 *   ...
 *   spy.mockRestore()
 */

type AnyFn = (...args: any[]) => any;

export interface MockResult {
  type: 'return' | 'throw';
  value: unknown;
}

export interface MockState<T extends AnyFn = AnyFn> {
  // Arguments of every call, in order
  calls: Parameters<T>[];
  // Return value (or thrown error) of every call
  results: MockResult[];
  // `this` of every call
  instances: unknown[];
  // Arguments of the most recent call
  lastCall: Parameters<T> | undefined;
}

export interface MockFunction<T extends AnyFn = AnyFn> {
  (...args: Parameters<T>): ReturnType<T>;
  readonly mock: MockState<T>;
  readonly _isMockFunction: true;
  getMockName(): string;
  mockName(name: string): this;
  mockImplementation(impl: T | ((...args: any[]) => any)): this;
  mockImplementationOnce(impl: T | ((...args: any[]) => any)): this;
  mockReturnValue(value: ReturnType<T> | unknown): this;
  mockReturnValueOnce(value: ReturnType<T> | unknown): this;
  mockResolvedValue(value: unknown): this;
  mockResolvedValueOnce(value: unknown): this;
  mockRejectedValue(error: unknown): this;
  mockRejectedValueOnce(error: unknown): this;
  /** Forget recorded calls/results. */
  mockClear(): this;
  /** mockClear() + drop every configured implementation/return value. */
  mockReset(): this;
  /** mockReset(); for spies also put the original method back. */
  mockRestore(): void;
}

function createMock<T extends AnyFn>(
  defaultImpl: AnyFn | undefined,
  onRestore?: () => void
): MockFunction<T> {
  let impl: AnyFn | undefined = defaultImpl;
  const onceQueue: AnyFn[] = [];
  let name = 'mock';

  const state: MockState<T> = {
    calls: [],
    results: [],
    instances: [],
    lastCall: undefined
  };

  const mockFn = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    state.calls.push(args);
    state.instances.push(this);
    state.lastCall = args;

    const current = onceQueue.length > 0 ? onceQueue.shift() : impl;

    try {
      const value = current ? current.apply(this, args) : undefined;
      state.results.push({ type: 'return', value });
      return value;
    } catch (error) {
      state.results.push({ type: 'throw', value: error });
      throw error;
    }
  } as MockFunction<T>;

  const api = {
    _isMockFunction: true as const,
    mock: state,
    getMockName: () => name,
    mockName(n: string) { name = n; return mockFn; },
    mockImplementation(f: AnyFn) { impl = f; return mockFn; },
    mockImplementationOnce(f: AnyFn) { onceQueue.push(f); return mockFn; },
    mockReturnValue(v: unknown) { impl = () => v; return mockFn; },
    mockReturnValueOnce(v: unknown) { onceQueue.push(() => v); return mockFn; },
    mockResolvedValue(v: unknown) { impl = () => Promise.resolve(v); return mockFn; },
    mockResolvedValueOnce(v: unknown) { onceQueue.push(() => Promise.resolve(v)); return mockFn; },
    mockRejectedValue(e: unknown) { impl = () => Promise.reject(e); return mockFn; },
    mockRejectedValueOnce(e: unknown) { onceQueue.push(() => Promise.reject(e)); return mockFn; },
    mockClear() {
      state.calls = [];
      state.results = [];
      state.instances = [];
      state.lastCall = undefined;
      return mockFn;
    },
    mockReset() {
      api.mockClear();
      onceQueue.length = 0;
      impl = undefined;
      return mockFn;
    },
    mockRestore() {
      api.mockReset();
      if (onRestore) onRestore();
    }
  };

  // `mock` must stay live after mockClear() replaces the arrays
  for (const [key, value] of Object.entries(api)) {
    if (key === 'mock') continue;
    Object.defineProperty(mockFn, key, { value, enumerable: false, writable: true });
  }
  Object.defineProperty(mockFn, 'mock', { get: () => state, enumerable: false });

  return mockFn;
}

/**
 * Create a mock function, optionally with a default implementation.
 */
export function fn<T extends AnyFn = AnyFn>(implementation?: T): MockFunction<T> {
  return createMock<T>(implementation);
}

/**
 * Replace `object[method]` with a mock that calls through to the original
 * (until mockImplementation()/mockReturnValue() etc. change it).
 * mockRestore() puts the original method back.
 */
export function spyOn<O extends object, K extends keyof O>(
  object: O,
  method: K
): MockFunction<O[K] extends AnyFn ? O[K] : AnyFn> {
  if (object === null || (typeof object !== 'object' && typeof object !== 'function')) {
    throw new TypeError('spyOn() expects an object');
  }

  const original = (object as any)[method];
  if (typeof original !== 'function') {
    throw new TypeError(`spyOn(): property '${String(method)}' is not a function`);
  }
  if (isMockFunction(original)) return original as any;

  const hadOwn = Object.prototype.hasOwnProperty.call(object, method);

  const spy = createMock<any>(
    function (this: unknown, ...args: unknown[]) {
      return original.apply(this, args);
    },
    () => {
      if (hadOwn) (object as any)[method] = original;
      else delete (object as any)[method];
    }
  );

  // mockReset() clears the call-through; restore keeps it for spies
  const reset = spy.mockReset.bind(spy);
  Object.defineProperty(spy, 'mockReset', {
    value: () => {
      reset();
      spy.mockImplementation(function (this: unknown, ...args: unknown[]) {
        return original.apply(this, args);
      });
      return spy;
    },
    enumerable: false,
    writable: true
  });

  (object as any)[method] = spy;
  return spy as any;
}

export function isMockFunction(value: unknown): value is MockFunction {
  return typeof value === 'function' && (value as any)._isMockFunction === true;
}
