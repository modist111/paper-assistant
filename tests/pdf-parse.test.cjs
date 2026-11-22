const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const parsePath = path.resolve(__dirname, "../src/lib/pdf/parse.ts");
const source = fs.readFileSync(parsePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
});
const parseModule = new Module(parsePath, module);
parseModule.filename = parsePath;
parseModule.paths = Module._nodeModulePaths(path.dirname(parsePath));
parseModule._compile(compiled.outputText, parsePath);
const { parsePdfBuffer } = parseModule.exports;

test("extracts text from a PDF inside a Buffer slice", async () => {
  const fixture = fs.readFileSync(path.join(__dirname, "fixtures/paper-smoke.pdf"));
  const backing = Buffer.allocUnsafeSlow(fixture.length + 32);
  fixture.copy(backing, 16);
  const bufferSlice = backing.subarray(16, 16 + fixture.length);

  const result = await parsePdfBuffer(bufferSlice);
  assert.equal(result.pageCount, 1);
  assert.match(result.text, /vector retrieval and cited question answering/);
});
