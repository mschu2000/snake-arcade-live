import type { SnakeApi } from "./types";
import { getApi as getBackendApi } from "./backendApi";

export function getApi(): SnakeApi {
  return getBackendApi();
}

export type { SnakeApi, User, ScoreEntry, LiveGame } from "./types";
