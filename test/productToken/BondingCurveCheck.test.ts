import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect, assert } from "chai";
import { ethers, upgrades } from "hardhat";
import { deployContractFixture } from "./utils/deployContractFixture";
import { PRODUCT } from "./Constants";



describe("BondingCurveCheck", function () {
  //default off
  it.skip("show price when each token sold", async ()=>{
    const { user1, productToken, paymentToken } = await deployContractFixture();
    const initialBalance = ethers.parseEther("1000000.0");
    await paymentToken.connect(user1).faucet(initialBalance);
    await paymentToken
      .connect(user1)
      .approve(await productToken.getAddress(), initialBalance);

    for (let i = 0; i < PRODUCT.max; i++) {
      let buyPrice = await productToken.getCurrentPrice();
      let sellPrice = await productToken.calculateSellReturn(1);
      console.log(
        i,
        "\tbuy: " + ethers.formatEther(buyPrice),
        " \tsell:",
        ethers.formatEther(sellPrice)
      );
      await productToken.connect(user1).buy(buyPrice);
    }
  })
});
