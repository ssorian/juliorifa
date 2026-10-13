import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Vercel preset is build-only and fixture evaluates serve config', () => {
  const config = readFileSync('vite.config.ts', 'utf8')
  assert.match(config, /preset: command === 'build' \? 'vercel' : undefined/)
  const fixture = readFileSync('vite.e2e.config.ts', 'utf8')
  assert.match(fixture, /baseConfig\(\{ command: 'serve', mode: 'development' \}\)/)
  assert.ok(readFileSync('.gitignore', 'utf8').split('\n').includes('.vercel/'))
  assert.deepEqual(JSON.parse(readFileSync('vercel.json', 'utf8')).crons ?? [], [])
})
