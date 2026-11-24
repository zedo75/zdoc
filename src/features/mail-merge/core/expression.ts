import { toText } from "./formatters";

export interface ExpressionScope {
    fields: Record<string, unknown>;
    /** 内部 0 基；对外解析时统一 +1 */
    index: number;
    count: number;
    groupIndex?: number;
    group?: Record<string, unknown>;
}

export interface ExpressionResult {
    ok: boolean;
    value: boolean;
    error?: string;
}

type Token =
    | { type: "string"; value: string }
    | { type: "number"; value: number }
    | { type: "identifier"; value: string }
    | { type: "op"; value: string }
    | { type: "eof" };

class ExpressionError extends Error {}

/**
 * 解析并求值 `{{#if}}` 条件。
 *
 * 只支持：`@index` / `@count` / `@groupIndex` / `@group.列名` / `列名` /
 * 字符串字面量 / 数字 / `==` / `!=` / `&&` / `||` / 括号。
 * 不做算术、不做函数调用。
 */
export function evaluateExpression(source: string, scope: ExpressionScope): ExpressionResult {
    try {
        const tokens = tokenize(source);
        const parser = new Parser(tokens, scope);
        const value = parser.parseExpression();
        parser.expectEnd();
        return { ok: true, value: Boolean(value) };
    } catch (error) {
        return {
            ok: false,
            value: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < input.length) {
        const char = input[i];
        if (/\s/.test(char)) {
            i++;
            continue;
        }
        if (char === "(" || char === ")") {
            tokens.push({ type: "op", value: char });
            i++;
            continue;
        }
        if (char === "=" || char === "!") {
            if (input[i + 1] !== "=") throw new ExpressionError(`无法识别的运算符「${char}」`);
            tokens.push({ type: "op", value: `${char}=` });
            i += 2;
            continue;
        }
        if (char === "&" || char === "|") {
            if (input[i + 1] !== char) throw new ExpressionError(`无法识别的运算符「${char}」`);
            tokens.push({ type: "op", value: `${char}${char}` });
            i += 2;
            continue;
        }
        if (char === '"' || char === "'") {
            const { value, end } = readString(input, i);
            tokens.push({ type: "string", value });
            i = end;
            continue;
        }
        if (/\d/.test(char)) {
            let end = i + 1;
            while (end < input.length && /\d/.test(input[end])) end++;
            tokens.push({ type: "number", value: Number(input.slice(i, end)) });
            i = end;
            continue;
        }

        let end = i;
        while (end < input.length && /[^\s()=!&|"']/.test(input[end])) end++;
        if (end === i) throw new ExpressionError(`无法识别的字符「${char}」`);
        tokens.push({ type: "identifier", value: input.slice(i, end) });
        i = end;
    }

    tokens.push({ type: "eof" });
    return tokens;
}

function readString(input: string, start: number): { value: string; end: number } {
    const quote = input[start];
    let value = "";
    let i = start + 1;
    while (i < input.length) {
        const char = input[i];
        if (char === "\\" && i + 1 < input.length) {
            value += input[i + 1];
            i += 2;
            continue;
        }
        if (char === quote) return { value, end: i + 1 };
        value += char;
        i++;
    }
    throw new ExpressionError("字符串字面量未闭合");
}

type Value = unknown;

class Parser {
    private pos = 0;

    constructor(
        private readonly tokens: Token[],
        private readonly scope: ExpressionScope,
    ) {}

    parseExpression(): Value {
        return this.parseOr();
    }

    expectEnd(): void {
        if (this.peek().type !== "eof") throw new ExpressionError("条件表达式末尾存在多余内容");
    }

    private parseOr(): Value {
        let left = this.parseAnd();
        while (this.matchOp("||")) {
            const right = this.parseAnd();
            left = Boolean(left) || Boolean(right);
        }
        return left;
    }

    private parseAnd(): Value {
        let left = this.parseComparison();
        while (this.matchOp("&&")) {
            const right = this.parseComparison();
            left = Boolean(left) && Boolean(right);
        }
        return left;
    }

    private parseComparison(): Value {
        const left = this.parsePrimary();
        if (this.matchOp("==")) {
            const right = this.parsePrimary();
            return looseEqual(left, right);
        }
        if (this.matchOp("!=")) {
            const right = this.parsePrimary();
            return !looseEqual(left, right);
        }
        return left;
    }

    private parsePrimary(): Value {
        const token = this.peek();
        if (token.type === "op" && token.value === "(") {
            this.pos++;
            const value = this.parseExpression();
            if (!this.matchOp(")")) throw new ExpressionError("缺少右括号");
            return value;
        }
        if (token.type === "string") {
            this.pos++;
            return token.value;
        }
        if (token.type === "number") {
            this.pos++;
            return token.value;
        }
        if (token.type === "identifier") {
            this.pos++;
            return resolveIdentifier(token.value, this.scope);
        }
        throw new ExpressionError("条件不完整");
    }

    private peek(): Token {
        return this.tokens[this.pos] ?? { type: "eof" };
    }

    private matchOp(op: string): boolean {
        const token = this.peek();
        if (token.type === "op" && token.value === op) {
            this.pos++;
            return true;
        }
        return false;
    }
}

function looseEqual(left: Value, right: Value): boolean {
    if (typeof left === "number" && typeof right === "number") return left === right;
    if (typeof left === "boolean" || typeof right === "boolean") {
        return Boolean(left) === Boolean(right);
    }
    return toText(left) === toText(right);
}

function resolveIdentifier(name: string, scope: ExpressionScope): Value {
    if (name === "@index") return scope.index + 1;
    if (name === "@count") return scope.count;
    if (name === "@groupIndex") {
        return scope.groupIndex == null ? undefined : scope.groupIndex + 1;
    }
    if (name === "@group") return scope.group;
    if (name.startsWith("@group.")) {
        return resolvePath(scope.group, name.slice("@group.".length));
    }

    return resolvePath(scope.fields, name);
}

function resolvePath(source: unknown, path: string): unknown {
    let current: unknown = source;
    for (const segment of path.split(".")) {
        if (current == null || (typeof current !== "object" && typeof current !== "function")) {
            return undefined;
        }
        if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}
