// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.9;

contract TimeLimit {

  /// @dev Start time of behavior.
  uint256 public startTime;
  /// @dev End time of behavior.
  uint256 public endTime;

  event UpdateStartTime(uint256 newStartTime, address operator);
  event UpdateEndTime(uint256 newEndTime, address operator);


  modifier afterStartTime() {
    require(block.timestamp > startTime, "TimeLimit: behavior restricted after startTime");
    _;
  }

  modifier beforeStartTime() {
    require(block.timestamp < startTime, "TimeLimit: behavior restricted before startTime");
    _;
  }

  modifier afterEndTime() {
    require(block.timestamp > endTime, "TimeLimit: behavior restricted after endTime");
    _;
  }

  modifier beforeEndTime() {
    require(block.timestamp < endTime, "TimeLimit: behavior restricted before endTime");
    _;
  }

  function _updateStartTime(uint256 startTime_, address operator_) internal {
    startTime = startTime_;
    emit UpdateStartTime(startTime, operator_);
  }

  function _updateEndTime(uint256 endTime_, address operator_) internal {
    endTime = endTime_;
    emit UpdateEndTime(endTime, operator_);
  }
}