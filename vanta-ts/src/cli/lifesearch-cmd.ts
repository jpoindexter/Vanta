import { runLifeSearch } from "../repl/lifesearch-cmd.js";

export async function runLifeSearchCommand(repoRoot: string, args: string[] = []): Promise<number> {
  const query = args.join(" ").trim();
  if (!query) {
    console.error("Usage: vanta lifesearch <query>");
    return 1;
  }
  console.log(await runLifeSearch(repoRoot, query, process.env));
  return 0;
}
