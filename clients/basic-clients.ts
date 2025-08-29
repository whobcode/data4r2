// clients/basic-client.ts (updated response handling)
export type TransferResponse =
  | { success: true; message: string; job_id: string; status: "queued" }
  | { error: string };

export class HuggingFaceToR2Client {
  private workerUrl: string;

  constructor(workerUrl: string) {
    if (!workerUrl || workerUrl.includes("<your-account>")) {
      console.error("❌ Invalid or missing WORKER_URL. Please set it as an environment variable.");
      process.exit(1);
    }
    this.workerUrl = workerUrl;
  }

  async transferFile(hfUrl: string, r2Path: string): Promise<TransferResponse> {
    const payload = { hf_url: hfUrl, r2_path: r2Path };

    try {
      const res = await fetch(this.workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const result = await res.json();
      
      // Now returns job_id and "queued" status instead of immediate success
      if (result.success && result.status === "queued") {
        console.log(`📋 Job queued: ${result.job_id}`);
      }
      
      return result;
    } catch (err) {
      return { error: `Network error: ${err instanceof Error ? err.message : "Unknown error"}` };
    }
  }
}

