import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";

test("a nested display-name comment cannot replace the intended mail recipient", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await transport.sendMail({
    from: "proof@example.test",
    to: "Victim (x(y) <evil@evil.test>) <v@victim.test>",
    subject: "In-memory recipient boundary proof",
    text: "No SMTP connection or external delivery occurs.",
  });
  assert.deepEqual(result.envelope.to, ["v@victim.test"]);
});
