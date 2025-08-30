import { listFiles } from "@huggingface/hub";
import { HuggingFaceToR2Client, TransferResponse } from "./basic-client.ts"; // Fixed typo here

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
      repo: { name: repoId, type: repoType },
      recursive: true
    })) {
      if (f.type === "file") {
        files.push(f.path);
      }
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

// The 'if (import.meta.main)' check seems to cause silent crashes in this environment.
// Running the script logic directly.
const repoId = process.argv[2];
const repoType = (process.argv[3] as RepoType) || "dataset";

if (!repoId) {
  console.error("❌ No repo specified. Usage:");
  console.error("  npm run sync -- squad dataset");
  console.error("  npm run sync -- bert-base-uncased model");
  process.exit(1);
}

const s3Endpoint = process.env.S3_ENDPOINT_URL;
const bucketName = process.env.S3_BUCKET_NAME;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

if (!s3Endpoint || !bucketName || !accessKeyId || !secretAccessKey) {
    console.error("❌ Missing S3 configuration. Please set S3_ENDPOINT_URL, S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY environment variables.");
    process.exit(1);
}

const client = new HFToR2SyncClient(s3Endpoint, bucketName, accessKeyId, secretAccessKey);
client.syncRepo(repoId, repoType).then((results) => {
  const ok = results.filter(r => "success" in r.result).length;
  console.log(`\n🎉 Finished syncing ${repoType}: ${repoId}`);
  console.log(`📈 ${ok}/${results.length} files uploaded`);
}).catch(console.error);
