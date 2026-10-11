const maxGlobal = 32;
const maxPerActor = 8;
const activeByActor = new Map<string, number>();
let active = 0;
const counts = new Map<string, number>();
const durationBuckets = [10, 50, 100, 250, 500, 1000, 5000, Infinity];
const durations = new Map<string, number[]>();

export function enter(actorId: string): (() => void) | null {
  const current = activeByActor.get(actorId) ?? 0;
  if (active >= maxGlobal || current >= maxPerActor) return null;
  active += 1;
  activeByActor.set(actorId, current + 1);
  let left = false;
  return () => {
    if (left) return;
    left = true;
    active -= 1;
    const remaining = (activeByActor.get(actorId) ?? 1) - 1;
    if (remaining <= 0) activeByActor.delete(actorId);
    else activeByActor.set(actorId, remaining);
  };
}

export function observeTool(tool: string, outcome: 'ok' | 'error', elapsedMs: number): void {
  const key = `${tool}:${outcome}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
  const observed = durations.get(key) ?? durationBuckets.map(() => 0);
  durationBuckets.forEach((bucket, index) => { if (elapsedMs <= bucket) observed[index] += 1; });
  durations.set(key, observed);
}

export function metrics(): string {
  const lines = ['# TYPE mcp_requests_in_flight gauge', `mcp_requests_in_flight ${active}`, '# TYPE mcp_tool_calls_total counter', '# TYPE mcp_tool_duration_ms histogram'];
  for (const [key, count] of counts) {
    const [tool, outcome] = key.split(':');
    const labels = `tool="${tool}",outcome="${outcome}"`;
    lines.push(`mcp_tool_calls_total{${labels}} ${count}`);
    const buckets = durations.get(key) ?? [];
    durationBuckets.forEach((bound, index) => lines.push(`mcp_tool_duration_ms_bucket{${labels},le="${bound === Infinity ? '+Inf' : bound}"} ${buckets[index] ?? 0}`));
    lines.push(`mcp_tool_duration_ms_count{${labels}} ${count}`);
  }
  return `${lines.join('\n')}\n`;
}
