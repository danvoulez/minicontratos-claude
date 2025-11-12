/**
 * IndexedDB schema types
 */

import type { Span } from './span';
import type { Contract } from './contract';

export interface DatabaseSchema {
  spans: {
    key: string;
    value: Span;
    indexes: {
      'by-trace': string;
      'by-type': string;
      'by-entity': string;
      'by-time': string;
      'by-user': string;
    };
  };
  contracts: {
    key: string;
    value: Contract;
    indexes: {
      'by-status': ContractStatus;
      'by-created': string;
    };
  };
  users: {
    key: string;
    value: User;
  };
  credentials: {
    key: string; // Hash of API key
    value: Credential;
  };
  identity: {
    key: 'self';
    value: Identity;
  };
  session: {
    key: 'current';
    value: Session;
  };
  settings: {
    key: string;
    value: any;
  };
}

export interface User {
  id: string;
  name: string;
  email?: string;
  created_at: string;
}

export type LLMProvider = 'anthropic' | 'openai' | 'ollama';

export interface Credential {
  user_id: string;
  encrypted_key: string;
  provider: LLMProvider;
  model?: string;
  created_at: string;
}

export interface Identity {
  id: 'self';
  user_id: string;
  public_key: JsonWebKey;
  private_key_handle: CryptoKey;
  created_at: string;
}

export interface Session {
  user_id: string;
  started_at: string;
  last_activity: string;
  api_key?: string; // Decrypted in memory only
  provider?: LLMProvider;
  model?: string;
}

export type ContractStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export interface SpanFilter {
  trace_id?: string;
  type?: string;
  entity?: string;
  user_id?: string;
  from?: string;
  to?: string;
  limit?: number;
}
