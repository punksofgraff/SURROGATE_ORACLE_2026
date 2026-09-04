import type { H3ChunkRequest } from './polling.ts';

export type H3ChunkSubmissionInput = Pick<
  H3ChunkRequest,
  | 'chunkNumber'
  | 'pageNumbers'
  | 'targetDurationSeconds'
  | 'requestedDurationSeconds'
  | 'prompt'
  | 'imageUrl'
>;

export type H3ChunkSubmitter = (
  chunk: H3ChunkSubmissionInput,
) => Promise<H3ChunkRequest>;

export type H3ChunkCanceller = (
  chunk: H3ChunkRequest,
) => Promise<void>;

export type H3ChunkSubmissionResult = {
  requests: H3ChunkRequest[];
  submissionErrors: string[];
};

function failureMessage(value: unknown): string {
  return value instanceof Error ? value.message : 'MiniMax H3 chunk submission failed.';
}

function failedRequest(
  chunk: H3ChunkSubmissionInput,
  reason: unknown,
): H3ChunkRequest {
  return {
    ...chunk,
    requestId: '',
    statusUrl: '',
    responseUrl: '',
    status: 'failed',
    progress: 0,
    outputUrl: null,
    error: failureMessage(reason),
  };
}

export async function submitFalH3Chunks(
  chunks: H3ChunkSubmissionInput[],
  submit: H3ChunkSubmitter,
  cancel: H3ChunkCanceller,
): Promise<H3ChunkSubmissionResult> {
  const settled = await Promise.allSettled(chunks.map(chunk => submit(chunk)));
  let requests = settled.map((result, index) => result.status === 'fulfilled'
    ? result.value
    : failedRequest(chunks[index], result.reason));
  const submissionErrors = requests
    .filter(chunk => chunk.status === 'failed')
    .map(chunk => chunk.error)
    .filter((error): error is string => Boolean(error));

  if (submissionErrors.length) {
    const cancellationResults = await Promise.all(requests.map(async chunk => {
      if (!chunk.requestId || chunk.status === 'failed') return null;
      if (!chunk.cancelUrl) {
        return `MiniMax H3 chunk ${chunk.chunkNumber} was accepted but returned no cancellation URL.`;
      }
      try {
        await cancel(chunk);
        return null;
      } catch (error) {
        return `MiniMax H3 chunk ${chunk.chunkNumber} cancellation failed: ${
          error instanceof Error ? error.message : 'unknown cancellation error'
        }`;
      }
    }));
    const cancellationErrors = cancellationResults
      .filter((error): error is string => Boolean(error));
    requests = requests.map(chunk => chunk.requestId && chunk.status !== 'failed'
      ? {
        ...chunk,
        status: 'cancelled' as const,
        progress: 0,
        error: 'Submission batch aborted after another H3 chunk failed.',
      }
      : chunk);
    submissionErrors.push(...cancellationErrors);
  }

  return { requests, submissionErrors };
}