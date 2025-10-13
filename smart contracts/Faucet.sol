// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Faucet is Ownable {
    IERC20 public token;
    uint256 public claimAmount = 100 * 10 ** 18; // each user gets 100 tokens
    mapping(address => bool) public claimed;

    constructor(address _token) Ownable(msg.sender) {
        token = IERC20(_token);
    }

    function claim() external {
        require(!claimed[msg.sender], "You already claimed tokens");
        claimed[msg.sender] = true;
        require(token.balanceOf(address(this)) >= claimAmount, "Not enough tokens in faucet");
        token.transfer(msg.sender, claimAmount);
    }

    function withdrawTokens(address _to, uint256 _amount) external onlyOwner {
        token.transfer(_to, _amount);
    }

    function setClaimAmount(uint256 _newAmount) external onlyOwner {
        claimAmount = _newAmount;
    }
}
