// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TransferContract {
    IERC20 public immutable token;

    constructor(IERC20 _token){
        token = _token;
    }

    function transferToken(address to, uint256 amount) external {
        token.transfer(to, amount);
    }
}
