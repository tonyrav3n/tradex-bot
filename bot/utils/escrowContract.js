/**
 * tradenest-discord/bot/utils/escrowContract.js
 *
 * Loader for the TradeNestEscrow ABI from the JSON artifact.
 *
 * Behavior:
 * - Reads the ABI from bot/abi/TradeNestEscrow.json by default
 * - Supports both "pure ABI array" files and Hardhat/Foundry-style { abi: [...] } artifacts
 * - Optional override via ESCROW_ARTIFACT_PATH environment variable
 * - Throws a descriptive error if the artifact is missing or malformed
 *
 * Usage:
 *   import { ESCROW_ABI } from "./escrowContract.js";
 *   // then use ESCROW_ABI in viem readContract/writeContract/watchContractEvent
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const ROOT = process.cwd();
const DEFAULT_ESCROW_ARTIFACT_PATH = path.resolve(
  ROOT,
  "bot",
  "abi",
  "TradeNestEscrow.json",
);

/**
 * Check file existence
 * @param {string} p
 * @returns {boolean}
 */
function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Read and parse JSON file
 * @param {string} p
 * @returns {any}
 */
function readJson(p) {
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

/**
 * Try to extract an ABI array from a parsed artifact object.
 * Accepts:
 * - Array of ABI items directly
 * - Object with "abi" field (Hardhat/Foundry artifact format)
 * @param {any} artifact
 * @returns {Array<any>|null}
 */
function extractAbi(artifact) {
  if (!artifact) return null;
  if (Array.isArray(artifact)) return artifact;
  if (Array.isArray(artifact?.abi)) return artifact.abi;
  return null;
}

/**
 * Load the TradeNestEscrow ABI from disk with optional path override.
 * @returns {Array<any>}
 */
function loadEscrowAbi() {
  const overridePath = String(process.env.ESCROW_ARTIFACT_PATH || "").trim();
  const artifactPath = overridePath || DEFAULT_ESCROW_ARTIFACT_PATH;

  if (!fileExists(artifactPath)) {
    const hint =
      artifactPath === DEFAULT_ESCROW_ARTIFACT_PATH
        ? `Ensure the artifact exists at ${artifactPath}.`
        : `Provided ESCROW_ARTIFACT_PATH does not exist: ${artifactPath}`;
    throw new Error(
      `TradeNestEscrow artifact not found.\n${hint}\n` +
        `You can set ESCROW_ARTIFACT_PATH to override the default path.`,
    );
  }

  const artifact = readJson(artifactPath);
  const abi = extractAbi(artifact);
  if (!Array.isArray(abi) || abi.length === 0) {
    throw new Error(
      `Invalid TradeNestEscrow artifact at ${artifactPath} — ABI not found or empty.\n` +
        `Expected either a pure ABI array or an object with an "abi" field.`,
    );
  }

  // Optional sanity check: warn if key selectors are missing
  try {
    const names = new Set(
      abi.map((x) => (x && typeof x === "object" ? x.name : null)).filter(Boolean),
    );
    const required = [
      // views
      "buyer",
      "seller",
      "amount",
      "status",
      "deliveryTimestamp",
      "releaseTimeout",
      // writes we use
      "markDelivered",
      "approveDelivery",
      "releaseAfterTimeout",
      // event names
      "Funded",
      "Delivered",
      "Approved",
      "Released",
    ];
    const missing = required.filter((n) => !names.has(n));
    if (missing.length > 0) {
      console.warn(
        `[escrowContract] Warning: ABI is missing expected entries: ${missing.join(
          ", ",
        )}`,
      );
    }
  } catch {
    // best-effort only
  }

  if (process.env.CONTRACT_UTILS_DEBUG?.toLowerCase() === "true") {
    console.log("✅ Loaded TradeNestEscrow ABI");
    console.log(
      "Artifact path:",
      overridePath ? "ESCROW_ARTIFACT_PATH (override)" : "default",
      "→",
      artifactPath,
    );
  }

  return abi;
}

export const ESCROW_ABI = loadEscrowAbi();

export default {
  ESCROW_ABI,
};
