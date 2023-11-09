import { ethers } from "hardhat";
import { expect } from "chai";
import {
  Signer,
  ContractTransaction,
  ContractFactory,
  ContractTransactionReceipt
} from "ethers";
import { AnimocaHome, AnimocaRacingVault, IAnimocaRacingVault } from "../../typechain-types"
import { MockERC20, MockERC721 } from "../../typechain-types";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("Animoca racing vault contract", () => {

  let owner: Signer, user1: Signer, user2: Signer, user3: Signer, user4: Signer, user5: Signer, receiver: Signer;
  let ownerAddr: string, user1Addr: string, user2Addr: string, user3Addr: string, user4Addr: string, user5Addr: string, receiverAddr: string;
  let home: AnimocaHome, high: MockERC20, vault: AnimocaRacingVault;
  let homeAddress: string, highAddress: string, vaultAddress: string;
  let start: number, PQ1: number, PQ2: number, PQ3: number;
  let startClaim: number, endClaim: number;
  let RacingVault: ContractFactory;
  enum Stage { paused, stageOne, stageTwo, stageThree, end };

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

  const setupHome = async (
    minter: Signer,
    instance: AnimocaHome,
    vault: AnimocaRacingVault,
    to: Signer,
    ids: number[]
  ) => {
    const minterAddr = await minter.getAddress();
    const toAddr = await to.getAddress();
    await instance.grantMinterRole(minterAddr);
    for (const id of ids) {
      await instance.safeMint(toAddr, id);
    }
    const vaultAddr = await vault.getAddress();
    await instance.connect(to).setApprovalForAll(vaultAddr, true);
  }

  const arrayComparison = (arr1: Array<any>, arr2: Array<any>): boolean => {
    if (arr1.length !== arr2.length) return false;
    arr1.sort((a, b) => a - b);
    arr2.sort((a, b) => a - b);
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return false;
    }
    return true;
  }

  const encodeInput = (input: any, vault: string) => {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "address",
        "address",
        "uint256",
        "uint256",
      ],
      [
        vault,
        input.user,
        input.amount,
        input.chainId
      ]);
  };

  const getSignature = async (signer: Signer, encodeHash: any) => {
    const hash = ethers.keccak256(encodeHash);
    const hashBytes = ethers.getBytes(hash);
    const hashFlatSig = await signer.signMessage(hashBytes);
    const hashSig = ethers.Signature.from(hashFlatSig);
    return hashSig;
  };

  const spawnArgs = (user: string, amount: number) => {
    return {
      user: user,
      amount: ethers.parseEther(amount.toString()),
      chainId: 31337
    }
  }

  const deployContractFixture = async () => {
    const Animoca = await ethers.getContractFactory("AnimocaHome");
    RacingVault = await ethers.getContractFactory("AnimocaRacingVault");
    const erc20 = await ethers.getContractFactory("MockERC20");

    const currentTime = await time.latest();
    start = currentTime + 500;
    PQ1 = currentTime * 10;
    PQ2 = currentTime * 20;
    PQ3 = currentTime * 30;
    startClaim = currentTime * 40;
    endClaim = currentTime * 50;

    [owner,,,,, receiver] = await ethers.getSigners();
    ownerAddr = await owner.getAddress();
    receiverAddr = await receiver.getAddress();

    const config = {
      name: "NFT TBD",
      symbol: "TBD",
      uri: "https://highstreet.market/TBD",
      max: 5000,
    };
  
    const high = await erc20.deploy("HIGH", "HIGH");
    const home = await Animoca.deploy(config.name, config.symbol, config.uri, config.max);

    highAddress = await high.getAddress();
    homeAddress = await home.getAddress();

    const vault = await RacingVault.deploy(
      start, [startClaim, endClaim], [PQ1, PQ2, PQ3], homeAddress, ownerAddr, highAddress
    );
    vaultAddress = await vault.getAddress();

    await home.waitForDeployment();
    await high.waitForDeployment();
    await vault.waitForDeployment();
  
    return {home, vault, high};
  }

  beforeEach(async () => {
    [owner, user1, user2, user3, user4, user5, receiver] = await ethers.getSigners();
    ownerAddr = await owner.getAddress();
    user1Addr = await user1.getAddress();
    user2Addr = await user2.getAddress();
    user3Addr = await user3.getAddress();
    user4Addr = await user4.getAddress();
    user5Addr = await user5.getAddress();

    receiverAddr = await receiver.getAddress();

    const instance = await loadFixture(deployContractFixture);
    home = instance.home as AnimocaHome;
    high = instance.high as MockERC20;
    vault = instance.vault as AnimocaRacingVault;
  })

  describe("constructor check", () => {
    const zeroAddress = ethers.ZeroAddress;
    it("should revert if AnimocaRV address is zero", async () => {
      await expect(
        RacingVault.deploy(start, [startClaim, endClaim], [PQ1, PQ2, PQ3], zeroAddress, ownerAddr, highAddress)
      ).to.be.revertedWith("AnimocaRV cant be zero address");
    })
    it("should revert if adminSigner address is zero", async () => {
      await expect(
        RacingVault.deploy(start, [startClaim, endClaim], [PQ1, PQ2, PQ3], homeAddress, zeroAddress, highAddress)
      ).to.be.revertedWith("adminSigner cant be zero address");
    })
    it("should revert if High address is zero", async () => {
      await expect(
        RacingVault.deploy(start, [startClaim, endClaim], [PQ1, PQ2, PQ3], homeAddress, ownerAddr, zeroAddress)
      ).to.be.revertedWith("High cant be zero address");
    })
  })

  describe("permission check", () => {
    it("setAdminSigner", async () => {
      await expect(vault.connect(user1).setAdminSigner(user1Addr)).to.revertedWith("Ownable: caller is not the owner");
    })
    it("pause", async () => {
      await expect(vault.connect(user1).pause()).to.revertedWith("Ownable: caller is not the owner");
    })
    it("unpause", async () => {
      await expect(vault.connect(user1).unpause()).to.revertedWith("Ownable: caller is not the owner");
    })
    it("emergencyWithdrawHigh", async () => {
      await expect(vault.connect(user1).emergencyWithdrawHigh(receiverAddr)).to.revertedWith("Ownable: caller is not the owner");
    })
  })

  describe("getter function check", () => {
    it("getStage", async () => {
      expect(await vault.getStage()).to.eq(Stage.paused);
      await time.increaseTo(start);
      expect(await vault.getStage()).to.eq(Stage.stageOne);
      await time.increaseTo(PQ1);
      expect(await vault.getStage()).to.eq(Stage.stageTwo);
      await time.increaseTo(PQ2);
      expect(await vault.getStage()).to.eq(Stage.stageThree);
      await time.increaseTo(PQ3);
      expect(await vault.getStage()).to.eq(Stage.end);
    })

    it("getUserStakedAt", async () => {
      await setupHome(owner, home, vault, user1, [1, 2, 3]);
      await time.increaseTo(start);
      await vault.connect(user1).stake([1]);
      await time.increaseTo(PQ1);
      await vault.connect(user1).stake([2]);
      await time.increaseTo(PQ2);
      await vault.connect(user1).stake([3]);

      expect(await (await vault.getUserStakedAt(user1Addr, Stage.stageOne)).length).to.eq(1);
      expect(await (await vault.getUserStakedAt(user1Addr, Stage.stageTwo)).length).to.eq(1);
      expect(await (await vault.getUserStakedAt(user1Addr, Stage.stageThree)).length).to.eq(1);
    })

    it("getTotalStaked", async () => {
      await setupHome(owner, home, vault, user1, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
      await time.increaseTo(start);
      await vault.connect(user1).stake([1, 2, 3, 4]);
      await time.increaseTo(PQ1);
      await vault.connect(user1).stake([5, 6, 7]);
      await time.increaseTo(PQ2);
      await vault.connect(user1).stake([8, 9]);

      expect(await vault.getTotalStakedAt(Stage.stageOne)).to.eq(4);
      expect(await vault.getTotalStakedAt(Stage.stageTwo)).to.eq(3);
      expect(await vault.getTotalStakedAt(Stage.stageThree)).to.eq(2);
    })
  })

  describe("stake", () => {

    let user1Nft = Array.from({length: 10}, (_, i) => i);
    let user2Nft = Array.from({length: 10}, (_, i) => i + 10);
    let user3Nft = Array.from({length: 10}, (_, i) => i + 20);

    beforeEach(async () => {
      await setupHome(owner, home, vault, user1, user1Nft);
      await setupHome(owner, home, vault, user2, user2Nft);
      await setupHome(owner, home, vault, user3, user3Nft);
    })

    it("should revert if isn't in staking period", async () => {
      await expect(vault.connect(user1).stake(user1Nft)).to.be.revertedWith("Staking is closed");
    })

    it("should revert if contract is paused", async () => {
      await vault.connect(owner).pause();
      await expect(vault.connect(user1).stake(user1Nft)).to.be.revertedWith("Pausable: paused");
    })

    it("should revert if input is a empty array", async () => {
      await time.increaseTo(start);
      await expect(vault.connect(user1).stake([])).to.be.revertedWith("Cannot stake nothing");
    })
    
    it("should revert if exceed maximum purchase", async () => {
      let nfts = Array.from({length: 101}, (_, i) => i + 1000);
      await setupHome(owner, home, vault, user1, nfts);
      await time.increaseTo(start);
      await vault.connect(user1).stake(nfts.slice(0, 33));
      await time.increaseTo(PQ1);
      await vault.connect(user1).stake(nfts.slice(33, 66));
      await time.increaseTo(PQ2);
      await vault.connect(user1).stake(nfts.slice(66, 99));
      await expect(vault.connect(user1).stake([1099, 1100])).to.be.revertedWith("exceed maximum stake amount");
    })

    it("should only staked selected token", async () => {
      await time.increaseTo(start);
      await vault.connect(user1).stake(user1Nft.slice(0, 3));
      expect(await home.balanceOf(vaultAddress)).to.eq(3);
      for (let i = 0; i < 7; i++) {
        expect(await home.ownerOf(i + 3)).to.eq(user1Addr);
      }

      await time.increaseTo(PQ1);
      await vault.connect(user2).stake(user2Nft.slice(0, 3));
      for (let i = 0; i < 7; i++) {
        expect(await home.ownerOf(i + 13)).to.eq(user2Addr);
      }

      await time.increaseTo(PQ2);
      await vault.connect(user3).stake(user3Nft.slice(0, 3));
      for (let i = 0; i < 7; i++) {
        expect(await home.ownerOf(i + 23)).to.eq(user3Addr);
      }
    })

    it("should successfully transfer tokens to staking contract", async () => {
      await time.increaseTo(start);
      await vault.connect(user1).stake(user1Nft);
      for (let i = 0; i < user1Nft.length; i++) {
        expect(await home.ownerOf(i)).to.eq(vaultAddress);
      }

      await time.increaseTo(PQ1);
      await vault.connect(user2).stake(user2Nft);
      for (let i = 0; i < user2Nft.length; i++) {
        expect(await home.ownerOf(i + 10)).to.eq(vaultAddress);
      }

      await time.increaseTo(PQ2);
      await vault.connect(user3).stake(user3Nft);
      for (let i = 0; i < user3Nft.length; i++) {
        expect(await home.ownerOf(i + 20)).to.eq(vaultAddress);
      }
    })

    it("should successfully update userStaked", async () => {
      await time.increaseTo(start);
      await vault.connect(user1).stake(user1Nft);
      let user1Staked = await vault.getUserStakedAt(user1Addr, Stage.stageOne);
      expect(arrayComparison(user1Staked.map((val) => Number(val)), user1Nft)).to.be.true;

      await time.increaseTo(PQ1);
      await vault.connect(user2).stake(user2Nft);
      let user2Staked = await vault.getUserStakedAt(user2Addr, Stage.stageTwo);
      expect(arrayComparison(user2Staked.map((val) => Number(val)), user2Nft)).to.be.true;

      await time.increaseTo(PQ2);
      await vault.connect(user3).stake(user3Nft);
      let user3Staked = await vault.getUserStakedAt(user3Addr, Stage.stageThree);
      expect(arrayComparison(user3Staked.map((val) => Number(val)), user3Nft)).to.be.true;
    })

    it("should correctly emit Stake event", async () => {
      await time.increaseTo(start);
      let tx1 = await (await vault.connect(user1).stake(user1Nft)).wait();
      await time.increaseTo(PQ1);
      let tx2 =await (await vault.connect(user2).stake(user2Nft)).wait();
      await time.increaseTo(PQ2);
      let tx3 = await (await vault.connect(user3).stake(user3Nft)).wait();

      await time.increaseTo(PQ3);
      expect(tx1).to.emit("AnimocaRacingVault", "Stake").withArgs(user1Addr, Stage.stageOne, anyValue, anyValue);
      expect(tx2).to.emit("AnimocaRacingVault", "Stake").withArgs(user2Addr, Stage.stageTwo, anyValue, anyValue);
      expect(tx3).to.emit("AnimocaRacingVault", "Stake").withArgs(user3Addr, Stage.stageThree, anyValue, anyValue);
    })
  })

  describe("stakeAll", () => {

    let user1Nft = Array.from({length: 10}, (_, i) => i);
    let user2Nft = Array.from({length: 10}, (_, i) => i + 10);
    let user3Nft = Array.from({length: 10}, (_, i) => i + 20);

    beforeEach(async () => {
      await setupHome(owner, home, vault, user1, user1Nft);
      await setupHome(owner, home, vault, user2, user2Nft);
      await setupHome(owner, home, vault, user3, user3Nft);
    })

    it("should revert if isn't in staking period", async () => {
      await expect(vault.connect(user1).stakeAll()).to.be.revertedWith("Staking is closed");
    })

    it("should revert if contract is paused", async () => {
      await vault.connect(owner).pause();
      await expect(vault.connect(user1).stakeAll()).to.be.revertedWith("Pausable: paused");
    })

    it("should revert if user does not own any token", async () => {
      await time.increaseTo(start);
      await expect(vault.connect(user4).stakeAll()).to.be.revertedWith("User does not own RV");
    })

    it("should revert if exceed maximum purchase", async () => {
      let nfts = Array.from({length: 101}, (_, i) => i + 1000);
      await setupHome(owner, home, vault, user1, nfts);
      await time.increaseTo(start);
      await expect(vault.connect(user1).stakeAll()).to.be.revertedWith("exceed maximum stake amount");
    })

    it("should successfully transfer tokens to staking contract", async () => {
      await time.increaseTo(start);
      await vault.connect(user1).stakeAll();
      for (let i = 0; i < user1Nft.length; i++) {
        expect(await home.ownerOf(i)).to.eq(vaultAddress);
      }

      await time.increaseTo(PQ1);
      await vault.connect(user2).stakeAll();
      for (let i = 0; i < user2Nft.length; i++) {
        expect(await home.ownerOf(i + 10)).to.eq(vaultAddress);
      }

      await time.increaseTo(PQ2);
      await vault.connect(user3).stakeAll();
      for (let i = 0; i < user3Nft.length; i++) {
        expect(await home.ownerOf(i + 20)).to.eq(vaultAddress);
      }
    })

    it("should successfully update userStaked", async () => {
      await time.increaseTo(start);
      await vault.connect(user1).stakeAll();
      let user1Staked = await vault.getUserStakedAt(user1Addr, Stage.stageOne);
      expect(arrayComparison(user1Staked.map((val) => Number(val)), user1Nft)).to.be.true;

      await time.increaseTo(PQ1);
      await vault.connect(user2).stakeAll();
      let user2Staked = await vault.getUserStakedAt(user2Addr, Stage.stageTwo);
      expect(arrayComparison(user2Staked.map((val) => Number(val)), user2Nft)).to.be.true;

      await time.increaseTo(PQ2);
      await vault.connect(user3).stakeAll();
      let user3Staked = await vault.getUserStakedAt(user3Addr, Stage.stageThree);
      expect(arrayComparison(user3Staked.map((val) => Number(val)), user3Nft)).to.be.true;
    })

    it("should correctly emit Stake event", async () => {
      await time.increaseTo(start);
      let tx1 = await (await vault.connect(user1).stakeAll()).wait();
      await time.increaseTo(PQ1);
      let tx2 =await (await vault.connect(user2).stakeAll()).wait();
      await time.increaseTo(PQ2);
      let tx3 = await (await vault.connect(user3).stakeAll()).wait();

      expect(tx1).to.emit("AnimocaRacingVault", "Stake").withArgs(user1Addr, Stage.stageOne, anyValue, anyValue);
      expect(tx2).to.emit("AnimocaRacingVault", "Stake").withArgs(user2Addr, Stage.stageTwo, anyValue, anyValue);
      expect(tx3).to.emit("AnimocaRacingVault", "Stake").withArgs(user3Addr, Stage.stageThree, anyValue, anyValue);
    })
  })

  describe("claimAll", () => {

    let user1Args: any, user2Args: any, user3Args: any, user4Args: any, user5Args: any;

    const stakedFixture = async () => {
      await setupHome(owner, home, vault, user1, [1, 2, 3]);
      await setupHome(owner, home, vault, user2, [4, 5, 6]);
      await setupHome(owner, home, vault, user3, [7, 8, 9]);
      await setupHome(owner, home, vault, user4, [10, 11, 12]);
      await setupHome(owner, home, vault, user5, [13, 14, 15]);
      await setupHigh(high, vaultAddress, [owner]);

      await time.increaseTo(start);
      await vault.connect(user1).stake([1]);
      await vault.connect(user2).stake([4]);
      await vault.connect(user3).stake([7, 8, 9]);

      await time.increaseTo(PQ1);
      await vault.connect(user1).stake([2]);
      await vault.connect(user2).stake([5]);
      await vault.connect(user4).stake([10, 11, 12]);

      await time.increaseTo(PQ2);
      await vault.connect(user1).stake([3]);
      await vault.connect(user2).stake([6]);
      await vault.connect(user5).stake([13, 14, 15]);

      await high.connect(owner).transfer(vaultAddress, ethers.parseEther("600"));
    }

    beforeEach(async () => {
      user1Args = spawnArgs(user1Addr, 100);
      user2Args = spawnArgs(user2Addr, 200);
      user3Args = spawnArgs(user3Addr, 10);
      user4Args = spawnArgs(user4Addr, 10);
      user5Args = spawnArgs(user5Addr, 10);
      await loadFixture(stakedFixture);
    })

    it("should revert if signature isn’t from the correct signer", async () => {
      let sig = await getSignature(user1, encodeInput(user1Args, vaultAddress));
      let input = [...Object.values(user1Args), sig.v, sig.r, sig.s];
      await expect(vault.claimAll(input)).to.revertedWith("Invalid signer");
    })

    it("should revert if time within the race", async () => {
      let sig = await getSignature(owner, encodeInput(user1Args, vaultAddress));
      let input = [...Object.values(user1Args), sig.v, sig.r, sig.s];
      await expect(vault.claimAll(input)).to.revertedWith("Cannot claim within race");
    })

    it("should revert if is from wrong network", async () => {
      user1Args.chainId = 1;
      let sig = await getSignature(owner, encodeInput(user1Args, vaultAddress));
      let input = [...Object.values(user1Args), sig.v, sig.r, sig.s];
      await expect(vault.claimAll(input)).to.revertedWith("Invalid network");
    })

    it("should revert if user already claimed the reward", async () => {
      await time.increaseTo(startClaim);
      let sig = await getSignature(owner, encodeInput(user1Args, vaultAddress));
      let input = [...Object.values(user1Args), sig.v, sig.r, sig.s];
      await vault.claimAll(input);
      await expect(vault.claimAll(input)).to.revertedWith("User already claimed");
    })

    it("should revert if not in claim period", async () => {
      let sig = await getSignature(owner, encodeInput(user1Args, vaultAddress));
      let input = [...Object.values(user1Args), sig.v, sig.r, sig.s];
      await time.increaseTo(startClaim - 1000);
      await expect(vault.claimAll(input)).to.revertedWith("Claim between start and end");
      await time.increaseTo(endClaim + 1000);
      await expect(vault.claimAll(input)).to.revertedWith("Claim between start and end");
    })

    it("should successfully return all Rvs to user", async () => {
      await time.increaseTo(startClaim);
      let sig = await getSignature(owner, encodeInput(user1Args, vaultAddress));
      let input = [...Object.values(user1Args), sig.v, sig.r, sig.s];
      await vault.claimAll(input);

      sig = await getSignature(owner, encodeInput(user2Args, vaultAddress));
      input = [...Object.values(user2Args), sig.v, sig.r, sig.s];
      await vault.claimAll(input);

      expect(await home.ownerOf(1)).to.eq(user1Addr);
      expect(await home.ownerOf(2)).to.eq(user1Addr);
      expect(await home.ownerOf(3)).to.eq(user1Addr);

      expect(await home.ownerOf(4)).to.eq(user2Addr);
      expect(await home.ownerOf(5)).to.eq(user2Addr);
      expect(await home.ownerOf(6)).to.eq(user2Addr);
    })

    it("should successfully send high token to user", async () => {
      await time.increaseTo(startClaim);
      let user1Bal = await high.balanceOf(user1Addr);
      let user2Bal = await high.balanceOf(user2Addr);

      let sig = await getSignature(owner, encodeInput(user1Args, vaultAddress));
      let input = [...Object.values(user1Args), sig.v, sig.r, sig.s];
      await vault.claimAll(input);

      sig = await getSignature(owner, encodeInput(user2Args, vaultAddress));
      input = [...Object.values(user2Args), sig.v, sig.r, sig.s];
      await vault.claimAll(input);

      expect(await high.balanceOf(user1Addr)).to.eq(user1Bal + ethers.parseEther("100"));
      expect(await high.balanceOf(user2Addr)).to.eq(user2Bal + ethers.parseEther("200"));

    })

    it("should succesfully return rvs if only staked in one period", async () => {
      await time.increaseTo(startClaim);
      let sig = await getSignature(owner, encodeInput(user3Args, vaultAddress));
      let input = [...Object.values(user3Args), sig.v, sig.r, sig.s];
      await vault.claimAll(input);

      sig = await getSignature(owner, encodeInput(user4Args, vaultAddress));
      input = [...Object.values(user4Args), sig.v, sig.r, sig.s];
      await vault.claimAll(input);

      sig = await getSignature(owner, encodeInput(user5Args, vaultAddress));
      input = [...Object.values(user5Args), sig.v, sig.r, sig.s];
      await vault.claimAll(input);

      for (let i = 0; i < 3; i++) {
        expect(await home.ownerOf(7 + i)).to.eq(user3Addr);
        expect(await home.ownerOf(10 + i)).to.eq(user4Addr);
        expect(await home.ownerOf(13 + i)).to.eq(user5Addr);
      }
    })
    
    it("should delete the storage of all userStaked", async () => {
      await time.increaseTo(startClaim);
      let sig = await getSignature(owner, encodeInput(user1Args, vaultAddress));
      let input = [...Object.values(user1Args), sig.v, sig.r, sig.s];
      await vault.claimAll(input);

      sig = await getSignature(owner, encodeInput(user2Args, vaultAddress));
      input = [...Object.values(user2Args), sig.v, sig.r, sig.s];
      await vault.claimAll(input);
      
      expect(await (await vault.getUserStakedAt(user1Addr, Stage.stageOne)).length).to.eq(0);
      expect(await (await vault.getUserStakedAt(user1Addr, Stage.stageTwo)).length).to.eq(0);
      expect(await (await vault.getUserStakedAt(user1Addr, Stage.stageThree)).length).to.eq(0);

      expect(await (await vault.getUserStakedAt(user2Addr, Stage.stageOne)).length).to.eq(0);
      expect(await (await vault.getUserStakedAt(user2Addr, Stage.stageTwo)).length).to.eq(0);
      expect(await (await vault.getUserStakedAt(user2Addr, Stage.stageThree)).length).to.eq(0);
    })
    
    it("should correctly emit Claim event", async () => {
      await time.increaseTo(startClaim);
      let sig = await getSignature(owner, encodeInput(user1Args, vaultAddress));
      let input = [...Object.values(user1Args), sig.v, sig.r, sig.s];
      let tx1 = await (await vault.claimAll(input)).wait();

      sig = await getSignature(owner, encodeInput(user2Args, vaultAddress));
      input = [...Object.values(user2Args), sig.v, sig.r, sig.s];
      let tx2 = await (await vault.claimAll(input)).wait();

      expect(tx1).to.emit("AnimocaRacingVault", "Claim").withArgs(
        ownerAddr, user1Addr, ethers.parseEther("100"), anyValue,
      );
      expect(tx2).to.emit("AnimocaRacingVault", "Claim").withArgs(
        ownerAddr, user2Addr, ethers.parseEther("200"), anyValue,
      );
    })
  })

  describe("claimRVOnly", async () => {

    beforeEach(async () => {
      await time.increaseTo(start);
      await setupHome(owner, home, vault, user1, [1, 2, 3]);
      await vault.connect(user1).stake([1]);
      await time.increaseTo(PQ1);
      await vault.connect(user1).stake([2]);
      await time.increaseTo(PQ2);
      await vault.connect(user1).stake([3]);
    })

    it("should revert if is within racing period", async () => {
      await expect(vault.claimRVOnly(user1Addr)).to.revertedWith("Cannot withdraw within staking");
    })
      
    it("should only be claimed after claimEndTime", async () => {
      await time.increaseTo(startClaim);
      await expect(vault.claimRVOnly(user1Addr)).to.revertedWith("Cant claim before claimEndTime");
      await time.increaseTo(endClaim);
      await vault.connect(user1).claimRVOnly(user1Addr);
    })

    it("should withdraw to user without reward", async () => {
      await time.increaseTo(endClaim);
      let user1Bal = await high.balanceOf(user1Addr);

      for (let i = 1; i <= 3; i++)
        expect(await home.ownerOf(i)).to.eq(vaultAddress);

      await vault.connect(owner).claimRVOnly(user1Addr);

      for (let i = 1; i <= 3; i++)
        expect(await home.ownerOf(i)).to.eq(user1Addr);
       expect(await high.balanceOf(user1Addr)).to.eq(user1Bal);
    })
  })

  describe("Limit test", () => {

    let user1Owned = Array.from({length: 100}, (_, i) => i);

    beforeEach(async () => {
      await time.increaseTo(start);
      await setupHome(owner, home, vault, user1, user1Owned);
    })

    it("should be able to stake 100 RV", async () => {
      expect(await vault.connect(user1).stakeAll({gasLimit: 30000000})).not.to.be.revertedWithPanic();
    })

    it("should correctly emit Stake event", async () => {
      let tx = await (await vault.connect(user1).stakeAll({gasLimit: 30000000})).wait();
      expect(tx).to.emit("AnimocaRacingVault", "Stake").withArgs(user1Addr, Stage.stageOne, anyValue, anyValue);
    })

    it("should be able to claimAll max of 100 RV", async () => {
      await time.increaseTo(startClaim);
      let user1Args = spawnArgs(user1Addr, 0);
      let sig = await getSignature(owner, encodeInput(user1Args, vaultAddress));
      let input = [...Object.values(user1Args), sig.v, sig.r, sig.s];
      expect(await vault.claimAll(input)).not.to.be.revertedWithPanic();
      expect(await home.balanceOf(user1Addr)).to.eq(100);
    })
  })

  describe("Owner operation", () => {
    beforeEach(async () => {
      await time.increaseTo(start);
      await setupHome(owner, home, vault, user1, [1, 2, 3]);
      await vault.connect(user1).stake([1]);
      await time.increaseTo(PQ1);
      await vault.connect(user1).stake([2]);
      await time.increaseTo(PQ2);
      await vault.connect(user1).stake([3]);
    })

    it("emergencyWithdrawHigh", async () => {
      await time.increaseTo(endClaim);
      let beforeBal = await high.balanceOf(receiverAddr);
      await setupHigh(high, vaultAddress, [owner]);
      await high.connect(owner).transfer(vaultAddress, ethers.parseEther("300"));
      await vault.connect(owner).emergencyWithdrawHigh(receiverAddr);
      expect(await high.balanceOf(receiverAddr)).to.eq(beforeBal + ethers.parseEther("300"));
    })

    it("emergencyWithdrawHigh should only be claimed after claimEndTime", async () => {
      await expect(vault.connect(owner).emergencyWithdrawHigh(receiverAddr)).to.be.revertedWith("Cant withdraw before claimEndTime");
    })

    it("setAdminSigner", async () => {
      let nowAdminSigner = await vault.adminSigner();
      await expect(
        vault.connect(owner).setAdminSigner(ethers.ZeroAddress)
        ).to.be.revertedWith("adminSigner cant be zero address");
      await vault.connect(owner).setAdminSigner(user1Addr);
      expect(await vault.adminSigner()).to.not.eq(nowAdminSigner);
      expect(await vault.adminSigner()).to.eq(user1Addr);
    })
    
    it("pause", async () => {
      await vault.connect(owner).pause();
      expect(await vault.paused()).to.be.true;
    })

    it("pause", async () => {
      await vault.connect(owner).pause();
      expect(await vault.paused()).to.be.true;
      await vault.connect(owner).unpause();
      expect(await vault.paused()).to.be.false;
    })
  })

})