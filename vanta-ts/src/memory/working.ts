/** Session-scoped working memory — resets each session, accumulates during.
 * Not persisted to disk; different from ~/.vanta/memories (cross-session) and
 * the brain (long-term selfhood). This is the hot volatile cache for a single
 * conversation: things the agent should keep in mind for the next few turns.
 */
export class SessionWorkingMemory {
  private readonly items: string[] = [];
  private readonly editedFiles: string[] = [];

  add(note: string): void {
    const trimmed = note.trim();
    if (trimmed) this.items.push(trimmed);
  }

  getAll(): readonly string[] {
    return this.items;
  }

  recordEditedFile(path: string): void {
    const trimmed = path.trim();
    if (!trimmed) return;
    const existing = this.editedFiles.indexOf(trimmed);
    if (existing !== -1) this.editedFiles.splice(existing, 1);
    this.editedFiles.push(trimmed);
  }

  getEditedFiles(limit = 5): readonly string[] {
    return this.editedFiles.slice(-limit).reverse();
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /** Format for injection into the user message context. */
  format(): string {
    if (!this.items.length) return "";
    const list = this.items.map((item, i) => `${i + 1}. ${item}`).join("\n");
    return `Working memory (this session):\n${list}`;
  }

  /** Remove the last added item (undo). */
  pop(): string | undefined {
    return this.items.pop();
  }

  size(): number {
    return this.items.length;
  }
}
