import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, ContractTransactionResponse } from "ethers";
import { HighstreetBrands, MockERC20, MockProductTokenHighBase, MockProductTokenHighBaseV1__factory, ProductTokenHighBase } from "../../typechain-types";

type ContractDefaultType = {
  deploymentTransaction(): ContractTransactionResponse;
};

export type DeployContractFixtureReturnedType = {
  owner: HardhatEthersSigner;
  user1: HardhatEthersSigner;
  user2: HardhatEthersSigner;
  ownerAddress: string;
  user1Address: string;
  user2Address: string;
  productToken: MockProductTokenHighBase & Contract;
  paymentToken: MockERC20 & ContractDefaultType;
  purchasedNft: HighstreetBrands & ContractDefaultType;
  ProductTokenBaseV1: MockProductTokenHighBaseV1__factory;
};