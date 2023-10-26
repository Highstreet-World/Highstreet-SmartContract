import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-chai-matchers";
import "@openzeppelin/hardhat-upgrades";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 9999,
        details: {
          yul: true,
        },
      }
    },
  },
  networks: {
    mainnet: {
      url: process.env.ENDPOINT_MAINNET || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    sepolia: {
      url: process.env.ENDPOINT_SEPOLIA || "",
      accounts:
        process.env.PRIVATE_KEY_TESTNET !== undefined
          ? [process.env.PRIVATE_KEY_TESTNET]
          : [],
    },
    goerli: {
      url: process.env.ENDPOINT_GOERLI || "",
      accounts:
        process.env.PRIVATE_KEY_TESTNET !== undefined
          ? [process.env.PRIVATE_KEY_TESTNET]
          : [],
    },
    bsc: {
      url: process.env.ENDPOINT_BSC || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      chainId: 56,
    },
    bscTestnet: {
      url: process.env.ENDPOINT_BSC_TESTNET || "",
      accounts:
        process.env.PRIVATE_KEY_TESTNET !== undefined
          ? [process.env.PRIVATE_KEY_TESTNET]
          : [],
      chainId: 97,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  mocha: {
    timeout: 3000000,
  },
};

export default config;
