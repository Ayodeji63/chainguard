// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract KwalaTokenTest {
    event TokenTest(
        uint256 indexed id,
        address indexed user,
        uint256 amount,
        string message
    );

    uint256 public count;

    // Call this on Base Sepolia to trigger Kwala
    function trigger(uint256 amount, string calldata message) external {
        count++;
        emit TokenTest(count, msg.sender, amount, message);
    }

    // Kwala calls this on Optimism Sepolia
    function receiveTrigger(
        uint256 id,
        address user,
        uint256 amount,
        string calldata message
    ) external {
        // In a real token flow you would mint/transfer ERC20 here
        emit TokenTest(id, user, amount, message);
    }
}
