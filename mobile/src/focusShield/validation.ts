import type { AnswerResult, ChallengeQuestion } from "./types";

function gcd(a: bigint, b: bigint): bigint {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;
  while (right !== 0n) [left, right] = [right, left % right];
  return left || 1n;
}

function rational(value: string | number): [bigint, bigint] | null {
  const text = String(value).trim();
  if (text.length > 64) return null;
  const fraction = text.match(/^([+-]?\d+)\s*\/\s*([+-]?\d+)$/);
  if (fraction) {
    const numerator = BigInt(fraction[1]);
    const denominator = BigInt(fraction[2]);
    if (denominator === 0n) return null;
    const sign = denominator < 0n ? -1n : 1n;
    const divisor = gcd(numerator, denominator);
    return [(numerator * sign) / divisor, (denominator * sign) / divisor];
  }
  const decimal = text.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/);
  if (!decimal) return null;
  const wholeText = decimal[2] || "0";
  const fractionalText = decimal[3] ?? decimal[4] ?? "";
  const places = fractionalText.length;
  const scale = 10n ** BigInt(places);
  const whole = BigInt(wholeText);
  const fractional = BigInt(fractionalText || "0");
  const signed = (decimal[1] === "-" ? -1n : 1n) * (whole * scale + fractional);
  const divisor = gcd(signed, scale);
  return [signed / divisor, scale / divisor];
}

function boundedRational(numerator: bigint, denominator: bigint): [bigint, bigint] | null {
  if (denominator === 0n) return null;
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  const reducedNumerator = (numerator * sign) / divisor;
  const reducedDenominator = (denominator * sign) / divisor;
  if (reducedNumerator.toString(2).length > 256 || reducedDenominator.toString(2).length > 256) return null;
  return [reducedNumerator, reducedDenominator];
}

/** Small recursive-descent parser for arithmetic responses. Never executes code. */
function arithmeticExpression(source: string): [bigint, bigint] | null {
  if (source.length > 64) return null;
  let index = 0;
  const skipSpace = () => { while (/\s/.test(source[index] ?? "")) index += 1; };
  const add = (left: [bigint, bigint], right: [bigint, bigint], subtract = false) =>
    boundedRational(left[0] * right[1] + (subtract ? -1n : 1n) * right[0] * left[1], left[1] * right[1]);
  const multiply = (left: [bigint, bigint], right: [bigint, bigint]) => boundedRational(left[0] * right[0], left[1] * right[1]);
  const divide = (left: [bigint, bigint], right: [bigint, bigint]) => boundedRational(left[0] * right[1], left[1] * right[0]);

  function expression(depth = 0): [bigint, bigint] | null {
    if (depth > 16) return null;
    let value = term(depth);
    if (!value) return null;
    while (true) {
      skipSpace();
      const operator = source[index];
      if (operator !== "+" && operator !== "-") return value;
      index += 1;
      const right = term(depth);
      if (!right) return null;
      value = add(value, right, operator === "-");
      if (!value) return null;
    }
  }

  function term(depth: number): [bigint, bigint] | null {
    let value = unary(depth);
    if (!value) return null;
    while (true) {
      skipSpace();
      const operator = source[index];
      if (operator !== "*" && operator !== "/") return value;
      index += 1;
      const right = unary(depth);
      if (!right) return null;
      value = operator === "*" ? multiply(value, right) : divide(value, right);
      if (!value) return null;
    }
  }

  function unary(depth: number): [bigint, bigint] | null {
    skipSpace();
    const operator = source[index];
    if (operator === "+" || operator === "-") {
      index += 1;
      const value = unary(depth + 1);
      if (!value) return null;
      return operator === "-" ? [-value[0], value[1]] : value;
    }
    return power(depth);
  }

  function power(depth: number): [bigint, bigint] | null {
    let base = primary(depth);
    if (!base) return null;
    skipSpace();
    if (source[index] !== "^") return base;
    index += 1;
    const exponent = unary(depth + 1);
    if (!exponent || exponent[1] !== 1n || exponent[0] < -12n || exponent[0] > 12n) return null;
    const amount = exponent[0] < 0n ? -exponent[0] : exponent[0];
    let numerator = base[0] ** amount;
    let denominator = base[1] ** amount;
    if (exponent[0] < 0n) [numerator, denominator] = [denominator, numerator];
    base = boundedRational(numerator, denominator);
    return base;
  }

  function primary(depth: number): [bigint, bigint] | null {
    if (depth > 16) return null;
    skipSpace();
    if (source[index] === "(") {
      index += 1;
      const value = expression(depth + 1);
      skipSpace();
      if (source[index] !== ")") return null;
      index += 1;
      return value;
    }
    const number = source.slice(index).match(/^(?:\d+(?:\.\d+)?|\.\d+)/)?.[0];
    if (!number) return null;
    index += number.length;
    return rational(number);
  }

  const value = expression();
  skipSpace();
  return value && index === source.length ? value : null;
}

function sameNumber(expected: string | number, actual: string): boolean {
  const left = rational(expected);
  const right = rational(actual) ?? arithmeticExpression(actual);
  return !!left && !!right && left[0] === right[0] && left[1] === right[1];
}

export function validateAnswer(question: ChallengeQuestion, answer: string | string[]): AnswerResult {
  const normalizedAnswer = Array.isArray(answer) ? answer.map((x) => x.trim()).sort().join("|") : answer.trim();
  const expected = question.correctAnswer;
  if (question.answerType === "number" || typeof expected === "number") {
    return { correct: !Array.isArray(answer) && sameNumber(expected as string | number, answer), normalizedAnswer };
  }
  if (Array.isArray(expected)) {
    const actual = Array.isArray(answer) ? answer.map((x) => x.trim().toLowerCase()).sort() : [answer.trim().toLowerCase()];
    const target = expected.map((x) => x.trim().toLowerCase()).sort();
    return { correct: actual.length === target.length && actual.every((x, i) => x === target[i]), normalizedAnswer };
  }
  return { correct: !Array.isArray(answer) && expected.trim().toLowerCase() === answer.trim().toLowerCase(), normalizedAnswer };
}
