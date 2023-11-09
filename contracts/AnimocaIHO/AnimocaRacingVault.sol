// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import { AnimocaHome } from "./AnimocaHome.sol";
import { IAnimocaRacingVault } from "./interfaces/IAnimocaRacingVault.sol";
import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";

contract AnimocaRacingVault is Ownable2Step, IAnimocaRacingVault, ReentrancyGuard, Pausable, IERC721Receiver {

  using SafeERC20 for IERC20;

  /// @dev Max staked amount per person
  uint256 public constant MAX_STAKED_AMOUNT = 100;
  /// @dev starting time for users to stake their animocaRVs
  uint256 public immutable startTime;
  /// @dev start time and end time for user to claim and get reward
  uint256[2] public claimTimes;
  /// @dev Get the time of each PQ starts (which represents the staking period is shifted to the next stage)
  uint256[3] public preQualification;
  /// @dev User staked tokens at each stages
  mapping(address => mapping(Stage => uint256[])) public userStaked;
  /// @dev User had claimed reward or not
  mapping(address => bool) public userClaimedReward;
  /// @dev Total staked amount of each stages
  mapping(Stage => uint256) public totalStaked;
  
  /// @dev animmocaRv nft address
  AnimocaHome public immutable animocaRv;
  /// @dev high token address
  IERC20 public immutable high;
  /// @dev admin signer address
  address public adminSigner;

  /**
   * @dev Fired in stake() and stakeAll()
   *
   * @param user is the address who staked tokens
   * @param stage is the stage that user staked at
   * @param tokenIds is the tokens that user staked
   * @param timestamp is the timestamp that user staked at
   */
  event Stake(address user, Stage stage, uint256[] tokenIds, uint256 timestamp);
  /**
   * @dev Fired in claimAll()
   *
   * @param claimer is the address who calls claimAll function
   * @param user is the address who get the reward
   * @param amount is amount of high that user get
   * @param timestamp is the timestamp that user claim reward at
   */
  event Claim(address claimer, address user, uint256 amount, uint256 timestamp);

  /**
   * @dev Creates/deploys an instance of the AnimocaRacingVault
   * 
   * @param startTime_ starting time for users to stake their animocaRVs
   * @param preQualification_ time for pre-qualification race
   * @param animocaRv_ animmocaRv nft address
   * @param adminSigner_ admin signer address
   * @param high_ high token address
   */
  constructor(
    uint256 startTime_,
    uint256[2] memory claimTime_,
    uint256[3] memory preQualification_,
    AnimocaHome animocaRv_,
    address adminSigner_,
    address high_
  ) {
    startTime = startTime_;
    claimTimes[0] = claimTime_[0];
    claimTimes[1] = claimTime_[1];
    preQualification[0] = preQualification_[0];
    preQualification[1] = preQualification_[1];
    preQualification[2] = preQualification_[2];
    animocaRv = animocaRv_;
    require(address(animocaRv_) != address(0), "AnimocaRV cant be zero address");
    require(adminSigner_ != address(0), "adminSigner cant be zero address");
    require(high_ != address(0), "High cant be zero address");
    adminSigner = adminSigner_;
    high = IERC20(high_);
  }

  /**
   * @dev Get current stage in staking process
   * 
   * @notice We have 5 stages in total.Stage.paused is for time before the staking period starts.
   * StageOne is the time period before PQ1 starts. StageTwo is the time period before PQ2 starts.
   * StageThree is the time period before PQ3 starts. End represents that the whole staking period
   * is finished and waiting for the final result(off-chain races). 
   *
   * @return Stages at different time
   */
  function getStage() public view returns (Stage) {
    if (block.timestamp < startTime) {
      return Stage.paused;
    } else if (block.timestamp < preQualification[0]) {
      return Stage.stageOne;
    } else if (block.timestamp < preQualification[1]) {
      return Stage.stageTwo;
    } else if (block.timestamp < preQualification[2]) {
      return Stage.stageThree;
    } else {
      return Stage.end;
    }
  }

  /**
   * @dev Get the user's staked tokens at each stage
   * 
   * @param user is the user which we want to query
   * @param stage is the stage which we want to query
   *
   * @return uint256[] Tokens that user staked
   */
  function getUserStakedAt(address user, Stage stage) public view returns (uint256[] memory) {
    return userStaked[user][stage];
  }

  /**
   * @dev Get the total staked amount of each stage
   * 
   * @param stage is the stage which we want to query
   *
   * @return uint256 Tokens amounts that users staked at corresponding stage
   */
  function getTotalStakedAt(Stage stage) public view returns (uint256) {
    return totalStaked[stage];
  }

  /**
   * @dev stake function, stake selected tokenIds to stake in animocaRacingVault
   *
   * @notice this function could only be used within staking period
   *
   * @param tokenIds is selected tokenIds that user is willing to stake
   */
  function stake(uint256[] calldata tokenIds) external nonReentrant whenNotPaused {
    (bool isStaking, Stage stage)  = _isStaking();
    address user = _msgSender();
    uint256 userStakedAmount = userStaked[user][Stage.stageOne].length + userStaked[user][Stage.stageTwo].length + userStaked[user][Stage.stageThree].length;
    require(isStaking, "Staking is closed");
    require(tokenIds.length > 0, "Cannot stake nothing");
    require(userStakedAmount + tokenIds.length <= MAX_STAKED_AMOUNT, "exceed maximum stake amount");

    for (uint256 i = 0; i < tokenIds.length;) {
      userStaked[user][stage].push(tokenIds[i]);
      unchecked {
        ++i;
      }
    }

    totalStaked[stage] += tokenIds.length;
    animocaRv.safeBatchTransferFrom(user, address(this), tokenIds);
    emit Stake(user, stage, tokenIds, block.timestamp);
  }

  /**
   * @dev stakeAll function, stake all tokenIds from msg.sender in animocaRacingVault
   *
   * @notice this function could only be used within staking period
   */
  function stakeAll() external nonReentrant whenNotPaused {
    (bool isStaking, Stage stage) = _isStaking();
    require(isStaking, "Staking is closed");
    address user = _msgSender();
    uint256 userOwned = animocaRv.balanceOf(user);
    uint256 userStakedAmount = userStaked[user][Stage.stageOne].length + userStaked[user][Stage.stageTwo].length + userStaked[user][Stage.stageThree].length;
    require(userOwned > 0, "User does not own RV");
    require(userStakedAmount + userOwned <= MAX_STAKED_AMOUNT, "exceed maximum stake amount");
    uint256 lastTokenIndex = userOwned - 1;
    uint256[] memory tokenIds = new uint256[](userOwned);

    for (uint256 i = 0; i < userOwned;) {
      uint256 tokenId = animocaRv.tokenOfOwnerByIndex(user, lastTokenIndex);
      tokenIds[i] = tokenId;
      animocaRv.safeTransferFrom(user, address(this), tokenId);
      userStaked[user][stage].push(tokenId);

      unchecked {
        ++i;
        --lastTokenIndex;
      }
    }

    totalStaked[stage] += userOwned;
    emit Stake(user, stage, tokenIds, block.timestamp);
  }

  /**
   * @dev claimRV function, withdraw user's nfts without getting the reward
   * 
   * @notice this function could only be call after claimEndTime
   *
   * @param user is user who would like to withdraw
   */
  function claimRVOnly(address user) external nonReentrant whenNotPaused {
    (bool isStaking, ) = _isStaking();
    require(!isStaking, "Cannot withdraw within staking");
    require(block.timestamp > claimTimes[1], "Cant claim before claimEndTime");
    _returnRv(user);
  }

  /**
   * @dev emergencyWithdrawHigh function, withdraw high from vault
   * 
   * @notice this function could only be call by owner
   *
   * @param receiver is address that high would sender to
   */
  function emergencyWithdrawHigh(address receiver) external onlyOwner {
    require(block.timestamp > claimTimes[1], "Cant withdraw before claimEndTime");
    uint256 balance = high.balanceOf(address(this));
    high.safeTransfer(receiver, balance);
  }

  /**
    * @dev setAdminSigner function to update adminSigner
    * 
    * @notice this function can only be called by owner
    *
    * @param adminSigner_ new admin signer address
    */
  function setAdminSigner(address adminSigner_) external onlyOwner {
    require(adminSigner_ != address(0), "adminSigner cant be zero address");
    adminSigner = adminSigner_;
  }

  /**
    * @dev pause the contract
    * 
    * @notice this function can only be called by owner
    */
  function pause() external onlyOwner {
    _pause();
  }

  /**
    * @dev unpause the contract
    * 
    * @notice this function can only be called by owner
    */
  function unpause() external onlyOwner {
    _unpause();
  }

  /**
    * @dev onERC721Received enable this contract to receive erc721 token
    */
  function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4){
    return IERC721Receiver.onERC721Received.selector;
  }

  /**
   * @dev claimAll function, withdraw staked nfts and reward from vault contract
   * 
   * @notice this function could only be used while time isn't in staking period
   * @notice the input_ should be signed by signer first
   *
   * @param input_ is a structure of user input
   */
  function claimAll(Input memory input_) external nonReentrant whenNotPaused {
    _verifyInputSignature(input_);
    (bool isStaking, ) = _isStaking();
    address user = input_.user;

    require(isStaking == false, "Cannot claim within race");
    require(block.timestamp >= claimTimes[0] && block.timestamp <= claimTimes[1], "Claim between start and end");
    require(!userClaimedReward[user], "User already claimed");

    userClaimedReward[user] = true;
    _returnRv(user);
    high.safeTransfer(user, input_.amount);
    emit Claim(_msgSender(), user, input_.amount, block.timestamp);
  }

  /**
   * @dev _verifyInputSignature function, verify if signature is signed by admin signer or not
   * 
   * @notice this function could only be used while time is after staking period
   * @notice the input_ should be signed by signer first
   *
   * @param input_ is a structure of user input
   */
  function _verifyInputSignature(Input memory input_) internal view {
    uint chainId;
    assembly { chainId := chainid() }
    require(input_.chainId == chainId, "Invalid network");
    bytes32 hash_ = keccak256(abi.encode(address(this), input_.user, input_.amount, input_.chainId));
    bytes32 appendEthSignedMessageHash = ECDSA.toEthSignedMessageHash(hash_);
    address inputSigner = ECDSA.recover(appendEthSignedMessageHash, input_.v, input_.r, input_.s);
    require(adminSigner == inputSigner, "Invalid signer");
  }

  /**
   * @dev _returnRv function, return all staked tokens back to user 
   *
   * @param user is a the user who withdraw or claimAll
   */
  function _returnRv(address user) internal {

    if (userStaked[user][Stage.stageOne].length > 0) {
      animocaRv.safeBatchTransferFrom(address(this), user, userStaked[user][Stage.stageOne]);
      delete userStaked[user][Stage.stageOne];
    }

    if (userStaked[user][Stage.stageTwo].length > 0) {
      animocaRv.safeBatchTransferFrom(address(this), user, userStaked[user][Stage.stageTwo]);
      delete userStaked[user][Stage.stageTwo];
    }

    if (userStaked[user][Stage.stageThree].length > 0) {
      animocaRv.safeBatchTransferFrom(address(this), user, userStaked[user][Stage.stageThree]);
      delete userStaked[user][Stage.stageThree];
    }
  }

  /**
   * @dev _isStaking function, return if is in staking period or not and current stage
   *
   * @return bool if is in staking period or not
   * @return stage current stage status
   */
  function _isStaking() internal view returns (bool, Stage){
    Stage stage = getStage();
    if (stage == Stage.stageOne || stage == Stage.stageTwo || stage == Stage.stageThree) {
      return (true, stage);
    } else {
      return (false, stage);
    }
  }
}