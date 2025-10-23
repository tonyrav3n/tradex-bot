import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

/**
 * Contract utils to load the TradeNestFactory address and ABI.
 *
 * Priority:
 * 1) FACTORY_ADDRESS and FACTORY_ABI_PATH from .env (explicit overrides)
 * 2) Fallback ABI from bot/abi/TradeNestFactory.json
 */

const ROOT = process.cwd();

// Default ABI path fallback
const DEFAULT_ARTIFACT_PATH = path.resolve(
  ROOT,
  "bot",
  "abi",
  "TradeNestFactory.json",
);

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function readJson(p) {
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

function loadFactoryAddress() {
  const addr = process.env.FACTORY_ADDRESS;
  if (addr) return addr;

  throw new Error(
    `Factory address not found.
- Set FACTORY_ADDRESS in your .env`,
  );
}

function loadFactoryAbi() {
  // 1) resolve artifact path (env override or default)
  const envArtifactPath =
    process.env.FACTORY_ABI_PATH || process.env.FACTORY_ARTIFACT_PATH;
  const artifactPath = envArtifactPath || DEFAULT_ARTIFACT_PATH;

  if (!fileExists(artifactPath)) {
    throw new Error(
      `Factory artifact not found at ${artifactPath}.
- Ensure bot/abi/TradeNestFactory.json exists or set FACTORY_ABI_PATH to a valid file.`,
    );
  }

  const artifact = readJson(artifactPath);
  if (Array.isArray(artifact)) return artifact;
  if (artifact?.abi) return artifact.abi;
  throw new Error(
    `Artifact at ${artifactPath} has no 'abi' field or is invalid.`,
  );
}

export const FACTORY_ADDRESS = loadFactoryAddress();
export const FACTORY_ABI = loadFactoryAbi();

// Optional: small helper to log what we loaded
if (process.env.CONTRACT_UTILS_DEBUG?.toLowerCase() === "true") {
  console.log("✅ Loaded TradeNestFactory config");
  console.log("Factory Address:", FACTORY_ADDRESS);
}
