import { describe, expect, it } from "vitest";
import { parsePublicApiAllowedOrigins } from "./routes.js";

describe("public API CORS origins", () => {
  it("accepts only exact HTTPS origins", () => {
    expect([...parsePublicApiAllowedOrigins("https://localhost:3000,https://excel.example")]).toEqual(["https://localhost:3000", "https://excel.example"]);
    expect(() => parsePublicApiAllowedOrigins("http://localhost:3000")).toThrow("HTTPS");
    expect(() => parsePublicApiAllowedOrigins("https://excel.example/path")).toThrow("exact");
  });
});
