// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {SupplyChainSource} from "../src/SupplyChainSource.sol";
import {SupplyChainReceiver} from "../src/SupplyChainReceiver.sol";
import {SupplyChainToken} from "../src/SupplyChainToken.sol";
import {SupplyChainEscrow} from "../src/SupplyChainEscrow.sol";
import {KwalaTokenTest} from "../src/Kwalatest.sol";
// Smart Wallets
/**
    Base-Sepolia: 0x9061e42f972c8b4ffe1848ef6d151afcdbee209e
    Op-Sepolia: 0x9061e42f972c8b4ffe1848ef6d151afcdbee209e
 */
contract DeploySource is Script {
    SupplyChainSource public source;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        source = new SupplyChainSource();

        vm.stopBroadcast();
    }

    // 0x7eb6b92744808E2934B468FF3A97AEB20f524933 == Base Sepolia
}

contract DeployReceiver is Script {
    SupplyChainReceiver public receiver;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        receiver = new SupplyChainReceiver();

        vm.stopBroadcast();

        // 0x7eb6b92744808E2934B468FF3A97AEB20f524933 == OP Sepolia
    }
}

contract DeployToken is Script {
    SupplyChainToken public token;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        token = new SupplyChainToken(1_000_000 ether);

        vm.stopBroadcast();

        // 0xb0C1CdeC1Be918f9E232Bc7B96186035858CccFD == Op Sepolia
        // 0xb0C1CdeC1Be918f9E232Bc7B96186035858CccFD == Base Sepolia
    }
}

contract DeployEscrow is Script {
    SupplyChainEscrow public escrow;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();
        address tokenAddress = 0x1DE0046d87736c32DB5e10459F3409Afc5C3E0DE; // Base Sepolia token address
        uint64 chainId = 84532; // Base Sepolia chain ID

        escrow = new SupplyChainEscrow(tokenAddress, chainId);

        vm.stopBroadcast();

        // 0xa50A8774D917cDD655CA96a383E7CB83436177a1 == Base Sepolia
    }
}

contract DeployKwalaTokenTest is Script {
    KwalaTokenTest public KwalaToken;

    function setUp() public {}
    function run() public {
        vm.startBroadcast();
        KwalaToken = new KwalaTokenTest();
        vm.stopBroadcast();
    }
}
