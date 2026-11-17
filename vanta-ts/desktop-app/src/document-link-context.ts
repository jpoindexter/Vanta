import { createContext } from "react";

export type DocumentLinks = { root: string; open: (path: string) => void };
export const DocumentLinkContext = createContext<DocumentLinks | null>(null);
