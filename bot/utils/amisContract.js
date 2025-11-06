/**
 * amisContract.js
 *
 * Loader for the AmisEscrowManager contract address and ABI.
 *
 * - Address is read from AMIS_ESCROW_ADDRESS in the environment.
 * - ABI is loaded from bot/abi/AmisEscrow.json by default.
 * - You can override the ABI path via AMIS_ESCROW_ARTIFACT_PATH.
 * - Accepts both pure ABI arrays and { abi: [...] } artifacts.
 *
 * Usage:
 *   import { AMIS_ADDRESS, AMIS_ABI } from "./amisContract.js";
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const ROOT = process.cwd();
const DEFAULT_ARTIFACT_PATH = path.resolve(
  ROOT,
  "bot",
  "abi",
  "AmisEscrow.json",
);

/**
 * Basic address validator.
 * @param {string | undefined | null} addr
 * @returns {boolean}
 */
function isAddress(addr) {
  return (
    typeof addr === "string" &&
    addr.startsWith("0x") &&
    addr.length === 42 &&
    /^[0-9a-fA-Fx]+$/.test(addr)
  );
}

/**
 * Check file existence.
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
 * Read and parse JSON file.
 * @param {string} p
 * @returns {any}
 */
function readJson(p) {
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

/**
 * Extract ABI array from an artifact (pure array or { abi: [...] }).
 * @param {any} artifact
 * @returns {Array<any> | null}
 */
function extractAbi(artifact) {
  if (!artifact) return null;
  if (Array.isArray(artifact)) return artifact;
  if (Array.isArray(artifact?.abi)) return artifact.abi;
  return null;
}

/**
 * Load the AmisEscrowManager address from environment.
 * Requires AMIS_ESCROW_ADDRESS to be set to a valid 0x address.
 * @returns {string}
 */
function loadAmisAddress() {
  const addr = String(process.env.AMIS_ESCROW_ADDRESS || "").trim();
  if (!isAddress(addr)) {
    throw new Error(
      `AMIS_ESCROW_ADDRESS is missing or invalid.
- Set AMIS_ESCROW_ADDRESS in your .env to the deployed AmisEscrowManager address (0x...42 chars)`,
    );
  }
  return addr;
}

/**
 * Load the AmisEscrowManager ABI from disk.
 * Supports override via AMIS_ESCROW_ARTIFACT_PATH; otherwise uses bot/abi/AmisEscrow.json.
 * @returns {Array<any>}
 */
function loadAmisAbi() {
  const overridePath = String(
    process.env.AMIS_ESCROW_ARTIFACT_PATH || "",
  ).trim();
  const artifactPath = overridePath || DEFAULT_ARTIFACT_PATH;

  if (!fileExists(artifactPath)) {
    const hint =
      artifactPath === DEFAULT_ARTIFACT_PATH
        ? `Ensure the artifact exists at ${artifactPath}.`
        : `Provided AMIS_ESCROW_ARTIFACT_PATH does not exist: ${artifactPath}`;
    throw new Error(
      `AmisEscrowManager artifact not found.
${hint}
You can set AMIS_ESCROW_ARTIFACT_PATH to override the default path.`,
    );
  }

  const artifact = readJson(artifactPath);
  const abi = extractAbi(artifact);
  if (!Array.isArray(abi) || abi.length === 0) {
    throw new Error(
      `Invalid AmisEscrowManager artifact at ${artifactPath} — ABI not found or empty.
Expected either a pure ABI array or an object with an "abi" field.`,
    );
  }

  // Optional sanity check for expected entries
  try {
    const names = new Set(
      abi
        .map((x) => (x && typeof x === "object" ? x.name : null))
        .filter(Boolean),
    );
    const required = [
      // core writes
      "createTrade",
      "fund",
      "markDelivered",
      "approveDelivery",
      "releaseAfterTimeout",
      "openDispute",
      "resolveDispute",
      "cancelTrade",
      // views
      "trades",
      "tradeCount",
      "releaseTimeout",
      "FEE_BPS",
      "TOTAL_FEE_BPS",
      "BOT_SHARE_BPS",
      // key events
      "Created",
      "Funded",
      "Delivered",
      "Approved",
      "Released",
      "Refunded",
      "Disputed",
      "Cancelled",
      "BuyerFeeSplit",
      "SellerFeeSplit",
    ];
    const missing = required.filter((n) => !names.has(n));
    if (missing.length > 0) {
      console.warn(
        `[amisContract] Warning: ABI is missing expected entries: ${missing.join(", ")}`,
      );
    }
  } catch {
    // best-effort only
  }

  if (process.env.CONTRACT_UTILS_DEBUG?.toLowerCase() === "true") {
    console.log("✅ Loaded AmisEscrowManager ABI");
    console.log(
      "Artifact path:",
      overridePath ? "AMIS_ESCROW_ARTIFACT_PATH (override)" : "default",
      "→",
      artifactPath,
    );
  }

  return abi;
}

export const AMIS_ADDRESS = loadAmisAddress();
export const AMIS_ABI = loadAmisAbi();

if (process.env.CONTRACT_UTILS_DEBUG?.toLowerCase() === "true") {
  console.log("✅ Loaded AmisEscrowManager config");
  console.log("AMIS Address:", AMIS_ADDRESS);
}

export default {
  AMIS_ADDRESS,
  AMIS_ABI,
};
