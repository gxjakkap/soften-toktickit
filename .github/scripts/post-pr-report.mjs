// Edits the PR description in place (idempotent, marker-delimited); if
// that fails, posts a fresh PR comment instead — no dedup there, by
// design, so the comment history stays linear.
import { readFileSync } from 'node:fs'

const { GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, HEAD_SHA } = process.env
const [owner, repo] = GITHUB_REPOSITORY.split('/')
const report = readFileSync('report.md', 'utf8')

const START = '<!-- test-results:start -->'
const END = '<!-- test-results:end -->'
const block = `${START}\n## Test results (${HEAD_SHA.slice(0, 7)})\n\n${report}\n${END}`

const api = (path, init) =>
  fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

const pr = await (await api(`/pulls/${PR_NUMBER}`)).json()
const body = pr.body ?? ''

const hasMarkers = body.includes(START) && body.includes(END)
const newBody = hasMarkers
  ? body.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block)
  : `${body}\n\n${block}`

const editRes = await api(`/pulls/${PR_NUMBER}`, {
  method: 'PATCH',
  body: JSON.stringify({ body: newBody }),
})

if (!editRes.ok) {
  await api(`/issues/${PR_NUMBER}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: block }),
  })
}
