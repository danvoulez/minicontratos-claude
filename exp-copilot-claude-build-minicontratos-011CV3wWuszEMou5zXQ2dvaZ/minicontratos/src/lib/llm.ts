/**
 * LLM integration layer
 */

import type { LLMConfig, Message } from '../types/llm';
import { DEFAULT_MODELS, SYSTEM_PROMPT } from '../types/llm';
import type { Span } from '../types/span';

// ============================================================================
// MAIN LLM CALL FUNCTION
// ============================================================================

/**
 * Call LLM with conversation history
 */
export async function callLLM(
  userMessage: string,
  config: LLMConfig,
  conversationHistory: Message[] = []
): Promise<string> {
  const messages: Message[] = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  switch (config.provider) {
    case 'anthropic':
      return await callAnthropic(messages, config);

    case 'openai':
      return await callOpenAI(messages, config);

    case 'ollama':
      return await callOllama(messages, config);

    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

// ============================================================================
// ANTHROPIC (CLAUDE)
// ============================================================================

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  temperature?: number;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

async function callAnthropic(
  messages: Message[],
  config: LLMConfig
): Promise<string> {
  // Separate system message
  const systemMessage = messages.find((m) => m.role === 'system');
  const conversationMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  const request: AnthropicRequest = {
    model: config.model || DEFAULT_MODELS.anthropic,
    max_tokens: 4096,
    system: systemMessage?.content || SYSTEM_PROMPT,
    messages: conversationMessages,
    temperature: 0.7,
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${error}`);
  }

  const data: AnthropicResponse = await response.json();
  return data.content[0].text;
}

// ============================================================================
// OPENAI (GPT)
// ============================================================================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

async function callOpenAI(
  messages: Message[],
  config: LLMConfig
): Promise<string> {
  // Add system message if not present
  const allMessages = messages.some((m) => m.role === 'system')
    ? messages
    : [{ role: 'system' as const, content: SYSTEM_PROMPT }, ...messages];

  const request: OpenAIRequest = {
    model: config.model || DEFAULT_MODELS.openai,
    messages: allMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature: 0.7,
    max_tokens: 4096,
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${error}`);
  }

  const data: OpenAIResponse = await response.json();
  return data.choices[0].message.content;
}

// ============================================================================
// OLLAMA (LOCAL)
// ============================================================================

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaRequest {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
}

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

async function callOllama(
  messages: Message[],
  config: LLMConfig
): Promise<string> {
  // Ollama runs locally, endpoint from apiKey or default
  const endpoint = config.apiKey || 'http://localhost:11434';

  // Add system message if not present
  const allMessages = messages.some((m) => m.role === 'system')
    ? messages
    : [{ role: 'system' as const, content: SYSTEM_PROMPT }, ...messages];

  const request: OllamaRequest = {
    model: config.model || DEFAULT_MODELS.ollama,
    messages: allMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    stream: false,
  };

  const response = await fetch(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama error (${response.status}): ${error}`);
  }

  const data: OllamaResponse = await response.json();
  return data.message.content;
}

// ============================================================================
// API KEY VALIDATION
// ============================================================================

/**
 * Test if API key is valid by making a minimal call
 */
export async function testApiKey(
  apiKey: string,
  provider: 'anthropic' | 'openai' | 'ollama',
  model?: string
): Promise<boolean> {
  try {
    const config: LLMConfig = {
      provider,
      apiKey,
      model: model || DEFAULT_MODELS[provider],
    };

    // Make a minimal test call
    const response = await callLLM('Hello', config, []);
    return response.length > 0;
  } catch (error) {
    console.error('API key test failed:', error);
    return false;
  }
}

/**
 * Detect provider from API key format
 */
export function detectProvider(
  apiKey: string
): 'anthropic' | 'openai' | 'ollama' {
  if (apiKey.startsWith('sk-ant-')) {
    return 'anthropic';
  } else if (apiKey.startsWith('sk-proj-') || apiKey.startsWith('sk-')) {
    return 'openai';
  } else if (apiKey.startsWith('http://') || apiKey.startsWith('https://')) {
    return 'ollama';
  }
  // Default to anthropic
  return 'anthropic';
}

// ============================================================================
// SPAN EXTRACTION
// ============================================================================

/**
 * Extract Spans from LLM response
 * Looks for JSON code blocks containing Span arrays
 */
export function extractSpansFromResponse(response: string): Span[] {
  try {
    // Look for JSON code blocks
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
    const matches = [...response.matchAll(jsonBlockRegex)];

    if (matches.length === 0) {
      // Try to parse the entire response as JSON
      try {
        const parsed = JSON.parse(response);
        if (Array.isArray(parsed)) {
          return parsed as Span[];
        } else if (parsed && typeof parsed === 'object') {
          return [parsed as Span];
        }
      } catch {
        // Not valid JSON
        return [];
      }
    }

    // Parse each JSON block
    const allSpans: Span[] = [];
    for (const match of matches) {
      const jsonText = match[1];
      try {
        const parsed = JSON.parse(jsonText);
        if (Array.isArray(parsed)) {
          allSpans.push(...(parsed as Span[]));
        } else if (parsed && typeof parsed === 'object') {
          allSpans.push(parsed as Span);
        }
      } catch (error) {
        console.error('Failed to parse JSON block:', error);
      }
    }

    return allSpans;
  } catch (error) {
    console.error('Failed to extract spans:', error);
    return [];
  }
}

/**
 * Validate if an object is a valid Span
 */
export function isValidSpan(obj: any): obj is Span {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.trace_id === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.entity === 'string' &&
    obj.body &&
    typeof obj.body === 'object' &&
    typeof obj.body.action === 'string' &&
    obj.this &&
    typeof obj.this === 'object' &&
    typeof obj.this.version === 'string'
  );
}
