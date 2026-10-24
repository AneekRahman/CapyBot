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

export async function defaultTranscribe(buffer: Buffer, mimeType: string): Promise<string> {
  // 1. ElevenLabs Speech-to-Text (Scribe)
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (elevenKey) {
    const form = new FormData();
    const blob = new Blob([buffer as any], { type: mimeType });
    form.append("file", blob, "audio.webm");
    form.append("model_id", "scribe_v1");

    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": elevenKey,
      },
      body: form,
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, any>;
      throw new Error(body?.detail?.message || body?.message || `ElevenLabs STT returned ${res.status}`);
    }

    const data = (await res.json()) as { text?: string };
    return data.text || "";
  }

  // 2. Groq Whisper (free & fast if configured)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const form = new FormData();
    const blob = new Blob([buffer as any], { type: mimeType });
    form.append("file", blob, "audio.webm");
    form.append("model", "whisper-large-v3");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(25000),
    });

    if (res.ok) {
      const data = (await res.json()) as { text?: string };
      return data.text || "";
    }
  }

  throw new Error("transcribe_unconfigured");
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

      try {
        const text = await defaultTranscribe(audioBuffer, contentType);
        return json(res, 200, { text });
      } catch (sttErr: unknown) {
        if (sttErr instanceof Error && sttErr.message === "transcribe_unconfigured") {
          return json(res, 501, {
            error: {
              code: "transcribe_unconfigured",
              message: "Server transcription is not configured. Configure AWS Transcribe or ElevenLabs in environment/settings. Browser Web Speech fallback is available.",
            },
          });
        }
        throw sttErr;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transcription failed";
      return json(res, 500, { error: { code: "transcribe_failed", message } });
    }
  };
}

export const speechRoutes: RouteHandler = createSpeechRoutes();
