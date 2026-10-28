/** External HTTP/cookie boundaries for specification tests; no domain decisions live here. */
export function json(value: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

export function form(values: Record<string, string | string[]>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : [value]) result.append(key, entry);
  }
  return result;
}

export function cookieJar(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const writes: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const deleted: string[] = [];
  return {
    values, writes, deleted,
    get: (name: string) => values.has(name) ? { name, value: values.get(name)! } : undefined,
    set: (name: string, value: string, options: Record<string, unknown>) => { values.set(name, value); writes.push({ name, value, options }); },
    delete: (name: string) => { values.delete(name); deleted.push(name); },
  };
}
