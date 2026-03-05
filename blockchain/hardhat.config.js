// blockchain/hardhat.config.js
// ------------------------------
// Hardhat configuration for deploying VaxGuardAudit.sol to Polygon Mumbai testnet.
// CRITICAL: Uses hardhat-ethers v6 (different from v5 — no waffle).
// CRITICAL: Mumbai testnet chainId is 80001.
// CRITICAL: Get free MATIC from faucet.polygon.technology before deploying.

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../backend/.env" });

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs:    200,
      },
    },
  },
  networks: {
    mumbai: {
      url:      process.env.POLYGON_RPC_URL || "https://rpc-mumbai.maticvigil.com",
      accounts: process.env.POLYGON_PRIVATE_KEY
        ? [process.env.POLYGON_PRIVATE_KEY]
        : [],
      chainId:  80001,
      gasPrice: 20000000000,   // 20 gwei — safe for Mumbai
    },
    localhost: {
      url:     "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: {
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
    },
  },
};
