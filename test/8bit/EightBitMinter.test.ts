
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Signer } from "ethers";
import {
  getCurrentTime,
  getBalance,
  insertTags,
  makeLTags,
  packMintInput,
  mintOnchain,
} from "./utils/utils";
import { EightBit, EightBitMinter } from "../../typechain-types";

describe("8BitMinter test", () => {

  let owner: Signer, user1: Signer, user2: Signer;
  let ownerAddr: string, user1Addr: string, user2Addr: string, nftAddress: string, minterAddr: string;
  let startTime: number;
  let mintingFee: bigint;
  let accumulateFee = 0n;
  let nft: EightBit, minter: EightBitMinter;

  /* NFT PARAMETERS */
  const config = {
    name: "NFT TBD",
    symbol: "TBD",
    uri: "https://highstreet.market/TBD",
    max: 1500,
  };

  const styleList = ["KH01", "KH02", "KH03", "KH04", "KH05", "KH06", "KH07", "KH08", "KH09", "KH10"];
  const qty = [150, 200, 200, 200, 100, 150, 100, 30, 150, 100];
  

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();

    const EightBit = await ethers.getContractFactory("EightBit");
    const EightBitMinter = await ethers.getContractFactory("EightBitMinter");
    startTime = await getCurrentTime() + 10000;
    mintingFee = ethers.parseEther("0.1");

    ownerAddr = await owner.getAddress();
    user1Addr = await user1.getAddress();
    user2Addr = await user2.getAddress();

    nft = await EightBit.deploy(
      config.name,
      config.symbol,
      config.uri,
      config.max
    );
    nftAddress = await nft.getAddress();
    minter = await EightBitMinter.deploy(
      nftAddress,
      ownerAddr,
      mintingFee,
      startTime
    );
    minterAddr = await minter.getAddress();
    await nft.connect(owner).grantMinterRole(ownerAddr);
    await nft.connect(owner).grantMinterRole(minterAddr);
    await time.increase(100000);
  });

  describe("Owner operation", () => {
    describe("updateMintingFee", () => {
      const newFee = ethers.parseEther("0.2");

      it("get minting fee", async () => {
        const fee = await minter.mintingFee();
        expect(fee).to.eq(mintingFee);
      });

      it("should revert if isnt' send from owner", async () => {
        const tx = minter.connect(user1).updateMintingFee(newFee);
        await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("update minting fee", async () => {
        await expect(
          minter.connect(owner).updateMintingFee(newFee)
        ).to.emit(minter, "UpdateMintingFee").withArgs(newFee);
        mintingFee = newFee;
        const fee = await minter.mintingFee();
        expect(fee).to.eq(mintingFee);
      });

      it("update signer", async () => {
        expect(await minter.signer()).to.equal(ownerAddr);

        await expect(
          minter.connect(owner).updateSigner(user1Addr)
        ).to.emit(minter, "UpdateSigner").withArgs(user1Addr);

        expect(await minter.signer()).to.equal(user1Addr);
        //recover to origin signer to prevent break
        await minter.connect(owner).updateSigner(ownerAddr);
      });
    });

    describe("updateTags", async () => {
      let list;
      it("should update tags using insertTags", async () => {
        list = await makeLTags(styleList, qty);
        await insertTags(list, owner, minterAddr);
      });
      it("check tags updated", async () => {
        
        list = await makeLTags(styleList, qty);
        await insertTags(list, owner, minterAddr);

        for(let i = 0; i < styleList.length; i++) {
          let styleTag = await minter.styleTable(ethers.encodeBytes32String(styleList[i]));
          let newStyleTag = styleTag.slice(0, 3);
          expect(newStyleTag[0]).to.eq(list[i][0]);
          expect(newStyleTag[1]).to.eq(list[i][1]);
          expect(newStyleTag[2]).to.eq(list[i][2]);
        }
      });
    });

    describe("pause", async () => {
      it("should be able to pause", async () => {
        await minter.pause();
      });
    });

    describe("unpause", async () => {
      it("should be able to pause", async () => {
        await minter.pause();
        await minter.unpause();
      });
    });
  });

  describe("mint", () => {
    let mintInput: any;
    beforeEach(async () => {
      const list = await makeLTags(styleList, qty);
      await insertTags(list, owner, minterAddr);
      mintInput = {
        chainId: 31337,
        user: user1Addr,
        deadline: startTime + 1000000000,
        productCode: ethers.encodeBytes32String("A0"),
        styleTag: ethers.encodeBytes32String("KH01"),
      };
    });

    it("should mint through minting script", async () => {
      const input = await packMintInput(owner, mintInput);
      await expect(
        mintOnchain(input, minterAddr, user1, mintingFee)
      ).to.emit(minter, "Mint").withArgs(
        user1Addr,
        ethers.encodeBytes32String("KH01"),
        ethers.encodeBytes32String("A0"),
        0,
        mintingFee
      );
      accumulateFee += mintingFee;
      expect(await nft.ownerOf(0)).to.eq(user1Addr);
    });

    it("should revert on duplicate mint", async () => {
      const input = await packMintInput(owner, mintInput);
      await mintOnchain(input, minterAddr, user1, mintingFee);
      await expect(
        mintOnchain(input, minterAddr, user1, mintingFee)
      ).to.be.revertedWith("Minted already");
      expect(await minter.checkOrderStatus(input)).to.be.true;
    });

    it("should mint with correct starting tokenid", async () => {
      for(let i = 1; i <= 10; i++) {
        let addOns = (i == 10) ? "" : "0";
        const data = {
          ...mintInput,
          productCode: ethers.encodeBytes32String("A" + addOns + i),
          styleTag: ethers.encodeBytes32String("KH" + addOns + i),
          deadline: Date.now() + i
        }
        const input = await packMintInput(owner, data);
        await mintOnchain(input, minterAddr, user1, mintingFee);
        accumulateFee += mintingFee;
      }
      const list = await makeLTags(styleList, qty);
      for (let i = 0; i < list.length; i++) {
        expect(await nft.ownerOf(list[i][1])).to.eq(user1Addr);
      }
    });

    it("should require payment fee", async () => {
      const input = await packMintInput(owner, mintInput);
      const tx = mintOnchain(input, minterAddr, user1, 0n);
      await expect(tx).to.be.revertedWith("Require payment fee");
    });

    it("should signed by owner", async () => {
      const productCode = ethers.encodeBytes32String("B0");
      mintInput = { ...mintInput, productCode, deadline: Date.now()};
      const input = await packMintInput(user2, mintInput);
      const tx = mintOnchain(input, minterAddr, user1, mintingFee);
      await expect(tx).to.be.revertedWith("Invalid signer");
    });

    it("should revert if wrong network", async () => {
      const productCode = ethers.encodeBytes32String("B0");
      const thisinput = { ...mintInput, productCode, chainId: 1};
      const input = await packMintInput(owner, thisinput);
      const tx = mintOnchain(input, minterAddr, user1, mintingFee);
      await expect(tx).to.be.revertedWith("Invalid network");
    });

    it("should return exceed payment to msg.sender", async () => {
      const input = await packMintInput(owner, mintInput);
      const balance = await getBalance(user1Addr);
      await mintOnchain(input, minterAddr, user1, mintingFee * 10n);
      accumulateFee += mintingFee;
      expect(await getBalance(user1Addr)).to.gt(balance - mintingFee * 10n);
    });

    it("should revert if time pass execution deadline", async () => {
      const thisinput = mintInput;
      thisinput.deadline = await getCurrentTime() - 100;
      const input = await packMintInput(owner, thisinput);
      const tx = mintOnchain(input, minterAddr, user1, mintingFee);
      await expect(tx).to.be.revertedWith("Execution exceed deadline");
    });
  });

  describe("isValid", () => {
    let mintInput: any;
    beforeEach(async () => {
      const list = await makeLTags(styleList, qty);
      await insertTags(list, owner, minterAddr);
      mintInput = {
        chainId: 31337,
        user: user1Addr,
        deadline: startTime + 1000000000,
        productCode: ethers.encodeBytes32String("A0"),
        styleTag: ethers.encodeBytes32String("KH01"),
      };
    });
    it("should revert if styleTag was not initialized", async () => {
      await expect(minter.isValidTag(ethers.encodeBytes32String("KH100")))
        .to.revertedWith("Invalid: styleTag not exist");
    });
    it("should return false if styleTag was bought out", async () => {
      mintInput.styleTag = ethers.encodeBytes32String("KH08");
      for(let i = 0; i < 30; i++) {
        mintInput.deadline = await getCurrentTime() + 10000000 + i + 1;
        mintInput.productCode = ethers.encodeBytes32String(`C${i}`);
        const input = await packMintInput(owner, mintInput);
        await mintOnchain(input, minterAddr, user1, mintingFee);
        accumulateFee += mintingFee;
      }
      expect(await minter.isValidTag(mintInput.styleTag)).to.be.false;
    });
    it("should return true if styleTag was available to mint", async () => {
      expect(await minter.isValidTag(ethers.encodeBytes32String("KH02"))).to.be.true;
    });
  });

  describe("Time operation", () => {
    describe("updateStartTime", async () => {
      it("should get start time", async () => {
        expect(await minter.startTime()).to.eq(startTime);
      });
      it("should successfully update start time", async () => {
        const newTime = 10000;
        await minter.updateStartTime(newTime);
        expect(await minter.startTime()).to.eq(newTime);
      });
    });
  });

  describe("Owner withdraw", () => {
    it("should withdraw to owner", async () => {
      const originBalance = await getBalance(ownerAddr);
      const minterBalance = await getBalance(minterAddr);
      const tx = await minter.ownerWithdraw();
      const result = await tx.wait(1);
      const cost = result!.gasUsed * result!.gasPrice;
      const newBalance = await getBalance(ownerAddr);
      expect(newBalance).to.eq(originBalance + minterBalance - cost);
    });
  });
});