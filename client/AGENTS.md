# client

Vite + React 19 + React Router 7 in TypeScript. Bootstrap 5 supplies the base; the Zen Green layer sits on top.

## Structure

One component file per screen or shared piece, flat in `src/` (`MyTickets.tsx`, `badges.tsx`); helpers go in `src/lib/`. Routes are declared in `App.tsx`; protected screens sit under `RequireAuth`, which remounts them on a session change so data reloads.

## Requests

Every request goes through `src/apiClient.ts` using relative `/api/...` URLs (Vite proxies them to the server) and the session cookie, never a client-supplied id. It turns failures into `ApiError` (`message`, `field`, `code`) and fires `sessionInvalidated` on `UNAUTHENTICATED`. Screens catch `ApiError` and show `message`, or attach it to the input named by `field`.

Add an endpoint as a typed function in `apiClient.ts`, with its types in `types.ts`.

## Styling

Design tokens (`--zg-*`) and `.zg-*` classes live in `src/zen-green.css`, defined by `ui-spec.md`. Reuse them; a new screen adds its rules to that file. Every screen holds at phone width with no horizontal scroll.

## Tests

Vitest + jsdom + Testing Library. The pattern in `tests/lab-02/` and `tests/lab-03/`:

- Stub `global.fetch` with a `vi.fn` that answers by URL and rejects unknown URLs (`unexpected fetch: ...`), so an unplanned request fails the test. Include a `/api/auth/me` case returning the fixture user from `tests/helpers/auth.ts` — `AuthProvider` fetches it on mount.
- Render `AppRoutes` inside `MemoryRouter` and `AuthProvider`.
- Query by role and accessible name, as a user would.
