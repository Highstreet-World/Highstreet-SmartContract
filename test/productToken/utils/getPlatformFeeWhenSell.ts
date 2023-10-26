import { ethers } from "hardhat";
import { FEE_DIVIDER, FEE_RATE_IN_BUY, FEE_RATE_IN_SELL } from "../Constants";

export const getPlatformFeeWhenSell = (price: BigInt) =>
  (price * FEE_RATE_IN_SELL) / (FEE_DIVIDER - FEE_RATE_IN_SELL);