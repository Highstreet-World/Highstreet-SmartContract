import { ethers } from "hardhat";
import {
  Contract,
  Signer,
  BigNumberish,
  BytesLike,
  AddressLike,
} from "ethers";
import eightBitMinter from "../../../artifacts/contracts/8bit/EightBitMinter.sol/EightBitMinter.json";

export const getCurrentTime = async () => {
  return await (
    await ethers.provider.getBlock(
      await ethers.provider.getBlockNumber()
    )
  )!.timestamp;
};

export type MintInputStruct = {
  chainId: BigNumberish;
  user: AddressLike;
  deadline: BigNumberish;
  productCode: BytesLike;
  styleTag: BytesLike;
  v: BigNumberish;
  r: BytesLike;
  s: BytesLike;
};

export const getBalance = (address: string) => {
  return ethers.provider.getBalance(address);
}

export const insertTags = async (
  tagList: (string | number)[][],
  signer: Signer,
  address: string,
) => {
  const minter = new Contract(address, eightBitMinter.abi, signer);
  await minter.updateTags(tagList);
};

const styleToBytes32 = async (style: string) => {
  return await ethers.encodeBytes32String(style);
}

export const makeLTags = async (styleList: string[], qty: number[]) => {
  const tags = [];
  let accu = 0;
  tags.push([await styleToBytes32(styleList[0]), accu, qty[0]]);
  for(let i = 1; i < styleList.length; i++) {
    accu += qty[i - 1];
    tags.push([await styleToBytes32(styleList[i]), accu, qty[i]]);
  }
  return tags;
};

const getSignature = async (signer: Signer, encodeHash: string) => {
  const hash = ethers.keccak256(encodeHash);
  const hashBytes = ethers.getBytes(hash);
  const hashFlatSig = await signer.signMessage(hashBytes);
  const hashSig = ethers.Signature.from(hashFlatSig);
  return hashSig;
};

const encodeMintInput = (input: MintInputStruct) => {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "uint16",
      "address",
      "uint256",
      "bytes32",
      "bytes32"
    ],
    [
      input.chainId,
      input.user,
      input.deadline,
      input.productCode,
      input.styleTag
    ]);
};

export const packMintInput = async (signer: Signer, mintInput: MintInputStruct): Promise<MintInputStruct> => {
  const hash = encodeMintInput(mintInput);
  const sig = await getSignature(signer, hash);
  return {
    chainId: mintInput.chainId,
    user: mintInput.user,
    deadline: mintInput.deadline,
    productCode: mintInput.productCode,
    styleTag: mintInput.styleTag,
    v: sig.v,
    r: sig.r,
    s: sig.s,
  };
};

export const mintOnchain = async (input: MintInputStruct, address: string, sender: Signer, value: bigint) => {
  const minter = new Contract(address, eightBitMinter.abi, sender);
  const tx = await minter.mint(input, { value: value });
  return tx;
};