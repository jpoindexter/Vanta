import { open, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

async function syncDirectory(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!["EINVAL", "ENOTSUP", "EPERM", "EISDIR"].includes(code ?? "")) throw error;
  } finally {
    await handle?.close();
  }
}

export async function atomicWrite(path: string, content: string, durable = false): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    if (durable) await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    if (durable) await syncDirectory(dirname(path));
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
