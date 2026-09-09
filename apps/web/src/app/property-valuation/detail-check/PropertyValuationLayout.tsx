"use client";

import { DetailFieldLegend, FixedOverlay, Header, PAGE_CONTAINER_CLASS, Stepper, StickyActionBar } from '@/components/ui';
import { PropertyValuationSteps } from '@/constants/PropertyValuationUseCases';
import { authFetch } from '@/lib/api/authFetch';
import { useRouter } from 'next/navigation';
import { Children, cloneElement, isValidElement, useEffect, useMemo, useState } from 'react';

interface DetailCheckStatusRow {
  has_acquisition_costs: boolean;
  has_rental: boolean;
  has_financing: boolean;
  has_depreciation: boolean;
  has_renovation: boolean;
  has_calculator: boolean;
  has_location_score: boolean;
  has_comparison: boolean;
  recommendation_level: string | null;
}

interface PropertyValuationLayoutProps {
  children: React.ReactNode;
  currentStep: number;
  /** Current step's page title — usually more specific than the generic
   *  Stepper label (e.g. "Restnutzungsdauer in Jahren" vs. "Abschreibung"). */
  title: string;
  /** Optional action(s) shown next to the breadcrumb, e.g. a "Überspringen" button. */
  actions?: React.ReactNode;
  /** Persists the current step before direct navigation through the stepper. */
  beforeStepChange?: () => Promise<boolean>;
  /** Set by steps that render at least one calculated/taken-over (locked)
   *  field — shows the lock-icon legend at the bottom of the page so it
   *  only appears where it's actually relevant. */
  showFieldLegend?: boolean;
}

const LAST_ACTIVE_IDENTITY_KEY = 'detail-check:last-active-identity';

export function PropertyValuationLayout({
  children,
  currentStep,
  title,
  actions,
  beforeStepChange,
  showFieldLegend,
}: PropertyValuationLayoutProps) {
  const router = useRouter();
  const [maxReachedStep, setMaxReachedStep] = useState(currentStep);
  // Which steps actually have saved data — drives the Stepper's checkmarks.
  // Undefined until the fetch below resolves, so the Stepper falls back to
  // its "everything before currentStep" default in the meantime.
  const [completedSteps, setCompletedSteps] = useState<boolean[] | undefined>(undefined);
  const [isChangingStep, setIsChangingStep] = useState(false);
  const [previousStep, setPreviousStep] = useState(currentStep);
  const [motionDirection, setMotionDirection] = useState<'forward' | 'backward' | 'none'>('none');
  const [motionReady, setMotionReady] = useState(false);
  const [motionKey, setMotionKey] = useState(0);

  // Convert steps to stepper format
  const stepperSteps = PropertyValuationSteps.map((step) => ({
    label: step.label,
  }));
  const storageKey = useMemo(() => {
    if (typeof window === 'undefined') return 'detail-check:max-step:draft';
    const params = new URLSearchParams(window.location.search);
    const quickCheckId = params.get('quickCheckId');
    const workflowId = params.get('workflowId');
    if (quickCheckId) return `detail-check:max-step:quick-check:${quickCheckId}`;
    return workflowId ? `detail-check:max-step:${workflowId}` : 'detail-check:max-step:new';
  }, []);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(storageKey));
    const nextMax = Number.isFinite(stored) ? Math.max(stored, currentStep) : currentStep;
    window.localStorage.setItem(storageKey, String(nextMax));
    setMaxReachedStep(nextMax);
  }, [currentStep, storageKey]);

  // Remembers whichever identity (quickCheckId or workflowId) is currently
  // active, and recovers it when a step other than Objektdaten is opened
  // without one — a stale bookmark, a browser-history entry from mid-flow,
  // or a manually typed URL. Without this, the step's own API route falls
  // back to a generic per-user draft identity that has none of the actual
  // saved data, so the page renders blank even though the real data still
  // exists under the real workflow.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const quickCheckId = params.get('quickCheckId');
    const workflowId = params.get('workflowId');

    if (quickCheckId) {
      window.localStorage.setItem(LAST_ACTIVE_IDENTITY_KEY, `quickCheckId=${encodeURIComponent(quickCheckId)}`);
      return;
    }
    if (workflowId) {
      window.localStorage.setItem(LAST_ACTIVE_IDENTITY_KEY, `workflowId=${encodeURIComponent(workflowId)}`);
      return;
    }
    // Objektdaten legitimately starts blank (a brand-new detail check mints
    // its own fresh workflow on first save) — only later steps ever need
    // recovery, since they always expect an identity to already exist.
    if (currentStep === 0) return;

    const recovered = window.localStorage.getItem(LAST_ACTIVE_IDENTITY_KEY);
    if (recovered) router.replace(`${window.location.pathname}?${recovered}`);
  }, [currentStep, router]);

  // maxReachedStep otherwise only grows from steps visited *in this browser*
  // (tracked via localStorage) — so data saved another way (seeded directly,
  // filled in on a different device, a resumed session after clearing site
  // data) left already-completed steps stuck un-clickable. Checking which
  // steps actually have saved data unlocks the Stepper up to the real
  // furthest point regardless of what this browser has personally visited.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const quickCheckId = params.get('quickCheckId');
    const workflowId = params.get('workflowId');
    if (!quickCheckId && !workflowId) return;

    let cancelled = false;
    const query = quickCheckId
      ? `quickCheckId=${encodeURIComponent(quickCheckId)}`
      : `workflowId=${encodeURIComponent(workflowId as string)}`;

    authFetch(`/api/detail-checks?${query}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() as Promise<DetailCheckStatusRow[]> : null))
      .then((rows) => {
        if (cancelled || !rows?.[0]) return;
        const row = rows[0];
        const stepDone = [
          true, // Objektdaten — this row wouldn't exist otherwise
          row.has_acquisition_costs,
          row.has_rental,
          row.has_financing,
          row.has_depreciation,
          row.has_renovation,
          row.has_calculator,
          row.has_location_score,
          row.has_comparison,
          Boolean(row.recommendation_level), // Ergebnis
        ];
        setCompletedSteps(stepDone);

        let furthestIndex = 0;
        for (let i = 1; i < stepDone.length - 1; i++) {
          if (stepDone[i]) furthestIndex = i;
          else break;
        }
        const dataMax = Math.min(furthestIndex + 1, PropertyValuationSteps.length - 1);
        setMaxReachedStep((prev) => {
          const next = Math.max(prev, dataMax);
          window.localStorage.setItem(storageKey, String(next));
          return next;
        });
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [storageKey]);

  useEffect(() => {
    const navigationKey = `${storageKey}:last-visible-step`;
    const storedStep = Number(window.sessionStorage.getItem(navigationKey));
    const previousStep = Number.isInteger(storedStep) ? storedStep : currentStep;
    const direction = previousStep < currentStep
      ? 'forward'
      : previousStep > currentStep
        ? 'backward'
        : 'none';

    setMotionReady(false);
    setMotionDirection(direction);
    setPreviousStep(previousStep);
    setMotionKey((value) => value + 1);
    window.sessionStorage.setItem(navigationKey, String(currentStep));

    const revealFrame = window.requestAnimationFrame(() => {
      setMotionReady(true);
    });

    return () => window.cancelAnimationFrame(revealFrame);
  }, [currentStep, storageKey]);

  // "Schritt X von N" + (where relevant) the locked-field legend — both live
  // in the sticky bar's leftContent instead of taking up page-content space.
  const stepProgressContent = (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span>Schritt {currentStep + 1} von {stepperSteps.length}</span>
      {showFieldLegend && (
        <>
          <span className="text-border" aria-hidden="true">|</span>
          <DetailFieldLegend />
        </>
      )}
    </div>
  );

  const pageChildren: React.ReactNode[] = [];
  const fixedChildren: React.ReactNode[] = [];
  Children.forEach(children, (child, index) => {
    if (isValidElement(child) && child.type === StickyActionBar) {
      fixedChildren.push(cloneElement(child as React.ReactElement<{ leftContent?: React.ReactNode }>, {
        key: child.key ?? `fixed-${index}`,
        leftContent: stepProgressContent,
      }));
    } else if (isValidElement(child) && child.type === FixedOverlay) {
      fixedChildren.push(cloneElement(child, { key: child.key ?? `fixed-${index}` }));
    } else if (isValidElement(child)) {
      pageChildren.push(cloneElement(child, { key: child.key ?? `page-${index}` }));
    } else {
      pageChildren.push(child);
    }
  });

  const navigateToStep = async (stepIndex: number) => {
    if (stepIndex > maxReachedStep || stepIndex === currentStep || isChangingStep) return;
    const target = PropertyValuationSteps[stepIndex];
    if (!target?.path) return;
    setIsChangingStep(true);
    try {
      if (beforeStepChange && !(await beforeStepChange())) return;
      const suffix = typeof window === 'undefined' ? '' : window.location.search;
      router.push(`${target.path}${suffix}`);
    } finally {
      setIsChangingStep(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Bar - always shows property-valuation as active */}
      <main className={PAGE_CONTAINER_CLASS}>
        <Header
          items={[
            { label: 'Objektbewertung' },
            { label: 'Detailbewertung', href: '/property-valuation/detail-check' },
            { label: title },
          ]}
          actions={actions}
        />

        {/* Stepper */}
        <div className="mb-8">
          <Stepper
            steps={stepperSteps}
            currentStep={currentStep}
            previousStep={previousStep}
            progressStep={motionReady ? currentStep : previousStep}
            progressDirection={motionReady ? motionDirection : 'none'}
            maxClickableStep={maxReachedStep}
            completedSteps={completedSteps}
            onStepClick={(stepIndex) => void navigateToStep(stepIndex)}
          />
        </div>

        {/* Page Content */}
        <div
          key={`${currentStep}-${motionKey}`}
          className={motionReady
            ? motionDirection === 'forward'
              ? 'detail-step-enter-forward'
              : motionDirection === 'backward'
                ? 'detail-step-enter-backward'
                : 'detail-step-enter-initial'
            : 'opacity-0'}
        >
          {pageChildren}
        </div>

        {fixedChildren}
      </main>
    </div>
  );
}
