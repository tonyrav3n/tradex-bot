import hre from "hardhat";
const { ethers } = hre;

async function main() {
  // 1. Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 2. Get the contract factory
  const Factory = await ethers.getContractFactory("TradeNestFactory");

  // 3. Deploy
  const factory = await Factory.deploy();
  await factory.deployed();

  console.log("TradeNestFactory deployed to:", factory.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
