import bcrypt from 'bcryptjs'

// specification.md §8.5: bcryptjs, cost 10, same as the seed and migration.
const COST = 10

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST)

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash)

// specification.md BR-10: 8+ chars with upper, lower, digit and special.
export function isStrongPassword(password: unknown): boolean {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  )
}
