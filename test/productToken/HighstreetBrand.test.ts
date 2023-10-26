import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect, assert } from "chai";
import { ethers, upgrades } from "hardhat";
import { deployContractFixture } from "./utils/deployContractFixture";
import { NFT, PRODUCT } from "./Constants";
import { before } from "mocha";
import { HighstreetBrands } from "../../typechain-types";
import { ContractTransactionResponse } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Highstreet Brands NFT", function () {
  describe("basic information check", () => {
    let purchasedNft: HighstreetBrands & {
      deploymentTransaction(): ContractTransactionResponse;
    };
    let owner: HardhatEthersSigner;
    let ownerAddress: string;
    before(async () => {
      const context = await deployContractFixture();
      purchasedNft = context.purchasedNft;
      owner = context.owner;
      ownerAddress = await owner.getAddress();
    });

    it("has a name", async () => {
      expect(await purchasedNft.name()).to.equal(NFT.name);
    });
    it("has a symbol", async () => {
      expect(await purchasedNft.symbol()).to.equal(NFT.symbol);
    });

    it("has a decimals", async () => {
      expect(await purchasedNft.decimals()).to.equal(0);
    });

    it("check owner", async () => {
      expect(await purchasedNft.owner()).to.equal(ownerAddress);
    });
  });

  describe("permission check", () => {
    it("is able to transfer ownership", async () => {
      const context = await deployContractFixture();
      await expect(
        context.purchasedNft
          .connect(context.owner)
          .transferOwnership(context.user1Address)
      )
        .to.emit(context.purchasedNft, "OwnershipTransferred")
        .withArgs(context.ownerAddress, context.user1Address);

      expect(await context.purchasedNft.owner()).to.equal(context.user1Address);
    });
    it("should revert when not owner", async () => {
      const context = await deployContractFixture();
      let tx = context.purchasedNft
        .connect(context.user2)
        .grantMinterRole(context.user1Address);
      await expect(tx).to.revertedWith("Ownable: caller is not the owner");
    });
    it("grantMinterRole", async () => {
      const context = await deployContractFixture();
      await context.purchasedNft
        .connect(context.owner)
        .grantMinterRole(context.user1Address);
      let tx = await context.purchasedNft
        .connect(context.owner)
        .grantMinterRole(context.user2Address);
      expect(tx)
        .to.emit(context.purchasedNft, "MinterRoleGranted")
        .withArgs(context.user2Address, context.owner);
      // is able to set multiple minters
      expect(
        await context.purchasedNft
          .connect(context.owner)
          .minters(context.ownerAddress)
      ).to.be.true;
      expect(
        await context.purchasedNft
          .connect(context.owner)
          .minters(context.user1Address)
      ).to.be.true;
      expect(
        await context.purchasedNft
          .connect(context.owner)
          .minters(context.user2Address)
      ).to.be.true;
    });
    it("revokeMinterRole", async () => {
      const context = await deployContractFixture();
      await context.purchasedNft
        .connect(context.owner)
        .grantMinterRole(context.user1Address);
      expect(
        await context.purchasedNft
          .connect(context.owner)
          .minters(context.user1Address)
      ).to.be.true;

      let tx = await context.purchasedNft
        .connect(context.owner)
        .revokeMinterRole(context.user1Address);
      expect(tx)
        .to.emit(context.purchasedNft, "MinterRoleRevoked")
        .withArgs(context.user1Address, context.ownerAddress);

      expect(
        await context.purchasedNft
          .connect(context.owner)
          .minters(context.user1Address)
      ).to.be.false;
    });
  });

  describe("minting test", () => {
    const tokenId = "0";
    let amount = "1";
    it("should revert when not minter", async () => {
      const context = await deployContractFixture();
      expect(
        await context.purchasedNft
          .connect(context.owner)
          .minters(context.user1Address)
      ).to.be.false;
      const tx = context.purchasedNft
        .connect(context.user1)
        .mint(context.user2Address, tokenId, amount, "0x00");
      await expect(tx).to.revertedWith("permission denied");
    });
    it("unable to mint to zero address", async () => {
      const context = await deployContractFixture();
      const tx = context.purchasedNft
        .connect(context.owner)
        .mint(ethers.ZeroAddress, tokenId, amount, "0x00");
      await expect(tx).to.revertedWith("ERC1155: mint to the zero address");
    });
    it("should success mint single nft", async () => {
      const context = await deployContractFixture();
      amount = "10";
      const receiver = context.user1Address;
      await context.purchasedNft
        .connect(context.owner)
        .setMaxSupply(tokenId, amount);

      const tx = context.purchasedNft
        .connect(context.owner)
        .mint(receiver, tokenId, amount, "0x00");

      await expect(tx)
        .to.emit(context.purchasedNft, "TransferSingle")
        .withArgs(
          context.ownerAddress,
          ethers.ZeroAddress,
          receiver,
          tokenId,
          amount
        );
      expect(
        await context.purchasedNft
          .connect(context.owner)
          .balanceOf(context.user1Address, tokenId)
      ).to.equal(amount);
    });

    it("should success mint multiple nfts", async () => {
      const context = await deployContractFixture();
      let receiver = context.user1Address;
      let tokenIds = ["0", "1", "2"];
      let amounts = ["10", "100", "1000"];

      const ps = tokenIds.map(async (v, i) => {
        context.purchasedNft.connect(context.owner).setMaxSupply(v, amounts[i]);
      });
      await Promise.allSettled(ps);

      let tx = context.purchasedNft
        .connect(context.owner)
        .mintBatch(receiver, tokenIds, amounts, "0x00");

      await expect(tx)
        .to.emit(context.purchasedNft, "TransferBatch")
        .withArgs(
          context.ownerAddress,
          ethers.ZeroAddress,
          receiver,
          tokenIds,
          amounts
        );

      for (let idx = 0; idx < tokenIds.length; idx++) {
        expect(
          await context.purchasedNft
            .connect(context.owner)
            .balanceOf(context.user1Address, tokenIds[idx])
        ).to.equal(amounts[idx]);

        expect(
          await context.purchasedNft
            .connect(context.owner)
            .totalSupply(tokenIds[idx])
        ).to.equal(amounts[idx]);
      }
    });

    it("should revert if exceed max amount", async () => {
      const context = await deployContractFixture();

      let maxAmount = "10";
      let tx1 = context.purchasedNft
        .connect(context.owner)
        .setMaxSupply(tokenId, maxAmount);

      await expect(tx1)
        .to.emit(context.purchasedNft, "SetMaxSupply")
        .withArgs(tokenId, maxAmount);

      expect(
        await context.purchasedNft.connect(context.owner).maxSupply(tokenId)
      ).to.equal(maxAmount);

      let receiver = context.ownerAddress;
      let amount = maxAmount + 1;
      const tx2 = context.purchasedNft
        .connect(context.owner)
        .mint(receiver, tokenId, amount, "0x00");
      await expect(tx2).to.revertedWith("cap exceeded");

      expect(
        await context.purchasedNft
          .connect(context.owner)
          .balanceOf(receiver, tokenId)
      ).to.equal(0);
    });
  });

  describe("burning test", () => {
    const tokenIds = ["1", "10", "20"];
    const amounts = ["10", "100", "1000"];
    it("should success burn single nft", async () => {
      const index = 0;
      const tokenId = tokenIds[index];
      const amount = amounts[index];
      const burnedAmount = "9";
      const context = await deployContractFixture();
      await context.purchasedNft
        .connect(context.owner)
        .setMaxSupply(tokenId, amount);
      await context.purchasedNft
        .connect(context.owner)
        .mint(context.user1Address, tokenId, amount, "0x00");

      const tx = context.purchasedNft
        .connect(context.user1)
        .burn(context.user1Address, tokenId, burnedAmount);
      await expect(tx)
        .to.emit(context.purchasedNft, "TransferSingle")
        .withArgs(
          context.user1Address,
          context.user1Address,
          ethers.ZeroAddress,
          tokenId,
          burnedAmount
        );
    });

    it("should success burn multiple nft", async () => {
      const context = await deployContractFixture();
      for (let i = 0; i < tokenIds.length; i++) {
        await context.purchasedNft
          .connect(context.owner)
          .setMaxSupply(tokenIds[i], amounts[i]);
      }

      await context.purchasedNft
        .connect(context.owner)
        .mintBatch(context.user1Address, tokenIds, amounts, "0x00");

      let tx = context.purchasedNft
        .connect(context.user1)
        .burnBatch(context.user1Address, tokenIds, amounts);

      await expect(tx)
        .to.emit(context.purchasedNft, "TransferBatch")
        .withArgs(
          context.user1Address,
          context.user1Address,
          ethers.ZeroAddress,
          tokenIds,
          amounts
        );
    });
  });

  describe("update base uri test", () => {
    it("has corresponding URI", async () => {
      const tokenId = 0;
      const amount = 10;
      const context = await deployContractFixture();
      const receiver = context.ownerAddress;

      await context.purchasedNft
        .connect(context.owner)
        .grantMinterRole(context.ownerAddress);
      await context.purchasedNft.connect(context.owner).setMaxSupply(0, 10);

      await context.purchasedNft
        .connect(context.owner)
        .mint(receiver, tokenId, amount, "0x00");

      let url = "https://highstreet/testNFT/";
      let tx = context.purchasedNft.connect(context.owner).updateBaseUri(url);

      await expect(tx)
        .to.emit(context.purchasedNft, "UpdateBaseUri")
        .withArgs(context.ownerAddress, url);

      expect(
        await context.purchasedNft.connect(context.owner).uri(tokenId)
      ).to.equal(`${url}${tokenId}`);
    });
  });

  describe("transfer extra limitation test", () => {
    it("contract cannot be receiver - mint", async () => {
      const tokenId = 0;
      const amount = 10;
      const context = await deployContractFixture();
      await context.purchasedNft
        .connect(context.owner)
        .grantMinterRole(context.ownerAddress);
      await context.purchasedNft.connect(context.owner).setMaxSupply(0, 10);

      const receiver = await context.purchasedNft.getAddress();

      const tx = context.purchasedNft
        .connect(context.owner)
        .mint(receiver, tokenId, amount, "0x00");
      await expect(tx).to.revertedWith(
        "ERC1155: transfer to non-ERC1155Receiver implementer"
      );
    });

    it("contract cannot be receiver - safeTransferFrom", async () => {
      const tokenId = 0;
      let amount = 10;
      const context = await deployContractFixture();
      await context.purchasedNft
        .connect(context.owner)
        .grantMinterRole(context.ownerAddress);
      await context.purchasedNft.connect(context.owner).setMaxSupply(0, 10);

      let receiver = context.ownerAddress;

      await context.purchasedNft
        .connect(context.owner)
        .mint(receiver, tokenId, amount, "0x00");

      receiver = context.user1Address;
      amount = 5;
      await context.purchasedNft
        .connect(context.owner)
        .safeTransferFrom(
          context.ownerAddress,
          receiver,
          tokenId,
          amount,
          "0x00"
        );

      receiver = await context.purchasedNft.getAddress();
      let tx = context.purchasedNft
        .connect(context.user1)
        .safeTransferFrom(
          context.user1Address,
          receiver,
          tokenId,
          amount,
          "0x00"
        );
      await expect(tx).to.revertedWith(
        "ERC1155: transfer to non-ERC1155Receiver implementer"
      );
    });
  });
});
