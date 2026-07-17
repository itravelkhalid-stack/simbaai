function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function readJson(response: Response) {
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const message =
      typeof json === "object" &&
      json &&
      "error" in json &&
      typeof (json as { error?: unknown }).error === "object"
        ? JSON.stringify((json as { error: unknown }).error)
        : text || response.statusText;
    throw new Error(message);
  }
  return json;
}

export { requireEnv };
