import type { DataRepository } from "./dataRepository";
import { supabaseDataRepository } from "./supabase/supabaseDataRepository";

/**
 * Single switch point for where the app's data comes from. Everything else
 * (ProjectContext, components) depends only on the `DataRepository` interface.
 * To move to a self-hosted DB server later: implement `DataRepository` against
 * your own API (e.g. `./rest/restDataRepository.ts`) and change this one line.
 */
export const dataRepository: DataRepository = supabaseDataRepository;

export type { DataRepository } from "./dataRepository";
export * from "./types";
