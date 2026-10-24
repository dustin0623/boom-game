/**
 * Public API of the Hive chain module.
 * Browser code imports `./wallet`, server code imports `./server`.
 */
export { getHiveClient, setHiveClient, type HiveClient } from "./client";
export * from "./types";
export * as wallet from "./wallet";
export * as server from "./server";
