// clients/basic-client.ts (S3 direct upload implementation)
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "stream";

export type TransferResponse =
  | { success: true; message: string; }
  | { error: string };

export class HuggingFaceToR2Client {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(s3Endpoint: string, bucketName: string, accessKeyId: string, secretAccessKey: string) {
    if (!s3Endpoint) {
      console.error("❌ Missing S3 endpoint URL.");
      process.exit(1);
    }
    if (!bucketName) {
        console.error("❌ Missing S3_BUCKET_NAME.");
        process.exit(1);
    }
    if (!accessKeyId || !secretAccessKey) {
        console.error("❌ Missing S3 credentials. Please provide AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.");
        process.exit(1);
    }

    this.bucketName = bucketName;

    this.s3Client = new S3Client({
      region: "auto",
      endpoint: s3Endpoint,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });
  }

  async transferFile(hfUrl: string, r2Path: string): Promise<TransferResponse> {
    try {
      // 1. Fetch from Hugging Face
      const hfResponse = await fetch(hfUrl);
      if (!hfResponse.ok || !hfResponse.body) {
        return { error: `Failed to fetch from Hugging Face: ${hfResponse.status} ${hfResponse.statusText}` };
      }

      // 2. Stream upload to R2 using S3 API
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: r2Path,
          Body: hfResponse.body as unknown as Readable, // Cast for lib-storage compatibility
          ContentType: hfResponse.headers.get("content-type") || "application/octet-stream",
          ContentLength: Number(hfResponse.headers.get("content-length")) || undefined,
        },
      });

      await upload.done();

      return { success: true, message: `Transferred ${hfUrl} → R2://${this.bucketName}/${r2Path}` };

    } catch (err) {
      return { error: `S3 upload error: ${err instanceof Error ? err.message : "Unknown error"}` };
    }
  }
}

