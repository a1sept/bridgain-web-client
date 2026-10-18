import assert from "node:assert/strict";
import { test } from "node:test";
import {
  requestStages,
  customerRequestStage,
  customerEventStage,
} from "../src/request-stages.ts";

test("customer sees four workflow stages independently of legacy development statuses", () => {
  assert.deepEqual(Object.values(requestStages), [
    "요청 접수",
    "검토",
    "개발 진행",
    "완료",
  ]);
  assert.equal(
    customerRequestStage({ status: "received", workflowStage: "review" }),
    "review",
  );
  for (const status of ["review", "revision", "completed"]) {
    assert.equal(customerRequestStage({ status }), "in_progress");
  }
  assert.equal(customerRequestStage({ status: "released" }), "completed");
});

test("meeting review and legacy code review events remain distinct", () => {
  assert.equal(
    customerEventStage({ kind: "status", status: "review" }),
    "in_progress",
  );
  assert.equal(
    customerEventStage({ kind: "workflow_stage", status: "review" }),
    "review",
  );
  assert.equal(
    customerEventStage({ kind: "created", status: "received" }),
    "received",
  );
  assert.equal(
    customerEventStage({ kind: "comment", status: null }),
    undefined,
  );
  assert.equal(
    customerEventStage({ kind: "status", status: "released" }),
    "completed",
  );
});
