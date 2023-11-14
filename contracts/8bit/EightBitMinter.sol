// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { TimeLimit } from "../common/TimeLimit.sol";
import { EightBit } from "./EightBit.sol";

contract EightBitMinter is Ownable, TimeLimit, Pausable, ReentrancyGuard {

  /// @dev 8bit nft address
  EightBit public eightBit;
  /// @dev minting fee for platform
  uint256 public mintingFee;
  /// @dev signer of mint input
  address public signer;
  /// @dev styleTag bytes => id threshold
  mapping (bytes32 => Tags) public styleTable;
  /// @dev next style id from given style
  mapping (bytes32 => uint16) private nextStyleId;
  /// @dev minting status
  mapping (bytes32 => bool) internal orderMinted;

  /**
   * @dev Fired in updateMintingFee()
   *
   * @param updatedFee is the fee of current updated fee
   */
  event UpdateMintingFee(uint256 updatedFee);
  /**
   * @dev Fired in updateSigner()
   *
   * @param signer new signer address
   */
  event UpdateSigner(address signer);

  /**
   * @dev Fired in mint()
   *
   * @param from is the sender who wants to mint token
   * @param styleTag is the styleTag sender wants to mint
   * @param productCode is unique id represented a sepcific item
   * @param tokenId is the id from 8bit minter
   * @param mintingFee is the fee that sender pays for minting token
   */
  event Mint(address indexed from, bytes32 styleTag,  bytes32 productCode, uint256 tokenId, uint256 mintingFee);

  struct MintInput {
    uint16 chainId;
    address user;
    uint256 deadline;
    bytes32 productCode;
    bytes32 styleTag;
    uint8 v;
    bytes32 r;
    bytes32 s;
  }

  struct Tags {
    bytes32 name;
    uint16 idLevel;
    uint16 quantity;
  }

  /**
   * @dev Creates/deploys an instance of the NFT
   *
   * @param eightBit_ the address for 8bit contract
   * @param signer_ default signer that sign the minting input
   * @param mintingFee_ default minting fee
   * @param startTime_ default startingTime for mint
   */
  constructor(
    address eightBit_,
    address signer_,
    uint256 mintingFee_,
    uint256 startTime_
  ) {
    eightBit = EightBit(eightBit_);
    signer = signer_;
    mintingFee = mintingFee_;
    startTime = startTime_;
  }

  /**
   * @dev check if styleTag is still available
   *
   * @notice will revert if styleTag doesn't exist
   *
   * @param styleTag_ the styleTag_ that you want to query
   *
   * @return bool if token exist
   */
  function isValidTag(bytes32 styleTag_) public view returns (bool) {
    require(styleTable[styleTag_].quantity != 0, "Invalid: styleTag not exist");
    if (nextStyleId[styleTag_] >= styleTable[styleTag_].quantity) {
      return false;
    }
    return true;
  }

  /**
   * @dev check if order has been minted
   *
   * @param input_ the order you like to query
   *
   * @return bool return true if order is minted
   */
  function checkOrderStatus(MintInput memory input_) public view returns (bool) {
    bytes32 inputHash = keccak256(abi.encodePacked(input_.productCode, input_.styleTag));
    return orderMinted[inputHash];
  }

  /**
   * @dev update styleTag by batch
   *
   * @notice this function could only call by owner
   *
   * @param tagLists_[] a collections of tags
   */
  function updateTags(Tags[] memory tagLists_) external onlyOwner {
    for(uint i; i < tagLists_.length; ++i) {
      Tags memory Tag = tagLists_[i];
      styleTable[Tag.name] = Tag;
    }
  }

  /**
   * @dev updateSigner
   *
   * @notice this function could only call by owner
   *
   * @param signer_ is a new signer address
   */
  function updateSigner(address signer_) external onlyOwner {
    signer = signer_;
    emit UpdateSigner(signer);
  }

  /**
   * @dev update mintingFee
   *
   * @notice this function could only call by owner
   *
   * @param updateFee_ is a new setup mintingFee
   */
  function updateMintingFee(uint256 updateFee_) external onlyOwner {
    mintingFee = updateFee_;
    emit UpdateMintingFee(updateFee_);
  }

  /**
   * @dev update startTime
   *
   * @notice this function could only call by owner
   *
   * @param newStartTime_ new time to start mint
   */
  function updateStartTime(uint256 newStartTime_) external onlyOwner {
    _updateStartTime(newStartTime_, _msgSender()); 
  }

  /**
   * @dev pause the minting process
   *
   * @notice this function could only call by owner
   */
  function pause() external onlyOwner {
    _pause();
  }

  /**
   * @dev unpause the minting process
   *
   * @notice this function could only call by owner
   */
  function unpause() external onlyOwner {
    _unpause();
  }

  /**
   * @dev withdraw all mintingFee
   *
   * @notice this function could only call by owner
   */
  function ownerWithdraw() external onlyOwner {
    payable(owner()).transfer(address(this).balance);
  }

  /**
   * @dev mint function
   *
   * @notice the input_ should be signed by signer first
   *
   * @param input_ a structure of user input
   */
  function mint(MintInput memory input_)
    external
    payable
    nonReentrant
    whenNotPaused
    afterStartTime
  {
    bytes32 inputHash = keccak256(abi.encodePacked(input_.productCode, input_.styleTag));
    require(msg.value >= mintingFee, "Require payment fee");
    require(block.timestamp <= input_.deadline, "Execution exceed deadline");
    require(!checkOrderStatus(input_), "Minted already");
    _verifyInputSignature(input_);
    orderMinted[inputHash] = true;
    _mint(input_);
  }

  function _verifyInputSignature(MintInput memory input_) internal view {
    uint chainId;
    assembly {
      chainId := chainid()
    }
    require(input_.chainId == chainId, "Invalid network");
    bytes memory encodeData = abi.encode(input_.chainId, input_.user, input_.deadline , input_.productCode, input_.styleTag);
    bytes32 hash_ = keccak256(encodeData);
    bytes32 appendEthSignedMessageHash = ECDSA.toEthSignedMessageHash(hash_);
    address inputSigner = ECDSA.recover(appendEthSignedMessageHash, input_.v, input_.r, input_.s);
    require(signer == inputSigner, "Invalid signer");
  }

  function _mint(MintInput memory input_) internal {
    require(isValidTag(input_.styleTag), "mint exceeed token max");
    Tags memory Tag = styleTable[input_.styleTag];
    uint256 tagId = nextStyleId[input_.styleTag] + Tag.idLevel;
    eightBit.safeMint(input_.user, tagId);

    ++nextStyleId[input_.styleTag];
    uint256 refund = msg.value - mintingFee;
    if (refund > 0) {
      payable(_msgSender()).transfer(refund);
    }
    emit Mint(input_.user, input_.styleTag, input_.productCode, tagId, mintingFee);
  }
}