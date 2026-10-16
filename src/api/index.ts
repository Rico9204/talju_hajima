import type { DataRepository } from "./dataRepository";
import { RestDataRepository } from "./rest/restDataRepository";
import { accessToken } from "./rest/session";

/**
 * Single switch point for where the app's data comes from. Everything else
 * (ProjectContext, components) depends only on the `DataRepository` interface.
 * The application uses the self-hosted API server.
 */
const serverUrl = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
export const dataRepository: DataRepository = new RestDataRepository(serverUrl, accessToken);

export type { DataRepository } from "./dataRepository";
export * from "./types";
