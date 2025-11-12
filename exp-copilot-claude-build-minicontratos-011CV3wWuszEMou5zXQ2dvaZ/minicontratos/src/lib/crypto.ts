/**
 * Cryptography utilities using Web Crypto API
 */

import { blake3 } from '@noble/hashes/blake3.js';

import type { Span } from '../types/span';

// ============================================================================
// HASHING (BLAKE3)
// ============================================================================

/**
 * Calculate BLAKE3 hash of data
 */
export function calculateHash(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = blake3(bytes);
  return 'blake3:' + bytesToHex(hash);
}

/**
 * Calculate hash of a span (excluding the hash and signature fields)
 */
export async function calculateSpanHash(span: Span): Promise<string> {
  // Create a copy without hash and signature
  const spanForHashing = {
    ...span,
    this: { ...span.this, hash: '' },
    confirmed_by: span.confirmed_by
      ? { ...span.confirmed_by, signature: '' }
      : undefined,
  };

  // Remove empty signature field if present
  if (spanForHashing.confirmed_by?.signature === '') {
    const { signature, ...rest } = spanForHashing.confirmed_by;
    spanForHashing.confirmed_by = rest as any;
  }

  const jsonString = JSON.stringify(spanForHashing, null, 0);
  return calculateHash(jsonString);
}

// ============================================================================
// SIGNATURES (Ed25519)
// ============================================================================

/**
 * Generate Ed25519 key pair using Web Crypto API
 */
export async function generateKeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'Ed25519',
    } as any,
    false, // not extractable for security
    ['sign', 'verify']
  );

  return keyPair as { publicKey: CryptoKey; privateKey: CryptoKey };
}

/**
 * Export public key to JWK format
 */
export async function exportPublicKey(publicKey: CryptoKey): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey('jwk', publicKey);
}

/**
 * Import public key from JWK format
 */
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'Ed25519',
    } as any,
    true,
    ['verify']
  );
}

/**
 * Sign data with private key
 */
export async function sign(
  data: string | Uint8Array,
  privateKey: CryptoKey
): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

  const signature = await crypto.subtle.sign(
    {
      name: 'Ed25519',
    } as any,
    privateKey,
    bytes as BufferSource
  );

  return 'ed25519:' + bytesToHex(new Uint8Array(signature));
}

/**
 * Sign a span with private key
 */
export async function signSpan(
  span: Span,
  privateKey: CryptoKey
): Promise<string> {
  // Calculate hash first if not present
  if (!span.this.hash) {
    span.this.hash = await calculateSpanHash(span);
  }

  // Sign the hash
  return await sign(span.this.hash, privateKey);
}

/**
 * Verify signature with public key
 */
export async function verify(
  data: string | Uint8Array,
  signature: string,
  publicKey: CryptoKey
): Promise<boolean> {
  try {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

    // Remove prefix if present
    const sigHex = signature.startsWith('ed25519:')
      ? signature.slice(8)
      : signature;

    const sigBytes = hexToBytes(sigHex);

    return await crypto.subtle.verify(
      {
        name: 'Ed25519',
      } as any,
      publicKey,
      sigBytes as BufferSource,
      bytes as BufferSource
    );
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Verify span signature
 */
export async function verifySpan(
  span: Span,
  publicKey: CryptoKey
): Promise<boolean> {
  if (!span.confirmed_by?.signature) {
    return false;
  }

  // Verify hash first
  const calculatedHash = await calculateSpanHash(span);
  if (span.this.hash !== calculatedHash) {
    console.error('Hash mismatch');
    return false;
  }

  // Verify signature
  return await verify(span.this.hash, span.confirmed_by.signature, publicKey);
}

// ============================================================================
// API KEY ENCRYPTION
// ============================================================================

/**
 * Encrypt API key using user ID as key material
 */
export async function encryptApiKey(
  apiKey: string,
  userId: string
): Promise<string> {
  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive key from userId
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(userId),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // Generate IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    encryptionKey,
    new TextEncoder().encode(apiKey)
  );

  // Combine salt + iv + ciphertext
  const combined = new Uint8Array(
    salt.length + iv.length + encrypted.byteLength
  );
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return bytesToBase64(combined);
}

/**
 * Decrypt API key using user ID
 */
export async function decryptApiKey(
  encrypted: string,
  userId: string
): Promise<string> {
  const data = base64ToBytes(encrypted);

  // Extract components
  const salt = data.slice(0, 16);
  const iv = data.slice(16, 28);
  const ciphertext = data.slice(28);

  // Derive key
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(userId),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const decryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    decryptionKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert bytes to base64
 */
function bytesToBase64(bytes: Uint8Array): string {
  const binString = String.fromCharCode(...bytes);
  return btoa(binString);
}

/**
 * Convert base64 to bytes
 */
function base64ToBytes(base64: string): Uint8Array {
  const binString = atob(base64);
  return Uint8Array.from(binString, (c) => c.charCodeAt(0));
}

/**
 * Generate UUID v7 (time-ordered)
 */
export function generateUUIDv7(): string {
  const timestamp = Date.now();
  const timestampHex = timestamp.toString(16).padStart(12, '0');
  const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-7${randomHex.slice(0, 3)}-${randomHex.slice(3, 7)}-${randomHex.slice(7, 19)}`;
}

/**
 * Generate short ID (for user IDs)
 */
export function generateShortId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 3);
}

/**
 * Sanitize name for user ID
 */
export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
