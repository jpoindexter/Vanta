import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmationActions, ControlButton, InlineError, LoadingIndicator, TextField } from "./form-controls.js";

describe("desktop form primitives", () => {
  it("keeps buttons, fields, errors, loaders, and confirmations semantic", () => {
    const html = renderToStaticMarkup(<>
      <TextField aria-label="Project" />
      <InlineError>Could not connect.</InlineError>
      <LoadingIndicator label="Connecting" />
      <ConfirmationActions><ControlButton tone="primary">Allow once</ControlButton></ConfirmationActions>
    </>);
    expect(html).toContain('class="control-field"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('role="status"');
    expect(html).toContain('class="confirmation-actions"');
    expect(html).toContain("tone-primary");
  });
});
