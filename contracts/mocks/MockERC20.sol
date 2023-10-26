// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20{
	constructor(string memory name_,string memory symbol_) ERC20(name_, symbol_) {

	}

	function faucet(uint256 _amount) external {
		_mint(msg.sender, _amount);
	}
}