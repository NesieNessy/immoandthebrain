import { runGoal, type OptimizationGoal, type OptimizationProposal } from '@/lib/detailCheck/analysis/optimize';
import type { CalculatorParams } from '@/lib/detailCheck/rentCalculator';
import type { RenovationCase } from '@/lib/detailCheck/renovation';

type Request = { requestId: number; params: CalculatorParams; cases: RenovationCase[]; goal: OptimizationGoal };

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown) => void;
};

// This worker only ever runs a single sub-goal via `runGoal` — never
// `RECOMMENDATION` as one monolithic, sequential job (`runGoal` returns
// `null` for it by design). `useOptimization`'s `startRecommendation`
// dispatches the five candidate goals as five parallel workers itself and
// combines them with `pickRecommendation`; its "Berechnet in …" timing is
// the wall time from click to that combined result. Routing `RECOMMENDATION`
// through a single worker here would report one worker's own duration
// instead (browser-fix, SCRUM-96) — keep this a thin, single-goal wrapper so
// that mistake cannot come back.
ctx.onmessage = (event: MessageEvent<Request>) => {
  const { requestId, params, cases, goal } = event.data;
  const startedAt = performance.now();
  try {
    const proposal: OptimizationProposal | null = runGoal(params, cases, goal);
    ctx.postMessage({ requestId, ok: true, proposal, durationMs: performance.now() - startedAt });
  } catch (error) {
    ctx.postMessage({ requestId, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
