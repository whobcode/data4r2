import { listFiles } from "@huggingface/hub";
import { HuggingFaceToR2Client, TransferResponse } from "./basic-clients.ts";

interface BulkResult {
  file: string;
  result: TransferResponse;
}

type RepoType = "dataset" | "model";

export class HFToR2SyncClient extends HuggingFaceToR2Client {
  async syncRepo(repoId: string, repoType: RepoType = "dataset", r2Prefix?: string): Promise<BulkResult[]> {
    const results: BulkResult[] = [];
    const files: string[] = [];

    const defaultPrefix = repoType === "dataset" ? "datasets" : "models";
    const prefix = r2Prefix || defaultPrefix;

    // List files in the repo
    for await (const f of listFiles({ 
      repo: repoId, 
      repoType, 
      recursive: true 
    })) {
      files.push(f.path);
    }

    console.log(`📦 Found ${files.length} files in ${repoType}: ${repoId}`);

    for (const path of files) {
      // Compose URL depending on repo type
      const baseUrl = repoType === "dataset" 
        ? `https://huggingface.co/datasets/${repoId}`
        : `https://huggingface.co/${repoId}`;

      const hfUrl = `${baseUrl}/resolve/main/${path}`;
      const r2Path = `${prefix}/${repoId}/${path}`;

      const result = await this.transferFile(hfUrl, r2Path);
      results.push({ file: path, result });

      if ("success" in result) {
        console.log(`✅ Synced: ${path}`);
      } else {
        console.error(`❌ Failed: ${path} → ${result.error}`);
      }
    }

    return results;
  }
}

// CLI runner: npm run sync -- <repoId> [dataset|model]
if (import.meta.main) {
  const repoId = process.argv[2];
  const repoType = (process.argv[3] as RepoType) || "dataset";

  if (!repoId) {
    console.error("❌ No repo specified. Usage:");
    console.error("  npm run sync -- squad dataset");
    console.error("  npm run sync -- bert-base-uncased model");
    process.exit(1);
  }

  const workerUrl = process.env.WORKER_URL;
  const client = new HFToR2SyncClient(workerUrl);
  client.syncRepo(repoId, repoType).then((results) => {
    const ok = results.filter(r => "success" in r.result).length;
    console.log(`\n🎉 Finished syncing ${repoType}: ${repoId}`);
    console.log(`📈 ${ok}/${results.length} files uploaded`);
  }).catch(console.error);
}
