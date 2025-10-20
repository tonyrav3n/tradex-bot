import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

/**
 * Contract utils to load the TradeNestFactory address and ABI.
 *
 * Priority:
 * 1) FACTORY_ADDRESS and FACTORY_ABI_PATH from .env (explicit overrides)
 * 2) Ignition deployment addresses at ignition/deployments/chain-<CHAIN_ID>/deployed_addresses.json
 *    with key ending in "#TradeNestFactory"
 * 3) ABI from Ignition artifact at
 *    ignition/deployments/chain-<CHAIN_ID>/artifacts/TradeNestFactoryModule#TradeNestFactory.json
 * 4) Fallback ABI from build artifacts:
 *    - artifacts/TradeNestFactory.json (present in this repo)
 *    - artifacts/contracts/TradeNestFactory.sol/TradeNestFactory.json (typical Hardhat layout)
 */

const ROOT = process.cwd();

const CHAIN_ID = process.env.CHAIN_ID || "11155111"; // default to Sepolia in this repo
const ADDRESSES_PATH = path.resolve(
  ROOT,
  "ignition",
  "deployments",
  `chain-${CHAIN_ID}`,
  "deployed_addresses.json",
);

// Candidate artifact paths (first existing will be used if no env override)
const CANDIDATE_ARTIFACT_PATHS = [
  // Prefer committed runtime ABI
  path.resolve(ROOT, "bot", "abi", "TradeNestFactory.json"),
  path.resolve(
    ROOT,
    "ignition",
    "deployments",
    `chain-${CHAIN_ID}`,
    "artifacts",
    "TradeNestFactoryModule#TradeNestFactory.json",
  ),
  // Repo has flattened artifacts at the root artifacts/ dir
  path.resolve(ROOT, "artifacts", "TradeNestFactory.json"),
  // Typical Hardhat artifacts location
  path.resolve(
    ROOT,
    "artifacts",
    "contracts",
    "TradeNestFactory.sol",
    "TradeNestFactory.json",
  ),
];

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

function resolveFirstExisting(paths) {
  for (const p of paths) {
    if (fileExists(p)) return p;
  }
  return null;
}

function loadFactoryAddress() {
  // 1) env override
  if (process.env.FACTORY_ADDRESS) {
    return process.env.FACTORY_ADDRESS;
  }

  // 2) Ignition deployed addresses
  if (fileExists(ADDRESSES_PATH)) {
    const deployed = readJson(ADDRESSES_PATH);

    // Prefer a key that ends with "#TradeNestFactory"
    const key =
      Object.keys(deployed).find((k) => k.endsWith("#TradeNestFactory")) ||
      Object.keys(deployed).find((k) => /TradeNestFactory/i.test(k));

    if (key && deployed[key]) {
      return deployed[key];
    }
  }

  throw new Error(
    `Factory address not found.
- Set FACTORY_ADDRESS in your .env
- Or deploy with Ignition and ensure path exists: ${ADDRESSES_PATH}
- Or set CHAIN_ID to the chain you deployed to`,
  );
}

function loadFactoryAbi() {
  // 1) env override for artifact path
  const envArtifactPath =
    process.env.FACTORY_ABI_PATH || process.env.FACTORY_ARTIFACT_PATH;
  if (envArtifactPath && fileExists(envArtifactPath)) {
    const artifact = readJson(envArtifactPath);
    if (Array.isArray(artifact)) return artifact;
    if (artifact?.abi) return artifact.abi;
    throw new Error(
      `Invalid FACTORY_ABI_PATH (no abi field): ${envArtifactPath}`,
    );
  }

  // 2) Try candidates
  const artifactPath = resolveFirstExisting(CANDIDATE_ARTIFACT_PATHS);
  if (!artifactPath) {
    throw new Error(
      `Factory artifact not found.
Tried:
- ${CANDIDATE_ARTIFACT_PATHS.join("\n- ")}
You can also set FACTORY_ABI_PATH in .env`,
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
  console.log("Chain ID:", CHAIN_ID);
  console.log("Factory Address:", FACTORY_ADDRESS);
}
