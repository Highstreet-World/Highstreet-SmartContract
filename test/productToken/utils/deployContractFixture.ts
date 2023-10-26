import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect, assert } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, ContractTransactionResponse } from "ethers";
import { NFT, PRODUCT, TOKEN } from "../Constants";
import { DeployContractFixtureReturnedType } from "../types";
import { MockProductTokenHighBase, ProductTokenHighBase } from "../../../typechain-types";





export async function deployContractFixture(
  maxSupply = PRODUCT.max
): Promise<DeployContractFixtureReturnedType> {
  const [owner, user1, user2] = await ethers.getSigners();
  const ownerAddress = await owner.getAddress();
  const user1Address = await user1.getAddress();
  const user2Address = await user2.getAddress();

  const BondingCurve = await ethers.getContractFactory("BancorBondingCurve");
  const bondingCurve = await BondingCurve.deploy();

  const PaymentToken = await ethers.getContractFactory("MockERC20");
  const paymentToken = await PaymentToken.deploy(TOKEN.name, TOKEN.symbol);

  const PurchasedNft = await ethers.getContractFactory("HighstreetBrands");
  const purchasedNft = await PurchasedNft.deploy(NFT.name, NFT.symbol, NFT.uri);

  const ProductTokenBase = await ethers.getContractFactory(
    "MockProductTokenHighBase"
  );
  const productToken = (await upgrades.deployProxy(
    ProductTokenBase,
    [
      PRODUCT.name,
      PRODUCT.symbol,
      await paymentToken.getAddress(),
      await bondingCurve.getAddress(),
      await purchasedNft.getAddress(),
      PRODUCT.exp,
      maxSupply,
      PRODUCT.offset,
      PRODUCT.baseReserve,
      [PRODUCT.startTime, PRODUCT.endTime, PRODUCT.coolDownTime],
      PRODUCT.brandTokenId,
    ],
    {
      initializer: "initialize",
    }
  )) as MockProductTokenHighBase & Contract;
  await productToken.waitForDeployment();
  const ProductTokenBaseV1 = await ethers.getContractFactory(
    "MockProductTokenHighBaseV1"
  );

  purchasedNft.connect(owner).grantMinterRole(await productToken.getAddress());
  purchasedNft.connect(owner).grantMinterRole(ownerAddress);
  purchasedNft.connect(owner).setMaxSupply(0, 200);

  return {
    owner,
    user1,
    user2,
    ownerAddress,
    user1Address,
    user2Address,
    productToken,
    paymentToken,
    purchasedNft,
    ProductTokenBaseV1,
  };
}
