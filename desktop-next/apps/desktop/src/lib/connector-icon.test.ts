import { expect, it } from 'vitest'

import { connectorIconUrl, connectorSubject } from './connector-tools'

// Vendor logos used to load from a hosted registry; none is requested now.
it('requests no hosted vendor logo for any connector', () => {
  expect(connectorIconUrl('github')).toBeUndefined()
  expect(connectorSubject('github').iconUrl).toBeUndefined()
})
