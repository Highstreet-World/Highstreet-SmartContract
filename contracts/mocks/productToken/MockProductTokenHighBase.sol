// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../productToken/ProductTokenHighBase.sol";

contract MockProductTokenHighBase is ProductTokenHighBase {

  uint256 time;

  function calculateTradinReturn(uint32 _amount) public view virtual returns (uint256 price) {
      return _tradinReturn(_amount);
  }

  function setTimestamp(uint256 time_) external virtual {
    time = time_;
  }

  function now256() public view override returns (uint256) {
    if(time !=0) return time;
    return block.timestamp;
  }
  function tokenVersion() external virtual pure returns(string memory) {
      return 'V0';
  }
}