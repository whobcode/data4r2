/**
 * data4r2 — R2 storage service.
 *
 * Original API: POST / { hf_url, r2_path } queues a HuggingFace→R2 transfer
 * (processed by the queue consumer below). This adds a full web UI at GET /
 * plus the file-management endpoints the bare API lacked (list/download/
 * delete/direct-upload), all backed by the R2 binding.
 */

import UI from "./ui.html";

interface TransferJob {
  hf_url: string;
  r2_path: string;
  timestamp: number;
  job_id: string;
}

interface Env {
  data4r2: R2Bucket;
  MY_QUEUE: Queue<TransferJob>;
  WORKER_URL: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    // --- Web UI ---
    if (method === "GET" && (path === "/" || path === "/index.html")) {
      return new Response(UI, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // --- List objects ---
    if (method === "GET" && path === "/api/files") {
      const prefix = url.searchParams.get("prefix") || undefined;
      const cursor = url.searchParams.get("cursor") || undefined;
      const listed = await env.data4r2.list({ limit: 1000, prefix, cursor, include: ["httpMetadata", "customMetadata"] });
      return json({
        objects: listed.objects.map((o) => ({
          key: o.key,
          size: o.size,
          uploaded: o.uploaded,
          etag: o.httpEtag,
          contentType: o.httpMetadata?.contentType,
          source: o.customMetadata?.source_url,
        })),
        truncated: listed.truncated,
        cursor: listed.truncated ? (listed as { cursor?: string }).cursor : undefined,
      });
    }

    // --- Download / stream an object ---
    if (method === "GET" && path === "/api/file") {
      const key = url.searchParams.get("key");
      if (!key) return json({ error: "key is required" }, 400);
      const obj = await env.data4r2.get(key);
      if (!obj) return json({ error: "Not found" }, 404);
      const h = new Headers(CORS);
      obj.writeHttpMetadata(h);
      h.set("etag", obj.httpEtag);
      if (url.searchParams.get("download")) {
        h.set("Content-Disposition", `attachment; filename="${(key.split("/").pop() || key).replace(/"/g, "")}"`);
      }
      return new Response(obj.body, { headers: h });
    }

    // --- Delete an object ---
    if (method === "DELETE" && path === "/api/file") {
      const key = url.searchParams.get("key");
      if (!key) return json({ error: "key is required" }, 400);
      await env.data4r2.delete(key);
      return json({ success: true, deleted: key });
    }

    // --- Direct upload (multipart form or raw PUT) ---
    if (method === "POST" && path === "/api/upload") {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json({ error: "file field is required" }, 400);
      const key = String(form.get("key") || file.name);
      await env.data4r2.put(key, file.stream(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
        customMetadata: { uploaded_via: "ui", processed_at: new Date().toISOString() },
      });
      return json({ success: true, key, size: file.size });
    }
    if (method === "PUT" && path === "/api/upload") {
      const key = url.searchParams.get("key");
      if (!key) return json({ error: "key is required" }, 400);
      await env.data4r2.put(key, request.body, {
        httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" },
      });
      return json({ success: true, key });
    }

    // --- HuggingFace → R2 transfer (original API; POST / kept for back-compat) ---
    if (method === "POST" && (path === "/" || path === "/api/transfer")) {
      try {
        const body = (await request.json()) as { hf_url?: string; r2_path?: string };
        const { hf_url, r2_path } = body;
        if (!hf_url || !r2_path) return json({ error: "Missing hf_url or r2_path" }, 400);
        if (!hf_url.includes("huggingface.co")) return json({ error: "Invalid Hugging Face URL" }, 400);
        const job: TransferJob = { hf_url, r2_path, timestamp: Date.now(), job_id: crypto.randomUUID() };
        await env.MY_QUEUE.send(job);
        return json({ success: true, message: `Transfer job queued: ${hf_url} → R2://${r2_path}`, job_id: job.job_id, status: "queued" });
      } catch (err) {
        return json({ error: `Failed to queue job: ${err instanceof Error ? err.message : "Unknown error"}` }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
  },

  // Queue consumer: streams HuggingFace files into R2.
  async queue(batch: MessageBatch<TransferJob>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const job = message.body;
      try {
        const hfResponse = await fetch(job.hf_url);
        if (!hfResponse.ok) {
          message.retry();
          continue;
        }
        await env.data4r2.put(job.r2_path, hfResponse.body, {
          httpMetadata: { contentType: hfResponse.headers.get("content-type") || "application/octet-stream" },
          customMetadata: { job_id: job.job_id, source_url: job.hf_url, processed_at: new Date().toISOString() },
        });
        message.ack();
      } catch (error) {
        if (message.attempts < 3) message.retry();
        else message.ack();
      }
    }
  },
} satisfies ExportedHandler<Env>;
