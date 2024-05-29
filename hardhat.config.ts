import * as dotenv from "dotenv";

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

dotenv.config();
const env = process.env;
const accounts = env.PRIVATE_KEY !== undefined ? [env.PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.23",
        settings: { optimizer: { enabled: true, runs: 200 } },
      }
    ],
  },
  networks: {
    hardhat: {
      accounts: { count: 20, accountsBalance: "1" + "0".repeat(27) }
    },
    bscTestnet: { url: env.BSC_TESTNET_URL, chainId: 97, accounts },
    bsc: { url: env.BSC_MAINNET_URL, chainId: 56, accounts },
  },
  etherscan: {
    apiKey: {
      bscTestnet: env.BSCSCAN_API_KEY!,
      bsc: env.BSCSCAN_API_KEY!,
    },
  }
};

export default config;
