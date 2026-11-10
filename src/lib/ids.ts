const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Audit ids are UUIDs; anything else is a 404 before it reaches a uuid column. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
