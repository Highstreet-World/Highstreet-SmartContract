// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17; 

interface IAnimocaSaleBatch3 {

  struct Package {
    uint256 index;
    uint256 amount;
  }

  function buyBatch3OpenSale(Package[] memory packages) external payable;
  function isOpened() external view returns (bool);
  function hasDiscount(address account) external view returns (bool);
  function getPackageLeft(uint256 package) external view returns (uint256);
  function getTokenLeft() external view returns (uint256);
  function setBatch3Time(uint256[2] memory newTime) external;
  function getPriceInEth(address account, uint256 amount) external view returns (uint256);
  function getPriceInHigh(address account, uint256 amount) external view returns (uint256);
}