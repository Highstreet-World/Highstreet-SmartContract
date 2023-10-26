import { ethers } from "hardhat";
import { FEE_DIVIDER, FEE_RATE_IN_BUY } from "../Constants";

export const getPlatformFeeWhenBuy = (price: BigInt) =>
  (price * FEE_RATE_IN_BUY) / (FEE_DIVIDER + FEE_RATE_IN_BUY);
