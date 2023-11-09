// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.17;

interface IAnimocaRacingVault {

  enum Stage { paused, stageOne, stageTwo, stageThree, end }

  struct Input {
    address user;
    uint256 amount;
    uint256 chainId;
    uint8 v;
    bytes32 r;
    bytes32 s;
  }

  function getStage() external view returns (Stage);
  function getUserStakedAt(address user, Stage stage) external view returns (uint256[] memory);
  function getTotalStakedAt(Stage stage) external view returns (uint256);

  function stake(uint256[] calldata tokenIds) external;
  function stakeAll() external;
  function claimAll(Input calldata input_) external;
}