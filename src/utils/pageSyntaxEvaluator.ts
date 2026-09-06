/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

type Token =
  | { type: 'UNION' }
  | { type: 'INTERSECT' }
  | { type: 'NOT' }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' }
  | { type: 'K' }
  | { type: 'N' }
  | { type: 'NUMBER'; value: number }
  | { type: 'MINUS' }
  | { type: 'PLUS' }
  | { type: 'RANGE' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (char === ',' || char === ';') {
      tokens.push({ type: 'UNION' });
      i++;
      continue;
    }
    if (char === '&') {
      tokens.push({ type: 'INTERSECT' });
      i++;
      continue;
    }
    if (char === '!') {
      tokens.push({ type: 'NOT' });
      i++;
      continue;
    }
    if (char === '(') {
      tokens.push({ type: 'LPAREN' });
      i++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'RPAREN' });
      i++;
      continue;
    }
    if (char === '-') {
      tokens.push({ type: 'MINUS' });
      i++;
      continue;
    }
    if (char === '+') {
      tokens.push({ type: 'PLUS' });
      i++;
      continue;
    }
    if (char === '*' && input[i + 1] !== '*') {
      tokens.push({ type: 'K' });
      i++;
      continue;
    }
    if (char === '.' && input[i + 1] === '.') {
      tokens.push({ type: 'RANGE' });
      i += 2;
      continue;
    }
    if (/\d/.test(char)) {
      let numStr = '';
      while (i < input.length && /\d/.test(input[i])) {
        numStr += input[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: parseInt(numStr, 10) });
      continue;
    }
    if (/[a-zA-Z_]/.test(char)) {
      let word = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        word += input[i];
        i++;
      }
      const lowerWord = word.toLowerCase();
      if (lowerWord === 'k') {
        tokens.push({ type: 'K' });
      } else if (lowerWord === 'n') {
        tokens.push({ type: 'N' });
      } else if (lowerWord === 'all' || lowerWord === 'todas') {
        tokens.push({ type: 'K' });
      } else if (lowerWord === 'even' || lowerWord === 'pares') {
        tokens.push({ type: 'NUMBER', value: 2 });
        tokens.push({ type: 'K' });
      } else if (lowerWord === 'odd' || lowerWord === 'impares') {
        tokens.push({ type: 'NUMBER', value: 2 });
        tokens.push({ type: 'K' });
        tokens.push({ type: 'MINUS' });
        tokens.push({ type: 'NUMBER', value: 1 });
      }
      continue;
    }
    i++;
  }
  return tokens;
}

class PageSyntaxParser {
  private tokens: Token[];
  private pos = 0;
  private totalPages: number;

  constructor(tokens: Token[], totalPages: number) {
    this.tokens = tokens;
    this.totalPages = totalPages;
  }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private next(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos++] : null;
  }

  private match(type: string): boolean {
    const token = this.peek();
    if (token && token.type === type) {
      this.pos++;
      return true;
    }
    return false;
  }

  public parseExpression(): Set<number> {
    const result = this.parseIntersection();

    while (this.match('UNION')) {
      const right = this.parseIntersection();
      for (const val of right) {
        result.add(val);
      }
    }

    return result;
  }

  private parseIntersection(): Set<number> {
    let result = this.parseUnary();

    while (this.match('INTERSECT')) {
      const right = this.parseUnary();
      const newResult = new Set<number>();
      for (const val of result) {
        if (right.has(val)) {
          newResult.add(val);
        }
      }
      result = newResult;
    }

    return result;
  }

  private parseUnary(): Set<number> {
    if (this.match('NOT')) {
      const inner = this.parseUnary();
      const complement = new Set<number>();
      for (let p = 1; p <= this.totalPages; p++) {
        if (!inner.has(p)) {
          complement.add(p);
        }
      }
      return complement;
    }

    return this.parsePrimary();
  }

  private parsePrimary(): Set<number> {
    if (this.match('LPAREN')) {
      const result = this.parseExpression();
      if (!this.match('RPAREN')) {
        console.warn('Mismatched parentheses in page syntax');
      }
      return result;
    }

    const token = this.peek();
    if (!token) {
      return new Set<number>();
    }

    // 1. Check if it's "2k-1" or "2k"
    if (token.type === 'NUMBER' && token.value === 2) {
      const nextToken = this.tokens[this.pos + 1];
      if (nextToken && nextToken.type === 'K') {
        this.pos += 2;
        const opToken = this.peek();
        if (opToken && (opToken.type === 'MINUS' || opToken.type === 'PLUS')) {
          const numToken = this.tokens[this.pos + 1];
          if (numToken && numToken.type === 'NUMBER' && numToken.value === 1) {
            this.pos += 2;
            const odds = new Set<number>();
            for (let p = 1; p <= this.totalPages; p++) {
              if (p % 2 !== 0) {
                odds.add(p);
              }
            }
            return odds;
          }
        }
        const evens = new Set<number>();
        for (let p = 1; p <= this.totalPages; p++) {
          if (p % 2 === 0) {
            evens.add(p);
          }
        }
        return evens;
      }
    }

    // 2. Check if it's "k"
    if (token.type === 'K') {
      this.next();
      const allPages = new Set<number>();
      for (let p = 1; p <= this.totalPages; p++) {
        allPages.add(p);
      }
      return allPages;
    }

    // 3. Check if it's "n" or "n-X"
    if (token.type === 'N') {
      this.next();
      const opToken = this.peek();
      if (opToken && (opToken.type === 'MINUS' || opToken.type === 'PLUS')) {
        const numToken = this.tokens[this.pos + 1];
        if (numToken && numToken.type === 'NUMBER') {
          this.pos += 2;
          const offset = opToken.type === 'MINUS' ? -numToken.value : numToken.value;
          const targetPage = this.totalPages + offset;
          const resultSet = new Set<number>();
          if (targetPage >= 1 && targetPage <= this.totalPages) {
            resultSet.add(targetPage);
          }
          return resultSet;
        }
      }
      const resultSet = new Set<number>();
      if (this.totalPages >= 1) {
        resultSet.add(this.totalPages);
      }
      return resultSet;
    }

    // 4. Check if it's a NUMBER
    if (token.type === 'NUMBER') {
      const numToken = this.next() as { type: 'NUMBER'; value: number };
      const start = numToken.value;

      if (this.match('RANGE')) {
        const endToken = this.peek();
        if (endToken && endToken.type === 'NUMBER') {
          this.next();
          const end = endToken.value;
          const rangeSet = new Set<number>();
          for (let p = Math.min(start, end); p <= Math.max(start, end); p++) {
            if (p >= 1 && p <= this.totalPages) {
              rangeSet.add(p);
            }
          }
          return rangeSet;
        }
      }

      const resultSet = new Set<number>();
      if (start >= 1 && start <= this.totalPages) {
        resultSet.add(start);
      }
      return resultSet;
    }

    this.next();
    return new Set<number>();
  }
}

export function shouldShowOnPage(
  pattern: string | undefined,
  pageNumber: number,
  totalPages: number
): boolean {
  if (!pattern) return true;

  const trimmed = pattern.trim();
  const normalized = trimmed.toLowerCase();

  if (
    normalized === '' ||
    normalized === 'all' ||
    normalized === 'todas' ||
    normalized === '*'
  ) {
    return true;
  }

  try {
    const tokens = tokenize(trimmed);
    if (tokens.length === 0) return true;

    const parser = new PageSyntaxParser(tokens, totalPages);
    const selectedPages = parser.parseExpression();

    return selectedPages.has(pageNumber);
  } catch (error) {
    console.error(`Error parsing selector syntax pattern: "${pattern}"`, error);
    return true;
  }
}
