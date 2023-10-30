import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { deployContractFixture } from "./utils/deployContractFixture";
import { ethers, upgrades } from "hardhat";
import { DeployContractFixtureReturnedType } from "./types";
import { getPlatformFeeWhenBuy } from "./utils/getPlatformFeeWhenBuy";
import { expect } from "chai";
import { getPlatformFeeWhenSell } from "./utils/getPlatformFeeWhenSell";
import { FEE_MULTIPLIER, FEE_RATE_IN_BUY, FEE_RATE_IN_SELL, PRODUCT } from "./Constants";
import { MockProductTokenHighBaseV1 } from "../../typechain-types";
import { Contract } from "ethers";

describe("ProductTokenHighBase test", () => {
  describe("basic information check", () => {
    let context: DeployContractFixtureReturnedType;
    beforeEach(async () => {
      context = await deployContractFixture();
    });
    it("has a name", async () => {
      const { productToken } = context;
      expect(await productToken.name()).to.equal(PRODUCT.name);
    });

    it("has a symbol", async () => {
      const { productToken } = context;
      expect(await productToken.symbol()).to.equal(PRODUCT.symbol);
    });

    it("has 0 decimals", async () => {
      const { productToken } = context;
      expect(await productToken.decimals()).to.eq(0);
    });

    it("has max supply", async () => {
      const { productToken } = context;
      expect(await productToken.maxTokenCount()).to.be.equal(PRODUCT.max);
    });

    it("check owner", async () => {
      const { productToken, ownerAddress } = context;
      expect(await productToken.owner()).to.equal(ownerAddress);
    });

    it("default supplier should be owner", async () => {
      const { productToken, ownerAddress } = context;
      expect(await productToken.getSupplierAddress()).to.equal(ownerAddress);
    });
  });

  describe("test purchase feature", () => {
    let context: DeployContractFixtureReturnedType;
    beforeEach(async () => {
      context = await deployContractFixture();
      const amount = ethers.parseEther("1000");
      await context.paymentToken.connect(context.user1).faucet(amount);
    });

    it("should success when maxPrice = currentPrice", async () => {
      const { productToken, paymentToken, user1, user1Address } = context;

      const user1Balance = await paymentToken.balanceOf(user1Address);
      const price = await productToken.getCurrentPrice();
      const fee = getPlatformFeeWhenBuy(price);
      await paymentToken
        .connect(user1)
        .approve(productToken.getAddress(), price);

      const tx = productToken.connect(user1).buy(price);
      await expect(tx)
        .to.emit(productToken, "Buy")
        .withArgs(user1Address, price - fee, fee);

      expect(await paymentToken.balanceOf(user1Address)).to.eq(
        user1Balance - price
      );
      expect(await productToken.balanceOf(user1Address)).to.be.equal("1");
    });

    it("revert when maxPrice < currentPrice", async () => {
      const { productToken, paymentToken, user1, user1Address } = context;

      let price = await productToken.getCurrentPrice();

      let insufficientPrice = price - ethers.getBigInt(1);

      await paymentToken
        .connect(user1)
        .approve(productToken.getAddress(), insufficientPrice);
      let tx = productToken.connect(user1).buy(insufficientPrice);
      await expect(tx).to.revertedWith("Insufficient max price.");
    });

    it("check change when maxPrice > currentPrice", async () => {
      const { productToken, paymentToken, user1, user1Address } = context;

      let balance = await paymentToken.balanceOf(user1Address);

      let price = await productToken.getCurrentPrice();
      let overPrice = price + ethers.toBigInt(1);

      //Approve and pay more than purchase need but no any additional charge.
      await paymentToken
        .connect(user1)
        .approve(productToken.getAddress(), overPrice);
      await productToken.connect(user1).buy(overPrice);

      //check if the balanceOf money is (1000 - price)
      expect(await paymentToken.balanceOf(user1Address)).to.be.eq(
        balance - price
      );
      //check if user1's balanceOf to see there is a token received
      expect(await productToken.balanceOf(user1Address)).to.be.eq(1);
    });

    it("revert when getAvailability == 0", async () => {
      //change max supply
      const maxSupply = 2;
      const defaultUserPaymentTokenAmount = ethers.parseEther("1000");
      context = await deployContractFixture(maxSupply);
      const { productToken, paymentToken, user1, user1Address } = context;

      let remain = await productToken.getAvailability();
      expect(remain).to.be.equal(maxSupply);

      await paymentToken.connect(user1).faucet(defaultUserPaymentTokenAmount);
      await paymentToken
        .connect(user1)
        .approve(productToken.getAddress(), defaultUserPaymentTokenAmount);

      for (let i = 0; i < maxSupply; i++) {
        let price = await productToken.getCurrentPrice();
        await productToken.connect(user1).buy(price);
      }

      expect(await productToken.totalSupply()).to.be.equal(remain);
      expect(await productToken.getAvailability()).to.equal(0);

      let price = await productToken.getCurrentPrice();
      let tx = productToken.connect(user1).buy(price);
      await expect(tx).to.revertedWith("Sorry, this token is sold out.");
    });
  });

  describe("test sell feature", () => {
    let context: DeployContractFixtureReturnedType;
    beforeEach(async () => {
      context = await deployContractFixture();
      const { productToken, paymentToken, user1, user1Address } = context;
      const amount = ethers.parseEther("1000");
      await context.paymentToken.connect(context.user1).faucet(amount);
      await paymentToken
        .connect(user1)
        .approve(productToken.getAddress(), amount);

      //User should have at least one product before selling it
      const price = await productToken.getCurrentPrice();
      await productToken.connect(user1).buy(price);
    });

    it("should success when sold one product", async () => {
      const { productToken, paymentToken, owner, user1, user1Address } =
        context;

      let balance = await paymentToken.balanceOf(user1Address);

      let sellAmount = 1;
      //now need to check if the contract works properly
      let sellPrice = await productToken.calculateSellReturn(sellAmount);
      let fee = getPlatformFeeWhenSell(sellPrice);
      // await productToken.connect(owner).setTimestamp(5);
      let tx = productToken.connect(user1).sell(sellAmount);
      await expect(tx)
        .to.emit(productToken, "Sell")
        .withArgs(user1Address, sellAmount, sellPrice + fee, fee);

      expect(await productToken.balanceOf(user1Address)).to.be.equal(0);
      //check sellPrice recieve price.
      expect(await paymentToken.balanceOf(user1Address)).to.be.equal(
        balance + sellPrice
      );
    });

    it("revert if balance of user < amount", async () => {
      const { productToken, paymentToken, owner, user1 } = context;
      const tx = productToken.connect(user1).sell(2);
      await expect(tx).to.revertedWith("Insufficient tokens.");
    });

    it("revert if amount == 0", async () => {
      const { productToken, paymentToken, owner, user1 } = context;
      const tx = productToken.connect(user1).sell(0);
      await expect(tx).to.revertedWith("Amount must be non-zero.");
    });
  });

  describe("test tradein feature", () => {
    let context: DeployContractFixtureReturnedType;
    beforeEach(async () => {
      context = await deployContractFixture();
      const { productToken, paymentToken, user1, user1Address } = context;
      const amount = ethers.parseEther("1000");
      await context.paymentToken.connect(context.user1).faucet(amount);
      await paymentToken
        .connect(user1)
        .approve(productToken.getAddress(), amount);

      //purchase two tokens first
      let price = await productToken.getCurrentPrice();
      await productToken.connect(user1).buy(price);

      price = await productToken.getCurrentPrice();
      await productToken.connect(user1).buy(price);
    });

    it("should success when tradein one product", async () => {
      const { productToken, paymentToken, user1, user1Address } = context;

      let redeemAmount = 1;
      let tradeinValue = await productToken.calculateTradinReturn(redeemAmount);

      let tx = productToken.connect(user1).tradein(redeemAmount);
      await expect(tx)
        .to.emit(productToken, "Tradein")
        .withArgs(user1Address, redeemAmount, tradeinValue);

      //tradeinCount equal to 1 means you burned 1 product
      expect(await productToken.tradeinCount()).to.be.eq(redeemAmount);
      expect(await productToken.totalSupply()).to.be.eq(1);
    });

    it("should success received two nft when tradein two product", async () => {
      const { productToken, paymentToken, purchasedNft, user1, user1Address } =
        context;
      const redeemAmount = 2;
      const tradeinValue = await productToken.calculateTradinReturn(
        redeemAmount
      );

      await expect(productToken.connect(user1).tradein(redeemAmount))
        .to.emit(productToken, "Tradein")
        .withArgs(user1Address, redeemAmount, tradeinValue);

      //check the tradeinCount=2, that means you burn 2 product
      expect(await productToken.tradeinCount()).to.be.eq(redeemAmount);
      expect(await productToken.totalSupply()).to.be.eq(0);
      expect(await purchasedNft.balanceOf(user1Address, 0)).to.equal(2);
    });
  });

  describe("platform features test", () => {
    let context: DeployContractFixtureReturnedType;
    beforeEach(async () => {
      context = await deployContractFixture();
      const { productToken, paymentToken, user1, user1Address } = context;
      const amount = ethers.parseEther("1000");
      await context.paymentToken.connect(context.user1).faucet(amount);
    });

    it("able to transfer ownership", async () => {
      const { productToken, paymentToken, purchasedNft, owner, user1, user1Address } =
        context;
      await productToken.connect(owner).transferOwnership(user1Address);
      expect(await productToken.owner()).to.equal(user1Address);
    });
    it("able to change supplier", async () => {
      const {
        productToken,
        paymentToken,
        purchasedNft,
        owner,
        user1,
        user1Address,
        user2,
        user2Address
      } = context;
      //transfer supplier from owner to user1
      await productToken.connect(owner).transferSupplier(user1Address);
      expect(await productToken.connect(user1).getSupplierAddress()).to.equal(
        user1Address
      );
      //transfer supplier from user1 to user2
      await productToken.connect(user1).transferSupplier(user2Address);
      expect(await productToken.connect(user2).getSupplierAddress()).to.equal(
        user2Address
      );

      //origin supplier should be revert after transfer supplier
      await expect(
        productToken.connect(user1).getSupplierAddress()
      ).to.revertedWith("not allowed");
      await expect(
        productToken.connect(user1).getSupplierFee()
      ).to.revertedWith("not allowed");
    });

    it("not allow to get supplier information", async () => {
      const {
        productToken,
        user1,
      } = context;
      await expect(
        productToken.connect(user1).getSupplierAddress()
      ).to.revertedWith("not allowed");
      await expect(
        productToken.connect(user1).getSupplierFee()
      ).to.revertedWith("not allowed");
    });

    it("not allow to get platform fee information", async () => {
      const {
        productToken,
        user1
      } = context;
      await expect(
        productToken.connect(user1).getPlatformFee()
      ).to.revertedWith("not allowed");
    });

    describe("platform fee check", () => {
      enum feeType {
        TYPE_BUY = 0,
        TYBE_SELL =1,
        TYPE_TRADIN = 2,
      };
      let platformFee: bigint, supplierFee: bigint;

      const calculateFee = (
        type: feeType,
        fee: bigint,
        tradeInValue?: bigint
      ) => {
        if (type === feeType.TYPE_BUY) {
          // (60/80)
          let supplierFeeRate = BigInt(2) * FEE_MULTIPLIER;
          // (20/80)
          let platformFeeRate = BigInt(6) * FEE_MULTIPLIER;

          supplierFee =
            supplierFee + (fee * supplierFeeRate) / FEE_RATE_IN_BUY;

          platformFee =
            platformFee + (fee * platformFeeRate) / FEE_RATE_IN_BUY;
        } else if (type === feeType.TYBE_SELL) {
          // (30/40)
          let supplierFeeRate = BigInt(1) * FEE_MULTIPLIER;
          // (10/40)
          let platformFeeRate = BigInt(3) * FEE_MULTIPLIER;

          // 50%
          supplierFee =
            supplierFee + (fee * supplierFeeRate) / FEE_RATE_IN_SELL;
          // 50%
          platformFee =
            platformFee + (fee * platformFeeRate) / FEE_RATE_IN_SELL;
        } else if (type === feeType.TYPE_TRADIN && tradeInValue) {
          // tradeInValue
          supplierFee = supplierFee + tradeInValue;
        }
      };

      beforeEach(async () => {
        let price: bigint;
        const {
          productToken,
          paymentToken,
          purchasedNft,
          owner,
          user1,
          user1Address,
        } = context;
        platformFee = BigInt(0);
        supplierFee = BigInt(0);
        // buy
        price = await productToken.getCurrentPrice();
        await paymentToken.connect(user1).approve(productToken.getAddress(), price);
        await productToken.connect(user1).buy(price);
        calculateFee(feeType.TYPE_BUY, getPlatformFeeWhenBuy(price));

        // sell
        const sellAmount = 1;
        productToken.connect(owner).setTimestamp(100);
        price = await productToken.calculateSellReturn(sellAmount);
        await productToken.connect(user1).sell(sellAmount);
        calculateFee(feeType.TYBE_SELL, getPlatformFeeWhenSell(price));

        // buy
        price = await productToken.getCurrentPrice();
        await paymentToken.connect(user1).approve(productToken.getAddress(), price);
        await productToken.connect(user1).buy(price);
        calculateFee(feeType.TYPE_BUY, getPlatformFeeWhenBuy(price));

        // tradein
        const redeemAmount = 1;
        const tradeinValue = await productToken.calculateTradinReturn(redeemAmount);
        await productToken.calculateSellReturn(redeemAmount);
        await productToken.connect(user1).tradein(redeemAmount);
        calculateFee(feeType.TYPE_TRADIN, BigInt(0), tradeinValue);
      });

      it("check platform fee", async () => {
        const {
          productToken,
        } = context;
        expect(await productToken.getPlatformFee()).to.be.equal(platformFee);
      });
      it("claim platform fee", async () => {
        const {
          productToken,
          paymentToken,
          owner,
          ownerAddress
        } = context;
        let balance = await paymentToken.balanceOf(ownerAddress);

        await expect(productToken.connect(owner).claimPlatformFee(platformFee))
          .to.emit(productToken, "ClaimPlatformFee")
          .withArgs(ownerAddress, platformFee);
        expect(await productToken.getPlatformFee()).to.be.equal(0);
        expect(await paymentToken.balanceOf(ownerAddress)).to.be.eq(
          balance + platformFee
        );
      });
      it("check supplier fee", async () => {
        const { productToken, owner, ownerAddress } = context;
        expect(await productToken.getSupplierFee()).to.be.eq(supplierFee);
      });
      it("claim supplier fee", async () => {
        const { productToken, paymentToken, owner, ownerAddress } = context;
        let balance = await paymentToken.balanceOf(ownerAddress);
        await expect(productToken.connect(owner).claimSupplierFee(supplierFee))
          .to.emit(productToken, "ClaimSupplierFee")
          .withArgs(ownerAddress, supplierFee);
        expect(await productToken.getSupplierFee()).to.be.eq(0);
        expect(await paymentToken.balanceOf(ownerAddress)).to.be.eq(
          balance + supplierFee
        );
      });
    });
  });
  describe("product upgradability test", () => {
    let context: DeployContractFixtureReturnedType;
    beforeEach(async () => {
      context = await deployContractFixture();
    });

    it("upgrade to Mock V1", async () => {
      const { productToken,ProductTokenBaseV1 } = context;
      const productTokenV1 = (await upgrades.upgradeProxy(
        productToken,
        ProductTokenBaseV1
      )) as MockProductTokenHighBaseV1 & Contract;
      expect(await productTokenV1.tokenVersion()).to.be.equal("V1");
    });
  });
});
