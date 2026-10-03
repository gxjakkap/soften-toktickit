// Formats summary.json into a markdown report via OpenRouter. Falls back
// to a deterministic plain table if the call fails, or if the numbers the
// model returns don't match the input — a flaky LLM call should never
// block the PR update, and it must never be trusted to invent counts.
import { readFileSync, writeFileSync } from 'node:fs'

const summary = JSON.parse(readFileSync('summary.json', 'utf8'))

function plainTable(summary) {
  const rows = summary.suites.map((s) => {
    const cell = (v) => (s.status === 'ran' ? v : '-')
    const duration =
      s.status === 'ran' && s.durationMs != null ? `${(s.durationMs / 1000).toFixed(1)}s` : s.status
    return `| ${s.suite} | ${cell(s.passed)} | ${cell(s.failed)} | ${cell(s.skipped)} | ${duration} |`
  })
  let md = `| Suite | Passed | Failed | Skipped | Duration |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`

  const failedRows = summary.suites.flatMap((s) =>
    (s.failedTests ?? []).map((t) => `| ${s.suite} | ${t.name} | ${t.error} |`),
  )
  if (failedRows.length > 0) {
    md += `\n**Failed tests**\n\n| Suite | Test | Error |\n| --- | --- | --- |\n${failedRows.join('\n')}\n`
  }
  return md
}

function countsMatch(markdown) {
  return summary.suites
    .filter((s) => s.status === 'ran')
    .every((s) => markdown.includes(String(s.passed)) && markdown.includes(String(s.failed)))
}

async function askOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return null

  const prompt = `You are formatting CI test results for a GitHub PR description.

Given this JSON (one entry per test suite, with exact passed/failed/skipped counts and any failed test names/errors), write:
1. One short sentence summarizing the overall outcome.
2. A markdown table with columns Suite | Passed | Failed | Skipped | Duration.
3. If any tests failed, a second markdown table listing Suite | Test | Error for each failed test.

Use ONLY the numbers given below — do not invent, round, or recompute any count or duration. A suite with status "did not run" or "parse error" should show "-" for its counts in the table.

${JSON.stringify(summary, null, 2)}`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-v4.1-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    }),
  })
  if (!res.ok) return null

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? null
}

const llmOutput = await askOpenRouter().catch(() => null)
const report = llmOutput && countsMatch(llmOutput) ? llmOutput : plainTable(summary)

writeFileSync('report.md', report)
