/**
 * blockchain/scripts/deploy.js
 * ----------------------------
 * Deploys VaxGuardAudit.sol to Polygon Amoy testnet.
 *
 * Run:
 *   npx hardhat run scripts/deploy.js --network amoy
 *
 * Prerequisites:
 *   1. Copy .env.example to .env and fill in POLYGON_PRIVATE_KEY
 *   2. Get free MATIC from https://faucet.polygon.technology (select Amoy)
 *   3. npm install in the blockchain/ directory
 *
 * After deploy, copy the printed contract address into your backend .env:
 *   POLYGON_CONTRACT_ADDRESS=0x...
 */

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying VaxGuardAudit...");
  console.log("Deployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "MATIC");

  if (balance === 0n) {
    console.error(
      "ERROR: Deployer has 0 MATIC. " +
      "Get free Amoy MATIC from https://faucet.polygon.technology"
    );
    process.exit(1);
  }

  const VaxGuardAudit = await ethers.getContractFactory("VaxGuardAudit");
  const contract      = await VaxGuardAudit.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();

  console.log("\n✅ VaxGuardAudit deployed!");
  console.log("   Contract address:", address);
  console.log("   Network:         Polygon Amoy (chain_id=80002)");
  console.log("\nAdd to your backend .env:");
  console.log(`   POLYGON_CONTRACT_ADDRESS=${address}`);
  console.log("   POLYGON_RPC_URL=https://rpc-amoy.polygon.technology");
  console.log("   POLYGON_CHAIN_ID=80002");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
