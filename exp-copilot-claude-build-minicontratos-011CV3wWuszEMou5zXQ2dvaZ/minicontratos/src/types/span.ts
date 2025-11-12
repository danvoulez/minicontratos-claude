/**
 * JSON✯Atomic Span - The core atomic unit of the system
 */

export interface Rule {
  id: string;
  condition: string;
  action: string;
  parameters?: Record<string, any>;
  description?: string;
}

export interface SpanBody {
  action: string;
  input: any;
  output?: any;
  rules?: Rule[];
  metadata?: Record<string, any>;
}

export interface SpanHash {
  hash: string; // "blake3:abc123..."
  version: string;
}

export interface SpanConfirmation {
  signature: string; // "ed25519:xyz789..."
  domain: string; // "minicontratos.local"
  timestamp: string; // ISO 8601
  signer_id: string;
}

export interface Span {
  // Unique identification
  id: string; // UUID v7 or hash-based
  trace_id: string; // Groups related spans
  parent_id?: string; // For hierarchies

  // Type and metadata
  type: string; // "contract.created", "payment.verified", etc
  entity: string; // "minicontrato", "user", "payment"

  // Semantic content
  body: SpanBody;

  // Temporal
  started_at: string; // ISO 8601
  completed_at?: string;
  duration_ms?: number;

  // Cryptography and Integrity
  this: SpanHash;

  // Signature (optional but recommended)
  confirmed_by?: SpanConfirmation;
}

// Common span types
export type SpanType =
  | 'contract.created'
  | 'contract.updated'
  | 'contract.cancelled'
  | 'obligation.registered'
  | 'obligation.fulfilled'
  | 'payment.verified'
  | 'deliverable.released'
  | 'rule.defined'
  | 'rule.executed'
  | 'user.registered'
  | 'user.updated';

export type EntityType =
  | 'minicontrato'
  | 'user'
  | 'payment'
  | 'deliverable'
  | 'rule';
