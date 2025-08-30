# data4r2: Hugging Face to Cloudflare R2 Sync

`data4r2` is a robust and efficient command-line tool designed to synchronize entire repositories (datasets or models) from the Hugging Face Hub directly into a Cloudflare R2 bucket using the S3-compatible API.

It provides a simple and direct pipeline for transferring large amounts of data, making it ideal for populating your R2 storage with valuable AI assets from Hugging Face.

## How it Works

The system is a command-line client that performs direct transfers.

1.  **Client-Side Sync**: You run the client-side script, specifying a Hugging Face repository you want to sync.
2.  **List and Transfer**: The client uses the `@huggingface/hub` library to list all files in the repository. For each file, it fetches the content and streams it directly to your Cloudflare R2 bucket using the AWS S3 SDK. This is highly efficient as it avoids loading large files into memory.

## Prerequisites

Before you begin, ensure you have the following:

*   A **Cloudflare Account** with an R2 bucket.
*   **Node.js** and **npm** installed on your local machine.
*   **S3 Credentials for your R2 Bucket**: You will need an Access Key ID and a Secret Access Key that have permission to write to your R2 bucket.

## Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd data4r2
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure R2 S3 Credentials

You need to get S3 credentials for your R2 bucket. You can create these in the Cloudflare Dashboard under `R2 > Manage R2 API Tokens`.

The client script will read these credentials from environment variables.

## Usage

To sync a repository, you use the `npm run sync` command.

### 1. Set Environment Variables

The client script needs to know your R2 bucket's S3 endpoint and credentials. You must set them as environment variables.

```bash
# Your R2 bucket's S3 API endpoint
export S3_ENDPOINT_URL="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
# The name of your R2 bucket
export S3_BUCKET_NAME="<YOUR_BUCKET_NAME>"
# Your R2 S3 Access Key ID
export AWS_ACCESS_KEY_ID="<YOUR_ACCESS_KEY_ID>"
# Your R2 S3 Secret Access Key
export AWS_SECRET_ACCESS_KEY="<YOUR_SECRET_ACCESS_KEY>"
```

### 2. Run the Sync Command

Now you can sync any public repository from Hugging Face.

**Sync a Dataset:**

```bash
# Format: npm run sync -- <repoId> dataset
npm run sync -- squad dataset
```

**Sync a Model:**

```bash
# Format: npm run sync -- <repoId> model
npm run sync -- bert-base-uncased model
```

The client will list all files, transfer them directly to your R2 bucket, and you will see progress logs in your terminal.
