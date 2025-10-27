import { walletClient } from "./client.js";
import { FACTORY_ABI, FACTORY_ADDRESS } from "./contract.js";

export async function createTrade(buyer, seller) {
  try {
    const txHash = await walletClient.writeContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "createEscrow",
      args: [buyer, seller],
    });

    console.log("✅ Trade created! Tx:", txHash);
    return txHash;
  } catch (err) {
    console.error("❌ Error creating trade:", err);
    throw err;
  }
}
