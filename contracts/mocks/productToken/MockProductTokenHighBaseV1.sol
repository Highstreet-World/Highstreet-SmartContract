// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "./MockProductTokenHighBase.sol";

contract MockProductTokenHighBaseV1 is MockProductTokenHighBase {

    function tokenVersion() external override pure returns(string memory) {
        return 'V1';
    }
}