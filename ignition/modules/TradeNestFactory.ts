import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TradeNestFactoryModule = buildModule("TradeNestFactoryModule", (m) => {
  const factory = m.contract("TradeNestFactory");
  return { factory };
});

export default TradeNestFactoryModule;
