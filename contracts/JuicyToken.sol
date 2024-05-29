// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract JuicyToken is ERC20{
    constructor(uint256 mintAmount)
    ERC20('Test name', 'Test Symbol')
    {
        _mint(msg.sender, mintAmount);
    }
}