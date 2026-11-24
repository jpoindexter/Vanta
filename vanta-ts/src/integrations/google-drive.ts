import { getAccessToken } from "../google/auth.js";

export type GoogleDriveFetch = typeof fetch;
export type GoogleAccessToken = (env: NodeJS.ProcessEnv) => Promise<string>;

const TEST_URL = "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)";

export async function testGoogleDrive(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: GoogleDriveFetch = fetch,
  accessToken: GoogleAccessToken = getAccessToken,
): Promise<void> {
  const token = await accessToken(env);
  const response = await fetcher(TEST_URL, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw googleDriveError(response.status);
}

function googleDriveError(status: number): Error {
  if (status === 401 || status === 403) return new Error("Google Drive authorization was rejected. Reconnect Google Workspace before retrying.");
  if (status === 429) return new Error("Google Drive rate limit reached. Wait before retrying.");
  return new Error(`Google Drive verification failed with HTTP ${status}.`);
}
