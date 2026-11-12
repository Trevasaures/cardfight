import { createContext, useContext } from "react";
import type { AuthAccount } from "./session";
import type { WorkspaceStorage } from "./workspaceStorage";

type Workspace = {
  account: AuthAccount | null;
  storage: WorkspaceStorage;
  canManageCatalog: boolean;
  signingOut: boolean;
  signOutError: string;
  signOut: () => void;
};

export const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("A verified workspace is required.");
  return workspace;
}
