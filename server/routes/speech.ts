// Server endpoint for speech transcription using Amazon Transcribe or local STT engines.
import type { IncomingMessage } from "node:http";
import { loadConfig } from "../config.ts";
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
  let elevenKey: string | undefined = process.env.ELEVENLABS_API_KEY;
  try {
    const cfg = loadConfig();
    elevenKey = cfg.tts?.key || elevenKey;
  } catch {}

  if (elevenKey) {
    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
    const filename = `audio.${ext}`;
    console.log(`[STT] Transcribing via ElevenLabs Scribe STT (${filename}, mime: ${mimeType}, ${buffer.length} bytes)...`);

    const form = new FormData();
    const blob = new Blob([buffer as any], { type: mimeType });
    form.append("file", blob, filename);
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
      const errMsg = body?.detail?.message || body?.message || `ElevenLabs STT returned ${res.status}`;
      console.error(`[STT] ElevenLabs STT API error (status ${res.status}):`, errMsg);
      throw new Error(errMsg);
    }

    const data = (await res.json()) as { text?: string };
    const text = data.text || "";
    console.log(`[STT] ElevenLabs STT succeeded: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`);
    return text;
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
    const filename = `audio.${ext}`;
    console.log(`[STT] Transcribing via Groq Whisper (${filename}, ${buffer.length} bytes)...`);

    const form = new FormData();
    const blob = new Blob([buffer as any], { type: mimeType });
    form.append("file", blob, filename);
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
      const text = data.text || "";
      console.log(`[STT] Groq Whisper succeeded: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`);
      return text;
    }
  }

  throw new Error("transcribe_unconfigured");
}

export function createSpeechRoutes(deps: SpeechTranscribeDeps = {}): RouteHandler {
  return async ({ req, res, path, method, json }: RouteContext) => {
    if (path !== "/api/speech/transcribe") return PASS;

    if (method === "GET") {
      let available = Boolean(deps.transcribeAudio);
      let engine = deps.transcribeAudio ? "custom" : "none";
      try {
        const cfg = loadConfig();
        const elevenKey = cfg.tts?.key || process.env.ELEVENLABS_API_KEY;
        const groqKey = process.env.GROQ_API_KEY;
        const awsKey = process.env.AWS_ACCESS_KEY_ID;
        if (elevenKey) {
          available = true;
          engine = "elevenlabs";
        } else if (groqKey) {
          available = true;
          engine = "whisper";
        } else if (awsKey) {
          available = true;
          engine = "aws-transcribe";
        }
      } catch {}
      console.log(`[STT] Status probe: available=${available}, engine=${engine}`);
      return json(res, 200, { status: "ok", available, engine });
    }

    if (method !== "POST") {
      res.writeHead(405, { allow: "GET, POST" });
      res.end();
      return;
    }

    const contentType = req.headers["content-type"] || "audio/webm";
    console.log(`[STT] Incoming transcribe request, content-type=${contentType}`);
    let audioBuffer: Buffer;
    try {
      audioBuffer = await readAudioBody(req);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to read audio body";
      console.error(`[STT] Failed to read audio body:`, message);
      return json(res, 413, { error: { code: "payload_too_large", message } });
    }

    console.log(`[STT] Received audio buffer: ${audioBuffer.length} bytes`);

    if (audioBuffer.length === 0) {
      console.warn(`[STT] Rejected empty audio body`);
      return json(res, 400, { error: { code: "invalid_input", message: "Audio body was empty" } });
    }

    try {
      if (deps.transcribeAudio) {
        console.log(`[STT] Calling custom transcribeAudio handler...`);
        const text = await deps.transcribeAudio(audioBuffer, contentType);
        console.log(`[STT] Custom transcribeAudio succeeded: "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}"`);
        return json(res, 200, { text });
      }

      try {
        const text = await defaultTranscribe(audioBuffer, contentType);
        return json(res, 200, { text });
      } catch (sttErr: unknown) {
        if (sttErr instanceof Error && sttErr.message === "transcribe_unconfigured") {
          console.warn(`[STT] Server transcription unconfigured`);
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
      console.error(`[STT] Transcribe endpoint returning 500:`, message);
      return json(res, 500, { error: { code: "transcribe_failed", message } });
    }
  };
}

export const speechRoutes: RouteHandler = createSpeechRoutes();
