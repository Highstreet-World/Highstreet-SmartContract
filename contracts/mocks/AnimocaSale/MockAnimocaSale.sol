// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../AnimocaIHO/AnimocaHome.sol";
import "../../AnimocaIHO/AnimocaSale.sol";
import "../../AnimocaIHO/interfaces/IAnimocaSale.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockAnimocaSale is AnimocaSale {

  uint256 public customTime;

  constructor(
    IERC20 high_,
    AnimocaHome animocaNft_,
    IERC721 duck_,
    uint256[2] memory batch1Time_,
    uint256[2] memory batch2Time_
  ) AnimocaSale(high_, animocaNft_, duck_, batch1Time_, batch2Time_) {}

  function setNowTimestamp(uint256 newTime_) public {
    customTime = newTime_;
  }

  function nowTimestamp() public view override returns (uint256) {
    return customTime;
  }
}
