import { cleanFixtures } from './clean-fixtures.js'

// PR #55 review round 2: without this, a crashed or interrupted prior run's
// fixture debris survives into the next run and can still show up in the
// screenshot specs, even with the teardown below in place.
export default function globalSetup() {
  cleanFixtures()
}
