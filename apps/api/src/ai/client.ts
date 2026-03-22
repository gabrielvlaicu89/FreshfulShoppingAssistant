import { ClaudeUpstreamError } from "./errors.js";

export interface ClaudeClientMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeClientRequest {
  model: string;
  system: string;
  maxTokens: number;
  messages: ClaudeClientMessage[];
}

export interface ClaudeClientUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ClaudeClientResponse {
  id: string;
  model: string;
  text: string;
  stopReason: string | null;
  usage: ClaudeClientUsage | null;
}

export interface AnthropicClientConfig {
  apiKey: string;
  baseUrl: string;
  apiVersion: string;
  requestTimeoutMs: number;
}

export interface ClaudeClient {
  createMessage(request: ClaudeClientRequest): Promise<ClaudeClientResponse>;
}

interface AnthropicMessagesResponse {
  id?: string;
  model?: string;
  stop_reason?: string | null;
  content?: Array<{
    type: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

export function createAnthropicClient(config: AnthropicClientConfig): ClaudeClient {
  return {
    async createMessage(request) {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, config.requestTimeoutMs);

      try {
        const response = await fetch(`${config.baseUrl.replace(/\/$/u, "")}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": config.apiVersion
          },
          body: JSON.stringify({
            model: request.model,
            system: request.system,
            max_tokens: request.maxTokens,
            messages: request.messages.map((message) => ({
              role: message.role,
              content: message.content
            }))
          }),
          signal: controller.signal
        });
        const payload = (await response.json().catch(async () => {
          const text = await response.text();

          return {
            error: {
              message: text
            }
          } satisfies AnthropicMessagesResponse;
        })) as AnthropicMessagesResponse;

        if (!response.ok) {
          throw new ClaudeUpstreamError(
            payload.error?.message ?? `Anthropic request failed with status ${response.status}.`,
            response.status
          );
        }

        return {
          id: payload.id ?? "",
          model: payload.model ?? request.model,
          text: payload.content?.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n") ?? "",
          stopReason: payload.stop_reason ?? null,
          usage:
            payload.usage && typeof payload.usage.input_tokens === "number" && typeof payload.usage.output_tokens === "number"
              ? {
                  inputTokens: payload.usage.input_tokens,
                  outputTokens: payload.usage.output_tokens
                }
              : null
        };
      } catch (error) {
        if (error instanceof ClaudeUpstreamError) {
          throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
          throw new ClaudeUpstreamError("Anthropic request timed out.", 504, true);
        }

        throw new ClaudeUpstreamError("Anthropic request failed.", 502, true);
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}