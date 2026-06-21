import { describe, it, expect } from "vitest";
import {
  buildDashboardHtml,
  escapeHtml,
  resolveEphemeralPort,
  ephemeralUiEnabled,
  DEFAULT_EPHEMERAL_PORT,
  type DashboardSpec,
} from "./ephemeral-dashboard.js";

describe("escapeHtml", () => {
  it("escapes all five XSS-relevant characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("escapes & first so entities are not double-escaped", () => {
    expect(escapeHtml("a & b < c")).toBe("a &amp; b &lt; c");
  });

  it("leaves safe text untouched", () => {
    expect(escapeHtml("plain text 123")).toBe("plain text 123");
  });
});

describe("buildDashboardHtml — document shape", () => {
  const spec: DashboardSpec = {
    title: "Deploy status",
    sections: [{ heading: "Summary", kind: "text", body: "all green" }],
  };

  it("produces a self-contained document (DOCTYPE + inline style)", () => {
    const html = buildDashboardHtml(spec);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).toContain("</html>");
  });

  it("has NO external assets or scripts", () => {
    const html = buildDashboardHtml(spec);
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/<link[^>]+href/i);
    expect(html).not.toMatch(/src\s*=/i);
    expect(html).not.toMatch(/\son\w+\s*=/i); // no inline event handlers
  });

  it("renders the title in both <title> and <h1>", () => {
    const html = buildDashboardHtml(spec);
    expect(html).toContain("<title>Deploy status</title>");
    expect(html).toContain("<h1>Deploy status</h1>");
  });
});

describe("buildDashboardHtml — section kinds", () => {
  it("renders a keyvalue section (label + value rows)", () => {
    const html = buildDashboardHtml({
      title: "t",
      sections: [
        {
          heading: "Build",
          kind: "keyvalue",
          rows: [
            { label: "Branch", value: "main" },
            { label: "Tests", value: "5077 green" },
          ],
        },
      ],
    });
    expect(html).toContain("<h2>Build</h2>");
    expect(html).toContain("Branch");
    expect(html).toContain("main");
    expect(html).toContain("5077 green");
  });

  it("renders a table section (columns + cell rows)", () => {
    const html = buildDashboardHtml({
      title: "t",
      sections: [
        {
          heading: "Compare",
          kind: "table",
          columns: ["Tool", "Speed"],
          rows: [
            ["grep", "fast"],
            ["codegraph", "faster"],
          ],
        },
      ],
    });
    expect(html).toContain("<th>Tool</th>");
    expect(html).toContain("<th>Speed</th>");
    expect(html).toContain("<td>grep</td>");
    expect(html).toContain("<td>faster</td>");
  });

  it("renders a text section body", () => {
    const html = buildDashboardHtml({
      title: "t",
      sections: [{ heading: "Notes", kind: "text", body: "deploy at 5pm" }],
    });
    expect(html).toContain("<h2>Notes</h2>");
    expect(html).toContain("deploy at 5pm");
  });

  it("renders multiple sections in order", () => {
    const html = buildDashboardHtml({
      title: "t",
      sections: [
        { heading: "First", kind: "text", body: "a" },
        { heading: "Second", kind: "text", body: "b" },
      ],
    });
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
  });
});

describe("buildDashboardHtml — SECURITY: all data escaped (no injection)", () => {
  const PAYLOAD = `<script>alert(1)</script>`;
  const ESCAPED = "&lt;script&gt;alert(1)&lt;/script&gt;";

  it("escapes a script payload in the title (not a live tag)", () => {
    const html = buildDashboardHtml({ title: PAYLOAD, sections: [] });
    expect(html).toContain(ESCAPED);
    expect(html).not.toContain(PAYLOAD);
    // the only <script-looking thing must be the escaped entities
    expect(html).not.toMatch(/<script>alert/);
  });

  it("escapes a script payload in a keyvalue label and value", () => {
    const html = buildDashboardHtml({
      title: "t",
      sections: [
        {
          heading: "h",
          kind: "keyvalue",
          rows: [{ label: PAYLOAD, value: PAYLOAD }],
        },
      ],
    });
    expect(html).toContain(ESCAPED);
    expect(html).not.toContain(PAYLOAD);
  });

  it("escapes a script payload in a table cell and column", () => {
    const html = buildDashboardHtml({
      title: "t",
      sections: [
        { heading: "h", kind: "table", columns: [PAYLOAD], rows: [[PAYLOAD]] },
      ],
    });
    expect(html).toContain(ESCAPED);
    expect(html).not.toContain(PAYLOAD);
  });

  it("escapes a script payload in a text body and the heading", () => {
    const html = buildDashboardHtml({
      title: "t",
      sections: [{ heading: PAYLOAD, kind: "text", body: PAYLOAD }],
    });
    expect(html).toContain(ESCAPED);
    expect(html).not.toContain(PAYLOAD);
  });

  it("escapes an attribute-breakout quote payload (no live tag)", () => {
    const html = buildDashboardHtml({
      title: `"><img src=x onerror=alert(1)>`,
      sections: [],
    });
    // The `<` is escaped, so `<img` is inert text — not a parsed tag.
    // `onerror=...` survives as plain text but is harmless without a live tag.
    expect(html).not.toMatch(/<img\s/i);
    expect(html).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("buildDashboardHtml — empty data", () => {
  it("empty spec → a minimal 'no data' page (still a valid document)", () => {
    const html = buildDashboardHtml({ title: "", sections: [] });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("No data to display.");
    expect(html).toContain("<title>Dashboard</title>");
  });

  it("non-empty title but no sections → 'no data' body under that title", () => {
    const html = buildDashboardHtml({ title: "Empty board", sections: [] });
    expect(html).toContain("<h1>Empty board</h1>");
    expect(html).toContain("No data to display.");
  });
});

describe("resolveEphemeralPort", () => {
  it("defaults when unset", () => {
    expect(resolveEphemeralPort({})).toBe(DEFAULT_EPHEMERAL_PORT);
  });

  it("honors a valid env override", () => {
    expect(resolveEphemeralPort({ VANTA_EPHEMERAL_PORT: "8123" })).toBe(8123);
  });

  it("clamps below-range to 1024", () => {
    expect(resolveEphemeralPort({ VANTA_EPHEMERAL_PORT: "80" })).toBe(1024);
  });

  it("clamps above-range to 65535", () => {
    expect(resolveEphemeralPort({ VANTA_EPHEMERAL_PORT: "999999" })).toBe(65535);
  });

  it("falls back to default on a non-numeric value", () => {
    expect(resolveEphemeralPort({ VANTA_EPHEMERAL_PORT: "nope" })).toBe(DEFAULT_EPHEMERAL_PORT);
  });

  it("falls back to default on a non-integer value", () => {
    expect(resolveEphemeralPort({ VANTA_EPHEMERAL_PORT: "80.5" })).toBe(DEFAULT_EPHEMERAL_PORT);
  });
});

describe("ephemeralUiEnabled", () => {
  it("is off by default", () => {
    expect(ephemeralUiEnabled({})).toBe(false);
  });

  it("is on only when VANTA_EPHEMERAL_UI=1", () => {
    expect(ephemeralUiEnabled({ VANTA_EPHEMERAL_UI: "1" })).toBe(true);
  });

  it("treats any other value as off", () => {
    expect(ephemeralUiEnabled({ VANTA_EPHEMERAL_UI: "true" })).toBe(false);
    expect(ephemeralUiEnabled({ VANTA_EPHEMERAL_UI: "0" })).toBe(false);
  });
});
