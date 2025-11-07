import { Contract, Interface, JsonRpcProvider, Wallet } from "ethers";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const NETWORK_PRIVATE_KEY = process.env.NETWORK_PRIVATE_KEY;
const NETWORK_RPC_URL = process.env.NETWORK_RPC_URL;
export const NETWORK_CHAIN_ID = Number(process.env.NETWORK_CHAIN_ID);

if (!NETWORK_PRIVATE_KEY) {
  console.error("❌ Missing NETWORK_PRIVATE_KEY in .env");
  process.exit(1);
}
if (!NETWORK_RPC_URL) {
  console.error("❌ Missing NETWORK_RPC_URL in .env");
  process.exit(1);
}
if (!Number.isFinite(NETWORK_CHAIN_ID)) {
  console.error("❌ Missing NETWORK_CHAIN_ID in .env");
  process.exit(1);
}

// Provider and wallet
const provider = new JsonRpcProvider(NETWORK_RPC_URL, {
  name: `chain-${NETWORK_CHAIN_ID}`,
  chainId: NETWORK_CHAIN_ID,
});
const wallet = new Wallet(NETWORK_PRIVATE_KEY, provider);

// Keep exports compatible with existing imports
export const account = { address: wallet.address };

export const resolvedChain = {
  id: NETWORK_CHAIN_ID,
  name: `chain-${NETWORK_CHAIN_ID}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [NETWORK_RPC_URL] },
    public: { http: [NETWORK_RPC_URL] },
  },
};

// Helper: build an ethers Contract (read-only)
function roContract(address, abi) {
  return new Contract(address, abi, provider);
}

// Helper: build an ethers Contract (with signer)
function rwContract(address, abi) {
  return new Contract(address, abi, wallet);
}

// Wrapper to match the previously used viem-like API
export const publicClient = {
  // Read a view/pure function from a contract
  async readContract({ address, abi, functionName, args = [] }) {
    const c = roContract(address, abi);
    if (typeof c[functionName] !== "function") {
      throw new Error(`readContract: function not found: ${functionName}`);
    }
    return await c[functionName](...args);
  },

  // Simulate a contract write to get the return value (no state change)
  // Returns { result, request } where request can be passed to walletClient.writeContract
  async simulateContract({ address, abi, functionName, args = [] }) {
    const c = rwContract(address, abi); // connect signer to allow from/account context if needed
    let result;
    // ethers v6 uses .staticCall; older versions use callStatic
    const fn = c[functionName];
    if (!fn)
      throw new Error(`simulateContract: function not found: ${functionName}`);
    if (fn && typeof fn.staticCall === "function") {
      result = await fn.staticCall(...args);
    } else if (
      c.callStatic &&
      typeof c.callStatic[functionName] === "function"
    ) {
      result = await c.callStatic[functionName](...args);
    } else {
      throw new Error(
        "simulateContract: static call not supported by this ethers version",
      );
    }
    return {
      result,
      request: { address, abi, functionName, args },
    };
  },

  // Encode calldata for a function
  async encodeFunctionData({ abi, functionName, args = [] }) {
    const iface = new Interface(abi);
    const data = iface.encodeFunctionData(functionName, args);
    return { data };
  },

  // Wait for a transaction receipt
  async waitForTransactionReceipt({ hash }) {
    return await provider.waitForTransaction(hash);
  },

  // Get bytecode at an address (used to detect EOA vs contract)
  async getBytecode({ address }) {
    return await provider.getCode(address);
  },

  // Watch a contract event; args supports simple named filters for indexed params
  // Signature compatible with viem's watchContractEvent
  watchContractEvent({ address, abi, eventName, args, onLogs, onError }) {
    try {
      const c = roContract(address, abi);
      const frag = c.interface.getEvent(eventName);

      // Build filter params array matching event inputs
      let params = [];
      try {
        params = new Array(frag.inputs.length).fill(null);
        if (args && typeof args === "object") {
          for (let i = 0; i < frag.inputs.length; i++) {
            const input = frag.inputs[i];
            if (
              input.indexed &&
              Object.prototype.hasOwnProperty.call(args, input.name)
            ) {
              params[i] = args[input.name];
            }
          }
        }
      } catch {
        // fallback: no filtering
        params = new Array(frag.inputs.length).fill(null);
      }

      const filterFactory = c.filters?.[eventName];
      if (typeof filterFactory !== "function") {
        throw new Error(
          `watchContractEvent: filter not available for event ${eventName}`,
        );
      }
      const filter = filterFactory(...params);

      const listener = async (log) => {
        try {
          // log is a raw Log, decode it
          const parsed = c.interface.parseLog(log);
          // Build args object keyed by input names
          const outArgs = {};
          parsed.fragment.inputs.forEach((inp, idx) => {
            outArgs[inp.name] = parsed.args[idx];
          });

          const normalized = {
            args: outArgs,
            transactionHash: log.transactionHash,
            logIndex: log.logIndex,
          };
          if (typeof onLogs === "function") {
            await onLogs([normalized]);
          }
        } catch (e) {
          if (typeof onError === "function") onError(e);
          else console.error("watchContractEvent decode error:", e);
        }
      };

      provider.on(filter, listener);

      // Return unwatch function
      return () => {
        try {
          provider.off(filter, listener);
        } catch (e) {
          console.error("watchContractEvent unwatch error:", e);
        }
      };
    } catch (e) {
      if (typeof onError === "function") onError(e);
      else console.error("watchContractEvent error:", e);
      // no-op unwatch
      return () => {};
    }
  },
};

export const walletClient = {
  // Write a contract function
  // Accepts either:
  // - { address, abi, functionName, args = [], value? }
  // - { to, data, value? } (raw transaction)
  async writeContract(input) {
    // Raw tx path
    if (input && input.to && input.data) {
      const tx = await wallet.sendTransaction({
        to: input.to,
        data: input.data,
        value: input.value ?? 0,
      });
      return tx.hash;
    }

    // ABI invocation path
    const { address, abi, functionName, args = [], value } = input || {};
    if (!address || !abi || !functionName) {
      throw new Error("writeContract: missing address/abi/functionName");
    }
    const c = rwContract(address, abi);
    if (typeof c[functionName] !== "function") {
      throw new Error(`writeContract: function not found: ${functionName}`);
    }
    const overrides = {};
    if (value !== undefined && value !== null) {
      overrides.value = value;
    }
    const tx = await c[functionName](...args, overrides);
    return tx.hash;
  },
};

export function getExplorerBaseUrl() {
  const url = resolvedChain?.blockExplorers?.default?.url;
  if (url) return url;
  switch (NETWORK_CHAIN_ID) {
    case 1:
      return "https://etherscan.io";
    case 11155111:
      return "https://sepolia.etherscan.io";
    default:
      return "https://etherscan.io";
  }
}
export function explorerAddressUrl(address) {
  return `${getExplorerBaseUrl()}/address/${address}`;
}
export function explorerTxUrl(hash) {
  return `${getExplorerBaseUrl()}/tx/${hash}`;
}

console.log("✅ Wallet client ready:", account.address);
