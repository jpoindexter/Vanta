import { SpreadsheetVantaClient } from "@jpoindexter/vanta-operator-sdk";

declare const OfficeRuntime: { storage: { getItem(key: string): Promise<string | null> } };

/** @customfunction VANTA.ASK Ask the local Vanta operator about workbook context. */
export async function ask(prompt: string, workbook: string, sheet?: string, range?: string, values?: unknown[][]): Promise<string> {
  const baseUrl = await OfficeRuntime.storage.getItem("VANTA_API_BASE_URL"), token = await OfficeRuntime.storage.getItem("VANTA_API_TOKEN");
  if (!baseUrl || !token) throw new Error("Configure the Vanta API URL and revocable token in the add-in task pane");
  const channelId = `excel-${workbook.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)}`;
  const client = new SpreadsheetVantaClient({ baseUrl, token, channelId });
  return client.ask(prompt, { workbook, sheet, range, values });
}
