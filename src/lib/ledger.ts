/**
 * Ledger operations and span management
 */

import type { Span } from '../types/span';
import {
  appendSpan,
  saveContract,
  getContract,
  getAllContracts,
  getSpansByTrace,
  getIdentity,
} from './database';
import { calculateSpanHash, signSpan, verifySpan, generateUUIDv7 } from './crypto';

// ============================================================================
// LEDGER APPEND OPERATIONS
// ============================================================================

/**
 * Append a span to the ledger with automatic signing
 */
export async function appendToLedger(span: Span): Promise<void> {
  // 1. Calculate hash if not present
  if (!span.this.hash) {
    span.this.hash = await calculateSpanHash(span);
  }

  // 2. Sign if identity exists and no signature yet
  const identity = await getIdentity();
  if (identity && !span.confirmed_by) {
    const signature = await signSpan(span, identity.private_key_handle);
    span.confirmed_by = {
      signature,
      domain: 'minicontratos.local',
      timestamp: new Date().toISOString(),
      signer_id: identity.user_id,
    };
  }

  // 3. Append to ledger
  await appendSpan(span);

  // 4. Update contract view if this is a contract span
  if (span.entity === 'minicontrato') {
    await updateContractFromSpans(span.trace_id);
  }
}

// ============================================================================
// CONTRACT VIEW MANAGEMENT
// ============================================================================

/**
 * Create or update contract view from spans
 */
export async function updateContractFromSpans(traceId: string): Promise<void> {
  const spans = await getSpansByTrace(traceId);
  if (spans.length === 0) return;

  // Find the contract creation span
  const creationSpan = spans.find((s) => s.type === 'contract.created');
  if (!creationSpan) return;

  // Get or create contract
  let contract = await getContract(traceId);
  const now = new Date().toISOString();

  if (!contract) {
    // Create new contract
    contract = {
      id: traceId,
      title: extractContractTitle(creationSpan),
      description: extractContractDescription(creationSpan),
      parties: creationSpan.body.input?.parties
        ? Object.values(creationSpan.body.input.parties)
        : [],
      status: 'active',
      created_at: creationSpan.started_at,
      updated_at: now,
      spans: spans.map((s) => s.id),
      metadata: creationSpan.body.metadata,
    };
  } else {
    // Update existing contract
    contract.updated_at = now;
    contract.spans = spans.map((s) => s.id);

    // Update status based on spans
    const cancelledSpan = spans.find((s) => s.type === 'contract.cancelled');
    const completedSpan = spans.find((s) => s.type === 'contract.completed');

    if (cancelledSpan) {
      contract.status = 'cancelled';
      contract.completed_at = cancelledSpan.completed_at;
    } else if (completedSpan) {
      contract.status = 'completed';
      contract.completed_at = completedSpan.completed_at;
    }
  }

  await saveContract(contract);
}

/**
 * Extract contract title from creation span
 */
function extractContractTitle(span: Span): string {
  const input = span.body.input;

  if (input?.title) return input.title;

  // Generate title from parties
  if (input?.parties) {
    const partyNames = Object.values(input.parties).map((p: any) => p.name);
    return `Contrato entre ${partyNames.join(' e ')}`;
  }

  // Fallback
  return `Contrato ${span.id.slice(0, 8)}`;
}

/**
 * Extract contract description from creation span
 */
function extractContractDescription(span: Span): string | undefined {
  return span.body.input?.description || span.body.metadata?.description;
}

// ============================================================================
// LEDGER VERIFICATION
// ============================================================================

/**
 * Verify ledger integrity
 */
export async function verifyLedger(): Promise<{
  valid: boolean;
  total: number;
  errors: Array<{ span_id: string; error: string }>;
}> {
  const allContracts = await getAllContracts();
  const errors: Array<{ span_id: string; error: string }> = [];
  let totalSpans = 0;

  for (const contract of allContracts) {
    const spans = await getSpansByTrace(contract.id);
    totalSpans += spans.length;

    for (const span of spans) {
      // 1. Verify hash
      const calculatedHash = await calculateSpanHash(span);
      if (span.this.hash !== calculatedHash) {
        errors.push({
          span_id: span.id,
          error: `Hash mismatch: expected ${span.this.hash}, got ${calculatedHash}`,
        });
      }

      // 2. Verify signature if present
      if (span.confirmed_by?.signature) {
        const identity = await getIdentity();
        if (identity) {
          try {
            const isValid = await verifySpan(span, identity.private_key_handle as any);
            if (!isValid) {
              errors.push({
                span_id: span.id,
                error: 'Invalid signature',
              });
            }
          } catch (error) {
            errors.push({
              span_id: span.id,
              error: `Signature verification error: ${error}`,
            });
          }
        }
      }

      // 3. Verify parent reference if present
      if (span.parent_id) {
        const parentExists = spans.some((s) => s.id === span.parent_id);
        if (!parentExists) {
          errors.push({
            span_id: span.id,
            error: `Parent span ${span.parent_id} not found`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    total: totalSpans,
    errors,
  };
}

// ============================================================================
// SPAN BUILDERS
// ============================================================================

/**
 * Create a contract creation span
 */
export function createContractSpan(
  contractData: {
    parties: any;
    amount?: number;
    currency?: string;
    deadline?: string;
    deliverable?: string;
    rules?: any[];
    metadata?: any;
  },
  _userId: string
): Span {
  const now = new Date().toISOString();
  const traceId = `contract-${generateUUIDv7()}`;

  return {
    id: generateUUIDv7(),
    trace_id: traceId,
    type: 'contract.created',
    entity: 'minicontrato',
    body: {
      action: 'create_contract',
      input: contractData,
      rules: contractData.rules || [],
    },
    started_at: now,
    completed_at: now,
    duration_ms: 0,
    this: {
      hash: '', // Will be calculated before appending
      version: '1.0.0',
    },
  };
}

/**
 * Create an obligation span
 */
export function createObligationSpan(
  traceId: string,
  parentId: string,
  obligationData: {
    debtor_id: string;
    creditor_id: string;
    amount: number;
    due_date: string;
    status: string;
  }
): Span {
  const now = new Date().toISOString();

  return {
    id: generateUUIDv7(),
    trace_id: traceId,
    parent_id: parentId,
    type: 'obligation.registered',
    entity: 'minicontrato',
    body: {
      action: 'register_obligation',
      input: obligationData,
    },
    started_at: now,
    completed_at: now,
    duration_ms: 0,
    this: {
      hash: '',
      version: '1.0.0',
    },
  };
}

/**
 * Create a user registration span
 */
export function createUserRegistrationSpan(
  userId: string,
  userName: string
): Span {
  const now = new Date().toISOString();
  const traceId = `onboarding-${userId}`;

  return {
    id: generateUUIDv7(),
    trace_id: traceId,
    type: 'user.registered',
    entity: 'user',
    body: {
      action: 'register_user',
      input: { name: userName, user_id: userId },
      output: { success: true, user_id: userId },
    },
    started_at: now,
    completed_at: now,
    duration_ms: 0,
    this: {
      hash: '',
      version: '1.0.0',
    },
  };
}
