// Posts the review guide and the test results as two separate bot comments.
// Each comment carries a marker; a rerun edits the matching comment in place
// instead of piling up a new one per push.
import { existsSync, readFileSync } from 'node:fs'

const { GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, HEAD_SHA } = process.env
const sha = HEAD_SHA.slice(0, 7)

const api = (path, init) =>
  fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

// ponytail: reads the first 100 comments only; page through if a PR ever
// gets enough discussion to push the bot comments past that.
const comments = await (await api(`/issues/${PR_NUMBER}/comments?per_page=100`)).json()

async function upsert(marker, body) {
  const full = `${marker}\n${body}`
  const existing = comments.find(
    (c) => c.user?.login === 'github-actions[bot]' && c.body?.startsWith(marker),
  )
  await api(existing ? `/issues/comments/${existing.id}` : `/issues/${PR_NUMBER}/comments`, {
    method: existing ? 'PATCH' : 'POST',
    body: JSON.stringify({ body: full }),
  })
}

if (existsSync('review-guide.md')) {
  await upsert(
    '<!-- review-guide -->',
    `## Review guide (${sha})\n\n${readFileSync('review-guide.md', 'utf8')}`,
  )
}
await upsert(
  '<!-- test-results -->',
  `## Test results (${sha})\n\n${readFileSync('report.md', 'utf8')}`,
)
