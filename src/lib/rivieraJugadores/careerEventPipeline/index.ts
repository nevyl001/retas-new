export {
  finalizeCareerEvent,
  processCareerEvent,
} from "./pipeline";
export {
  assertCareerEventIntegrity,
  partitionAssertionFailures,
} from "./assertions";
export { formatCareerPipelineSuccessMessage, formatCareerPipelineFailureMessage } from "./formatPipelineSuccess";
export {
  collectProspectiveJugadorRefs,
  formatIdentityPreCloseMessage,
  validateCareerEventPreClose,
} from "./preCloseGuards";
export type { ProspectiveJugadorRef } from "./preCloseGuards";
export type {
  CareerEventKind,
  CareerEventAssertionCode,
  CareerEventAssertionFailure,
  CareerEventAssertionSeverity,
  CareerEventContext,
  CareerEventPipelineOptions,
  CareerEventPipelineResult,
  FinalizeCareerEventInput,
} from "./types";
export { CAREER_EVENT_KIND_TO_TIPO, getAssertionSeverity } from "./types";
