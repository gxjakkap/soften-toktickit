# client

Vite + React 19 + React Router 7 in TypeScript. Bootstrap 5 supplies the base; the Zen Green layer sits on top.

## Structure

One component file per screen or shared piece, flat in `src/` (`MyTickets.tsx`, `badges.tsx`); helpers go in `src/lib/`. Routes are declared in `App.tsx`; Requester-scoped screens sit under `RequireRequester`, which remounts them on a requester switch (FR-13) so data reloads.

## Requests

Every request goes through `src/apiClient.ts` using relative `/api/...` URLs (Vite proxies them to the server). It turns failures into `ApiError` (`message`, `field`, `code`) and fires `requesterInvalidated` on `INVALID_REQUESTER` (BR-12). Screens catch `ApiError` and show `message`, or attach it to the input named by `field`.

Add an endpoint as a typed function in `apiClient.ts`, with its types in `types.ts`.

## Styling

Design tokens (`--zg-*`) and `.zg-*` classes live in `src/zen-green.css`, defined by `ui-spec.md`. Reuse them; a new screen adds its rules to that file. Every screen holds at phone width with no horizontal scroll.

## Tests

Vitest + jsdom + Testing Library. The pattern in `tests/lab-02/`:

- Stub `global.fetch` with a `vi.fn` that answers by URL and rejects unknown URLs (`unexpected fetch: ...`), so an unplanned request fails the test.
- Render `AppRoutes` inside `MemoryRouter` and `RequesterProvider`, with the requester pre-seeded in `localStorage` under `REQUESTER_STORAGE_KEY`.
- Query by role and accessible name, as a user would.
