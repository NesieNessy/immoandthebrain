"use client";

import { runGoal, type OptimizationGoal } from '@/lib/detailCheck/analysis/optimize';
import { pickRecommendation, RECOMMENDATION_CANDIDATE_GOALS } from '@/lib/detailCheck/analysis/recommend';
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

/** `goal` is always a single sub-goal here — `RECOMMENDATION` never reaches a worker, it is assembled in `useOptimization` from the five sub-goal results. */
function runInline(params: CalculatorParams, cases: RenovationCase[], goal: OptimizationGoal): OptimizationProposal | null {
  return runGoal(params, cases, goal);
}

/**
 * Startet Optimierungen im Web Worker (bis zu fünf parallel, je Ziel ein
 * Worker) und cacht die Ergebnisse je Eingabestand: ändert sich die Planung,
 * gelten alte Vorschläge nicht mehr und die Karten zeigen wieder „Starten".
 *
 * Die Zustände sind je `${inputKey}|${goal}` abgelegt, ein alter Stand
 * wird also nie erneut angezeigt — ein Zurücksetzen von `states` beim
 * Wechsel des Eingabestands ist daher für die Korrektheit nicht nötig, nur
 * laufende Worker eines veralteten Stands werden noch abgebrochen.
 *
 * `RECOMMENDATION` (SCRUM-96, Performance) läuft nicht mehr als ein eigener,
 * sequenzieller Worker-Aufruf: die fünf Kandidaten-Ziele werden parallel (je
 * ein Worker, wie bei den einzelnen Karten) gestartet — bereits fertige
 * Ergebnisse desselben Eingabestands werden wiederverwendet — und über die
 * reine `pickRecommendation` zur Empfehlung kombiniert.
 */
export function useOptimization(params: CalculatorParams, cases: RenovationCase[]) {
  // Betrachtungszeitraum gehört dazu: er ist Teil des Ziels „Mietsumme über B".
  const inputKey = useMemo(() => JSON.stringify({ params, cases }), [params, cases]);
  const [states, setStates] = useState<Record<string, OptimizationState>>({});
  const statesRef = useRef(states);
  statesRef.current = states;
  const workersRef = useRef(new Map<OptimizationGoal, Worker>());
  const requestIdRef = useRef(0);
  const recommendationRequestIdRef = useRef(0);

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

  /** Startet ein einzelnes Sub-Ziel (nie `RECOMMENDATION`) im Worker und löst mit dessen Ergebnis auf. Aktualisiert `states` wie bisher, damit die einzelne Karte des Ziels ebenfalls den Fortschritt zeigt. */
  const startGoalAsync = useCallback((goal: OptimizationGoal): Promise<OptimizationProposal | null> => {
    const key = `${inputKey}|${goal}`;
    const requestId = ++requestIdRef.current;
    setStates((current) => ({ ...current, [key]: { status: 'running', startedAt: Date.now() } }));

    return new Promise((resolve) => {
      if (typeof Worker === 'undefined') {
        const startedAt = performance.now();
        window.setTimeout(() => {
          try {
            const proposal = runInline(params, cases, goal);
            setStates((current) => ({ ...current, [key]: { status: 'done', proposal, durationMs: performance.now() - startedAt } }));
            resolve(proposal);
          } catch (error) {
            setStates((current) => ({ ...current, [key]: { status: 'error', message: error instanceof Error ? error.message : String(error) } }));
            resolve(null);
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
        if (event.data.ok) {
          const proposal = event.data.proposal ?? null;
          setStates((current) => ({ ...current, [key]: { status: 'done', proposal, durationMs: event.data.durationMs ?? 0 } }));
          resolve(proposal);
        } else {
          setStates((current) => ({ ...current, [key]: { status: 'error', message: event.data.message ?? 'Unbekannter Fehler' } }));
          resolve(null);
        }
      };
      worker.onerror = (event) => {
        worker.terminate();
        workersRef.current.delete(goal);
        setStates((current) => ({ ...current, [key]: { status: 'error', message: event.message || 'Worker-Fehler' } }));
        resolve(null);
      };
      worker.postMessage({ requestId, params, cases, goal });
    });
  }, [inputKey, params, cases]);

  /** Liefert ein bereits fertiges Ergebnis desselben Eingabestands wieder, sonst startet `startGoalAsync`. */
  const goalResult = useCallback((goal: OptimizationGoal): Promise<OptimizationProposal | null> => {
    const existing = statesRef.current[`${inputKey}|${goal}`];
    if (existing?.status === 'done') return Promise.resolve(existing.proposal);
    return startGoalAsync(goal);
  }, [inputKey, startGoalAsync]);

  const startRecommendation = useCallback(() => {
    const key = `${inputKey}|RECOMMENDATION`;
    const requestId = ++recommendationRequestIdRef.current;
    const startedAt = performance.now();
    setStates((current) => ({ ...current, [key]: { status: 'running', startedAt: Date.now() } }));

    // Höchstens 5 gleichzeitige Worker: es gibt genau 5 Kandidaten-Ziele, sie
    // laufen also alle parallel — bereits fertige gehen ohne neuen Worker
    // durch `goalResult`.
    Promise.all(RECOMMENDATION_CANDIDATE_GOALS.map((goal) => goalResult(goal))).then((results) => {
      if (requestId !== recommendationRequestIdRef.current) return; // Eine neuere RECOMMENDATION-Anfrage läuft bereits.
      const proposals: Partial<Record<OptimizationGoal, OptimizationProposal | null>> = {};
      RECOMMENDATION_CANDIDATE_GOALS.forEach((goal, index) => {
        proposals[goal] = results[index];
      });
      const proposal = pickRecommendation(params, cases, proposals);
      setStates((current) => ({ ...current, [key]: { status: 'done', proposal, durationMs: performance.now() - startedAt } }));
    });
  }, [inputKey, params, cases, goalResult]);

  const start = useCallback((goal: OptimizationGoal) => {
    if (goal === 'RECOMMENDATION') {
      startRecommendation();
      return;
    }
    void startGoalAsync(goal);
  }, [startGoalAsync, startRecommendation]);

  return { stateFor, start };
}
