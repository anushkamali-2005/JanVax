/**
 * blockchain/hardhat.config.js
 * ----------------------------
 * Hardhat config for Polygon Amoy testnet deployment.
 * NOTE: Mumbai (chain_id 80001) was deprecated Nov 2023. Use Amoy.
 */

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "./.env" });

const PRIVATE_KEY = process.env.POLYGON_PRIVATE_KEY || "";

if (!PRIVATE_KEY && process.env.NODE_ENV !== "test") {
  console.warn(
    "WARNING: POLYGON_PRIVATE_KEY not set in blockchain/.env\n" +
    "Copy blockchain/.env.example to blockchain/.env and fill it in."
  );
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Polygon Amoy testnet (Mumbai replacement)
    amoy: {
      url:      process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId:  80002,
    },
    // Keep a localhost network for unit tests
    hardhat: {
      chainId: 31337,
    },
  },
  etherscan: {
    // For contract verification on PolygonScan (optional)
    apiKey: {
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || "",
    },
    customChains: [
      {
        network:    "polygonAmoy",
        chainId:    80002,
        urls: {
          apiURL:     "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com",
        },
      },
    ],
  },
};
