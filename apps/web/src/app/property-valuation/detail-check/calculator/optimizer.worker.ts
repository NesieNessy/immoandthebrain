import { runGoal, type OptimizationGoal, type OptimizationProposal } from '@/lib/detailCheck/analysis/optimize';
import { recommend } from '@/lib/detailCheck/analysis/recommend';
import type { CalculatorParams } from '@/lib/detailCheck/rentCalculator';
import type { RenovationCase } from '@/lib/detailCheck/renovation';

type Request = { requestId: number; params: CalculatorParams; cases: RenovationCase[]; goal: OptimizationGoal };

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown) => void;
};

function run(params: CalculatorParams, cases: RenovationCase[], goal: OptimizationGoal): OptimizationProposal | null {
  return goal === 'RECOMMENDATION' ? recommend(params, cases) : runGoal(params, cases, goal);
}

ctx.onmessage = (event: MessageEvent<Request>) => {
  const { requestId, params, cases, goal } = event.data;
  const startedAt = performance.now();
  try {
    const proposal = run(params, cases, goal);
    ctx.postMessage({ requestId, ok: true, proposal, durationMs: performance.now() - startedAt });
  } catch (error) {
    ctx.postMessage({ requestId, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
