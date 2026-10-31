import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Issue #71: runs only e2e/lab-04/capture-screenshots.ts, on demand
// (`pnpm screenshots`). The default config's testMatch (*.spec.ts) never
// picks that file up, so `pnpm e2e` doesn't rewrite the committed PNGs.
export default defineConfig({
  ...base,
  testMatch: '**/lab-04/capture-screenshots.ts',
})
