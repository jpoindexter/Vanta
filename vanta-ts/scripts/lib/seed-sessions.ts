import { saveSession } from "../../src/sessions/store.js";

// Seeds a throwaway VANTA_HOME with realistic-looking sessions for launch measurements.
const count = Number(process.argv[2] ?? 60);
for (let i = 0; i < count; i += 1) {
  const id = `20260${(i % 9) + 1}${String((i % 27) + 1).padStart(2, "0")}-1${String(i % 10)}${String(i % 60).padStart(2, "0")}00`;
  await saveSession(id, [
    { role: "user", content: `Sample task ${i}: summarise the launch notes` },
    { role: "assistant", content: `Here is the summary for sample ${i}.` },
  ], { started: new Date(Date.now() - i * 3_600_000).toISOString() });
}
console.log(`seeded ${count} sessions`);
