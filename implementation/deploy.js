// blockchain/scripts/deploy.js
// ------------------------------
// Deploys VaxGuardAudit.sol to Polygon Mumbai testnet.
// Run: npx hardhat run scripts/deploy.js --network mumbai
//
// CRITICAL: After deploy, copy the contract address to:
//   backend/.env  → POLYGON_CONTRACT_ADDRESS=0x...
//   frontend/.env.local → NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
//
// CRITICAL: Save the ABI from artifacts/ to backend/services/polygon_abi.json

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying with account:", deployer.address);

  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "MATIC");

  if (balance < ethers.parseEther("0.01")) {
    console.error("❌ Insufficient MATIC. Get free tokens from faucet.polygon.technology");
    process.exit(1);
  }

  console.log("Deploying VaxGuardAudit...");
  const VaxGuardAudit = await ethers.getContractFactory("VaxGuardAudit");
  const contract      = await VaxGuardAudit.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ VaxGuardAudit deployed to:", address);

  // Save ABI to backend for polygon_service.py
  const artifact   = require(`../artifacts/contracts/VaxGuardAudit.sol/VaxGuardAudit.json`);
  const abiOutPath = path.join(__dirname, "../../backend/services/polygon_abi.json");
  fs.writeFileSync(abiOutPath, JSON.stringify(artifact.abi, null, 2));
  console.log("✅ ABI saved to backend/services/polygon_abi.json");

  // Print env var lines to copy
  console.log("\n── Copy these to your .env files ──");
  console.log(`POLYGON_CONTRACT_ADDRESS=${address}`);
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);

  // Test: store and retrieve a hash
  console.log("\nTesting contract...");
  const testHash = "a".repeat(64);
  const tx       = await contract.storeHash("test-entity-001", testHash);
  await tx.wait();

  const retrieved = await contract.getHash("test-entity-001");
  console.log("✅ Test passed:", retrieved === testHash ? "Hash verified" : "❌ MISMATCH");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
