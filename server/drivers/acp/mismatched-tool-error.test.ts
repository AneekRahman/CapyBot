import { describe, expect, it } from "vitest";
import { annotateMismatchedToolError } from "./core.ts";

describe("annotateMismatchedToolError", () => {
  const deniedTmpError =
    'Access to path "/tmp" is denied. It is outside the allowed workspace directories: [/var/lib/openmausbot/task-workspaces/4e0f75e9/b0341001] ("denied by pre-tool hook: Access to path \\"/tmp\\" is denied.")';

  it("annotates when tool input does not reference the denied path", () => {
    const stored = {
      title: "view_file",
      rawInput: {
        AbsolutePath: "/var/lib/openmausbot/example/.openmausbot/brain/step-132/output.txt",
        StartLine: 1,
        EndLine: 100,
      },
    };
    const result = annotateMismatchedToolError(stored, deniedTmpError);
    expect(result).toContain('[Engine Mismatch: Denied path "/tmp" is not referenced in this tool\'s input arguments.');
    expect(result).toContain("Access to path \"/tmp\" is denied");
  });

  it("does not annotate when tool input references the denied path", () => {
    const stored = {
      title: "run_command",
      rawInput: {
        command: "curl -sL https://example.com/tool -o /tmp/yt-dlp && chmod +x /tmp/yt-dlp",
      },
    };
    const result = annotateMismatchedToolError(stored, deniedTmpError);
    expect(result).toBe(deniedTmpError);
    expect(result).not.toContain("[Engine Mismatch");
  });

  it("does not annotate when tool path argument references denied subpath", () => {
    const stored = {
      title: "write_file",
      rawInput: {
        Path: "/tmp/scratch.txt",
        Content: "data",
      },
    };
    const result = annotateMismatchedToolError(stored, deniedTmpError);
    expect(result).toBe(deniedTmpError);
    expect(result).not.toContain("[Engine Mismatch");
  });

  it("does not annotate unrelated tool errors", () => {
    const stored = {
      title: "view_file",
      rawInput: {
        AbsolutePath: "/var/lib/openmausbot/output.txt",
      },
    };
    const unrelated = "File not found: /var/lib/openmausbot/output.txt";
    expect(annotateMismatchedToolError(stored, unrelated)).toBe(unrelated);
  });

  it("does not annotate when stored tool call is undefined", () => {
    expect(annotateMismatchedToolError(undefined, deniedTmpError)).toBe(deniedTmpError);
  });

  it("does not double-annotate an already annotated error", () => {
    const stored = {
      title: "view_file",
      rawInput: { AbsolutePath: "/var/lib/output.txt" },
    };
    const once = annotateMismatchedToolError(stored, deniedTmpError);
    const twice = annotateMismatchedToolError(stored, once);
    expect(twice).toBe(once);
  });

  it("handles single-quoted path denial strings", () => {
    const stored = {
      title: "view_file",
      rawInput: { AbsolutePath: "/workspace/file.txt" },
    };
    const singleQuoted = "Access to path '/opt/secret' is denied. It is outside the allowed workspace directories.";
    const result = annotateMismatchedToolError(stored, singleQuoted);
    expect(result).toContain('[Engine Mismatch: Denied path "/opt/secret" is not referenced in this tool\'s input arguments.');
  });
});
