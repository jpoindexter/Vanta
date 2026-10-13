import { promises as fsp } from "node:fs";
import path from "node:path";

import { CH } from "./channels";
import { watchTargetPath } from "./fs-preview";
import { readFileDataUrl } from "./fs-read";
import type { IpcLike } from "./native-handlers";
import { isSecretName, type ProjectGuard } from "./project-guard";

export const MAX_NAME_LENGTH = 255;
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|gif|webp|bmp|svg\+xml|avif));base64,([A-Za-z0-9+/=\s]+)$/i;
const EXTENSION_FOR_TYPE: Record<string, string> = {
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp"
};

export interface ConfirmOptions {
  buttons: [string, string];
  detail: string;
  message: string;
}

export interface FileActionDeps {
  /** A native dialog the renderer cannot script or click for itself. True only when the user chose the first button. */
  confirm: (sender: unknown, options: ConfirmOptions) => Promise<boolean>;
  getRoot: () => Promise<null | string>;
  guard: ProjectGuard;
  ipc: IpcLike;
  /** The OS save dialog. The path the user picked, or null when they cancelled. */
  pickSavePath: (sender: unknown, defaultName: string) => Promise<null | string>;
  /** Move to the OS Trash, so the user can put it back. */
  trash: (target: string) => Promise<void>;
}

const cancelled = (): Error => Object.assign(new Error("Cancelled."), { name: "UserCancelled" });

/** A new file name for rename: one path segment, nothing the OS or the secrets rules would treat specially. */
export function checkNewName(raw: unknown): { message: string; ok: false } | { name: string; ok: true } {
  if (typeof raw !== "string") {
    return { message: "Type a new name.", ok: false };
  }

  const name = raw.trim();

  if (!name || name === "." || name === ".." || name.length > MAX_NAME_LENGTH || /[/\\\0\n\r]/.test(name)) {
    return { message: "That is not a name Vanta can use. Names cannot contain / or \\.", ok: false };
  }

  return isSecretName(name) || isSecretName(name, true)
    ? { message: "That name looks like a secrets file, so Vanta will not use it.", ok: false }
    : { name, ok: true };
}

async function exists(target: string): Promise<boolean> {
  return fsp
    .lstat(target)
    .then(() => true)
    .catch(() => false);
}

export function decodeImageDataUrl(raw: unknown): null | { bytes: Buffer; type: string } {
  const match = typeof raw === "string" && raw.length < MAX_IMAGE_BYTES * 1.4 ? IMAGE_DATA_URL.exec(raw) : null;

  if (!match) {
    return null;
  }

  const bytes = Buffer.from((match[2] as string).replace(/\s/g, ""), "base64");

  return bytes.length > 0 && bytes.length <= MAX_IMAGE_BYTES ? { bytes, type: (match[1] as string).toLowerCase() } : null;
}

/** An image from a data URL, or from a file inside the project (a path or file:// URL). Nothing is fetched from the network. */
async function imageFrom(guard: ProjectGuard, source: unknown) {
  const direct = decodeImageDataUrl(source);

  if (direct || typeof source !== "string" || (/^[a-z][a-z0-9+.-]*:/i.test(source) && !/^file:/i.test(source))) {
    return direct;
  }

  const read = await readFileDataUrl(guard, watchTargetPath(source));

  return typeof read === "string" ? decodeImageDataUrl(read) : null;
}

/**
 * Rename, move to the Trash, and save an image. Rename and Trash are confined to the project and each waits for a
 * native confirmation that names the exact path. Saving an image waits for the user to choose where in the OS
 * save dialog; the renderer never picks a destination.
 */
class FileActions {
  private busy = false;

  constructor(private readonly deps: FileActionDeps) {
    deps.ipc.handle(CH.renamePath, (event, raw: unknown, newName: unknown) => this.once(() => this.rename(event.sender, raw, newName)));
    deps.ipc.handle(CH.trashPath, (event, raw: unknown) => this.once(() => this.trash(event.sender, raw)));
    deps.ipc.handle(CH.saveImage, (event, source: unknown) => this.once(() => this.saveImage(event.sender, source)));
  }

  // One question at a time: a second request while a dialog is open is refused rather than queued behind it.
  private async once<T>(work: () => Promise<T>): Promise<T> {
    if (this.busy) {
      throw new Error("Finish the open question first.");
    }

    this.busy = true;

    try {
      return await work();
    } finally {
      this.busy = false;
    }
  }

  private async projectItem(raw: unknown) {
    const target = await this.deps.guard.resolve(raw);
    const root = await this.deps.getRoot();

    if (target.ok === false) {
      throw new Error(target.error.message);
    }

    if (target.value.real === root || target.value.rel === "") {
      throw new Error("Vanta will not change the project folder itself.");
    }

    return target.value;
  }

  private async rename(sender: unknown, raw: unknown, newName: unknown) {
    const name = checkNewName(newName);

    if (name.ok === false) {
      throw new Error(name.message);
    }

    const item = await this.projectItem(raw);
    const destination = path.join(path.dirname(item.real), name.name);

    if (await exists(destination)) {
      throw new Error(`"${name.name}" already exists in that folder.`);
    }

    const approved = await this.deps.confirm(sender, {
      buttons: ["Rename", "Cancel"],
      detail: `${item.real}\n→ ${destination}`,
      message: `Rename "${path.basename(item.real)}" to "${name.name}"?`
    });

    if (!approved) {
      throw cancelled();
    }

    await fsp.rename(item.real, destination);

    return { path: path.join(path.dirname(item.abs), name.name) };
  }

  private async trash(sender: unknown, raw: unknown): Promise<boolean> {
    const item = await this.projectItem(raw);
    const approved = await this.deps.confirm(sender, {
      buttons: ["Move to Trash", "Cancel"],
      detail: item.real,
      message: `Move "${path.basename(item.real)}" to the Trash?`
    });

    if (!approved) {
      return false;
    }

    await this.deps.trash(item.real);

    return true;
  }

  private async saveImage(sender: unknown, source: unknown): Promise<boolean> {
    const image = await imageFrom(this.deps.guard, source);

    if (!image) {
      throw new Error("Vanta can save images that are in the chat or the project. Open other images in your browser to save them.");
    }

    const chosen = await this.deps.pickSavePath(sender, `image${EXTENSION_FOR_TYPE[image.type] ?? ".png"}`);

    if (!chosen || !path.isAbsolute(chosen)) {
      return false;
    }

    await fsp.writeFile(chosen, image.bytes);

    return true;
  }
}

export const registerFileActions = (deps: FileActionDeps): FileActions => new FileActions(deps);
