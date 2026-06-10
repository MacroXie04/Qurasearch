export function getDb(): never {
  throw new Error('database client lands in phase 1; set DATABASE_URL then')
}
