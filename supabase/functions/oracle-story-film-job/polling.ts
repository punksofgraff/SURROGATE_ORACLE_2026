export const PAGE_COUNT = 32;

export type StoryPanelManifestEntry = {
  panelId: string;
  pageNumber: number;
  sourceHash: string;
  [key: string]: unknown;
};

export type StoryCoverageEntry = {
  panelId: string;
  pageNumber: number;
  sourceHash: string;
  startSeconds: number;
  endSeconds: number;
};

export type StoryCoverageCertificate = {
  version: 1;
  panelCount: 32;
  totalDurationSeconds: number;
  panels: StoryCoverageEntry[];
  audioProvenance: Record<string, unknown>;
};

export type StoryWorkflowState = {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  [key: string]: unknown;
};

export type H3ChunkRequest = {
  chunkNumber: number;
  pageNumbers: number[];
  targetDurationSeconds: number;
  requestedDurationSeconds: number;
  prompt: string;
  imageUrl: string;
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  cancelUrl?: string;
  status: 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  outputUrl?: string | null;
  error?: string | null;
};

export type WorkflowJson = (
  url: string,
  init?: RequestInit,
) => Promise<Record<string, unknown>>;

function safeText(value: unknown, max = 300): string {
  return typeof value === 'string'
    ? value.replace(/https?:\/\/\S+/gi, '').replace(/["'`{}<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function safeUrl(value: unknown, max = 4000): string {
  return typeof value === 'string'
    ? value.replace(/["'`{}<>]/g, '').trim().slice(0, max)
    : '';
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function errorDetail(value: unknown): string {
  if (typeof value === 'string') return safeText(value, 300);
  if (!value || typeof value !== 'object') return '';
  try {
    return safeText(JSON.stringify(value), 300);
  } catch {
    return '';
  }
}

export function coverageCertificate(
  value: unknown,
  panelManifest: StoryPanelManifestEntry[],
  totalDurationSeconds: number,
): StoryCoverageCertificate {
  if (!value || typeof value !== 'object') {
    throw new Error('Coverage certificate is missing; ordered panel alignment cannot be proven.');
  }
  const raw = value as Record<string, unknown>;
  const version = Number(raw.version ?? 1);
  const panels = Array.isArray(raw.panels)
    ? raw.panels
    : Array.isArray(raw.shots)
      ? raw.shots
      : [];
  const audioProvenance = raw.audioProvenance ?? raw.audio_provenance;
  if (version !== 1 || panels.length !== PAGE_COUNT || !audioProvenance || typeof audioProvenance !== 'object') {
    throw new Error('Coverage certificate is incomplete; expected version 1, 32 panel ranges, and audio provenance.');
  }
  const expected = new Map(panelManifest.map(panel => [panel.pageNumber, panel]));
  const normalized: StoryCoverageEntry[] = [];
  let previousEnd = 0;
  for (const [index, item] of panels.entries()) {
    if (!item || typeof item !== 'object') {
      throw new Error('Coverage certificate contains an unreadable panel entry.');
    }
    const rawPanel = item as Record<string, unknown>;
    const pageNumber = Number(rawPanel.pageNumber ?? rawPanel.page_number);
    const expectedPanel = expected.get(pageNumber);
    const panelId = safeText(rawPanel.panelId ?? rawPanel.panel_id, 120);
    const sourceHash = safeText(rawPanel.sourceHash ?? rawPanel.source_hash, 128).toLowerCase();
    const startSeconds = finiteNumber(rawPanel.startSeconds ?? rawPanel.start_seconds);
    const endSeconds = finiteNumber(rawPanel.endSeconds ?? rawPanel.end_seconds);
    const contiguous = index === 0 || (startSeconds !== null && Math.abs(startSeconds - previousEnd) <= 0.05);
    if (!expectedPanel || pageNumber !== index + 1 || !panelId || panelId !== expectedPanel.panelId || sourceHash !== expectedPanel.sourceHash
      || startSeconds === null || endSeconds === null || startSeconds < -0.05
      || endSeconds <= startSeconds || !contiguous) {
      throw new Error('Coverage certificate has missing, duplicate, reordered, overlapping, or unverifiable panel ranges.');
    }
    normalized.push({
      panelId,
      pageNumber,
      sourceHash,
      startSeconds: Math.max(0, startSeconds),
      endSeconds,
    });
    previousEnd = endSeconds;
  }
  normalized.sort((left, right) => left.pageNumber - right.pageNumber);
  if (normalized.some((panel, index) => panel.pageNumber !== index + 1)
    || normalized[0].startSeconds > 0.05
    || Math.abs(normalized[normalized.length - 1].endSeconds - totalDurationSeconds) > 0.75) {
    throw new Error('Coverage certificate does not prove contiguous 01–32 coverage for the requested duration.');
  }
  return {
    version: 1,
    panelCount: PAGE_COUNT,
    totalDurationSeconds,
    panels: normalized,
    audioProvenance: { ...(audioProvenance as Record<string, unknown>) },
  };
}

function workflowRequestId(data: Record<string, unknown>): string {
  return safeText(data.request_id ?? data.requestId ?? data.job_id ?? data.jobId ?? data.id, 240);
}

function workflowVideoUrl(data: Record<string, unknown>): string {
  const video = data.video && typeof data.video === 'object'
    ? data.video as Record<string, unknown>
    : {};
  return safeUrl(
    data.output_url ?? data.outputUrl ?? data.final_media_url ?? data.finalMediaUrl ?? video.url,
    4000,
  );
}

function workflowCertificate(data: Record<string, unknown>): unknown {
  return data.coverage_certificate ?? data.coverageCertificate
    ?? (data.result && typeof data.result === 'object'
      ? workflowCertificate(data.result as Record<string, unknown>)
      : null);
}

function staleWorkflowResponse(
  workflow: StoryWorkflowState,
  response: Record<string, unknown>,
): string | null {
  const responseRequestId = workflowRequestId(response);
  return responseRequestId && responseRequestId !== workflow.requestId
    ? `Shared FAL story workflow response belongs to request ${responseRequestId}, not the persisted request.`
    : null;
}

export async function pollFalStoryWorkflow(
  workflow: StoryWorkflowState,
  panelManifest: StoryPanelManifestEntry[],
  totalDurationSeconds: number,
  request: WorkflowJson,
): Promise<{
  status: 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  output?: string;
  certificate?: StoryCoverageCertificate;
  error?: string;
}> {
  const status = await request(workflow.statusUrl);
  const staleStatus = staleWorkflowResponse(workflow, status);
  if (staleStatus) return { status: 'failed', progress: 0, error: staleStatus };
  const state = safeText(status.status ?? status.state, 32).toUpperCase();
  if (['FAILED', 'ERROR'].includes(state)) {
    return { status: 'failed', progress: 0, error: errorDetail(status.error ?? status.detail) || 'Shared FAL story workflow failed.' };
  }
  if (['CANCELED', 'CANCELLED'].includes(state)) {
    return { status: 'cancelled', progress: 0, error: 'Shared FAL story workflow was cancelled.' };
  }
  if (!['COMPLETED', 'SUCCEEDED', 'SUCCESS'].includes(state)) {
    return {
      status: state === 'IN_QUEUE' || state === 'QUEUED' ? 'queued' : 'generating',
      progress: state === 'IN_QUEUE' || state === 'QUEUED' ? 8 : 45,
    };
  }
  const result = await request(workflow.responseUrl);
  const staleResult = staleWorkflowResponse(workflow, result);
  if (staleResult) return { status: 'failed', progress: 0, error: staleResult };
  const output = workflowVideoUrl(result);
  if (!output) return { status: 'failed', progress: 0, error: 'Shared FAL story workflow completed without a video URL.' };
  try {
    return {
      status: 'ready',
      progress: 100,
      output,
      certificate: coverageCertificate(workflowCertificate(result), panelManifest, totalDurationSeconds),
    };
  } catch (error) {
    return {
      status: 'failed',
      progress: 0,
      error: error instanceof Error ? error.message : 'Coverage certificate validation failed.',
    };
  }
}

function h3VideoUrl(data: Record<string, unknown>): string {
  const video = data.video && typeof data.video === 'object'
    ? data.video as Record<string, unknown>
    : {};
  return safeUrl(data.output_url ?? data.outputUrl ?? video.url, 4000);
}

function chunkStateFromProvider(
  chunk: H3ChunkRequest,
  status: Record<string, unknown>,
): H3ChunkRequest {
  const state = safeText(status.status ?? status.state, 32).toUpperCase();
  if (['FAILED', 'ERROR'].includes(state)) {
    return {
      ...chunk,
      status: 'failed',
      progress: 0,
      error: errorDetail(status.error ?? status.detail) || 'MiniMax H3 chunk failed.',
    };
  }
  if (['CANCELED', 'CANCELLED'].includes(state)) {
    return {
      ...chunk,
      status: 'cancelled',
      progress: 0,
      error: 'MiniMax H3 chunk was cancelled.',
    };
  }
  return {
    ...chunk,
    status: state === 'IN_QUEUE' || state === 'QUEUED' ? 'queued' : 'generating',
    progress: state === 'IN_QUEUE' || state === 'QUEUED' ? 8 : 45,
    error: null,
  };
}

export async function pollFalH3Chunks(
  chunks: H3ChunkRequest[],
  request: WorkflowJson,
): Promise<{
  status: 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  chunks: H3ChunkRequest[];
  error?: string;
}> {
  const expectedSizes = [4, 4, ...Array.from({ length: 8 }, () => 3)];
  const orderedPages = chunks.flatMap(chunk => chunk.pageNumbers);
  const validManifest = chunks.length === 10
    && chunks.every((chunk, index) => (
      chunk.chunkNumber === index + 1
      && chunk.pageNumbers.length === expectedSizes[index]
    ))
    && orderedPages.length === 32
    && orderedPages.every((pageNumber, index) => pageNumber === index + 1);
  if (!validManifest) {
    return {
      status: 'failed',
      progress: 0,
      chunks,
      error: 'MiniMax H3 chunk manifest is missing, duplicated, reordered, or does not cover all 32 story pages.',
    };
  }
  const nextChunks = await Promise.all(chunks.map(async (chunk) => {
    if (chunk.status === 'ready' || chunk.status === 'failed' || chunk.status === 'cancelled') return chunk;
    try {
      const status = await request(chunk.statusUrl);
      const responseRequestId = workflowRequestId(status);
      if (responseRequestId && responseRequestId !== chunk.requestId) {
        return {
          ...chunk,
          status: 'failed' as const,
          progress: 0,
          error: `MiniMax H3 chunk response belongs to request ${responseRequestId}, not chunk ${chunk.chunkNumber}.`,
        };
      }
      const state = safeText(status.status ?? status.state, 32).toUpperCase();
      if (!['COMPLETED', 'SUCCEEDED', 'SUCCESS'].includes(state)) {
        return chunkStateFromProvider(chunk, status);
      }
      const result = await request(chunk.responseUrl);
      const resultRequestId = workflowRequestId(result);
      if (resultRequestId && resultRequestId !== chunk.requestId) {
        return {
          ...chunk,
          status: 'failed' as const,
          progress: 0,
          error: `MiniMax H3 result belongs to request ${resultRequestId}, not chunk ${chunk.chunkNumber}.`,
        };
      }
      const outputUrl = h3VideoUrl(result);
      if (!outputUrl) {
        return {
          ...chunk,
          status: 'failed' as const,
          progress: 0,
          error: `MiniMax H3 chunk ${chunk.chunkNumber} completed without a playable video URL.`,
        };
      }
      return {
        ...chunk,
        status: 'ready' as const,
        progress: 100,
        outputUrl,
        error: null,
      };
    } catch (error) {
      return {
        ...chunk,
        status: 'failed' as const,
        progress: 0,
        error: error instanceof Error ? error.message : `MiniMax H3 chunk ${chunk.chunkNumber} polling failed.`,
      };
    }
  }));
  const failed = nextChunks.find(chunk => chunk.status === 'failed');
  const cancelled = nextChunks.find(chunk => chunk.status === 'cancelled');
  const allReady = nextChunks.length > 0 && nextChunks.every(chunk => chunk.status === 'ready' && Boolean(chunk.outputUrl));
  const active = nextChunks.some(chunk => chunk.status === 'queued' || chunk.status === 'generating');
  return {
    status: failed ? 'failed' : cancelled ? 'cancelled' : allReady ? 'ready' : active ? 'generating' : 'queued',
    progress: Math.round(nextChunks.reduce((sum, chunk) => sum + chunk.progress, 0) / Math.max(1, nextChunks.length)),
    chunks: nextChunks,
    ...(failed?.error ? { error: failed.error } : cancelled?.error ? { error: cancelled.error } : {}),
  };
}