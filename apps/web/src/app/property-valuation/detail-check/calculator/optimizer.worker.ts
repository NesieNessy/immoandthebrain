import { runOptimization } from '@/lib/detailCheck/analysis/optimize';
import type { ObjectiveId } from '@/lib/detailCheck/analysis/objectives';
import type { CalculatorParams } from '@/lib/detailCheck/rentCalculator';
import type { RenovationCase } from '@/lib/detailCheck/renovation';

type Request = { requestId: number; params: CalculatorParams; cases: RenovationCase[]; objective: ObjectiveId };

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown) => void;
};

ctx.onmessage = (event: MessageEvent<Request>) => {
  const { requestId, params, cases, objective } = event.data;
  const startedAt = performance.now();
  try {
    const proposal = runOptimization(params, cases, objective);
    ctx.postMessage({ requestId, ok: true, proposal, durationMs: performance.now() - startedAt });
  } catch (error) {
    ctx.postMessage({ requestId, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
