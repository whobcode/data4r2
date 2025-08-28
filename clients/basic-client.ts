// clients/basic-client.ts (updated response handling)
export class HuggingFaceToR2Client {
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
