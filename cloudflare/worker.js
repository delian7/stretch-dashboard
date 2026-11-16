// stretch-sync: tiny D1-backed sync API for the Stretch Dashboard.
//   GET  /api/log?key=<key>     -> { key, value, updated_at } or 404
//   PUT  /api/log {key, value}  -> { ok, key, updated_at }
//   GET  /                      -> health check ("stretch-sync ok")
//
// D1 binding: DB (database stretch-logs, see schema.sql).
// No auth: personal stretch log, low sensitivity. Keys are allowlisted to
// the three dashboard key families, values must be JSON and <= 64 KiB.
// CORS is restricted to the dashboard hosts:
//   https://stretches.delianpetrov.com
//   https://*.stretch-dashboard.pages.dev

const ALLOWED_EXACT = new Set(["sd-workout-log-v1", "sd-winddown-log-v1"]);
const MAX_VALUE_BYTES = 65536;

function allowedKey(key) {
  if (typeof key !== "string" || !key) return false;
  if (ALLOWED_EXACT.has(key)) return true;
  return key.startsWith("sd-session-") && key.length < 100 && /^sd-session-[a-z]+$/.test(key);
}

function corsHeaders(origin) {
  const allowed =
    origin === "https://stretches.delianpetrov.com" ||
    (typeof origin === "string" && origin.endsWith(".stretch-dashboard.pages.dev"));
  return {
    "access-control-allow-origin": allowed ? origin : "null",
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return new Response("stretch-sync ok", { headers: corsHeaders(origin) });
    }

    if (url.pathname !== "/api/log") {
      return json({ error: "not found" }, 404, origin);
    }

    if (request.method === "GET") {
      const key = url.searchParams.get("key");
      if (!allowedKey(key)) return json({ error: "bad key" }, 400, origin);
      const row = await env.DB.prepare(
        "SELECT value, updated_at FROM logs WHERE key = ?"
      ).bind(key).first();
      if (!row) return json({ error: "not found" }, 404, origin);
      return json({ key, value: row.value, updated_at: row.updated_at }, 200, origin);
    }

    if (request.method === "PUT") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400, origin);
      }
      if (!allowedKey(body && body.key)) return json({ error: "bad key" }, 400, origin);
      if (typeof body.value !== "string" || body.value.length > MAX_VALUE_BYTES) {
        return json({ error: "bad value" }, 400, origin);
      }
      try {
        JSON.parse(body.value);
      } catch {
        return json({ error: "value is not JSON" }, 400, origin);
      }
      const updated_at = Date.now();
      await env.DB.prepare(
        "INSERT INTO logs (key, value, updated_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      )
        .bind(body.key, body.value, updated_at)
        .run();
      return json({ ok: true, key: body.key, updated_at }, 200, origin);
    }

    return json({ error: "method not allowed" }, 405, origin);
  },
};
