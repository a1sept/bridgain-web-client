export type WorkflowStage = "received" | "review" | "in_progress" | "completed";
export const requestStages: Record<WorkflowStage, string> = {
  received: "요청 접수",
  review: "검토",
  in_progress: "개발 진행",
  completed: "완료",
};
// Legacy review/completed mean code review/development complete, not deployment.
export function legacyRequestStage(status?: string | null): WorkflowStage {
  if (status === "released") return "completed";
  if (!status || status === "received") return "received";
  return "in_progress";
}
export function customerRequestStage(request: {
  status: string;
  workflowStage?: string;
}): WorkflowStage {
  const stage = request.workflowStage;
  return stage && Object.hasOwn(requestStages, stage)
    ? (stage as WorkflowStage)
    : legacyRequestStage(request.status);
}
export function customerEventStage(event: {
  kind: string;
  status?: string | null;
  workflowStage?: string;
}): WorkflowStage | undefined {
  if (event.workflowStage && Object.hasOwn(requestStages, event.workflowStage))
    return event.workflowStage as WorkflowStage;
  if (
    event.kind === "workflow_stage" &&
    event.status &&
    Object.hasOwn(requestStages, event.status)
  )
    return event.status as WorkflowStage;
  if (event.kind === "created") return "received";
  if (event.kind === "status" && event.status)
    return legacyRequestStage(event.status);
  return undefined;
}
