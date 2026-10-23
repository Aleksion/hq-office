// Turns the pieces of a split into module files: imports, the pieces' own text, exports and setters.
import { posix } from "node:path";
import ts from "typescript";
import { type Analysis, type Edit, type Piece, render, setterEdit, setterName } from "./split.ts";

export type EmitOptions = {
  ext: ".js" | ".ts";
  header(module: string): string; // the file's opening comment
  sectionRe: RegExp; // header lines dropped from the pieces' comments (each file has its own header)
  // How a piece is written, when not as plain source (a route, an event's art). Return null for the default.
  custom?(p: Piece, body: (s: number, e: number) => string): string | null;
  // Imports a custom piece needs beyond what the linker finds.
  extraImports?: Map<string, string[]>;
  // Lines added at the end of a module.
  extraTail?: Map<string, string>;
  // An import declaration's module specifier as seen from another file.
  respec(spec: string, fromModule: string): string;
};

export type Emitted = { files: Map<string, string>; deps: Map<string, string[]>; setters: string[] };

const rel = (from: string, to: string) => {
  const r = posix.relative(posix.dirname(from), to);
  return r.startsWith(".") ? r : `./${r}`;
};

export function emit(a: Analysis, o: EmitOptions): Emitted {
  const { pieces, refs, text } = a;
  const edits: Edit[] = [];
  const mod = (i: number) => pieces[i].module;
  const firstIdx = new Map<string, number>();
  for (const p of pieces) if (!firstIdx.has(p.module)) firstIdx.set(p.module, p.idx);

  // setters for bindings assigned from another module
  const taken = new Set(pieces.flatMap((p) => p.names));
  const setterOf = new Map<number, Map<string, string>>(); // piece -> name -> setter
  const setters: string[] = [];
  const imports = new Map<string, Map<string, Map<string, boolean>>>(); // module -> from module -> name -> typeOnly
  const need = (m: string, from: string, name: string, typeOnly: boolean) => {
    const byMod = imports.get(m) ?? imports.set(m, new Map()).get(m)!;
    const names = byMod.get(from) ?? byMod.set(from, new Map()).get(from)!;
    names.set(name, (names.get(name) ?? true) && typeOnly);
  };
  for (const r of refs) {
    const fm = mod(r.from), tm = mod(r.to);
    if (fm === tm) continue;
    const tp = pieces[r.to];
    if (tp.kind !== "import") tp.exported = true;
    if (r.write) {
      const byName = setterOf.get(r.to) ?? setterOf.set(r.to, new Map()).get(r.to)!;
      let s = byName.get(r.name);
      if (!s) {
        s = setterName(r.name, taken);
        taken.add(s);
        byName.set(r.name, s);
        setters.push(`${tm}: ${s}() for ${r.name}, assigned from ${fm}`);
      }
      edits.push(setterEdit(a, r, s));
      need(fm, tm, s, false);
      continue;
    }
    need(fm, tm, r.name, r.typeOnly || tp.kind === "type");
  }
  for (const p of pieces) {
    if (!p.exported || p.dropped) continue;
    if (p.exportAt >= 0) edits.push({ start: p.exportAt, end: p.exportAt, text: "export " });
    else if (p.kind === "var") p.head = p.head.replace(/(const|let|var) $/, "export $1 ");
  }

  const body = (s: number, e: number) => render(text, s, e, edits);
  const files = new Map<string, string>();
  const deps = new Map<string, string[]>();
  const modules = [...new Set(pieces.filter((p) => !p.dropped).map((p) => p.module))].filter((m) => m && m !== "(external)");
  for (const m of modules) {
    const own = pieces.filter((p) => p.module === m && !p.dropped).sort((x, y) => x.start - y.start);
    let out = "";
    for (const p of own) {
      const custom = o.custom?.(p, body);
      out += custom ?? p.head + body(p.start, p.end) + p.tail;
    }
    out = out
      .split("\n")
      .filter((l) => !o.sectionRe.test(l))
      .join("\n")
      .replace(/^\s*\n/, "")
      .replace(/\s*$/, "\n");
    // setters at the end: function declarations, so a module that runs first can still call them
    for (const [i, byName] of setterOf) {
      if (mod(i) !== m) continue;
      for (const [name, s] of byName) out += `export function ${s}(v) { return (${name} = v); }\n`;
    }
    if (o.ext === ".ts") out = out.replace(/export function (set\w+)\(v\) \{ return \((\w+) = v\); \}/g, "export function $1(v: typeof $2) { return ($2 = v); }");
    if (o.extraTail?.get(m)) out += o.extraTail.get(m);

    // imports: outside packages first, then this project's modules in the order they first appear in the source
    const lines: string[] = [];
    const external = new Map<string, string[]>();
    const order: string[] = [];
    for (const [from, names] of [...(imports.get(m) ?? new Map())].sort((x, y) => (firstIdx.get(x[0]) ?? 0) - (firstIdx.get(y[0]) ?? 0))) {
      if (from === "(external)") {
        for (const [name] of names) {
          const decl = pieces.find((p) => p.kind === "import" && p.names.includes(name))!;
          const imp = decl.node as ts.ImportDeclaration;
          const spec = o.respec((imp.moduleSpecifier as ts.StringLiteral).text, m);
          const c = imp.importClause!;
          const typeOnly = c.isTypeOnly;
          const key = `${typeOnly ? "type " : ""}${spec}`;
          let part: string;
          if (c.name?.text === name) part = `default:${name}`;
          else if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) part = `ns:${name}`;
          else {
            const el = (c.namedBindings as ts.NamedImports).elements.find((e) => e.name.text === name)!;
            part = el.propertyName ? `${el.propertyName.text} as ${name}` : name;
            if (el.isTypeOnly) part = `type ${part}`;
          }
          (external.get(key) ?? external.set(key, []).get(key)!).push(part);
        }
        continue;
      }
      order.push(from);
      const vals = [...names].filter(([, t]) => !t).map(([n]) => n).sort();
      const types = [...names].filter(([, t]) => t).map(([n]) => n).sort();
      const spec = rel(m, from);
      if (vals.length) lines.push(`import { ${vals.join(", ")} } from "${spec}";`);
      if (types.length) lines.push(`import type { ${types.join(", ")} } from "${spec}";`);
    }
    const ext: string[] = [];
    for (const [key, parts] of external) {
      const typeOnly = key.startsWith("type ");
      const spec = typeOnly ? key.slice(5) : key;
      const def = parts.find((p) => p.startsWith("default:"))?.slice(8);
      const ns = parts.find((p) => p.startsWith("ns:"))?.slice(3);
      const named = parts.filter((p) => !p.startsWith("default:") && !p.startsWith("ns:")).sort();
      const clause = [def, ns && `* as ${ns}`, named.length && `{ ${named.join(", ")} }`].filter(Boolean).join(", ");
      ext.push(`import ${typeOnly ? "type " : ""}${clause} from "${spec}";`);
    }
    for (const line of o.extraImports?.get(m) ?? []) if (!lines.includes(line)) lines.push(line);
    deps.set(m, order);
    const imps = [...ext, ...lines].join("\n");
    files.set(m, `${o.header(m)}${imps ? imps + "\n\n" : ""}${out}`);
  }
  return { files, deps, setters };
}
