"use client";

import { runGoal, type OptimizationGoal } from '@/lib/detailCheck/analysis/optimize';
import { recommend } from '@/lib/detailCheck/analysis/recommend';
import type { CalculatorParams } from '@/lib/detailCheck/rentCalculator';
import type { RenovationCase } from '@/lib/detailCheck/renovation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OptimizationProposal } from '@/lib/detailCheck/analysis/optimize';

export type OptimizationState =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number }
  | { status: 'done'; proposal: OptimizationProposal | null; durationMs: number }
  | { status: 'error'; message: string };

const IDLE: OptimizationState = { status: 'idle' };

function runInline(params: CalculatorParams, cases: RenovationCase[], goal: OptimizationGoal): OptimizationProposal | null {
  return goal === 'RECOMMENDATION' ? recommend(params, cases) : runGoal(params, cases, goal);
}

/**
 * Startet Optimierungen im Web Worker (bis zu drei parallel, je Ziel ein
 * Worker) und cacht die Ergebnisse je Eingabestand: ändert sich die Planung,
 * gelten alte Vorschläge nicht mehr und die Karten zeigen wieder „Starten".
 *
 * Die Zustände sind je `${inputKey}|${goal}` abgelegt, ein alter Stand
 * wird also nie erneut angezeigt — ein Zurücksetzen von `states` beim
 * Wechsel des Eingabestands ist daher für die Korrektheit nicht nötig, nur
 * laufende Worker eines veralteten Stands werden noch abgebrochen.
 */
export function useOptimization(params: CalculatorParams, cases: RenovationCase[]) {
  // Betrachtungszeitraum gehört dazu: er ist Teil des Ziels „Mietsumme über B".
  const inputKey = useMemo(() => JSON.stringify({ params, cases }), [params, cases]);
  const [states, setStates] = useState<Record<string, OptimizationState>>({});
  const workersRef = useRef(new Map<OptimizationGoal, Worker>());
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Eingabestand geändert: alte Worker sind veraltet und werden
    // abgebrochen. `states` selbst muss nicht geleert werden — es ist je
    // `${inputKey}|${goal}` abgelegt, ein alter Stand wird also nie
    // wieder angezeigt.
    const workers = workersRef.current;
    return () => {
      for (const worker of workers.values()) worker.terminate();
      workers.clear();
    };
  }, [inputKey]);

  const stateFor = useCallback((goal: OptimizationGoal) => states[`${inputKey}|${goal}`] ?? IDLE, [states, inputKey]);

  const start = useCallback((goal: OptimizationGoal) => {
    const key = `${inputKey}|${goal}`;
    const requestId = ++requestIdRef.current;
    setStates((current) => ({ ...current, [key]: { status: 'running', startedAt: Date.now() } }));

    if (typeof Worker === 'undefined') {
      const startedAt = performance.now();
      window.setTimeout(() => {
        try {
          const proposal = runInline(params, cases, goal);
          setStates((current) => ({ ...current, [key]: { status: 'done', proposal, durationMs: performance.now() - startedAt } }));
        } catch (error) {
          setStates((current) => ({ ...current, [key]: { status: 'error', message: error instanceof Error ? error.message : String(error) } }));
        }
      }, 0);
      return;
    }

    workersRef.current.get(goal)?.terminate();
    const worker = new Worker(new URL('./optimizer.worker.ts', import.meta.url));
    workersRef.current.set(goal, worker);
    worker.onmessage = (event: MessageEvent<{ requestId: number; ok: boolean; proposal?: OptimizationProposal | null; durationMs?: number; message?: string }>) => {
      if (event.data.requestId !== requestId) return;
      worker.terminate();
      workersRef.current.delete(goal);
      setStates((current) => ({
        ...current,
        [key]: event.data.ok
          ? { status: 'done', proposal: event.data.proposal ?? null, durationMs: event.data.durationMs ?? 0 }
          : { status: 'error', message: event.data.message ?? 'Unbekannter Fehler' },
      }));
    };
    worker.onerror = (event) => {
      worker.terminate();
      workersRef.current.delete(goal);
      setStates((current) => ({ ...current, [key]: { status: 'error', message: event.message || 'Worker-Fehler' } }));
    };
    worker.postMessage({ requestId, params, cases, goal });
  }, [inputKey, params, cases]);

  return { stateFor, start };
}
