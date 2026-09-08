"use client";

import { DetailFieldLegend, FixedOverlay, Header, PAGE_CONTAINER_CLASS, Stepper, StickyActionBar } from '@/components/ui';
import { PropertyValuationSteps } from '@/constants/PropertyValuationUseCases';
import { useRouter } from 'next/navigation';
import { Children, cloneElement, isValidElement, useEffect, useMemo, useState } from 'react';

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
