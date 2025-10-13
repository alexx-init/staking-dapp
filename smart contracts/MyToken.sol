// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MyToken — simple ERC20 with fixed supply
contract MyToken is ERC20, Ownable {
    constructor() ERC20("Alexx Token", "ALX") Ownable(msg.sender) {
        // Mint total supply to deployer (owner)
        _mint(msg.sender, 100_000_000 * 10 ** decimals());
    }

    /// @notice Allow owner to rescue tokens accidentally sent to this contract
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(this), "cannot rescue self");
        IERC20(token).transfer(to, amount);
    }
}

