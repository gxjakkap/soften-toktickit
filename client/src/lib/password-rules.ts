// specification.md BR-10: the live checklist for an Administrator-set password.
// The server stays the authority (api-spec.md §5.2, §5.4); this only gives
// feedback while typing.
export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'A number', test: (p) => /\d/.test(p) },
  { label: 'A special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
]

export const isStrongPassword = (p: string): boolean => PASSWORD_RULES.every((r) => r.test(p))
