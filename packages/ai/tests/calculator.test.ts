import { describe, it, expect } from 'vitest';
import { calculatorTool, evaluateMathExpression } from '../src/agents/tool';

describe('evaluateMathExpression', () => {
  const cases: Array<[string, number]> = [
    ['2 + 2', 4],
    ['2 + 3 * 4', 14],
    ['(2 + 3) * 4', 20],
    ['10 / 4', 2.5],
    ['10 % 3', 1],
    ['2 ^ 10', 1024],
    ['2 ** 3', 8],
    ['2 ^ 3 ^ 2', 512],       // right-associative
    ['-2 ^ 2', -4],           // unary minus binds looser than ^
    ['2 ^ -1', 0.5],
    ['-(3 - 5)', 2],
    ['--3', 3],
    ['+4', 4],
    ['.5 + 1.25', 1.75],
    ['1e3 / 2', 500],
    ['Math.sqrt(16)', 4],
    ['sqrt(16) + abs(-2)', 6],
    ['Math.pow(2, 8)', 256],
    ['Math.max(1, 7, 3)', 7],
    ['Math.floor(2.7) + Math.ceil(2.1) + Math.round(2.5)', 8],
    ['Math.log(Math.E)', 1],
    ['Math.PI', Math.PI],
    ['2 * PI', 2 * Math.PI],
    ['Math.sin(0) + Math.cos(0)', 1],
    ['Math.atan2(1, 1) * 4', Math.PI],
    ['Math.log10(1000)', 3]
  ];

  for (const [expr, expected] of cases) {
    it(`${expr} = ${expected}`, () => {
      expect(evaluateMathExpression(expr)).toBeCloseTo(expected, 10);
    });
  }

  it('returns Infinity for division by zero (like JS)', () => {
    expect(evaluateMathExpression('1 / 0')).toBe(Infinity);
  });

  const rejected = [
    'constructor',
    'this',
    'Math.constructor',
    'constructor.constructor("return process")()',
    '__proto__',
    '"abc"',
    "'abc'",
    '`x`',
    'process.exit()',
    'Math["sqrt"](4)',
    'globalThis',
    'x => 1',
    '2 +',
    '(1 + 2',
    '1 + 2)',
    '',
    'sqrt 4',
    'Math.toString()',
    'a = 1',
    '1; 2'
  ];

  for (const expr of rejected) {
    it(`rejects ${JSON.stringify(expr)}`, () => {
      expect(() => evaluateMathExpression(expr)).toThrow();
    });
  }

  it('rejects absurdly long or deeply nested input', () => {
    expect(() => evaluateMathExpression('1+'.repeat(600) + '1')).toThrow(/longer than/);
    expect(() => evaluateMathExpression('('.repeat(200) + '1' + ')'.repeat(200))).toThrow(/nested too deeply/);
  });
});

describe('calculatorTool', () => {
  it('returns result and type', async () => {
    expect(await calculatorTool.handler({ expression: '6 * 7' }))
      .toEqual({ expression: '6 * 7', result: 42, type: 'number' });
  });

  it('returns an error object instead of throwing', async () => {
    const out: any = await calculatorTool.handler({ expression: 'constructor' });
    expect(out.expression).toBe('constructor');
    expect(out.error).toMatch(/^Invalid expression: Unknown identifier 'constructor'/);

    const out2: any = await calculatorTool.handler({ expression: '"a"' });
    expect(out2.error).toMatch(/Unexpected character/);

    const out3: any = await calculatorTool.handler({ expression: 42 as any });
    expect(out3.error).toMatch(/must be a string/);
  });
});
