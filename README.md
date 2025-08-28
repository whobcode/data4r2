# data4r2: Hugging Face to Cloudflare R2 Sync

`data4r2` is a robust and efficient service powered by Cloudflare Workers, designed to synchronize entire repositories (datasets or models) from the Hugging Face Hub directly into a Cloudflare R2 bucket.

It provides a resilient, asynchronous pipeline for transferring large amounts of data, making it ideal for populating your R2 storage with valuable AI assets from Hugging Face.

## How it Works

The system is composed of a Cloudflare Worker and a command-line client. The architecture is designed for resilience and speed.

1.  **Client-Side Sync**: You run a client-side script, specifying a Hugging Face repository you want to sync.
2.  **List & Queue**: The client uses the `@huggingface/hub` library to list all files in the repository. For each file, it sends a `POST` request to the deployed worker.
3.  **Job Queuing**: The worker receives the request but doesn't perform the transfer immediately. Instead, it creates a `TransferJob` and places it into a Cloudflare Queue. This makes the initial API calls extremely fast, and you get immediate feedback that the jobs are queued.
4.  **Asynchronous Transfer**: A queue consumer, running as part of the worker, picks up jobs from the queue. It fetches the file from Hugging Face and streams it directly into your R2 bucket.
5.  **Resilience & Retries**: If a transfer fails (e.g., due to a temporary network issue), the queue is configured to automatically retry the job. The worker code includes logic to retry a job up to 3 times before marking it as permanently failed, preventing data loss from transient errors.

## Prerequisites

Before you begin, ensure you have the following:

*   A **Cloudflare Account**.
*   **Node.js** and **npm** installed on your local machine.
*   The **Wrangler CLI**. You can install it globally: `npm install -g wrangler`.

## Setup & Deployment

Follow these steps to get your `data4r2` service running.

### 1. Clone the Repository

```bash
git clone <repository-url>
cd data4r2
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create Cloudflare Resources

You need to create an R2 bucket and a Queue.

```bash
# Create the R2 bucket
wrangler r2 bucket create data4r2

# Create the Queue
wrangler queues create data4r2-queue
```

### 4. Configure `wrangler.jsonc`

Open the `wrangler.jsonc` file and bind the resources you just created to your worker.

Find the `[[r2_buckets]]` and `[[queues.producers]]` sections and update them with the correct names.

```jsonc
{
  // ... other configurations
  "r2_buckets": [
    {
      "binding": "data4r2", // This is how you access the bucket in your code
      "bucket_name": "data4r2"
    }
  ],
  "queues": {
    "producers": [
      {
        "queue": "data4r2-queue",
        "binding": "MY_QUEUE" // This is how you access the queue in your code
      }
    ],
    "consumers": [
      {
        "queue": "data4r2-queue"
      }
    ]
  }
}
```

### 5. Deploy the Worker

Deploy your worker to the Cloudflare network.

```bash
npm run deploy
```

This command will publish your worker, and you will get a URL for it (e.g., `https://data4r2.<your-account>.workers.dev`).

## Usage

To sync a repository, you use the `npm run sync` command.

### 1. Set the Worker URL

The client script needs to know the URL of your deployed worker. You can set it as an environment variable.

```bash
# Replace with your actual worker URL
export WORKER_URL="https://data4r2.<your-account>.workers.dev"
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

The client will list all files, queue them for transfer, and you will see progress logs in your terminal. The worker will process the queue in the background.
