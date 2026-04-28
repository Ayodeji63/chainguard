// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SupplyChainReceiver} from "../../src/SupplyChainReceiver.sol";

contract SupplyChainReceiverTest is Test {
    SupplyChainReceiver receiver;

    address admin;
    address kwala;      // authorized caller (simulating Kwala)
    address attacker;

    uint256 ITEM_ID = 1;

    function setUp() public {
        admin = address(this);
        kwala = makeAddr("kwala");
        attacker = makeAddr("attacker");

        receiver = new SupplyChainReceiver();

        // grant Kwala permission
        receiver.addAuthorizedCaller(kwala);
    }

    // ─────────────────────────────────────────────
    // ADMIN TESTS
    // ─────────────────────────────────────────────

    function testAdminSetCorrectly() public {
        assertEq(receiver.admin(), admin);
    }

    function testOnlyAdminCanAddAuthorizedCaller() public {
        vm.prank(attacker);
        vm.expectRevert("Not admin");

        receiver.addAuthorizedCaller(attacker);
    }

    function testRemoveAuthorizedCaller() public {
        receiver.removeAuthorizedCaller(kwala);
        assertFalse(receiver.authorizedCallers(kwala));
    }

    // ─────────────────────────────────────────────
    // MIRROR ITEM
    // ─────────────────────────────────────────────

    function testMirrorItem() public {
        vm.prank(kwala);

        receiver.mirrorItem(ITEM_ID, "Warehouse", 11155111);

        (
            uint256 id,
            SupplyChainReceiver.Status status,
            bool exists,
            string memory location,
            ,
            ,
            uint64 chainId
        ) = receiver.items(ITEM_ID);

        assertEq(id, ITEM_ID);
        assertTrue(exists);
        assertEq(uint(status), uint(SupplyChainReceiver.Status.Normal));
        assertEq(location, "Warehouse");
        assertEq(chainId, 11155111);
    }

    function testMirrorItemUnauthorized() public {
        vm.prank(attacker);
        vm.expectRevert("Not authorized");

        receiver.mirrorItem(ITEM_ID, "Warehouse", 1);
    }

    // ─────────────────────────────────────────────
    // FLAG ITEM
    // ─────────────────────────────────────────────

    function testFlagItemExisting() public {
        // first mirror
        vm.prank(kwala);
        receiver.mirrorItem(ITEM_ID, "Warehouse", 1);

        // then flag
        vm.prank(kwala);
        receiver.flagItem(ITEM_ID, "Fraud detected");

        (
            ,
            SupplyChainReceiver.Status status,
            ,
            ,
            string memory reason,
            ,
        ) = receiver.items(ITEM_ID);

        assertEq(uint(status), uint(SupplyChainReceiver.Status.Flagged));
        assertEq(reason, "Fraud detected");
    }

    function testFlagItemAutoCreatesIfNotExists() public {
        vm.prank(kwala);
        receiver.flagItem(ITEM_ID, "Auto flagged");

        (
            uint256 id,
            SupplyChainReceiver.Status status,
            bool exists,
            string memory location,
            string memory reason,
            ,
            uint64 chainId
        ) = receiver.items(ITEM_ID);

        assertEq(id, ITEM_ID);
        assertTrue(exists);
        assertEq(uint(status), uint(SupplyChainReceiver.Status.Flagged));
        assertEq(location, "Unknown");
        assertEq(reason, "Auto flagged");
        assertEq(chainId, 0);
    }

    function testFlagItemUnauthorized() public {
        vm.prank(attacker);
        vm.expectRevert("Not authorized");

        receiver.flagItem(ITEM_ID, "Hack attempt");
    }

    // ─────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────

    function testEmitItemMirrored() public {
        vm.prank(kwala);

        vm.expectEmit(true, false, false, true);
        emit SupplyChainReceiver.ItemMirrored(ITEM_ID, 1, "Warehouse");

        receiver.mirrorItem(ITEM_ID, "Warehouse", 1);
    }

    function testEmitItemFlagged() public {
        vm.prank(kwala);

        vm.expectEmit(true, false, false, true);
        emit SupplyChainReceiver.ItemFlagged(
            ITEM_ID,
            "Fraud detected",
            kwala
        );

        vm.expectEmit(true, false, false, true);
        emit SupplyChainReceiver.ItemStatusUpdated(
            ITEM_ID,
            SupplyChainReceiver.Status.Flagged
        );

        receiver.flagItem(ITEM_ID, "Fraud detected");
    }

    // ─────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────

    function testGetItem() public {
        vm.prank(kwala);
        receiver.mirrorItem(ITEM_ID, "Warehouse", 1);

        SupplyChainReceiver.MirroredItem memory item =
            receiver.getItem(ITEM_ID);

        assertEq(item.id, ITEM_ID);
    }

    function testGetStatus() public {
        vm.prank(kwala);
        receiver.mirrorItem(ITEM_ID, "Warehouse", 1);

        SupplyChainReceiver.Status status =
            receiver.getStatus(ITEM_ID);

        assertEq(uint(status), uint(SupplyChainReceiver.Status.Normal));
    }

    function testGetStatusRevertsIfNotExists() public {
        vm.expectRevert("Item not found");
        receiver.getStatus(999);
    }

    function testIsFlagged() public {
        vm.prank(kwala);
        receiver.flagItem(ITEM_ID, "Fraud");

        bool flagged = receiver.isFlagged(ITEM_ID);

        assertTrue(flagged);
    }
}