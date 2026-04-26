// Discriminated union for every write/read wrapper. Synthesis §4
// invariant: "errors never silent." Minimal shape; no third-party dep.

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}
