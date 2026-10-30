import { apiRequest } from "./client";
import type {
  AcquisitionPlan,
  AcquisitionPlanItem,
  AddAcquisitionItemPayload,
  CreateAcquisitionPlanPayload,
  UpdateAcquisitionItemPayload,
  UpdateAcquisitionPlanPayload,
  SplitAcquisitionItemPayload,
} from "../types/api";

export function getAcquisitionPlans() {
  return apiRequest<AcquisitionPlan[]>("/api/acquisition-plans");
}

export function getAcquisitionPlan(planId: number) {
  return apiRequest<AcquisitionPlan>(`/api/acquisition-plans/${planId}`);
}

export function archiveAcquisitionPlan(planId: number) {
  return apiRequest<AcquisitionPlan>(
    `/api/acquisition-plans/${planId}/archive`,
    {
      method: "POST",
    },
  );
}

export function restoreAcquisitionPlan(planId: number) {
  return apiRequest<AcquisitionPlan>(
    `/api/acquisition-plans/${planId}/restore`,
    {
      method: "POST",
    },
  );
}

export function createAcquisitionPlan(payload: CreateAcquisitionPlanPayload) {
  return apiRequest<AcquisitionPlan>("/api/acquisition-plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAcquisitionPlan(
  planId: number,
  payload: UpdateAcquisitionPlanPayload,
) {
  return apiRequest<AcquisitionPlan>(`/api/acquisition-plans/${planId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAcquisitionPlan(planId: number) {
  return apiRequest<{ deleted: boolean; id: number }>(
    `/api/acquisition-plans/${planId}`,
    { method: "DELETE" },
  );
}

export function updateAcquisitionItem(
  itemId: number,
  payload: UpdateAcquisitionItemPayload,
) {
  return apiRequest<AcquisitionPlanItem>(
    `/api/acquisition-plans/items/${itemId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

/** Return the committed plan without a second refresh request. */
export function addAcquisitionPrinting(
  planId: number,
  payload: AddAcquisitionItemPayload,
) {
  return apiRequest<AcquisitionPlan>(`/api/acquisition-plans/${planId}/printings`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function receiveAcquisitionItem(itemId: number, quantity: number) {
  return apiRequest<AcquisitionPlanItem>(
    `/api/acquisition-plans/items/${itemId}/receive`,
    {
      method: "POST",
      body: JSON.stringify({ quantity }),
    },
  );
}

export function splitAcquisitionItem(
  itemId: number,
  payload: SplitAcquisitionItemPayload,
) {
  return apiRequest<AcquisitionPlan>(
    `/api/acquisition-plans/items/${itemId}/split`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export type AcquisitionBatchAction = "mark_incoming" | "receive";

export function batchAcquisitionItems(
  planId: number,
  action: AcquisitionBatchAction,
  itemIds: number[],
) {
  return apiRequest<AcquisitionPlan>(
    `/api/acquisition-plans/${planId}/items/batch`,
    { method: "POST", body: JSON.stringify({ action, item_ids: itemIds }) },
  );
}

export function removeAcquisitionItem(itemId: number) {
  return apiRequest<{ deleted: boolean; id: number }>(
    `/api/acquisition-plans/items/${itemId}`,
    { method: "DELETE" },
  );
}
