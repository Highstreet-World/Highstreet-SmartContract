import { expect } from "chai";
import { ethers } from "hardhat";
import {
  Signer,
  Contract,
  ContractTransactionReceipt
} from "ethers";
import { AnimocaHome } from "../../typechain-types";

describe("AnimocaHome test", () => {

  let owner: Signer, user1: Signer, user2: Signer;
  let ownerAddr: string, user1Addr: string, user2Addr: string;
  let nft: AnimocaHome;
  const ZERO_ADDRESS = ethers.ZeroAddress;

  /* NFT PARAMETERS */
  const config = {
    name: "NFT TBD",
    symbol: "TBD",
    uri: "https://highstreet.market/TBD",
    max: 10,
  };

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    ownerAddr = await owner.getAddress();
    user1Addr = await user1.getAddress();
    user2Addr = await user2.getAddress();

    const Animoca = await ethers.getContractFactory("AnimocaHome");
    nft = await Animoca.deploy(
      config.name,
      config.symbol,
      config.uri,
      config.max
    );
    await nft.waitForDeployment();
  });

  describe("basic information check", () => {
    it('has a name', async () => {
      expect(await nft.name()).to.equal(config.name);
    });

    it('has a symbol', async () => {
      expect(await nft.symbol()).to.equal(config.symbol);
    });

    it('has max supply', async () => {
      expect(await nft.maxSupply()).to.be.equal(config.max);
    });

    it('check owner', async () => {
      expect(await nft.owner()).to.equal(ownerAddr);
    });

    it('owner is not a minter by default', async () => {
      expect(await nft.minters(ownerAddr)).to.be.false;
    });
  });

  describe("permission check", () => {
    it("is able to transfer ownership", async () => {
      await nft.connect(owner).transferOwnership(user1Addr);
      expect(await nft.owner()).to.equal(user1Addr);
    });
    it("should revert when not owner", async () => {
      let tx = nft.connect(user2).grantMinterRole(user1Addr);
      await expect(tx).to.revertedWith("Ownable: caller is not the owner");

      tx = nft.connect(user2).grantMinterRole(ownerAddr);
      await expect(tx).to.revertedWith("Ownable: caller is not the owner");
    });
    it("grantMinterRole", async () => {
      await nft.connect(owner).grantMinterRole(user1Addr);
      let tx = await nft.connect(owner).grantMinterRole(user2Addr);
      expect(tx)
        .to.emit(nft, "MinterRoleGranted")
        .withArgs(ownerAddr, user2Addr);
      // is able to set multiple minters
      expect(await nft.connect(owner).minters(ownerAddr)).to.be.false;
      expect(await nft.connect(owner).minters(user1Addr)).to.be.true;
      expect(await nft.connect(owner).minters(user2Addr)).to.be.true;
    });
    it("revokeMinterRole", async () => {
      await nft.connect(owner).grantMinterRole(user1Addr);
      expect(await nft.connect(owner).minters(user1Addr)).to.be.true;

      let tx = await nft.connect(owner).revokeMinterRole(user1Addr);
      expect(tx)
        .to.emit(nft, "MinterRoleRevoked")
        .withArgs(ownerAddr, user1Addr);
      expect(await nft.connect(owner).minters(user1Addr)).to.be.false;
    });
  });

  describe("minting test", () => {
    it("should revert when not minter", async () => {
      expect(await nft.connect(owner).minters(user1Addr)).to.be.false;
      let tx = nft.connect(user1).safeMint(user2Addr, 0);
      await expect(tx).to.revertedWith("permission denied");
    });
    it("unable to mint to zero address", async () => {
      await nft.connect(owner).grantMinterRole(ownerAddr);

      let receiver = ZERO_ADDRESS;
      let tokenId = 0;
      let tx = nft.connect(owner).safeMint(receiver, tokenId);
      await expect(tx).to.revertedWith("ERC721: mint to the zero address");
    })
    it("revert when tokenId already minted", async () => {
      await nft.connect(owner).grantMinterRole(ownerAddr);

      let receiver = user1Addr;
      let tokenId = 0;
      await nft.connect(owner).safeMint(receiver, tokenId);

      let newReceiver = user2Addr;
      tokenId = 0;
      let tx = nft.connect(owner).safeMint(newReceiver, tokenId);
      await expect(tx).to.revertedWith("ERC721: token already minted");
    })
    it("should success mint nft", async () => {
      await nft.connect(owner).grantMinterRole(ownerAddr);

      let receiver = user1Addr;
      let tokenId = 0;
      let tx = await nft.connect(owner).safeMint(receiver, tokenId);
      expect(tx)
        .to.emit(nft, "Transfer")
        .withArgs(0, receiver);

      expect(await nft.connect(owner).ownerOf(tokenId)).to.equal(receiver);
      expect(await nft.connect(owner).balanceOf(user1Addr)).to.equal(1n);
    });
    it("should revert if mint exceed maxSupply", async () => {
      await nft.connect(owner).grantMinterRole(ownerAddr);

      let receiver = ownerAddr;
      let tokenMax = config.max;

      for (let tokenId = 0; tokenId < tokenMax; tokenId++) {
        await nft.connect(owner).safeMint(receiver, tokenId);
      }

      await expect(nft.connect(owner).safeMint(receiver, tokenMax))
        .to.revertedWith("mint exceed maxSupply");
    })
  });

  describe("burning test", () => {
    it('should able to burn token by owner', async () => {
      await nft.connect(owner).grantMinterRole(ownerAddr);

      let receiver = ownerAddr;
      let tokenId = 0;
      await nft.connect(owner).safeMint(receiver, tokenId);
      expect(await nft.connect(owner).balanceOf(receiver)).to.be.equal(1n);

      const tx = await nft.connect(owner).burn(tokenId);
      expect(tx)
        .to.emit(nft, "Transfer")
        .withArgs(0, receiver);

      const ownerCheck = nft.connect(owner).ownerOf(tokenId);
      await expect(ownerCheck).to.revertedWith("ERC721: invalid token ID");

      expect(await nft.connect(owner).balanceOf(receiver)).to.equal(0n);
    });

    it('should able to burn token when get approval', async () => {
      await nft.connect(owner).grantMinterRole(ownerAddr);

      let receiver = ownerAddr;
      let tokenId = 0;
      await nft.connect(owner).safeMint(receiver, tokenId);

      await nft.connect(owner).approve(user1Addr, tokenId);

      let tx = await nft.connect(user1).burn(tokenId);
      expect(tx)
      .to.emit(nft, "Transfer")
      .withArgs(0, receiver);

      const ownerCheck = nft.connect(owner).ownerOf(tokenId);
      await expect(ownerCheck).to.revertedWith("ERC721: invalid token ID");

      expect(await nft.connect(owner).balanceOf(receiver)).to.equal(0n);
    });

    it('should revert if not owner or get approval', async () => {
      await nft.connect(owner).grantMinterRole(ownerAddr);

      let receiver = ownerAddr;
      let tokenId = 0;
      await nft.connect(owner).safeMint(receiver, tokenId);

      let tx = nft.connect(user1).burn(tokenId);
      await expect(tx).to.revertedWith("caller is not owner nor approved");

    });
  });

  describe("update base uri test", () => {
    it('has corresponding URI', async () => {
      let url = "https://highstreet/testNFT/";
      let tx = await nft.connect(owner).updateBaseURI(url);
      expect(tx).to.emit(nft, "UpdateBaseUri");
    });
  });

  describe("update max supply", () => {
    it('should update maxSupply', async () => {
      await nft.connect(owner).updateMaxSupply(12);
      expect(await nft.maxSupply()).to.eq(12);
    });
  });

  describe("transfer extra limitation test", () => {
    it('contract cannot be receiver - mint', async () => {
      await nft.connect(owner).grantMinterRole(ownerAddr);

      let receiver = await nft.getAddress();
      let tokenId = 0;

      let tx = nft.connect(owner).safeMint(receiver, tokenId);
      await expect(tx).to.revertedWith("this contract cannot be receiver");
    });
    it('contract cannot be receiver - transferFrom', async () => {
      await nft.connect(owner).grantMinterRole(ownerAddr);

      let receiver = ownerAddr;
      let tokenId = 0;
      await nft.connect(owner).safeMint(receiver, tokenId);

      //normally, can transfer token
      receiver = user1Addr;
      await nft.connect(owner).transferFrom(ownerAddr, receiver, tokenId)

      //but cannot transfer to nft contract
      receiver = await nft.getAddress();
      let tx = nft.connect(user1).transferFrom(user1Addr, receiver, tokenId);
      await expect(tx).to.revertedWith("this contract cannot be receiver");
    });
    it('contract cannot be receiver - safeTransferFrom', async () => {
      await nft.connect(owner).grantMinterRole(ownerAddr);

      let receiver = ownerAddr;
      let tokenId = 0;
      await nft.connect(owner).safeMint(receiver, tokenId);

      //normally, can transfer token
      receiver = user1Addr;
      await nft.connect(owner)["safeTransferFrom(address,address,uint256)"](ownerAddr, receiver, tokenId);

      //but cannot transfer to nft contract
      receiver = await nft.getAddress();
      let tx = nft.connect(user1)["safeTransferFrom(address,address,uint256)"](user1Addr, receiver, tokenId);
      await expect(tx).to.revertedWith("this contract cannot be receiver");
    });
  });

  it("safeBatchTransferFrom test", async () => {
    await nft.connect(owner).grantMinterRole(ownerAddr);

    let receiver = ownerAddr;

    for (let tokenId = 0; tokenId < 10; tokenId++) {
      await nft.connect(owner).safeMint(receiver, tokenId);
    }

    let ids = Array.from(Array(10), (_, i) => i);
    receiver = user1Addr;
    await nft.connect(owner).safeBatchTransferFrom(ownerAddr, receiver, ids);
  })
})
