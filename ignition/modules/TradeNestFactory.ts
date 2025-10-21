import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import dotenv from "dotenv";

dotenv.config();

const TradeNestFactoryModule = buildModule("TradeNestFactoryModule", (m) => {
  const factory = m.contract("TradeNestFactory", [process.env.BOT_ADDRESS!]);
  return { factory };
});

export default TradeNestFactoryModule;
