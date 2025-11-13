/**
 * IndexedDB ledger operations
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Span } from '../types/span';
import type { Contract, ContractStatus } from '../types/contract';
import type { User, Credential, Identity, Session, SpanFilter } from '../types/database';

interface MinicontratosDB extends DBSchema {
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
    key: string;
    value: Credential;
  };
  identity: {
    key: string;
    value: Identity;
  };
  session: {
    key: string;
    value: Session;
  };
  settings: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'minicontratos';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<MinicontratosDB> | null = null;

/**
 * Initialize and open the database
 */
export async function initDB(): Promise<IDBPDatabase<MinicontratosDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<MinicontratosDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Spans store - append-only ledger
      if (!db.objectStoreNames.contains('spans')) {
        const spanStore = db.createObjectStore('spans', { keyPath: 'id' });
        spanStore.createIndex('by-trace', 'trace_id');
        spanStore.createIndex('by-type', 'type');
        spanStore.createIndex('by-entity', 'entity');
        spanStore.createIndex('by-time', 'started_at');
        spanStore.createIndex('by-user', 'confirmed_by.signer_id');
      }

      // Contracts store - materialized view
      if (!db.objectStoreNames.contains('contracts')) {
        const contractStore = db.createObjectStore('contracts', { keyPath: 'id' });
        contractStore.createIndex('by-status', 'status');
        contractStore.createIndex('by-created', 'created_at');
      }

      // Users store
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'id' });
      }

      // Credentials store
      if (!db.objectStoreNames.contains('credentials')) {
        db.createObjectStore('credentials', { keyPath: 'user_id' });
      }

      // Identity store
      if (!db.objectStoreNames.contains('identity')) {
        db.createObjectStore('identity', { keyPath: 'id' });
      }

      // Session store
      if (!db.objectStoreNames.contains('session')) {
        db.createObjectStore('session', { keyPath: 'user_id' });
      }

      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    },
  });

  return dbInstance;
}

/**
 * Get database instance
 */
export async function getDB(): Promise<IDBPDatabase<MinicontratosDB>> {
  if (!dbInstance) {
    return await initDB();
  }
  return dbInstance;
}

// ============================================================================
// LEDGER OPERATIONS (Append-only)
// ============================================================================

/**
 * Append a span to the ledger
 */
export async function appendSpan(span: Span): Promise<void> {
  const db = await getDB();
  await db.add('spans', span);
}

/**
 * Query spans from the ledger
 */
export async function querySpans(filter: SpanFilter): Promise<Span[]> {
  const db = await getDB();
  let spans: Span[] = [];

  // Use indexes for efficient queries
  if (filter.trace_id) {
    const tx = db.transaction('spans', 'readonly');
    const index = tx.store.index('by-trace');
    spans = await index.getAll(filter.trace_id);
  } else if (filter.type) {
    const tx = db.transaction('spans', 'readonly');
    const index = tx.store.index('by-type');
    spans = await index.getAll(filter.type);
  } else if (filter.entity) {
    const tx = db.transaction('spans', 'readonly');
    const index = tx.store.index('by-entity');
    spans = await index.getAll(filter.entity);
  } else {
    // Get all spans if no specific filter
    spans = await db.getAll('spans');
  }

  // Apply additional filters
  let filtered = spans;

  if (filter.user_id) {
    filtered = filtered.filter(
      (s) => s.confirmed_by?.signer_id === filter.user_id
    );
  }

  if (filter.from) {
    filtered = filtered.filter((s) => s.started_at >= filter.from!);
  }

  if (filter.to) {
    filtered = filtered.filter((s) => s.started_at <= filter.to!);
  }

  // Sort by time (newest first)
  filtered.sort((a, b) => b.started_at.localeCompare(a.started_at));

  if (filter.limit) {
    filtered = filtered.slice(0, filter.limit);
  }

  return filtered;
}

/**
 * Get a single span by ID
 */
export async function getSpan(id: string): Promise<Span | undefined> {
  const db = await getDB();
  return await db.get('spans', id);
}

/**
 * Get all spans for a trace
 */
export async function getSpansByTrace(traceId: string): Promise<Span[]> {
  return await querySpans({ trace_id: traceId });
}

/**
 * Get span count
 */
export async function getSpanCount(): Promise<number> {
  const db = await getDB();
  return await db.count('spans');
}

// ============================================================================
// CONTRACT OPERATIONS
// ============================================================================

/**
 * Create or update a contract
 */
export async function saveContract(contract: Contract): Promise<void> {
  const db = await getDB();
  await db.put('contracts', contract);
}

/**
 * Get a contract by ID
 */
export async function getContract(id: string): Promise<Contract | undefined> {
  const db = await getDB();
  return await db.get('contracts', id);
}

/**
 * Get all contracts
 */
export async function getAllContracts(): Promise<Contract[]> {
  const db = await getDB();
  const contracts = await db.getAll('contracts');
  return contracts.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * Get contracts by status
 */
export async function getContractsByStatus(
  status: ContractStatus
): Promise<Contract[]> {
  const db = await getDB();
  const tx = db.transaction('contracts', 'readonly');
  const index = tx.store.index('by-status');
  return await index.getAll(status);
}

/**
 * Delete a contract (not recommended - breaks immutability)
 */
export async function deleteContract(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('contracts', id);
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

/**
 * Create or update a user
 */
export async function saveUser(user: User): Promise<void> {
  const db = await getDB();
  await db.put('users', user);
}

/**
 * Get user by ID
 */
export async function getUser(id: string): Promise<User | undefined> {
  const db = await getDB();
  return await db.get('users', id);
}

/**
 * Get all users
 */
export async function getAllUsers(): Promise<User[]> {
  const db = await getDB();
  return await db.getAll('users');
}

// ============================================================================
// CREDENTIAL OPERATIONS
// ============================================================================

/**
 * Save encrypted credentials
 */
export async function saveCredential(credential: Credential): Promise<void> {
  const db = await getDB();
  await db.put('credentials', credential);
}

/**
 * Get credential by user ID
 */
export async function getCredential(
  userId: string
): Promise<Credential | undefined> {
  const db = await getDB();
  return await db.get('credentials', userId);
}

// ============================================================================
// IDENTITY OPERATIONS
// ============================================================================

/**
 * Save identity (cryptographic keys)
 */
export async function saveIdentity(identity: Identity): Promise<void> {
  const db = await getDB();
  await db.put('identity', identity);
}

/**
 * Get current identity
 */
export async function getIdentity(): Promise<Identity | undefined> {
  const db = await getDB();
  return await db.get('identity', 'self');
}

// ============================================================================
// SESSION OPERATIONS
// ============================================================================

/**
 * Save current session
 */
export async function saveSession(session: Session): Promise<void> {
  const db = await getDB();
  await db.put('session', session);
}

/**
 * Get current session
 */
export async function getCurrentSession(): Promise<Session | undefined> {
  const db = await getDB();
  const sessions = await db.getAll('session');
  return sessions[0]; // Return first session (should only be one)
}

/**
 * Clear session
 */
export async function clearSession(userId: string): Promise<void> {
  const db = await getDB();
  await db.delete('session', userId);
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn(): Promise<boolean> {
  const session = await getCurrentSession();
  return !!session;
}

// ============================================================================
// SETTINGS OPERATIONS
// ============================================================================

/**
 * Save a setting
 */
export async function saveSetting(key: string, value: any): Promise<void> {
  const db = await getDB();
  await db.put('settings', value, key);
}

/**
 * Get a setting
 */
export async function getSetting(key: string): Promise<any | undefined> {
  const db = await getDB();
  return await db.get('settings', key);
}

// ============================================================================
// EXPORT OPERATIONS
// ============================================================================

/**
 * Export ledger to different formats
 */
export async function exportLedger(
  format: 'ndjson' | 'json' | 'csv'
): Promise<Blob> {
  const db = await getDB();
  const allSpans = await db.getAll('spans');

  switch (format) {
    case 'ndjson': {
      // Newline Delimited JSON
      const ndjson = allSpans.map((s) => JSON.stringify(s)).join('\n') + '\n';
      return new Blob([ndjson], { type: 'application/x-ndjson' });
    }

    case 'json': {
      // JSON array
      return new Blob([JSON.stringify(allSpans, null, 2)], {
        type: 'application/json',
      });
    }

    case 'csv': {
      // CSV simplified
      const headers = [
        'id',
        'trace_id',
        'type',
        'entity',
        'started_at',
        'hash',
        'signature',
      ];
      const rows = allSpans.map((s) => [
        s.id,
        s.trace_id,
        s.type,
        s.entity,
        s.started_at,
        s.this.hash,
        s.confirmed_by?.signature || '',
      ]);
      const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
      return new Blob([csv], { type: 'text/csv' });
    }

    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Clear all data (use with caution!)
 */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['spans', 'contracts', 'users', 'credentials', 'identity', 'session', 'settings'],
    'readwrite'
  );

  await Promise.all([
    tx.objectStore('spans').clear(),
    tx.objectStore('contracts').clear(),
    tx.objectStore('users').clear(),
    tx.objectStore('credentials').clear(),
    tx.objectStore('identity').clear(),
    tx.objectStore('session').clear(),
    tx.objectStore('settings').clear(),
  ]);

  await tx.done;
}
