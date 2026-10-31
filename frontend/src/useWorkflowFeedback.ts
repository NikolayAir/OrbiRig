import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { InspectionState, VerificationState, Workflow } from "./workflowTypes";
import {
  INSPECTION_CANCELLED,
  VERIFICATION_CANCELLED,
  inspectionAnnouncement,
} from "./workflowContent";

export type FeedbackTargets = {
  containerRef: RefObject<HTMLDivElement | null>;
  submitRef: RefObject<HTMLButtonElement | null>;
  cancelRef: RefObject<HTMLButtonElement | null>;
};

type PendingFeedback = FeedbackTargets & {
  pendingRef: RefObject<boolean>;
};

function useFeedbackTargets(): PendingFeedback {
  const containerRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  return useMemo(() => ({ containerRef, submitRef, cancelRef, pendingRef }), []);
}

function useCompletionFeedback(
  active: boolean,
  state: VerificationState | InspectionState,
  targets: PendingFeedback,
  cancelledMessage: string,
  completedAnnouncement: string,
  announce: (message: string) => void,
) {
  useEffect(() => {
    if (state.kind === "loading" && targets.pendingRef.current && active) {
      targets.cancelRef.current?.focus();
      return;
    }
    const terminal = state.kind !== "idle" && state.kind !== "loading";
    if (!targets.pendingRef.current || !terminal) return;

    // Consume hidden completion too: returning to that panel later must not
    // move the user away from the control they chose in the meantime.
    targets.pendingRef.current = false;
    if (!active || targets.containerRef.current === null) return;
    if (state.kind === "cancelled") {
      targets.submitRef.current?.focus();
      announce(cancelledMessage);
      return;
    }
    focusAndScrollToFeedback(targets.containerRef.current);
    announce(completedAnnouncement);
  }, [active, state, targets, cancelledMessage, completedAnnouncement, announce]);
}

export function useWorkflowFeedback(
  activeWorkflow: Workflow,
  verification: VerificationState,
  inspection: InspectionState,
) {
  const [announcement, setAnnouncement] = useState("");
  const verificationTargets = useFeedbackTargets();
  const inspectionTargets = useFeedbackTargets();

  useEffect(() => {
    function cancelPendingFeedback(event: Event) {
      // Submit and Cancel belong to the pending request. Interacting elsewhere
      // gives up automatic result focus and scrolling in both panels.
      if (event.target instanceof Element && event.target.closest('button[type="submit"]:disabled, button[name="cancel-request"]')) return;
      verificationTargets.pendingRef.current = false;
      inspectionTargets.pendingRef.current = false;
      setAnnouncement("");
    }
    document.addEventListener("focusin", cancelPendingFeedback);
    document.addEventListener("pointerdown", cancelPendingFeedback);
    document.addEventListener("click", cancelPendingFeedback, true);
    window.addEventListener("blur", cancelPendingFeedback);
    return () => {
      document.removeEventListener("focusin", cancelPendingFeedback);
      document.removeEventListener("pointerdown", cancelPendingFeedback);
      document.removeEventListener("click", cancelPendingFeedback, true);
      window.removeEventListener("blur", cancelPendingFeedback);
    };
  }, [verificationTargets, inspectionTargets]);

  useCompletionFeedback(
    activeWorkflow === "verification", verification, verificationTargets,
    VERIFICATION_CANCELLED,
    verification.kind === "completed" ? `Verification completed. Outcome: ${verification.record.outcome}.` : "",
    setAnnouncement,
  );
  useCompletionFeedback(
    activeWorkflow === "inspection", inspection, inspectionTargets,
    INSPECTION_CANCELLED, inspectionAnnouncement(inspection), setAnnouncement,
  );
  return { announcement, setAnnouncement, verificationTargets, inspectionTargets };
}

function focusAndScrollToFeedback(feedback: HTMLDivElement) {
  // Move keyboard focus without causing the browser to scroll immediately.
  // The scroll below chooses a smooth movement or an immediate jump according
  // to the user's reduced-motion setting.
  feedback.querySelector<HTMLElement>("h2, [role='alert']")?.focus({ preventScroll: true });
  const reducedMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  feedback.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
}
