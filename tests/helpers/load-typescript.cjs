const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');

// Use the project's compiler and Node's test runner; no test dependencies needed.
module.exports = function loadTypeScript(relativePath, { imports = {}, globals = {} } = {}) {
  const filename = path.resolve(__dirname, '../..', relativePath);
  assert.ok(fs.existsSync(filename), `Feature module must exist: ${relativePath}`);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  });
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: (name) => Object.hasOwn(imports, name) ? imports[name] : nativeRequire(name),
    console, fetch, AbortController, setTimeout, clearTimeout,
    ...globals,
  }, { filename });
  return module.exports;
};
