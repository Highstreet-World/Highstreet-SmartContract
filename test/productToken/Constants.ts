import { ethers } from "hardhat";

/* TOKEN PARAMETERS */
export const TOKEN = {
  name: "HighStreet Token",
  symbol: "HIGH",
};

/* NFT PARAMETERS */
export const NFT = {
  name: "Product nft",
  symbol: "pNFT",
  amount: 200,
  uri: "https://highstreet/pNFT/",
};

/* PRODUCT PARAMETERS */
export const PRODUCT = {
  name: "Drop1",
  symbol: "D1",
  exp: "7100",
  max: 200,
  offset: "5492",
  baseReserve: "2657",
  startTime: 0,
  endTime: 0,
  coolDownTime: 0,
  brandTokenId: 0,
  feeOfBuy: 8,
  feeOfSell: 4,
};

export const FEE_MULTIPLIER = BigInt(1e6);
export const FEE_RATE_IN_BUY = BigInt(PRODUCT.feeOfBuy) * FEE_MULTIPLIER;
export const FEE_RATE_IN_SELL = BigInt(PRODUCT.feeOfSell) * FEE_MULTIPLIER;
export const FEE_DIVIDER = BigInt(100) * FEE_MULTIPLIER;
