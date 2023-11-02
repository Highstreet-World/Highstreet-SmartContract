import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer, ContractTransaction, BigNumberish, EventLog } from "ethers";

import { AnimocaHome, AnimocaSaleBatch3 } from "../../typechain-types";
import { MockERC721, MockERC20 } from "../../typechain-types";
import { HighOracle, EthOracle } from "../../typechain-types";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("Animoca Home sale Batch3", () => {

  let owner: Signer, user1: Signer, user2: Signer, user3: Signer, user4: Signer, receiver: Signer;
  let ownerAddr: string, user1Addr: string, user2Addr: string, user3Addr: string, user4Addr: string, receiverAddr: string;
  let home: AnimocaHome, duck: MockERC721, high: MockERC20, sale: AnimocaSaleBatch3, highOracle: HighOracle, ethOracle: EthOracle;
  let homeAddr: string, highAddr: string, duckAddr: string, saleAddr: string;

  let batch3Start: number, batch3End: number;
  let purchaseLimit = 20n;
  const price = ethers.parseEther("300");
  const duckHolderPrice = ethers.parseEther("255");
  const discount = ethers.parseEther("30");
  const tokenMaxAmount = 1250n;
  const packageStartingIndex = [1147n, 2397n, 3647n, 4897n];
  const packageReserveBias = 53n;
  const AggregatorV3Interface = require("../../artifacts/@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol/AggregatorV3Interface.json").abi;
  const formatEther = (val: bigint) => ethers.formatEther(val);

  /* NFT PARAMETERS */
  const config = {
    name: "NFT TBD",
    symbol: "TBD",
    uri: "https://highstreet.market/TBD",
    max: 5000,
  };

  const setupHigh = async (
    instance: MockERC20,
    homeSale: string,
    to: Array<Signer>
  ) => {
    for (let i = 0; i < to.length; i++) {
      await instance.connect(to[i]).faucet(ethers.parseEther("1000000"));
      await instance.connect(to[i]).approve(homeSale, ethers.parseEther("1000000"));
    }
  }

  const setupDuck = async (
    instance: MockERC721,
    to: string,
    id: number
  ) => {
    await instance.mintToken(to, id);
  }

  const buyBatch3 = async (
    packages: Array<number>,
    amounts: Array<number>,
  ) => {
    let pack = packages.map((v, i) => [v, amounts[i]]);
    return [pack];
  }

  const deployContractFixture = async () => {
    const Animoca = await ethers.getContractFactory("AnimocaHome");
    const homeSale = await ethers.getContractFactory("AnimocaSaleBatch3");
    const erc20 = await ethers.getContractFactory("MockERC20");
    const erc721 = await ethers.getContractFactory("MockERC721");
    const highOra = await ethers.getContractFactory("HighOracle");
    const ethOra = await ethers.getContractFactory("EthOracle");

    const currentTime = await time.latest();
    [owner] = await ethers.getSigners();
    batch3Start = currentTime + 10 * 3600;
    batch3End = batch3Start + 10 * 3600;

    highOracle = await highOra.deploy();
    await highOracle.waitForDeployment();
    ethOracle = await ethOra.deploy();
    await ethOracle.waitForDeployment();
  
    const high = await erc20.deploy("HIGH", "HIGH");
    const duck = await erc721.deploy();
    const home = await Animoca.deploy(config.name, config.symbol, config.uri, config.max);

    await home.waitForDeployment();
    await high.waitForDeployment();
    await duck.waitForDeployment();

    homeAddr = await home.getAddress();
    highAddr = await high.getAddress();
    duckAddr = await duck.getAddress();
    receiverAddr = await receiver.getAddress();

    const sale = await homeSale.deploy(
      highAddr,
      duckAddr,
      homeAddr,
      receiverAddr,
      highOracle,
      ethOracle,
      [batch3Start, batch3End],
      [
        packageStartingIndex[0] as BigNumberish,
        packageStartingIndex[1] as BigNumberish,
        packageStartingIndex[2] as BigNumberish,
        packageStartingIndex[3] as BigNumberish,
      ]
    )
    saleAddr = await sale.getAddress();
  
    await home.grantMinterRole(saleAddr);
  
    return {home, duck, high, sale}
  }

  beforeEach(async () => {
    [owner, user1, user2, user3, user4, receiver] = await ethers.getSigners();
    ownerAddr = await owner.getAddress();
    user1Addr = await user1.getAddress();
    user2Addr = await user2.getAddress();
    user3Addr = await user3.getAddress();
    user4Addr = await user4.getAddress();
    receiverAddr = await receiver.getAddress();

    const instance = await loadFixture(deployContractFixture);
    home = instance.home as AnimocaHome;
    duck = instance.duck as MockERC721;
    high = instance.high as MockERC20;
    sale = instance.sale as AnimocaSaleBatch3;
    await setupHigh(high, saleAddr, [user1, user2, user3, user4]);
  })

  describe("getter function check", () => {
    it("isOpened", async () => {
      expect(await sale.isOpened()).to.eq(false);
      await time.increaseTo(batch3Start);
      expect(await sale.isOpened()).to.eq(true);
      await time.increaseTo((batch3Start + batch3End)/ 2);
      expect(await sale.isOpened()).to.eq(true);
      await time.increaseTo(batch3End);
      expect(await sale.isOpened()).to.eq(true);
      await time.increaseTo(batch3End + 1);
      expect(await sale.isOpened()).to.eq(false);
    })
    it("getTokenLeft", async () => {
      let left = 0n;
      for (let i = 0; i < 4; i++) {
        left += (BigInt(i) + 1n) * tokenMaxAmount - packageReserveBias - packageStartingIndex[i];
      }
      expect(await sale.getTokenLeft()).to.eq(left);
    })
    it("getPackageLeft", async () => {
      for (let i = 0; i < 4; i++) {
        expect(await sale.getPackageLeft(i))
          .to.eq(tokenMaxAmount * (BigInt(i) + 1n) - packageReserveBias - packageStartingIndex[i]);
      }
    })
    describe("hasDiscount", () => {
      beforeEach(async () => {
        await sale.connect(owner).setDiscount([user1Addr, user2Addr], []);
      })
      it("should return true if msg.sender has discount", async () => {
        expect(await sale.hasDiscount(user1Addr)).to.eq(true);
      })
      it("should return false if msg.sender has discount", async () => {
        expect(await sale.hasDiscount(user3Addr)).to.eq(false);
      })
    })
    describe("getPriceInEth", () => {
      let ETH_USD, HIGH_USD, etherPrice: bigint, highPrice: bigint;
      beforeEach(async () => {
        const ethOracleAddr = await ethOracle.getAddress();
        const highOracleAddr = await highOracle.getAddress();
        ETH_USD = await ethers.getContractAt(AggregatorV3Interface, ethOracleAddr);
        HIGH_USD = await ethers.getContractAt(AggregatorV3Interface, highOracleAddr);
        etherPrice = (await ETH_USD.latestRoundData()).answer;
        highPrice = (await HIGH_USD.latestRoundData()).answer;
      })
      it("check high - eth exchangeToETH rate", async () => {
        let priceInEther = price * highPrice /  etherPrice * 11n / 10n;
        let result = await sale.getPriceInEth(user1Addr, 1);
        expect(Number(formatEther(result))).to.be.closeTo(Number(formatEther(priceInEther)), 0.000001);
      })
      it("check eth cost with discount", async () => {
        await sale.setDiscount([user1Addr], []);
        let priceInEther = (price * 10n - discount) * highPrice / etherPrice * 11n / 10n;
        let result = await sale.getPriceInEth(user1Addr, 10);
        expect(Number(formatEther(result))).to.be.closeTo(Number(formatEther(priceInEther)), 0.000001);
      })
      it("check eth cost with duck holding", async () => {
        await setupDuck(duck, user1Addr, 1);
        let priceInEther = duckHolderPrice * 10n * highPrice / etherPrice * 11n / 10n;
        let result = await sale.getPriceInEth(user1Addr, 10);
        expect(Number(formatEther(result))).to.be.closeTo(Number(formatEther(priceInEther)), 0.000001);
      })
      it("check eth cost with discount and duck holding", async () => {
        await sale.setDiscount([user1Addr], []);
        await setupDuck(duck, user1Addr, 1);
        let priceInEther = (duckHolderPrice * 10n - discount) * highPrice / etherPrice * 11n / 10n;
        let result = await sale.getPriceInEth(user1Addr, 10);
        expect(Number(formatEther(result))).to.be.closeTo(Number(formatEther(priceInEther)), 0.000001);
      })
    })
    describe("getPriceInHigh", () => {
      it("check high cost",async () =>{
        let result = await sale.getPriceInHigh(user1Addr, 1);
        expect(result).to.be.eq(price);
      })
      it("check high cost with discount", async ()=>{
        await sale.setDiscount([user1Addr], []);
        let result = await sale.getPriceInHigh(user1Addr, 10);
        expect(result).to.be.eq(price * 10n - discount);
      })
      it("check high cost with duck holding", async () => {
        await setupDuck(duck, user1Addr, 1);
        let result = await sale.getPriceInHigh(user1Addr, 10);
        expect(result).to.be.eq(duckHolderPrice * 10n);
      })
      it("check high cost with discount and duck holding", async () => {
        await setupDuck(duck, user1Addr, 1);
        await sale.setDiscount([user1Addr], []);
        let result = await sale.getPriceInHigh(user1Addr, 10);
        expect(result).to.be.eq(duckHolderPrice * 10n - discount);
      })
    })
  })

  describe("permission check", () => {
    it("setbatch3Time", async () => {
      await expect(sale.connect(user1).setBatch3Time([0, 100])).to.revertedWith("Ownable: caller is not the owner");
    })
    it("setReceiver", async () => {
      await expect(sale.connect(user1).setReceiver(user1Addr)).to.revertedWith("Ownable: caller is not the owner");
    })
    it("setDiscount", async () => {
      await expect(sale.connect(user1).setDiscount([user1Addr], [])).to.revertedWith("Ownable: caller is not the owner");
    })
    it("pause", async () => {
      await expect(sale.connect(user1).pause()).to.revertedWith("Ownable: caller is not the owner");
      await sale.connect(owner).pause();
      expect(await sale.paused()).to.eq(true);
    })
    it("unpause", async () => {
      await sale.connect(owner).pause();
      await expect(sale.connect(user1).unpause()).to.revertedWith("Ownable: caller is not the owner");
      await sale.connect(owner).unpause();
      expect(await sale.paused()).to.eq(false);
    })
  })

  describe("batch3 purchase", () => {
    it("should not be able to purchase if input length is longer than 4", async () => {
      await time.increaseTo(batch3Start);
      let packages = [0, 1, 2, 3, 4];
      let amounts = [1, 2, 3, 4, 5];
      let packInput = await buyBatch3(packages, amounts);
      await expect(sale.connect(user1).buyBatch3OpenSale(...packInput)).to.be.revertedWith("invalid input length")
    })
    it("should not be able to purchase if the index is more than 4", async () => {
      await time.increaseTo(batch3Start);
      let packInput = await buyBatch3([4], [4]);
      await expect(sale.connect(user1).buyBatch3OpenSale(...packInput)).to.be.revertedWith("package sale is over");
    })
    it("should not be able to purchase before start time", async () => {
      let packInput = await buyBatch3([0], [1]);
      await expect(sale.connect(user1).buyBatch3OpenSale(...packInput)).to.be.revertedWith("sale isn't open");
    })
    it("should not be able to purchase after end time", async () => {
      await time.increaseTo(batch3End + 1);
      let packInput = await buyBatch3([0], [1]);
      await expect(sale.connect(user1).buyBatch3OpenSale(...packInput)).to.be.revertedWith("sale isn't open");
    })
    it("should not exceed purchase limit", async () => {
      await time.increaseTo(batch3Start);
      let packInput = await buyBatch3([0, 1, 2], [10, 10, 10]);
      await expect(sale.connect(user1).buyBatch3OpenSale(...packInput)).to.be.revertedWith("exceed purchase limit");
    })
    it("should not be able to purchase if theres no token left", async () => {
      await time.increaseTo(batch3Start);
      for (let i = 0; i < 5; i++) {
        let packInput = await buyBatch3([0, 1], [10, 10]);
        await sale.connect(user1).buyBatch3OpenSale(...packInput);
      }
      let packInput = await buyBatch3([0, 1], [10, 10]);
      await expect(sale.connect(user1).buyBatch3OpenSale(...packInput)).to.be.revertedWith("package sale is over");
    })
    it("should not be able to purchase if sale is paused", async () => {
      await time.increaseTo(batch3Start);
      await sale.connect(owner).pause();
      let packInput = await buyBatch3([0, 1], [10, 10]);
      await expect(sale.connect(user1).buyBatch3OpenSale(...packInput))
        .to.be.revertedWith("Pausable: paused");
    })
    it("should correctly mint require amount to user", async () => {
      const mintIndexs = [0, 1, 2, 3];
      const mintAmounts = [3, 4, 5, 6];
      await time.increaseTo(batch3Start);
      let packInput = await buyBatch3(mintIndexs, mintAmounts);
      await sale.connect(user1).buyBatch3OpenSale(...packInput);
      expect(await home.balanceOf(user1Addr)).to.eq(18);
      for (let i = 0; i < mintIndexs.length; i++) {
        for (let j = 0; j < mintAmounts[i]; j++) {
          let tokenId = packageStartingIndex[i] + BigInt(j);
          expect(await home.ownerOf(tokenId)).to.eq(user1Addr);
        }
      }
    })
    it("should correctly receive exact high payment", async () => {
      const mintIndexs = [0, 1, 2, 3];
      const mintAmounts = [3, 4, 5, 6];
      await time.increaseTo(batch3Start);
      let packInput = await buyBatch3(mintIndexs, mintAmounts);
      await sale.connect(user1).buyBatch3OpenSale(...packInput);
      expect(await high.balanceOf(receiverAddr)).to.eq(price * 18n);
    })
    it("should revert if ether insufficient", async () => {
      const mintIndexs = [0, 1, 2, 3];
      const mintAmounts = [3, 4, 5, 6];

      await time.increaseTo(batch3Start);

      const priceInEth = await sale.getPriceInEth(user1Addr, 17);

      let packInput = await buyBatch3(mintIndexs, mintAmounts);
      await expect(sale.connect(user1).buyBatch3OpenSale(...packInput, {value: priceInEth}))
        .to.be.revertedWith("insufficient eth");
    })
    it("should correctly receive ether payment", async () => {
      const mintIndexs = [0, 1, 2, 3];
      const mintAmounts = [3, 4, 5, 6];

      await time.increaseTo(batch3Start);

      const originalBalance = await ethers.provider.getBalance(receiverAddr);
      const priceInEth = await sale.getPriceInEth(user1Addr, 18);

      let packInput = await buyBatch3(mintIndexs, mintAmounts);
      await sale.connect(user1).buyBatch3OpenSale(...packInput, {value: priceInEth});
      const currentBalance = await ethers.provider.getBalance(receiverAddr);
      expect(currentBalance).to.eq(priceInEth + originalBalance);
    })
    it("should correctly refund back for extra ether payment", async () => {
      const mintIndexs = [0, 1, 2, 3];
      const mintAmounts = [3, 4, 5, 6];
      await time.increaseTo(batch3Start);

      const originalBalance = await ethers.provider.getBalance(receiverAddr);

      const priceInEth = await sale.getPriceInEth(user1Addr, 18);
      const extraPayment = await ethers.parseEther("1");

      let packInput =await buyBatch3(mintIndexs, mintAmounts);

      await sale.connect(user1).buyBatch3OpenSale(...packInput, { value: priceInEth + extraPayment});
      const currentBalance = await ethers.provider.getBalance(receiverAddr);
      expect(currentBalance).to.eq(priceInEth + originalBalance);
    })
    it("should correctly receive exact payment if input amount is reduced", async () => {
      await time.increaseTo(batch3Start);
      for (let i = 0; i < 5; i++) {
        let packInput = await buyBatch3([0, 1], [9, 9]);
        await sale.connect(user1).buyBatch3OpenSale(...packInput);
      }
      const mintIndexs = [0, 1];
      const mintAmounts = [10, 10];
      const receiverBeforeBalance = await high.balanceOf(receiverAddr);
      const package0TokenLeft = await sale.getPackageLeft(0);
      const package1TokenLeft = await sale.getPackageLeft(1);

      let packInput = await buyBatch3(mintIndexs, mintAmounts);
      await sale.connect(user2).buyBatch3OpenSale(...packInput);
      const balanceShouldBe = receiverBeforeBalance + (price * (package0TokenLeft + package1TokenLeft));

      expect(await high.balanceOf(receiverAddr)).to.eq(balanceShouldBe);
      expect(await home.balanceOf(user2Addr)).to.eq(package0TokenLeft + package1TokenLeft);
      for (let i = 0; i < 5; i++) {
        const package0TokenId = tokenMaxAmount * 1n - packageReserveBias - BigInt(i) - 1n;
        const package1TokenId = tokenMaxAmount * 2n - packageReserveBias - BigInt(i) - 1n;
        expect(await home.ownerOf(package0TokenId)).to.eq(user2Addr);
        expect(await home.ownerOf(package1TokenId)).to.eq(user2Addr);
      }

    })
    it("should mint contiuous tokenId", async () => {
      await time.increaseTo(batch3Start);
      for (let i = 0; i < 4; i++) {
        let packInput = await buyBatch3([i], [Number(purchaseLimit)]);
        await sale.connect(user1).buyBatch3OpenSale(...packInput);
      }
      for (let i = 0; i < purchaseLimit; i++) {
        expect(await home.ownerOf(packageStartingIndex[0] + BigInt(i))).to.eq(user1Addr);
        expect(await home.ownerOf(packageStartingIndex[1] + BigInt(i))).to.eq(user1Addr);
        expect(await home.ownerOf(packageStartingIndex[2] + BigInt(i))).to.eq(user1Addr);
        expect(await home.ownerOf(packageStartingIndex[3] + BigInt(i))).to.eq(user1Addr);
      }
    })
    it("should correctly emit event corresponding to purchase input", async () => {
      const mintIndexs = [0, 1, 2];
      const mintAmounts = [3, 4, 3];
      await time.increaseTo(batch3Start);

      let packInput = await buyBatch3(mintIndexs, mintAmounts);
      const tx = await sale.connect(user1).buyBatch3OpenSale(...packInput);
      await expect(tx).to.emit(sale, "Purchase");

      const receipt = await tx.wait();
      const targetEventArguments = (receipt?.logs[receipt.logs.length -1] as EventLog).args!;

      expect(targetEventArguments.account).to.eq(user1Addr);
      for (let i = 0; i < mintIndexs.length; i++) {
        expect(targetEventArguments.packages[i].index).to.eq(mintIndexs[i]);
        expect(targetEventArguments.packages[i].startingIndex).to.eq(packageStartingIndex[i]);
        expect(targetEventArguments.packages[i].amount).to.eq(mintAmounts[i]);
      }
      expect(targetEventArguments.fee).to.eq(price * 10n);
      expect(targetEventArguments.isPaidByEth).to.eq(false);
    })
    it("should correctly emit event corresponding to purchase input with ether", async () => {
      const mintIndexs = [0, 1, 2];
      const mintAmounts = [3, 4, 3];
      await time.increaseTo(batch3Start);
      const priceInEth = await sale.getPriceInEth(user1Addr, 10);

      let packInput = await buyBatch3(mintIndexs, mintAmounts);
      const tx = await sale.connect(user1).buyBatch3OpenSale(...packInput, { value: priceInEth });
      await expect(tx).to.emit(sale, "Purchase");
      const receipt = await tx.wait();
      const targetEventArguments = (receipt?.logs[receipt.logs.length -1] as EventLog).args!;
      expect(targetEventArguments.account).to.eq(user1Addr);
      for (let i = 0; i < mintIndexs.length; i++) {
        expect(targetEventArguments.packages[i].index).to.eq(mintIndexs[i]);
        expect(targetEventArguments.packages[i].startingIndex).to.eq(packageStartingIndex[i]);
        expect(targetEventArguments.packages[i].amount).to.eq(mintAmounts[i]);
      }
      expect(targetEventArguments.fee).to.eq(priceInEth);
      expect(targetEventArguments.isPaidByEth).to.eq(true);
    })
    it("should be able to get correct token ids amount corresponding to tokens left.", async () => {
      const mintIndexs = [0, 1, 2, 3];
      const mintAmounts = [3, 4, 5, 6];
      await time.increaseTo(batch3Start);
      let packInput = await buyBatch3(mintIndexs, mintAmounts);
      await sale.connect(user1).buyBatch3OpenSale(...packInput);
      expect(await sale.getTokenLeft()).to.eq(200 - (3 + 4 + 5 + 6));
      for (let i = 0; i < mintIndexs.length; i++) {
        expect(await sale.getPackageLeft(mintIndexs[i])).to.eq(50 - mintAmounts[i]);
      }
      const mintSingle = [1, 1, 1, 1];
      packInput = await buyBatch3(mintIndexs, mintSingle);
      await sale.connect(user2).buyBatch3OpenSale(...packInput);
      for (let i = 0; i < mintIndexs.length; i++) {
        expect(await home.ownerOf(packageStartingIndex[i] + BigInt(mintAmounts[i]))).to.eq(user2Addr);
      }
    })
    it("should discount if user is in discount list", async () => {
      const mintIndexs = [0, 1];
      const mintAmounts = [3, 4];
      await time.increaseTo(batch3Start);

      let packInput = await buyBatch3(mintIndexs, mintAmounts);
      await sale.connect(owner).setDiscount([user2Addr], []);
      await sale.connect(user1).buyBatch3OpenSale(...packInput);
      expect(await high.balanceOf(receiverAddr)).to.eq(price * 7n);

      packInput = await buyBatch3(mintIndexs, mintAmounts);
      await sale.connect(user2).buyBatch3OpenSale(...packInput);
      expect(await high.balanceOf(receiverAddr)).to.eq(price * (7n * 2n) - discount);
    })
    it("should discount just once for buying token", async () => {
      const mintIndexs = [0, 1];
      const mintAmounts = [3, 4];
      await time.increaseTo(batch3Start);

      let packInput = await buyBatch3(mintIndexs, mintAmounts);
      await sale.connect(owner).setDiscount([user1Addr], []);
      await sale.connect(user1).buyBatch3OpenSale(...packInput);
      expect(await high.balanceOf(receiverAddr)).to.eq(price * 7n - discount);

      packInput = await buyBatch3(mintIndexs, mintAmounts);
      await sale.connect(user1).buyBatch3OpenSale(...packInput);
      expect(await high.balanceOf(receiverAddr)).to.eq(price * (7n * 2n) - discount);
    })
    it("should discount just once for buying token with ether", async () => {
      const mintIndexs = [0, 1];
      const mintAmounts = [3, 4];
      await time.increaseTo(batch3Start);
      await sale.connect(owner).setDiscount([user1Addr], []);
      let priceInEth = await sale.getPriceInEth(user1Addr, 7);
      let receiverBalance = await ethers.provider.getBalance(receiverAddr);

      let packInput = await buyBatch3(mintIndexs, mintAmounts);
      await sale.connect(user1).buyBatch3OpenSale(...packInput, {value: priceInEth});
      let currentBalance = await ethers.provider.getBalance(receiverAddr);
      expect(currentBalance).to.eq(receiverBalance + priceInEth);

      receiverBalance = await ethers.provider.getBalance(receiverAddr);
      priceInEth = await sale.getPriceInEth(user1Addr, 7);
      packInput = await buyBatch3(mintIndexs, mintAmounts);
      await sale.connect(user1).buyBatch3OpenSale(...packInput, {value: priceInEth});
      currentBalance = await ethers.provider.getBalance(receiverAddr);
      expect(currentBalance).to.eq(receiverBalance + priceInEth);
    })
    it("should discount if buyer is duck owner", async () => {
      const mintIndexs = [0, 1];
      const mintAmounts = [3, 4];
      await time.increaseTo(batch3Start);
      await setupDuck(duck, user1Addr, 1);

      let packInput = await buyBatch3(mintIndexs, mintAmounts);
      let currentBalance = await ethers.provider.getBalance(receiverAddr);
      await sale.connect(user1).buyBatch3OpenSale(...packInput);
      expect(await high.balanceOf(receiver)).to.eq(duckHolderPrice * 7n);

      await sale.connect(user2).buyBatch3OpenSale(...packInput);
      expect(await high.balanceOf(receiverAddr)).to.eq(duckHolderPrice * 7n + price * 7n);
    })
  })

  describe("Owner operation", () => {
    describe("setReceiver", async () => {
      it("should correctly update Receiver address", async () => {
        expect(await sale.receiver()).to.eq(receiverAddr);
        await sale.connect(owner).setReceiver(user1Addr);
        expect(await sale.receiver()).to.eq(user1Addr);
      })
      it("should correctly emit UpdateReceiver event", async () => {
        const tx = sale.connect(owner).setReceiver(user1Addr);
        await expect(tx).to.emit(sale, "UpdateReceiver").withArgs(receiverAddr, user1Addr);
      })
    })
    describe("setBatch3Time", () => {
      it("should correctly update starting time and ending time", async () => {
        const newt = await time.latest();
        const newTime = [newt + 100, newt + 100000];
        await sale.connect(owner).setBatch3Time([newTime[0], newTime[1]]);
        expect(await sale.batch3Time(0)).to.eq(newt + 100);
        expect(await sale.batch3Time(1)).to.eq(newt + 100000);
      })
      it("should correctly emit UpdateBatch3Time event", async () => {
        const newt = await time.latest();
        const newTime = [newt + 100, newt + 100000];
        const tx = sale.connect(owner).setBatch3Time([newTime[0], newTime[1]]);
        await expect(tx).to.emit(sale, "UpdateBatch3Time").withArgs(ownerAddr, newt + 100, newt + 100000);
      })
    })
    describe("setDiscount", () => {
      it("should correctly add account", async () => {
        await sale.setDiscount([user1Addr, user2Addr], []);
        expect(await sale.hasDiscount(user1Addr)).to.eq(true);
        expect(await sale.hasDiscount(user2Addr)).to.eq(true);
      })
      it("should correctly remove account", async () => {
        await sale.setDiscount([user1Addr, user2Addr], []);
        await sale.setDiscount([], [user2Addr]);
        expect(await sale.hasDiscount(user1Addr)).to.eq(true);
        expect(await sale.hasDiscount(user2Addr)).to.eq(false);

      })
    })
  })
})
