export type N8nCallback = {
  version: 1;
  event: string; // "<event>.completed" | "<event>.failed"
  data: {
    jobId: string;
    status: "completed" | "failed";
    correlationId?: string;
    requestIdempotencyKey: string; // idempotency-key of our request to n8n: finds the record
    result?: { documentUrl?: string };
    error?: { code?: string };
    completedAt?: string;
  };
};
