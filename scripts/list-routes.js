import { readFile } from 'node:fs/promises'

const routerSource = await readFile(new URL('../src/js/router.js', import.meta.url), 'utf8')
const routePattern = /\{\s*path:\s*(['"])(.*?)\1(?:\s*,\s*name:\s*(['"])(.*?)\3)?/gs

const routes = [...routerSource.matchAll(routePattern)].map((match) => ({
  name: match[4] ?? '(unnamed)',
  path: match[2]
}))
const nameWidth = Math.max(...routes.map(({ name }) => name.length))

for (const { name, path } of routes) {
  console.log(`${name.padEnd(nameWidth)}  ${path}`)
}