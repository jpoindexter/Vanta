export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

export class FakeVoiceRecorder {
  static instances: FakeVoiceRecorder[] = [];
  static isTypeSupported(type: string) { return type.startsWith("audio/webm"); }
  state = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { FakeVoiceRecorder.instances.push(this); }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.onstop?.(); }
  chunk(size = 3) { this.ondataavailable?.({ data: new Blob([new Uint8Array(size)]) }); }
}
