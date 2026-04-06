export async function readJsonBody<T>(request: Request): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    const data = (await request.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}
