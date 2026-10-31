/**
 * API client for ClaimShield services.
 * Routes through APISIX gateway or directly to services in dev.
 */

import { authFetch } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9080';

export interface Claim {
  id: string;
  tenant_id: string;
  clinic_id: string;
  patient_id: string | null;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  denial_reason: string | null;
  raw_denial_text: string;
  raw_clinical_notes: string;
  amount_denied_cents: number | null;
  amount_approved_cents: number | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Appeal {
  id: string;
  tenant_id: string;
  claim_id: string;
  version: number;
  letter_text: string | null;
  policy_evidence: string | null;
  confidence: number | null;
  needs_review: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface PipelineResult {
  status: string;
  denial_summary: {
    denial_code: string | null;
    denial_reason: string | null;
    payer_name: string | null;
    amount_denied_cents: number | null;
    parser_confidence: number | null;
    parser_needs_review: boolean;
  };
  rule_results: Array<{
    rule_id: string;
    passed: boolean;
    severity: string;
    message: string;
    source: string;
  }>;
  has_rule_blockers: boolean;
  generated_appeal: string | null;
  writer_confidence: number | null;
  needs_human_review: boolean;
}

async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await authFetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(error.detail || error.title || `API error ${resp.status}`);
  }
  return resp.json();
}

export const claimsApi = {
  list: (params?: { status?: string; limit?: number }) =>
    apiCall<Claim[]>(`/api/v1/claims?${new URLSearchParams(params as Record<string, string>).toString()}`),
  get: (id: string) => apiCall<Claim>(`/api/v1/claims/${id}`),
  create: (data: Partial<Claim>) =>
    apiCall<Claim>('/api/v1/claims', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id: string, status: string, reviewedBy?: string) =>
    apiCall<Claim>(`/api/v1/claims/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reviewed_by: reviewedBy }),
    }),
};

export const appealsApi = {
  list: (params?: { claim_id?: string; needs_review?: boolean }) =>
    apiCall<Appeal[]>(`/api/v1/appeals?${new URLSearchParams(params as Record<string, string>).toString()}`),
  get: (id: string) => apiCall<Appeal>(`/api/v1/appeals/${id}`),
  create: (data: { claim_id: string; letter_text?: string; confidence?: number }) =>
    apiCall<Appeal>('/api/v1/appeals', { method: 'POST', body: JSON.stringify(data) }),
  approve: (id: string, approvedBy: string) =>
    apiCall<Appeal>(`/api/v1/appeals/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ approved_by: approvedBy }),
    }),
  send: (id: string) =>
    apiCall<Appeal>(`/api/v1/appeals/${id}/send`, { method: 'PATCH' }),
};

export const pipelineApi = {
  run: (denialText: string, clinicalNotes: string) =>
    apiCall<PipelineResult>('/api/v1/pipeline/run', {
      method: 'POST',
      body: JSON.stringify({ denial_text: denialText, clinical_notes: clinicalNotes }),
    }),
};
