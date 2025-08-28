/**
 * Welcome to Cloudflare Workers!
 *
 * This is a template for a Queue consumer: a Worker that can consume from a
 * Queue: https://developers.cloudflare.com/queues/get-started/
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
/*
export default {
	// Our fetch handler is invoked on a HTTP request: we can send a message to a queue
	// during (or after) a request.
	// https://developers.cloudflare.com/queues/platform/javascript-apis/#producer
	async fetch(req, env, ctx): Promise<Response> {
		// To send a message on a queue, we need to create the queue first
		// https://developers.cloudflare.com/queues/get-started/#3-create-a-queue
		await env.MY_QUEUE.send({
			url: req.url,
			method: req.method,
			headers: Object.fromEntries(req.headers),
		});
		return new Response('Sent message to the queue');
	},
	// The queue handler is invoked when a batch of messages is ready to be delivered
	// https://developers.cloudflare.com/queues/platform/javascript-apis/#messagebatch
	async queue(batch, env): Promise<void> {
		// A queue consumer can make requests to other endpoints on the Internet,
		// write to R2 object storage, query a D1 Database, and much more.
		for (let message of batch.messages) {
			// Process each message (we'll just log these)
			console.log(`message ${message.id} processed: ${JSON.stringify(message.body)}`);
		}
	},
} satisfies ExportedHandler<Env, Error>;
*/
// src/index.ts
/*export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed. Use POST.", { status: 405 });
    }

    try {
      const body = await request.json<{ hf_url: string; r2_path: string }>();
      const { hf_url, r2_path } = body;

      if (!hf_url || !r2_path) {
        return Response.json({ error: "Missing hf_url or r2_path" }, { status: 400 });
      }

      if (!hf_url.includes("huggingface.co")) {
        return Response.json({ error: "Invalid Hugging Face URL" }, { status: 400 });
      }

      // Fetch from HuggingFace
      const hfResponse = await fetch(hf_url);
      if (!hfResponse.ok) {
        return Response.json(
          { error: `Failed to fetch from Hugging Face: ${hfResponse.status}` },
          { status: 400 }
        );
      }

      // Stream directly to R2
      await env.HF_R2_BUCKET.put(r2_path, hfResponse.body, {
        httpMetadata: {
          contentType: hfResponse.headers.get("content-type") || "application/octet-stream",
        },
      });

      return Response.json({
        success: true,
        message: `Transferred ${hf_url} → R2://${r2_path}`,
        size: hfResponse.headers.get("content-length") || "unknown",
      });
    } catch (err) {
      return Response.json(
        { error: `Transfer failed: ${err instanceof Error ? err.message : "Unknown error"}` },
        { status: 500 }
      );
    }
  },
} satisfies ExportedHandler<Env>;
*/


// src/index.ts

interface TransferJob {
  hf_url: string;
  r2_path: string;
  timestamp: number;
  job_id: string;
}

export default {
  // HTTP handler: receives requests and queues transfer jobs
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed. Use POST.", { status: 405 });
    }

    try {
      const body = await request.json<{ hf_url: string; r2_path: string }>();
      const { hf_url, r2_path } = body;

      if (!hf_url || !r2_path) {
        return Response.json({ error: "Missing hf_url or r2_path" }, { status: 400 });
      }

      if (!hf_url.includes("huggingface.co")) {
        return Response.json({ error: "Invalid Hugging Face URL" }, { status: 400 });
      }

      // Create transfer job
      const job: TransferJob = {
        hf_url,
        r2_path,
        timestamp: Date.now(),
        job_id: crypto.randomUUID(),
      };

      // Send to queue for async processing
      await env.MY_QUEUE.send(job);

      return Response.json({
        success: true,
        message: `Transfer job queued: ${hf_url} → R2://${r2_path}`,
        job_id: job.job_id,
        status: "queued"
      });

    } catch (err) {
      return Response.json(
        { error: `Failed to queue job: ${err instanceof Error ? err.message : "Unknown error"}` },
        { status: 500 }
      );
    }
  },

  // Queue consumer: processes transfer jobs
  async queue(batch: MessageBatch<TransferJob>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const job = message.body;
      
      try {
        console.log(`🔄 Processing transfer job ${job.job_id}: ${job.hf_url}`);

        // Fetch from HuggingFace
        const hfResponse = await fetch(job.hf_url);
        if (!hfResponse.ok) {
          console.error(`❌ Job ${job.job_id} failed: HF returned ${hfResponse.status}`);
          message.retry(); // Retry the job
          continue;
        }

        // Stream directly to R2 (using your bucket binding)
        await env.data4r2.put(job.r2_path, hfResponse.body, {
          httpMetadata: {
            contentType: hfResponse.headers.get("content-type") || "application/octet-stream",
          },
          customMetadata: {
            job_id: job.job_id,
            source_url: job.hf_url,
            processed_at: new Date().toISOString(),
          }
        });

        console.log(`✅ Job ${job.job_id} completed: ${job.r2_path} (${hfResponse.headers.get("content-length") || "unknown"} bytes)`);
        
        // Acknowledge successful processing
        message.ack();

      } catch (error) {
        console.error(`❌ Job ${job.job_id} error:`, error);
        
        // Retry logic: retry up to 3 times, then give up
        if (message.attempts < 3) {
          message.retry();
        } else {
          console.error(`💀 Job ${job.job_id} failed permanently after 3 attempts`);
          message.ack(); // Remove from queue to prevent infinite retries
        }
      }
    }
  },

} satisfies ExportedHandler<Env>;
