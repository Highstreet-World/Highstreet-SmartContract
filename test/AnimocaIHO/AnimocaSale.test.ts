import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { AnimocaHome, AnimocaSale } from "../../typechain-types";
import { MockERC721, MockERC20 } from "../../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Animoca Home sale", () => {

  let owner: Signer, user1: Signer, user2: Signer, user3: Signer, user4: Signer, user5: Signer;
  let ownerAddr: string, user1Addr: string, user2Addr: string, user3Addr: string, user4Addr: string, user5Addr: string;
  let home: AnimocaHome, high: MockERC20, duck: MockERC721, sale: AnimocaSale;
  let homeAddr: string, highAddr: string, duckAddr: string, saleAddr: string;
  let batch1Start: number, batch1End: number;
  let batch2Start: number, batch2End: number;
  let purchaseLimit = 20n;
  let batch1Sale = 300n;
  let batch2Sale = 888n;
  const batch1Price = 150000000000000000000n;
  const batch2Price = 222000000000000000000n;
  const zeroAddress = ethers.ZeroAddress;

  enum stages {
    notStart = 0,
    batch1Whitelist = 1,
    batch1OpenSale  = 2,
    batch2Whitelist = 3,
    batch2OpenSale  = 4,
    close = 5
  }

  enum stageBase {
    none,
    batch1,
    batch2
  }

  /* NFT PARAMETERS */
  const config = {
    name: "NFT TBD",
    symbol: "TBD",
    uri: "https://highstreet.market/TBD",
    max: 4800,
  };

  const contractDeploy = async () => {
    const Animoca = await ethers.getContractFactory("AnimocaHome");
    const homeSale = await ethers.getContractFactory("AnimocaSale");
    const erc20 = await ethers.getContractFactory("MockERC20");
    const erc721 = await ethers.getContractFactory("MockERC721");

    const home = await Animoca.deploy(
      config.name,
      config.symbol,
      config.uri,
      config.max
    );
    const currentTime = await time.latest();
    batch1Start = currentTime + 100000;
    batch1End = batch1Start + 200000;
    batch2Start = batch1End + 200000;
    batch2End = batch2Start + 100000;

    const high = await erc20.deploy("HIGH", "HIGH");
    const duck = await erc721.deploy();
  
    await home.waitForDeployment();
    await high.waitForDeployment();
    await duck.waitForDeployment();

    homeAddr = await home.getAddress();
    highAddr = await high.getAddress();
    duckAddr = await duck.getAddress();

    const sale = await homeSale.deploy(
      highAddr,
      homeAddr,
      duckAddr,
      [batch1Start, batch1End],
      [batch2Start, batch2End]
    )
  
    await sale.waitForDeployment();
    saleAddr = await sale.getAddress();
    await home.grantMinterRole(saleAddr);
  
    return {
      home: home,
      high: high,
      duck: duck,
      sale: sale
    }
  }

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
    owner: Signer,
    to: Array<string>
  ) => {
    for (let i = 0; i < to.length; i++) {
      await instance.connect(owner).mintToken(to[i], i);
    }
  }

  const setupWhitelist = async (
    instance: AnimocaSale,
    owner: Signer,
    to: Array<string>
  ) => {
    await instance.connect(owner).setBatch1Whitelist(to, []);
    await instance.connect(owner).setBatch2Whitelist(to, []);
  }

  beforeEach(async () => {
    [owner, user1, user2, user3, user4, user5] = await ethers.getSigners();
    ownerAddr = await owner.getAddress();
    user1Addr = await user1.getAddress();
    user2Addr = await user2.getAddress();
    user3Addr = await user3.getAddress();
    user4Addr = await user4.getAddress();
    user5Addr = await user5.getAddress();

    const whitelist = [user1Addr, user2Addr, user3Addr, user4Addr];

    const result = await contractDeploy();
    home = result.home as AnimocaHome;
    high = result.high as MockERC20;
    sale = result.sale as AnimocaSale;
    duck = result.duck as MockERC721;

    await setupWhitelist(sale, owner, whitelist);
    await setupHigh(high, saleAddr, [user1, user2, user3, user4]);
    await setupDuck(duck, owner, [user1Addr, user2Addr]);
  })

  describe("get function check", () => {
    it("isInBatch1Whitelist", async () => {
      expect(await sale.isInBatch1Whitelist(user1Addr)).to.eq(true);
    })
    it("isInBatch2Whitelist", async () => {
      expect(await sale.isInBatch2Whitelist(user1Addr)).to.eq(true);
    })
    it("isQualifiedAssetsOwner", async () => {
      expect(await sale.isDuckOwner(user1Addr)).to.eq(true);
      expect(await sale.isDuckOwner(user3Addr)).to.eq(false);
    })
    it("getStage", async () => {
      expect(await sale.getStage()).to.eq(stages.notStart);
      await time.increaseTo(batch1Start);
      expect(await sale.getStage()).to.eq(stages.batch1Whitelist);
      await time.increaseTo(batch1Start + 86400 * 1);
      expect(await sale.getStage()).to.eq(stages.batch1OpenSale);
      await time.increaseTo(batch1End + 1);
      expect(await sale.getStage()).to.eq(stages.notStart);
      await time.increaseTo(batch2Start);
      expect(await sale.getStage()).to.eq(stages.batch2Whitelist);
      await time.increaseTo(batch2Start + 3600 * 2);
      expect(await sale.getStage()).to.eq(stages.batch2OpenSale);
      await time.increaseTo(batch2End + 1);
      expect(await sale.getStage()).to.eq(stages.close);
    })
    it("getTokenLeft()", async () => {
      await time.increaseTo(batch1Start);
      expect(await sale.getTokenLeft()).to.eq(300n);
      await time.increaseTo(batch2Start);
      expect(await sale.getTokenLeft()).to.eq(888n);
    })
    it("getPackageLeft()", async () => {
      expect(await sale.getPackageLeft(0)).to.eq(0);
      await time.increaseTo(batch1Start);
      for(let i = 0; i < 4; i++) {
        expect(await sale.getPackageLeft(i)).to.eq(75);
      }
      await time.increaseTo(batch2Start);
      for(let i = 0; i < 4; i++) {
        expect(await sale.getPackageLeft(i)).to.eq(222);
      }
    })
  })

  describe("permission check", () => {
    it("setWhitelist", async () => {
      await expect(sale.connect(user1).setBatch1Whitelist([user3Addr], [])).to.revertedWith("Ownable: caller is not the owner");
    })
    it("setAnimocaWhitelist", async () => {
      await expect(sale.connect(user1).setBatch2Whitelist([user3Addr], [])).to.revertedWith("Ownable: caller is not the owner");
    })
    it("setbatch1Time", async () => {
      await expect(sale.connect(user1).setBatch1Time([0, 100])).to.revertedWith("Ownable: caller is not the owner");
    })
    it("setbatch2Time", async () => {
      await expect(sale.connect(user1).setBatch2Time([100, 200])).to.revertedWith("Ownable: caller is not the owner");
    })
    it("withdrawHigh",async () => {
      await expect(sale.connect(user1).withdrawHigh()).to.revertedWith("Ownable: caller is not the owner");
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

  describe("stage time check", () => {
    it("should return notStart if sale hasn't start", async () => {
      expect(await sale.getStage()).to.eq(stages.notStart);
    })
    it("should return whitelist if Batch1 just start", async () => {
      await time.increaseTo(batch1Start);
      expect(await sale.getStage()).to.eq(stages.batch1Whitelist);
    })
    it("should return batch1 if time pass 2 days after batch1", async () => {
      await time.increaseTo(batch1Start + 86400);
      expect(await sale.getStage()).to.eq(stages.batch1OpenSale);
    })
    it("should return animocaWhitelist if batch2 just start", async () => {
      await time.increaseTo(batch2Start);
      expect(await sale.getStage()).to.eq(stages.batch2Whitelist);
    })
    it("should return batch2 if time pass 2 hour after batch2", async () => {
      await time.increaseTo(batch2Start + 3600 * 2);
      expect(await sale.getStage()).to.eq(stages.batch2OpenSale);
    })
    it("should return batch2 if sales time over", async () => {
      await time.increaseTo(batch2End + 1);
      expect(await sale.getStage()).to.eq(stages.close);
    })
  })

  describe("nft id check", ()=> {
    class helper {

      packageLimit: number;
      maxPackage: number;
      packageIndex: number;
      nextIndexedId: Array<number>;
      packageNumOfStage: Array<number>;

      constructor() {
        this.packageLimit = 1250;
        this.maxPackage = 4;
        this.packageIndex = 0;
        this.nextIndexedId = new Array(this.maxPackage).fill(0);
        this.packageNumOfStage= new Array(this.maxPackage).fill(0);
      }

      genNextPackageIndex () {
        this.packageIndex ++;
        if(this.packageIndex >= this.maxPackage) {
          this.packageIndex = 0;
        }
        return this.packageIndex ;
      }

      genId = () => {
        const base = this.packageIndex * this.packageLimit;
        const id = this.nextIndexedId[this.packageIndex] ++;
        this.genNextPackageIndex();
        return base + id;
      }
    }

    it("check when in whitelist stage", async() => {
      const helperImpl = new helper();

      await time.increaseTo(batch1Start);
      let nftIndex = 0
      //tokenId = 0
      {
        const tx = await sale.connect(user1).buyBatch1Whitelist();
        await tx.wait();
        const expecId = helperImpl.genId();
        expect(expecId).to.eq(0);
        expect(await home.tokenOfOwnerByIndex(user1Addr, nftIndex++)).to.eq(expecId);
      }

      //tokenId = 1250
      {
        await sale.connect(owner).setBatch1Whitelist([user1Addr], []);
        const tx = await sale.connect(user1).buyBatch1Whitelist();
        await tx.wait();
        const expecId = helperImpl.genId();
        expect(expecId).to.eq(1250);
        expect(await home.tokenOfOwnerByIndex(user1Addr, nftIndex++)).to.eq(expecId);
      }

      //tokenId = 1250
      {
        await sale.connect(owner).setBatch1Whitelist([user1Addr], []);
        const tx = await sale.connect(user1).buyBatch1Whitelist();
        await tx.wait();
        const expecId = helperImpl.genId();
        expect(expecId).to.eq(2500);
        expect(await home.tokenOfOwnerByIndex(user1Addr, nftIndex++)).to.eq(expecId);
      }

      //tokenId = 3750
      {
        await sale.connect(owner).setBatch1Whitelist([user1Addr], []);
        const tx = await sale.connect(user1).buyBatch1Whitelist();
        await tx.wait();
        const expecId = helperImpl.genId();
        expect(expecId).to.eq(3750);
        expect(await home.tokenOfOwnerByIndex(user1Addr, nftIndex++)).to.eq(expecId);
      }

      //tokenId = 1
      {
        await sale.connect(owner).setBatch1Whitelist([user1Addr], []);
        const tx = await sale.connect(user1).buyBatch1Whitelist();
        await tx.wait();
        const expecId = helperImpl.genId();
        expect(expecId).to.eq(1);
        expect(await home.tokenOfOwnerByIndex(user1Addr, nftIndex++)).to.eq(expecId);
      }
    })
    it("check when in open sale stage",async () => {
      await time.increaseTo(batch1Start + 86400);
      const helperImpl = new helper();
      const amount = 10;
      const tx = await sale.connect(user1).buyBatch1OpenSale(amount);
      await tx.wait();
      const expectIds = [0, 1250, 2500, 3750, 1, 1251, 2501, 3751, 2, 1252]
      for (let idx = 0; idx < amount; idx++) {
        const expecId = helperImpl.genId();
        expect(expecId).to.eq(expectIds[idx]);
        expect(await home.tokenOfOwnerByIndex(user1Addr, idx)).to.eq(expecId);
      }

    })
  })

  describe("batch1 purchase", () => {
    describe("highstreet whitelist", () => {
      it("should revert if stage is not whitelist", async () => {
        await expect(sale.connect(user1).buyBatch1Whitelist())
          .to.be.revertedWithCustomError(sale, "StageError");
      })
      it("should revert if user is not whitelist", async () => {
        await time.increaseTo(batch1Start);
        await expect(sale.connect(user5).buyBatch1Whitelist())
          .to.be.revertedWithCustomError(sale, "NotInWhitelist");
      })
      it("should revert if is paused", async () => {
        await time.increaseTo(batch1Start);
        await sale.connect(owner).pause();
        await expect(sale.connect(user1).buyBatch1Whitelist()).to.revertedWith("Pausable: paused");
      })
      it("should correctly mint for user", async () => {
        await time.increaseTo(batch1Start);
        await sale.connect(user1).buyBatch1Whitelist();
        expect(await home.balanceOf(user1Addr)).to.eq(1);
        expect(await sale.getTokenLeft()).to.eq(batch1Sale - 1n);
        expect(await sale.isInBatch1Whitelist(user1Addr)).to.eq(false);
      })
      it("should correctly transfer high to sale contract", async () => {
        await time.increaseTo(batch1Start);
        let tx = await sale.connect(user1).buyBatch1Whitelist();
        expect(await high.balanceOf(saleAddr)).to.eq(batch1Price);
        expect(await sale.getTokenLeft()).to.eq(batch1Sale - 1n);
        await expect(tx).to.emit(high, "Transfer").withArgs(user1Addr, saleAddr, batch1Price);
      })
    })

    describe("batch1 opensale", () => {
      it("should revert if purchase more than 20 tokens", async () => {
        await time.increaseTo(batch1Start + 86400);
        await expect(sale.connect(user1).buyBatch1OpenSale(purchaseLimit + 1n))
          .to.be.revertedWithCustomError(sale, "ExceedPurchaseLimit");
      })
      it("should revert if stage is not batch1", async () => {
        await expect(sale.connect(user1).buyBatch1OpenSale(purchaseLimit))
          .to.be.revertedWithCustomError(sale, "StageError");
      })
      it("should revert if is paused", async () => {
        await time.increaseTo(batch1Start + 86400);
        await sale.connect(owner).pause();
        await expect(sale.connect(user1).buyBatch1OpenSale(purchaseLimit)).to.revertedWith("Pausable: paused");
      })
      it("should revert if user isn't qualified owner", async () => {
        await time.increaseTo(batch1Start + 86400);
        await expect(sale.connect(user5).buyBatch1OpenSale(purchaseLimit))
          .to.revertedWithCustomError(sale, "NotQualifiedHolder");
      })
      it("should correctly mint for user", async () => {
        await time.increaseTo(batch1Start + 86400);
        await sale.connect(user1).buyBatch1OpenSale(purchaseLimit);
        expect(await home.balanceOf(user1Addr)).to.eq(purchaseLimit);
        expect(await sale.getTokenLeft()).to.eq(batch1Sale - purchaseLimit);
      })
      it("should correctly transfer high to sale contract", async () => {
        await time.increaseTo(batch1Start + 86400);
        await sale.connect(user1).buyBatch1OpenSale(purchaseLimit);
        expect(await high.balanceOf(saleAddr)).to.eq(batch1Price * purchaseLimit);
      })
      it("should revert if sale is over", async () => {
        await time.increaseTo(batch1Start + 86400);
        // 300
        for (let i = 0; i < 15; i++) {
          await sale.connect(user1).buyBatch1OpenSale(purchaseLimit);
        }
        await expect(sale.connect(user1).buyBatch1OpenSale(purchaseLimit))
          .to.revertedWithCustomError(sale, "SaleIsOver");
      })
      it("should mint the rest for user",async () => {
        const lastToken = 1n;
        await time.increaseTo(batch1Start + 86400);
        for (let i = 0; i < 14; i++) {
          await sale.connect(user1).buyBatch1OpenSale(purchaseLimit);
        }
        await sale.connect(user1).buyBatch1OpenSale(purchaseLimit - lastToken);
        expect(await sale.getTokenLeft()).to.eq(lastToken);
        const beforeBalance = await home.balanceOf(user1Addr);
        await sale.connect(user1).buyBatch1OpenSale(purchaseLimit);
        expect(await home.balanceOf(user1Addr)).to.eq(beforeBalance + lastToken);
      })
    })
  })

  describe("batch2 purchase", () => {
    describe("animoca whitelist", () => {
      it("should revert if stage is not animoca whitelist", async () => {
        await expect(sale.connect(user1).buyBatch2Whitelist())
          .to.be.revertedWithCustomError(sale, "StageError");
      })
      it("should revert if user is not whitelist", async () => {
        await time.increaseTo(batch2Start);
        await expect(sale.connect(user5).buyBatch2Whitelist())
          .to.be.revertedWithCustomError(sale, "NotInWhitelist");
      })
      it("should revert if is paused", async () => {
        await time.increaseTo(batch2Start);
        await sale.connect(owner).pause();
        await expect(sale.connect(user1).buyBatch2Whitelist()).to.revertedWith("Pausable: paused");
      })
      it("should correctly mint for user", async () => {
        await time.increaseTo(batch2Start);
        await sale.connect(user1).buyBatch2Whitelist();
        expect(await home.balanceOf(user1Addr)).to.eq(1);
        expect(await sale.isInBatch2Whitelist(user1Addr)).to.eq(false);
        expect(await sale.getTokenLeft()).to.eq(batch2Sale - 1n);
      })
      it("should correctly transfer high to sale contract", async () => {
        await time.increaseTo(batch2Start);
        let tx = await sale.connect(user1).buyBatch2Whitelist();
        expect(await high.balanceOf(saleAddr)).to.eq(batch2Price);
        expect(await sale.getTokenLeft()).to.eq(batch2Sale - 1n);
        await expect(tx).to.emit(high, "Transfer").withArgs(user1Addr, saleAddr, batch2Price);
      })
    })

    describe("batch2 purchase", () => {
      it("should revert if purchase more than 20 tokens", async () => {
        await time.increaseTo(batch2Start + 3600 * 2);
        await expect(sale.connect(user1).buyBatch2OpenSale(purchaseLimit + 1n))
          .to.be.revertedWithCustomError(sale, "ExceedPurchaseLimit");
      })
      it("should revert if stage is not batch1", async () => {
        await expect(sale.connect(user1).buyBatch2OpenSale(purchaseLimit))
          .to.be.revertedWithCustomError(sale, "StageError");
      })
      it("should revert if is paused", async () => {
        await time.increaseTo(batch2Start + 3600 * 2);
        await sale.connect(owner).pause();
        await expect(sale.connect(user1).buyBatch2OpenSale(purchaseLimit)).to.revertedWith("Pausable: paused");
      })
      it("should correctly mint for user", async () => {
        await time.increaseTo(batch2Start + 3600 * 2);
        await sale.connect(user1).buyBatch2OpenSale(purchaseLimit);
        expect(await home.balanceOf(user1Addr)).to.eq(purchaseLimit);
        expect(await sale.getTokenLeft()).to.eq(batch2Sale - purchaseLimit);
      })
      it("should correctly transfer high to sale contract", async () => {
        await time.increaseTo(batch2Start + 3600 * 2);
        await sale.connect(user1).buyBatch2OpenSale(purchaseLimit);
        expect(await high.balanceOf(saleAddr)).to.eq(batch2Price * purchaseLimit);
      })
      it("should revert if sale is over", async () => {
        await time.increaseTo(batch2Start + 3600 * 2);
        // 888 = 12 * 74
        for (let i = 0; i < 74; i++) {
          await sale.connect(user1).buyBatch2OpenSale(12);
        }
        await expect(sale.connect(user1).buyBatch2OpenSale(purchaseLimit))
          .to.revertedWithCustomError(sale, "SaleIsOver");
      })
      it("should mint the rest for user",async () => {
        const lastToken = 1;
        await time.increaseTo(batch2Start + 3600 * 2);
        for (let i = 0; i < 73; i++) {
          await sale.connect(user1).buyBatch2OpenSale(12);
        }
        await sale.connect(user1).buyBatch2OpenSale(12 - lastToken);
        expect(await sale.getTokenLeft()).to.eq(lastToken);
        const beforeBalance = await home.balanceOf(user2Addr);
        await sale.connect(user2).buyBatch2OpenSale(purchaseLimit);
        expect(await home.balanceOf(user2Addr)).to.eq(beforeBalance + BigInt(lastToken));
      })
    })
  })

  describe("Owner operation", () => {
    it("withdrawHigh", async () => {
      await time.increaseTo(batch2Start + 3600 * 2);
      await sale.connect(user1).buyBatch2OpenSale(purchaseLimit);
      let tx = sale.connect(owner).withdrawHigh();
      await expect(tx).to.emit(sale, "WithdrawHigh").withArgs(ownerAddr, batch2Price * purchaseLimit);
      expect(await high.balanceOf(ownerAddr)).to.eq(batch2Price * purchaseLimit);
    })
    it("setWhitelist", async () => {
      await sale.setBatch1Whitelist([user5Addr], [user1Addr]);
      expect(await sale.isInBatch1Whitelist(user1Addr)).to.eq(false);
      expect(await sale.isInBatch1Whitelist(user5Addr)).to.eq(true);
    })
    it("setAnimocaWhitelist", async () => {
      await sale.setBatch2Whitelist([user5Addr], [user1Addr]);
      expect(await sale.isInBatch2Whitelist(user1Addr)).to.eq(false);
      expect(await sale.isInBatch2Whitelist(user5Addr)).to.eq(true);
    })
    it("setBatch1Time", async () => {
      const newt = await time.latest();
      const newTime = [newt + 100, newt + 100000];
      const tx = sale.connect(owner).setBatch1Time([newTime[0], newTime[1]]);
      await expect(tx).to.emit(sale, "UpdateBatch1Time").withArgs(ownerAddr, newt + 100, newt + 100000);
      expect(await sale.batch1Time(0)).to.eq(newt + 100);
      expect(await sale.batch1Time(1)).to.eq(newt + 100000);
    })
    it("setbatch2Time", async () => {
      const newt = await time.latest();
      const newTime = [newt + 100, newt + 100000];
      const tx = sale.connect(owner).setBatch2Time([newTime[0], newTime[1]]);
      await expect(tx).to.emit(sale, "UpdateBatch2Time").withArgs(ownerAddr, newt + 100, newt + 100000);
      expect(await sale.batch2Time(0)).to.eq(newt + 100);
      expect(await sale.batch2Time(1)).to.eq(newt + 100000);
    })
  })
})
