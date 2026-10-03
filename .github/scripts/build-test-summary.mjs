// Parses the vitest/Playwright JSON reporter artifacts (if present) into
// one structured summary.json for the OpenRouter formatting step.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function findJsonFile(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return null
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      const nested = findJsonFile(full)
      if (nested) return nested
    } else if (entry.endsWith('.json')) {
      return full
    }
  }
  return null
}

// ponytail: parses the Jest-compatible shape vitest's json reporter emits
// today (vitest ^4.1). A vitest major bump that changes this shape will
// surface as "parse error" rows rather than a silent miscount.
function parseVitest(dir, suite) {
  const file = findJsonFile(dir)
  if (!file) return { suite, status: 'did not run' }
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    const failedTests = []
    let start = Infinity
    let end = -Infinity
    for (const fileResult of data.testResults ?? []) {
      if (typeof fileResult.startTime === 'number') start = Math.min(start, fileResult.startTime)
      if (typeof fileResult.endTime === 'number') end = Math.max(end, fileResult.endTime)
      for (const assertion of fileResult.assertionResults ?? []) {
        if (assertion.status === 'failed') {
          failedTests.push({
            name: assertion.fullName || assertion.title,
            error: (assertion.failureMessages?.[0] ?? '').split('\n')[0],
          })
        }
      }
    }
    return {
      suite,
      status: 'ran',
      passed: data.numPassedTests ?? 0,
      failed: data.numFailedTests ?? 0,
      skipped: data.numPendingTests ?? 0,
      durationMs: Number.isFinite(end - start) && end >= start ? end - start : null,
      failedTests,
    }
  } catch (err) {
    return { suite, status: 'parse error', error: String(err) }
  }
}

// ponytail: same ceiling as parseVitest, pinned to Playwright's own
// JSONReport schema (^1.63) instead of vitest's.
function parsePlaywright(dir, suite) {
  const file = findJsonFile(dir)
  if (!file) return { suite, status: 'did not run' }
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    const failedTests = []
    const walk = (node) => {
      for (const spec of node.specs ?? []) {
        for (const test of spec.tests ?? []) {
          for (const result of test.results ?? []) {
            if (result.status && result.status !== 'passed' && result.status !== 'skipped') {
              failedTests.push({
                name: spec.title,
                error: (result.error?.message ?? '').split('\n')[0],
              })
            }
          }
        }
      }
      for (const child of node.suites ?? []) walk(child)
    }
    for (const top of data.suites ?? []) walk(top)
    const stats = data.stats ?? {}
    return {
      suite,
      status: 'ran',
      passed: (stats.expected ?? 0) + (stats.flaky ?? 0),
      failed: stats.unexpected ?? 0,
      skipped: stats.skipped ?? 0,
      durationMs: stats.duration ?? null,
      failedTests,
    }
  } catch (err) {
    return { suite, status: 'parse error', error: String(err) }
  }
}

const summary = {
  sha: process.env.HEAD_SHA ?? 'unknown',
  suites: [
    parseVitest('artifacts/client-test-results', 'client'),
    parseVitest('artifacts/server-test-results', 'server'),
    parsePlaywright('artifacts/e2e-test-results', 'e2e'),
  ],
}

writeFileSync('summary.json', JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
