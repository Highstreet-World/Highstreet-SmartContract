// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract EthOracle is AggregatorV3Interface {

  function decimals() external pure returns (uint8) {
    return 8;
  }

  function description() external pure returns (string memory) {
    return "fake eth oracle";
  }

  function version() external pure returns (uint256) {
    return 4;
  }

  function getRoundData(uint80 _roundId) external pure returns (
    uint80 roundId,
    int256 answer,
    uint256 startedAt,
    uint256 updatedAt,
    uint80 answeredInRound
  ) {
    _roundId;
    return (
      110680464442257316870,
      186674255000,
      1698893735,
      1698893735,
      110680464442257316870
    );
  }

  function latestRoundData() external pure returns (
    uint80 roundId,
    int256 answer,
    uint256 startedAt,
    uint256 updatedAt,
    uint80 answeredInRound
  ) {
    return (
      110680464442257316870,
      186674255000,
      1698893735,
      1698893735,
      110680464442257316870
    );
  }
}
