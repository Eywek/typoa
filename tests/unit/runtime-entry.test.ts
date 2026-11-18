import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

const root = path.resolve(__dirname, '../..')

function loadedCompilerModules(
  entry: string,
  nodeArgs: string[] = []
): string[] {
  const script = `
    require(${JSON.stringify(entry)})
    const keys = Object.keys(require.cache).filter(k => /ts-morph|[\\\\/]typescript[\\\\/]/.test(k))
    process.stdout.write(JSON.stringify(keys))
  `
  const output = execFileSync(process.execPath, [...nodeArgs, '-e', script], {
    cwd: root,
    encoding: 'utf8'
  })
  return JSON.parse(output)
}

test('src/runtime does not load ts-morph or typescript', () => {
  assert.deepEqual(
    loadedCompilerModules('./src/runtime', ['--import', 'tsx']),
    []
  )
})

test(
  "require('typoa/runtime') does not load ts-morph or typescript",
  {
    skip: !fs.existsSync(path.join(root, 'build/runtime/index.js'))
      ? 'run `yarn build` first'
      : false
  },
  () => {
    assert.deepEqual(loadedCompilerModules('typoa/runtime'), [])
  }
)

test('src (generator entry) loads ts-morph, so the detection works', () => {
  const keys = loadedCompilerModules('./src', ['--import', 'tsx'])
  assert.ok(keys.some(k => k.includes('ts-morph')))
})
