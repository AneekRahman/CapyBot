// Server endpoint for speech transcription using Amazon Transcribe or local STT engines.
import type { IncomingMessage } from "node:http";
import { PASS, type RouteContext, type RouteHandler } from "./table.ts";

export interface SpeechTranscribeDeps {
  transcribeAudio?: (buffer: Buffer, mimeType: string) => Promise<string>;
}

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

export async function readAudioBody(req: IncomingMessage, limit = MAX_AUDIO_BYTES): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) {
      throw new Error(`Audio payload exceeded limit of ${limit} bytes`);
    }
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export function createSpeechRoutes(deps: SpeechTranscribeDeps = {}): RouteHandler {
  return async ({ req, res, path, method, json }: RouteContext) => {
    if (path !== "/api/speech/transcribe") return PASS;

    if (method !== "POST") {
      res.writeHead(405, { allow: "POST" });
      res.end();
      return;
    }

    const contentType = req.headers["content-type"] || "audio/webm";
    let audioBuffer: Buffer;
    try {
      audioBuffer = await readAudioBody(req);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to read audio body";
      return json(res, 413, { error: { code: "payload_too_large", message } });
    }

    if (audioBuffer.length === 0) {
      return json(res, 400, { error: { code: "invalid_input", message: "Audio body was empty" } });
    }

    try {
      if (deps.transcribeAudio) {
        const text = await deps.transcribeAudio(audioBuffer, contentType);
        return json(res, 200, { text });
      }

      // Default handler when no transcribe backend is configured
      // Clients use Web Speech API in browser; this fallback endpoint is active when AWS STT is wired
      return json(res, 501, {
        error: {
          code: "transcribe_unconfigured",
          message: "AWS Transcribe backend is not configured on this host. Use browser speech recognition or configure AWS Transcribe.",
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transcription failed";
      return json(res, 500, { error: { code: "transcribe_failed", message } });
    }
  };
}

export const speechRoutes: RouteHandler = createSpeechRoutes();
