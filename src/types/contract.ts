/**
 * Contract domain types
 */

export interface Party {
  id?: string;
  name: string;
  role: string; // "pagador", "recebedor", "prestador", "cliente", etc
  email?: string;
}

export type ContractStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export interface Contract {
  id: string;
  title: string;
  description?: string;
  parties: Party[];
  status: ContractStatus;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  spans: string[]; // IDs of related spans
  metadata?: Record<string, any>;
}

export interface ContractFormData {
  parties: Party[];
  amount?: number;
  currency?: string;
  deadline?: string;
  deliverable?: string;
  rules?: Array<{
    condition: string;
    action: string;
    description: string;
  }>;
}
