'use strict'

const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '..')

if (!process.env.NEXT_PUBLIC_PLAN_CAPABILITIES) {
  const planPath = path.resolve(projectRoot, '..', 'plan-capabilities.json')
  process.env.NEXT_PUBLIC_PLAN_CAPABILITIES = fs.readFileSync(planPath, 'utf8')
}

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy'
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy'
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_dummy'

const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveWithAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const withoutAlias = request.slice(2)
    const candidate = path.join(projectRoot, withoutAlias)
    return originalResolveFilename.call(this, candidate, parent, isMain, options)
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

const compileTs = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      skipLibCheck: true,
    },
    fileName: filename,
  })
  module._compile(transpiled.outputText, filename)
}

Module._extensions['.ts'] = compileTs
Module._extensions['.tsx'] = compileTs
