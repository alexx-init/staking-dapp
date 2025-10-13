// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Staking is Ownable {
    IERC20 public stakeToken;

    uint256 public totalStaked;
    uint256 public rewardRate = 1e16; // 0.01 token per second per token staked (adjust later)
    uint256 public rewardPool = 50_000_000 * 10 ** 18; // 50 million tokens for rewards

    struct Staker {
        uint256 amount;
        uint256 rewardDebt;
        uint256 lastUpdate;
    }

    mapping(address => Staker) public stakers;

    constructor(address _stakeToken) Ownable(msg.sender) {
        stakeToken = IERC20(_stakeToken);
    }

    // Stake tokens
    function stake(uint256 _amount) external {
        require(_amount > 0, "Amount must be > 0");
        Staker storage user = stakers[msg.sender];

        // Update pending rewards
        if (user.amount > 0) {
            uint256 pending = calculateReward(msg.sender);
            user.rewardDebt += pending;
        }

        // Transfer tokens
        stakeToken.transferFrom(msg.sender, address(this), _amount);

        user.amount += _amount;
        user.lastUpdate = block.timestamp;
        totalStaked += _amount;
    }

    // Unstake tokens and claim rewards
    function unstake(uint256 _amount) external {
        Staker storage user = stakers[msg.sender];
        require(user.amount >= _amount, "Not enough staked");

        uint256 pending = calculateReward(msg.sender) + user.rewardDebt;

        // Update staker info
        user.amount -= _amount;
        user.rewardDebt = 0;
        user.lastUpdate = block.timestamp;
        totalStaked -= _amount;

        // Transfer rewards and staked tokens
        if (pending > 0 && rewardPool >= pending) {
            rewardPool -= pending;
            stakeToken.transfer(msg.sender, pending);
        }

        stakeToken.transfer(msg.sender, _amount);
    }

    // View pending reward
    function calculateReward(address _user) public view returns (uint256) {
        Staker storage user = stakers[_user];
        if (user.amount == 0) return 0;

        uint256 timeDiff = block.timestamp - user.lastUpdate;
        uint256 reward = (user.amount * rewardRate * timeDiff) / 1e18;
        return reward;
    }

    // Owner can refill reward pool
    function refillRewards(uint256 _amount) external onlyOwner {
        stakeToken.transferFrom(msg.sender, address(this), _amount);
        rewardPool += _amount;
    }
}
