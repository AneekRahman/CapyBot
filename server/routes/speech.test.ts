import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { readBody } from "../harness/http.ts";
import { createSpeechRoutes, speechRoutes } from "./speech.ts";
import { PASS, type RouteContext } from "./table.ts";

function fakeContext(options: {
  method?: string;
  path?: string;
  body?: Buffer;
  contentType?: string;
  jsonSpy?: ReturnType<typeof vi.fn>;
}): RouteContext {
  const method = options.method ?? "POST";
  const path = options.path ?? "/api/speech/transcribe";
  const body = options.body ?? Buffer.from("fake-audio-bytes");

  const req = Readable.from([body]) as any;
  req.headers = {
    "content-type": options.contentType ?? "audio/webm",
  };

  const res = {
    writeHead: vi.fn(),
    end: vi.fn(),
    headersSent: false,
    writableEnded: false,
  } as any;

  return {
    req,
    res,
    url: new URL(`http://127.0.0.1${path}`),
    path,
    method,
    auth: { kind: "loopback", scopes: ["client"] } as any,
    json: options.jsonSpy ?? (vi.fn((_res, status, data) => ({ status, data })) as any),
    readBody,
  };
}

describe("speechRoutes", () => {
  it("ignores non-matching paths", async () => {
    const ctx = fakeContext({ path: "/api/other" });
    const res = await speechRoutes(ctx);
    expect(res).toBe(PASS);
  });

  it("returns 405 for non-POST methods", async () => {
    const ctx = fakeContext({ method: "GET" });
    await speechRoutes(ctx);
    expect(ctx.res.writeHead).toHaveBeenCalledWith(405, { allow: "POST" });
    expect(ctx.res.end).toHaveBeenCalled();
  });

  it("returns 400 for empty audio body", async () => {
    const jsonSpy = vi.fn();
    const ctx = fakeContext({ body: Buffer.alloc(0), jsonSpy });
    await speechRoutes(ctx);
    expect(jsonSpy).toHaveBeenCalledWith(
      ctx.res,
      400,
      expect.objectContaining({ error: { code: "invalid_input", message: "Audio body was empty" } }),
    );
  });

  it("returns 501 when backend is not configured", async () => {
    const jsonSpy = vi.fn();
    const ctx = fakeContext({ jsonSpy });
    await speechRoutes(ctx);
    expect(jsonSpy).toHaveBeenCalledWith(
      ctx.res,
      501,
      expect.objectContaining({ error: expect.objectContaining({ code: "transcribe_unconfigured" }) }),
    );
  });

  it("transcribes audio when transcribeAudio handler is provided", async () => {
    const jsonSpy = vi.fn();
    const transcribeAudio = vi.fn().mockResolvedValue("Transcribed text from Amazon Transcribe");
    const routes = createSpeechRoutes({ transcribeAudio });
    const ctx = fakeContext({ jsonSpy });
    await routes(ctx);
    expect(transcribeAudio).toHaveBeenCalledWith(expect.any(Buffer), "audio/webm");
    expect(jsonSpy).toHaveBeenCalledWith(ctx.res, 200, { text: "Transcribed text from Amazon Transcribe" });
  });
});
