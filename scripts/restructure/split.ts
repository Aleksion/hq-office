// Splits one source file (the page's script, or server.ts) into ES modules, mechanically.
//
// The source is cut at top-level statements. Each statement keeps its text, its comments and its order; it only
// gains `export` when another module uses what it declares, and the module gains the imports it needs. A binding
// that one module declares and another assigns gets a setter in the declaring module (setX(v)), because an
// imported binding is read-only. Which statement goes to which module is the caller's plan; this file only does
// the cutting, the linking and the checks.
import ts from "typescript";

export type Piece = {
  idx: number;
  node: ts.Node; // the statement, declarator or property this piece stands for
  start: number; // emitted source range [start, end)
  end: number;
  head: string; // text emitted before the range (a split declarator's keyword, an event file's export)
  tail: string; // text emitted after the range
  exportAt: number; // where "export " goes inside the range, or -1 to put it at the start of head
  names: string[]; // top-level names it declares
  nameNodes: ts.Identifier[];
  kind: "fn" | "var" | "class" | "type" | "import" | "expr" | "part";
  section: string; // the section header it sits under
  sectionStart: boolean; // first piece under its header
  module: string;
  exported: boolean;
  dropped: boolean; // replaced by hand-written code elsewhere
  text: string; // its source text, for matching rules
};

export type Ref = {
  from: number;
  to: number;
  name: string;
  node: ts.Identifier;
  write: boolean;
  evalTime: boolean; // runs while the module is evaluated, not later from a function
  callee: boolean;
  typeOnly: boolean;
};

export type Analysis = {
  sf: ts.SourceFile;
  text: string;
  pieces: Piece[];
  refs: Ref[];
  locals: Map<ts.Identifier, ts.Symbol>; // identifiers inside sub-pieces that resolve to the enclosing function's locals
  checker: ts.TypeChecker;
};

const NOT_EVAL_CALLS = new Set(["addEventListener", "setInterval", "setTimeout", "requestAnimationFrame", "then", "catch", "finally", "observe", "ResizeObserver", "MutationObserver", "IntersectionObserver", "watch"]);

export function parse(file: string, text: string, kind: ts.ScriptKind) {
  const options: ts.CompilerOptions = { allowJs: true, noLib: true, noResolve: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, types: [] };
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, kind);
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => (name === file ? sf : undefined);
  host.fileExists = (name) => name === file;
  host.readFile = (name) => (name === file ? text : undefined);
  const program = ts.createProgram([file], options, host);
  return { sf: program.getSourceFile(file)!, checker: program.getTypeChecker() };
}

export function bindingNames(n: ts.BindingName, out: ts.Identifier[]) {
  if (ts.isIdentifier(n)) out.push(n);
  else for (const e of n.elements) if (!ts.isOmittedExpression(e)) bindingNames(e.name, out);
}

// Where a statement's own text ends: after any comment on the same line, which TypeScript would give the next one.
function trailingEnd(text: string, pos: number) {
  let end = pos;
  for (const c of ts.getTrailingCommentRanges(text, pos) ?? []) end = c.end;
  return end;
}

export function declaredBy(st: ts.Statement): { kind: Piece["kind"]; ids: ts.Identifier[] } {
  const ids: ts.Identifier[] = [];
  if (ts.isFunctionDeclaration(st) && st.name) return { kind: "fn", ids: [st.name] };
  if (ts.isClassDeclaration(st) && st.name) return { kind: "class", ids: [st.name] };
  if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) return { kind: "type", ids: [st.name] };
  if (ts.isVariableStatement(st)) {
    for (const d of st.declarationList.declarations) bindingNames(d.name, ids);
    return { kind: "var", ids };
  }
  if (ts.isImportDeclaration(st)) {
    const c = st.importClause;
    if (c?.name) ids.push(c.name);
    if (c?.namedBindings) {
      if (ts.isNamespaceImport(c.namedBindings)) ids.push(c.namedBindings.name);
      else for (const s of c.namedBindings.elements) ids.push(s.name);
    }
    return { kind: "import", ids };
  }
  return { kind: "expr", ids };
}

export type CutPlan = {
  sectionRe: RegExp; // a header comment line; group 1 is the title
  // Which module a declared name belongs to, or undefined to decide by position.
  moduleOfName(name: string): string | undefined;
  // Split a multi-declarator `let a, b` when its names belong to different modules.
  splitDeclarators: boolean;
};

// Cuts the file into pieces. Pieces cover the text end to end, so nothing is lost between them.
export function cut(text: string, sf: ts.SourceFile, plan: CutPlan): Piece[] {
  const pieces: Piece[] = [];
  let section = "";
  let prevEnd = 0;
  const stmts = sf.statements;
  for (let i = 0; i < stmts.length; i++) {
    const st = stmts[i];
    const start = prevEnd;
    const end = i === stmts.length - 1 ? text.length : trailingEnd(text, st.end);
    prevEnd = end;
    const trivia = text.slice(start, st.getStart());
    let sectionStart = false;
    for (const line of trivia.split("\n")) {
      const h = line.match(plan.sectionRe);
      if (h) { section = h[1].trim(); sectionStart = true; }
    }
    const { kind, ids } = declaredBy(st);
    const base = { node: st as ts.Node, head: "", tail: "", kind, section, sectionStart, module: "", exported: false, dropped: false };
    if (plan.splitDeclarators && ts.isVariableStatement(st) && st.declarationList.declarations.length > 1) {
      const decls = st.declarationList.declarations;
      const mods = new Set(decls.map((d) => { const n: ts.Identifier[] = []; bindingNames(d.name, n); return plan.moduleOfName(n[0].text) ?? "?"; }));
      if (mods.size > 1) {
        const kw = st.declarationList.flags & ts.NodeFlags.Const ? "const" : st.declarationList.flags & ts.NodeFlags.Let ? "let" : "var";
        decls.forEach((d, j) => {
          const n: ts.Identifier[] = [];
          bindingNames(d.name, n);
          const lead = j === 0 ? text.slice(start, st.getStart()) : "\n";
          const last = j === decls.length - 1;
          pieces.push({
            ...base, idx: pieces.length, node: d, start: d.getStart(), end: d.end,
            head: `${lead}${kw} `, tail: last ? ";" + text.slice(st.end, end) : ";", exportAt: -1,
            names: n.map((x) => x.text), nameNodes: n, sectionStart: sectionStart && j === 0, text: text.slice(d.getStart(), d.end),
          });
        });
        continue;
      }
    }
    const exportAt = kind === "expr" || kind === "import" ? -1 : st.getStart();
    pieces.push({ ...base, idx: pieces.length, start, end, exportAt, names: ids.map((x) => x.text), nameNodes: ids, text: text.slice(st.getStart(), st.end) });
  }
  return pieces;
}

// A piece cut out of another piece (one property of a big object, one route of the request handler).
export function subPiece(pieces: Piece[], parent: Piece, node: ts.Node, start: number, end: number, extra: Partial<Piece>): Piece {
  const p: Piece = {
    idx: pieces.length, node, start, end, head: "", tail: "", exportAt: -1, names: [], nameNodes: [], kind: "part",
    section: parent.section, sectionStart: false, module: "", exported: false, dropped: false, text: "", ...extra,
  };
  pieces.push(p);
  return p;
}

function isWriteTarget(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isBinaryExpression(p) && p.left === id && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return true;
  if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) return true;
  return false;
}

function inDestructuringAssignment(id: ts.Identifier): boolean {
  for (let n: ts.Node = id; n.parent; n = n.parent) {
    const p = n.parent;
    if (ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && (ts.isObjectLiteralExpression(n) || ts.isArrayLiteralExpression(n))) return true;
    if (!(ts.isObjectLiteralExpression(p) || ts.isArrayLiteralExpression(p) || ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p) || ts.isSpreadElement(p) || ts.isSpreadAssignment(p))) return false;
  }
  return false;
}

// A function value that is stored, handed to the event loop or attached to an object runs later, not now.
function deferred(fn: ts.Node): boolean {
  const p = fn.parent;
  if (ts.isVariableDeclaration(p) && p.initializer === fn) return true;
  if (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) return true;
  if (ts.isBinaryExpression(p) && p.right === fn) return true;
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
    const c = p.expression;
    const name = ts.isPropertyAccessExpression(c) ? c.name.text : ts.isIdentifier(c) ? c.text : "";
    return NOT_EVAL_CALLS.has(name);
  }
  return false;
}

function evalTime(id: ts.Node, root: ts.Node): boolean {
  for (let n = id.parent; n && n !== root.parent; n = n.parent) {
    if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isConstructorDeclaration(n)) return false;
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && deferred(n)) return false;
  }
  return true;
}

function isTypePosition(id: ts.Identifier): boolean {
  for (let n: ts.Node = id; n.parent; n = n.parent) {
    if (ts.isTypeNode(n.parent) || ts.isTypeReferenceNode(n.parent) || ts.isTypeQueryNode(n.parent) || ts.isExpressionWithTypeArguments(n.parent)) return true;
    if (ts.isExpression(n.parent) || ts.isStatement(n.parent)) return false;
  }
  return false;
}

// Finds every use of a top-level binding and which piece it is in. Pieces nested in another (sub-pieces) win.
export function link(a: { sf: ts.SourceFile; checker: ts.TypeChecker; text: string; pieces: Piece[] }, localScopes: ts.Node[] = []): Analysis {
  const { sf, checker, text, pieces } = a;
  const top = new Map<ts.Symbol, number>();
  for (const p of pieces) for (const n of p.nameNodes) {
    const s = checker.getSymbolAtLocation(n);
    if (s) top.set(s, p.idx);
  }
  const declNodes = new Set(pieces.flatMap((p) => p.nameNodes));
  const order = [...pieces].sort((x, y) => (y.kind === "part" ? 1 : 0) - (x.kind === "part" ? 1 : 0));
  const pieceAt = (pos: number) => order.find((p) => pos >= p.start && pos < p.end);
  const refs: Ref[] = [];
  const locals = new Map<ts.Identifier, ts.Symbol>();
  const errors: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n) && !declNodes.has(n)) {
      let s: ts.Symbol | undefined;
      if (ts.isShorthandPropertyAssignment(n.parent) && n.parent.name === n) s = checker.getShorthandAssignmentValueSymbol(n.parent);
      else s = checker.getSymbolAtLocation(n);
      const from = pieceAt(n.getStart());
      if (s && top.has(s) && from) {
        const to = top.get(s)!;
        const write = isWriteTarget(n);
        if (inDestructuringAssignment(n)) errors.push(`${n.text}: assigned by destructuring at ${pos(sf, n)}; split it by hand`);
        refs.push({ from: from.idx, to, name: n.text, node: n, write, evalTime: evalTime(n, from.node), callee: ts.isCallExpression(n.parent) && n.parent.expression === n, typeOnly: isTypePosition(n) });
      } else if (s && from?.kind === "part" && localScopes.length) {
        const d = s.declarations?.[0];
        if (d && localScopes.some((sc) => d.pos >= sc.pos && d.end <= sc.end) && !(d.pos >= from.start && d.end <= from.end)) locals.set(n, s);
      } else if (!s && isWriteTarget(n)) {
        errors.push(`${n.text}: assigned at ${pos(sf, n)} but never declared; modules are strict, so declare it`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (errors.length) throw new Error(errors.join("\n"));
  return { sf, text, pieces, refs, locals, checker };
}

export function pos(sf: ts.SourceFile, n: ts.Node) {
  const { line, character } = sf.getLineAndCharacterOfPosition(n.getStart());
  return `line ${line + 1}:${character + 1}`;
}

// ---- output ----

export type Edit = { start: number; end: number; text: string };

export function render(text: string, start: number, end: number, edits: Edit[]): string {
  const inside = edits.filter((e) => e.start >= start && e.end <= end).sort((x, y) => y.start - x.start);
  let out = text.slice(start, end);
  let floor = end;
  for (const e of inside) {
    if (e.end > floor) throw new Error(`overlapping edits at ${e.start}`);
    out = out.slice(0, e.start - start) + e.text + out.slice(e.end - start);
    floor = e.start;
  }
  return out;
}

export const setterName = (name: string, taken: Set<string>) => {
  let s = `set${name[0].toUpperCase()}${name.slice(1)}`;
  while (taken.has(s)) s += "Value";
  return s;
};

// Rewrites `x = v`, `x += v` and `x++` in a module that does not own x into a call to x's setter.
export function setterEdit(a: Analysis, r: Ref, setter: string): Edit {
  const id = r.node, p = id.parent, t = a.text;
  if (ts.isBinaryExpression(p)) {
    const rhs = t.slice(p.right.getStart(), p.right.end);
    const op = p.operatorToken.kind;
    if (op === ts.SyntaxKind.EqualsToken) return { start: p.getStart(), end: p.end, text: `${setter}(${rhs})` };
    const bin = ts.tokenToString(op)!.slice(0, -1);
    return { start: p.getStart(), end: p.end, text: `${setter}(${id.text} ${bin} (${rhs}))` };
  }
  if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && ts.isExpressionStatement(p.parent)) {
    return { start: p.getStart(), end: p.end, text: `${setter}(${id.text} ${p.operator === ts.SyntaxKind.PlusPlusToken ? "+" : "-"} 1)` };
  }
  throw new Error(`${id.text}: cannot rewrite the write at ${pos(a.sf, id)}`);
}

// ---- evaluation order ----
// ES modules run their dependencies first. A statement that runs at load time and reads another module's let or
// const must find that module already run, or the browser throws. This walks the import graph the way the browser
// does and reports every read that would find a binding not yet set.
export function checkOrder(a: Analysis, entry: string[], deps: Map<string, string[]>): string[] {
  const state = new Map<string, "visiting" | "done">();
  const problems: string[] = [];
  const modOf = (i: number) => a.pieces[i].module;
  const fnRefs = new Map<number, Ref[]>();
  for (const r of a.refs) (fnRefs.get(r.from) ?? fnRefs.set(r.from, []).get(r.from)!).push(r);
  const callReach = (fn: number, m: string, seen = new Set<number>()): Ref[] => {
    if (seen.has(fn)) return [];
    seen.add(fn);
    const out: Ref[] = [];
    for (const r of fnRefs.get(fn) ?? []) {
      if (r.typeOnly) continue;
      const tp = a.pieces[r.to];
      if (tp.kind === "fn") out.push(...callReach(r.to, m, seen));
      else if (modOf(r.to) !== m) out.push(r);
    }
    return out;
  };
  const check = (m: string) => {
    for (const r of a.refs) {
      if (!r.evalTime || r.typeOnly || modOf(r.from) !== m || a.pieces[r.from].dropped) continue;
      const tm = modOf(r.to), tp = a.pieces[r.to];
      if (tp.kind === "import") continue;
      // a call at load runs the function now, wherever it lives: everything it reads must be set
      if (tp.kind === "fn") {
        if (!r.callee) continue;
        for (const x of callReach(r.to, m)) {
          const xm = modOf(x.to);
          if (state.get(xm) !== "done" && a.pieces[x.to].kind !== "fn" && a.pieces[x.to].kind !== "import")
            problems.push(`${m}: calls ${r.name}() at load (${pos(a.sf, r.node)}), which reads ${x.name} from ${xm} before ${xm} has run`);
        }
        continue;
      }
      if (tm !== m && state.get(tm) !== "done") problems.push(`${m}: reads ${r.name} at load (${pos(a.sf, r.node)}) before ${tm} has run`);
    }
  };
  const visit = (m: string) => {
    if (state.has(m)) return;
    state.set(m, "visiting");
    for (const d of deps.get(m) ?? []) visit(d);
    check(m);
    state.set(m, "done");
  };
  for (const m of entry) visit(m);
  return [...new Set(problems)];
}

export function dedent(s: string, n: number) {
  const pad = " ".repeat(n);
  return s.split("\n").map((l, i) => (i > 0 && l.startsWith(pad) ? l.slice(n) : l)).join("\n");
}

export const slug = (title: string) =>
  title.split(/[:,(]/)[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").split("-").slice(0, 3).join("-") || "misc";

// A file's opening comment, wrapped at 115 columns.
export function comment(text: string, width = 115) {
  const lines: string[] = [];
  let line = "//";
  for (const w of text.split(/\s+/)) {
    if (line.length + 1 + w.length > width && line !== "//") { lines.push(line); line = "//"; }
    line += " " + w;
  }
  lines.push(line);
  return lines.join("\n") + "\n";
}
