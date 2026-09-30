export type MathOperator = '+' | '-' | '*' | '/' | '^' | '=' | '<' | '>' | '<=' | '>=';

export type MathNode =
  | { kind: 'number'; value: number }
  | { kind: 'identifier'; name: string }
  | { kind: 'unary'; operator: '+' | '-'; value: MathNode }
  | { kind: 'binary'; operator: MathOperator; left: MathNode; right: MathNode }
  | { kind: 'call'; name: string; args: MathNode[] };

type Token =
  | { kind: 'number'; value: string }
  | { kind: 'identifier'; value: string }
  | { kind: 'operator'; value: MathOperator }
  | { kind: 'leftParen' }
  | { kind: 'rightParen' }
  | { kind: 'comma' }
  | { kind: 'end' };

const normalize = (source: string) => source
  .replaceAll('×', '*')
  .replaceAll('÷', '/')
  .replaceAll('−', '-')
  .replaceAll('–', '-')
  .replaceAll('≤', '<=')
  .replaceAll('≥', '>=');

function tokenize(source: string): Token[] {
  const input = normalize(source);
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) { index += 1; continue; }
    if (/[0-9.]/.test(char)) {
      const start = index;
      let dots = 0;
      while (index < input.length && /[0-9.]/.test(input[index])) {
        if (input[index] === '.') dots += 1;
        index += 1;
      }
      if (dots > 1 || input.slice(start, index) === '.') throw new Error('잘못된 숫자입니다.');
      if (/[eE]/.test(input[index] ?? '')) {
        const exponentStart = index;
        index += 1;
        if (/[+-]/.test(input[index] ?? '')) index += 1;
        const digitsStart = index;
        while (/[0-9]/.test(input[index] ?? '')) index += 1;
        if (digitsStart === index) index = exponentStart;
      }
      tokens.push({ kind: 'number', value: input.slice(start, index) });
      continue;
    }
    if (/[A-Za-z_π]/.test(char)) {
      const start = index;
      index += 1;
      while (/[A-Za-z0-9_π]/.test(input[index] ?? '')) index += 1;
      tokens.push({ kind: 'identifier', value: input.slice(start, index) });
      continue;
    }
    if (char === '(') { tokens.push({ kind: 'leftParen' }); index += 1; continue; }
    if (char === ')') { tokens.push({ kind: 'rightParen' }); index += 1; continue; }
    if (char === ',') { tokens.push({ kind: 'comma' }); index += 1; continue; }
    const pair = input.slice(index, index + 2);
    if (pair === '<=' || pair === '>=') {
      tokens.push({ kind: 'operator', value: pair });
      index += 2;
      continue;
    }
    if ('+-*/^=<>'.includes(char)) {
      tokens.push({ kind: 'operator', value: char as MathOperator });
      index += 1;
      continue;
    }
    throw new Error(`지원하지 않는 기호: ${char}`);
  }
  tokens.push({ kind: 'end' });
  return tokens;
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): MathNode {
    const node = this.parseComparison();
    if (this.peek().kind !== 'end') throw new Error('수식의 끝을 해석하지 못했습니다.');
    return node;
  }

  private peek(offset = 0): Token { return this.tokens[this.index + offset] ?? { kind: 'end' }; }
  private take(): Token { return this.tokens[this.index++] ?? { kind: 'end' }; }

  private parseComparison(): MathNode {
    let node = this.parseAddSubtract();
    while (this.peek().kind === 'operator' && ['=', '<', '>', '<=', '>='].includes((this.peek() as Extract<Token, {kind:'operator'}>).value)) {
      const operator = (this.take() as Extract<Token, {kind:'operator'}>).value;
      node = { kind: 'binary', operator, left: node, right: this.parseAddSubtract() };
    }
    return node;
  }

  private parseAddSubtract(): MathNode {
    let node = this.parseMultiplyDivide();
    while (this.peek().kind === 'operator' && (this.peek() as Extract<Token, {kind:'operator'}>).value.match(/^[+-]$/)) {
      const operator = (this.take() as Extract<Token, {kind:'operator'}>).value as '+' | '-';
      node = { kind: 'binary', operator, left: node, right: this.parseMultiplyDivide() };
    }
    return node;
  }

  private startsPrimary(token: Token): boolean {
    return token.kind === 'number' || token.kind === 'identifier' || token.kind === 'leftParen';
  }

  private parseMultiplyDivide(): MathNode {
    let node = this.parseUnary();
    while (true) {
      const token = this.peek();
      if (token.kind === 'operator' && (token.value === '*' || token.value === '/')) {
        this.take();
        node = { kind: 'binary', operator: token.value, left: node, right: this.parseUnary() };
        continue;
      }
      if (this.startsPrimary(token)) {
        node = { kind: 'binary', operator: '*', left: node, right: this.parseUnary() };
        continue;
      }
      break;
    }
    return node;
  }

  private parseUnary(): MathNode {
    const token = this.peek();
    if (token.kind === 'operator' && (token.value === '+' || token.value === '-')) {
      this.take();
      return { kind: 'unary', operator: token.value, value: this.parseUnary() };
    }
    return this.parsePower();
  }

  private parsePower(): MathNode {
    let node = this.parsePrimary();
    const token = this.peek();
    if (token.kind === 'operator' && token.value === '^') {
      this.take();
      node = { kind: 'binary', operator: '^', left: node, right: this.parseUnary() };
    }
    return node;
  }

  private parsePrimary(): MathNode {
    const token = this.take();
    if (token.kind === 'number') return { kind: 'number', value: Number(token.value) };
    if (token.kind === 'identifier') {
      if (this.peek().kind !== 'leftParen') return { kind: 'identifier', name: token.value };
      this.take();
      const args: MathNode[] = [];
      if (this.peek().kind !== 'rightParen') {
        while (true) {
          args.push(this.parseComparison());
          if (this.peek().kind !== 'comma') break;
          this.take();
        }
      }
      if (this.take().kind !== 'rightParen') throw new Error('닫는 괄호가 필요합니다.');
      return { kind: 'call', name: token.value, args };
    }
    if (token.kind === 'leftParen') {
      const node = this.parseComparison();
      if (this.take().kind !== 'rightParen') throw new Error('닫는 괄호가 필요합니다.');
      return node;
    }
    throw new Error('수식 항이 필요합니다.');
  }
}

export function parseMathExpression(source: string): MathNode {
  const trimmed = source.trim();
  if (!trimmed) throw new Error('빈 수식입니다.');
  return new Parser(tokenize(trimmed)).parse();
}

const unaryFunctions: Record<string, (value: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};

export function evaluateMathExpression(node: MathNode, variables: Record<string, number> = {}): number {
  switch (node.kind) {
    case 'number': return node.value;
    case 'identifier': {
      const name = node.name.toLowerCase();
      if (name === 'pi' || node.name === 'π') return Math.PI;
      if (name === 'e') return Math.E;
      return variables[node.name] ?? variables[name] ?? Number.NaN;
    }
    case 'unary': {
      const value = evaluateMathExpression(node.value, variables);
      return node.operator === '-' ? -value : value;
    }
    case 'binary': {
      const left = evaluateMathExpression(node.left, variables);
      const right = evaluateMathExpression(node.right, variables);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.NaN;
      if (node.operator === '+') return left + right;
      if (node.operator === '-') return left - right;
      if (node.operator === '*') return left * right;
      if (node.operator === '/') return right === 0 ? Number.NaN : left / right;
      if (node.operator === '^') return Math.pow(left, right);
      if (node.operator === '=') return left === right ? 1 : 0;
      if (node.operator === '<') return left < right ? 1 : 0;
      if (node.operator === '>') return left > right ? 1 : 0;
      if (node.operator === '<=') return left <= right ? 1 : 0;
      return left >= right ? 1 : 0;
    }
    case 'call': {
      const name = node.name.toLowerCase();
      const values = node.args.map((arg) => evaluateMathExpression(arg, variables));
      if (values.some((value) => !Number.isFinite(value))) return Number.NaN;
      if (unaryFunctions[name] && values.length === 1) return unaryFunctions[name](values[0]);
      if (name === 'pow' && values.length === 2) return Math.pow(values[0], values[1]);
      if (name === 'min' && values.length > 0) return Math.min(...values);
      if (name === 'max' && values.length > 0) return Math.max(...values);
      return Number.NaN;
    }
  }
}
