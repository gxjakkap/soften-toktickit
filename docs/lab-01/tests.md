# Tests

## API

| Test ID | Tool | Test Description |
| --- | --- | --- |
| 1 | Supertest | `server/src/app.test.ts` › GET /api/health › returns ok status — requests `GET /api/health` and asserts a `200` response with body `{ status: 'ok', service: 'TokTickIT API' }`. |
| 2 | Supertest | `server/src/app.test.ts` › GET /api/categories › returns all categories ordered by id ascending — requests `GET /api/categories` and asserts a `200` response whose body matches a live Prisma `findMany` query ordered by `id` ascending. |

## UI

| Test ID | Tool | Test Description |
| --- | --- | --- |
| 1 | Vitest | `client/src/App.test.tsx` › App › renders without crashing — renders the `App` component and asserts an `<h1>` element is present in the output. |
| 2 | Vitest | `client/src/CategoryList.test.tsx` › CategoryList › shows a loading state before the request resolves — renders `CategoryList` with a `fetch` that never resolves and asserts the loading text is shown. |
| 3 | Vitest | `client/src/CategoryList.test.tsx` › CategoryList › renders categories once the request resolves — renders `CategoryList` with a mocked `fetch` returning categories and asserts each category name appears in the output. |
| 4 | Vitest | `client/src/CategoryList.test.tsx` › CategoryList › shows an error state when the request fails — renders `CategoryList` with a mocked `fetch` returning a `500` response and asserts the error text is shown. |
