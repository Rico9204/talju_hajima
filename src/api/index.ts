import type { DataRepository } from "./dataRepository";
import { RestDataRepository } from "./rest/restDataRepository";

/**
 * Single switch point for where the app's data comes from. Everything else
 * (ProjectContext, components) depends only on the `DataRepository` interface.
 * The application uses the self-hosted API server.
 */
const serverUrl = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const serverToken = () => {
  try { return JSON.parse(localStorage.getItem("talju-server-session") ?? "null")?.accessToken ?? null; } catch { return null; }
};
export const dataRepository: DataRepository = new RestDataRepository(serverUrl, serverToken);

export type { DataRepository } from "./dataRepository";
export * from "./types";
