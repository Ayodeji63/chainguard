// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SupplyChainSource} from "../../src/SupplyChainSource.sol";

contract SupplyChainSourceTest is Test {
    SupplyChainSource public source;

    address admin;
    address manufacturer;
    address logistics1;
    address logistics2;
    address oracle;
    address attacker;

    uint256 ITEM_ID = 1;
    string RFID = "RFID123";

    function setUp() public {
        admin = address(this);
        manufacturer = makeAddr("manufacturer");
        logistics1 = makeAddr("logistics1");
        logistics2 = makeAddr("logistics2");
        oracle = makeAddr("oracle");
        attacker = makeAddr("attacker");

        source = new SupplyChainSource();

        // Setup roles
        source.addManufacturer(manufacturer);
        source.addLogistics(logistics1);
        source.addLogistics(logistics2);
        source.addOracle(oracle);
    }

    // ─────────────────────────────────────────────
    // ADMIN TESTS
    // ─────────────────────────────────────────────

    function testAdminIsSetCorrectly() public {
        assertEq(source.admin(), admin);
    }

    function testOnlyAdminCanAddRoles() public {
        vm.prank(attacker);
        vm.expectRevert("Not admin");
        source.addManufacturer(attacker);
    }

    // ─────────────────────────────────────────────
    // CREATE ITEM
    // ─────────────────────────────────────────────

    function testCreateItem() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        (uint256 id, , , , bool exists, , , , , , , ) = source.items(ITEM_ID);

        assertEq(id, ITEM_ID);
        assertTrue(exists);
    }

    function testCannotCreateDuplicateItem() public {
        vm.startPrank(manufacturer);
        source.createItem(RFID, "Factory");

        vm.expectRevert("Item already exists");
        source.createItem("RFID2", "Factory");
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────
    // SCAN ITEM
    // ─────────────────────────────────────────────

    function testScanItem() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        vm.prank(logistics1);
        source.scanItem(ITEM_ID, "Warehouse");

        (
            ,
            ,
            ,
            SupplyChainSource.Status status,
            ,
            string memory loc,
            ,
            ,
            ,
            ,
            ,

        ) = source.items(ITEM_ID);

        assertEq(uint(status), uint(SupplyChainSource.Status.InTransit));
        assertEq(loc, "Warehouse");
    }

    function testFraudDetection_ImpossibleTravel() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        vm.prank(logistics1);
        source.scanItem(ITEM_ID, "Location1");

        vm.prank(logistics1);
        vm.expectEmit(true, false, false, true);
        emit SupplyChainSource.FraudDetected(
            ITEM_ID,
            "Impossible travel: different location within time window",
            logistics1
        );

        source.scanItem(ITEM_ID, "Location2");
    }

    function testFraudDetection_FrequencyAbuse() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        vm.startPrank(logistics1);

        source.scanItem(ITEM_ID, "Loc1");
        source.scanItem(ITEM_ID, "Loc1");
        source.scanItem(ITEM_ID, "Loc1");

        vm.expectEmit(true, false, false, true);
        emit SupplyChainSource.FraudDetected(
            ITEM_ID,
            "Frequency abuse: too many scans in short window",
            logistics1
        );

        source.scanItem(ITEM_ID, "Loc1");
        vm.stopPrank();
    }

    function testFraudDetection_UnauthorizedScanner() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        vm.prank(logistics2);

        vm.expectEmit(true, false, false, true);
        emit SupplyChainSource.FraudDetected(
            ITEM_ID,
            "Unauthorized scan: caller is not current custodian",
            logistics2
        );

        source.scanItem(ITEM_ID, "Warehouse");
    }

    // ─────────────────────────────────────────────
    // HANDOFF
    // ─────────────────────────────────────────────

    function testHandoffItem() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        vm.prank(logistics1);
        source.scanItem(ITEM_ID, "Warehouse");

        vm.prank(logistics1);
        source.handoffItem(ITEM_ID, logistics2, "Transit");

        (, , address custodian, , , , , , , , , ) = source.items(ITEM_ID);

        assertEq(custodian, logistics2);
    }

    // ─────────────────────────────────────────────
    // ORACLE CONDITIONS
    // ─────────────────────────────────────────────

    function testReportConditions_Normal() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        vm.prank(oracle);
        source.reportConditions(ITEM_ID, 2500, 50, false);

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            SupplyChainSource.SensorReading memory reading,

        ) = source.items(ITEM_ID);

        assertEq(reading.temperature, 2500);
    }

    function testConditionBreach_Temperature() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        vm.prank(oracle);

        vm.expectEmit(true, false, false, true);
        emit SupplyChainSource.ConditionBreached(
            ITEM_ID,
            "TEMPERATURE",
            "Temperature exceeded maximum safe threshold"
        );

        source.reportConditions(ITEM_ID, 4000, 50, false);
    }

    function testConditionBreach_Humidity() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        vm.prank(oracle);

        vm.expectEmit(true, false, false, true);
        emit SupplyChainSource.ConditionBreached(
            ITEM_ID,
            "HUMIDITY",
            "Humidity exceeded maximum safe threshold"
        );

        source.reportConditions(ITEM_ID, 2000, 90, false);
    }

    function testConditionBreach_Tilt() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        vm.prank(oracle);

        vm.expectEmit(true, false, false, true);
        emit SupplyChainSource.ConditionBreached(
            ITEM_ID,
            "TILT",
            "Item was tilted beyond safe angle during transit"
        );

        source.reportConditions(ITEM_ID, 2000, 50, true);
    }

    // ─────────────────────────────────────────────
    // DELIVERY
    // ─────────────────────────────────────────────

    function testConfirmDelivery() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        vm.prank(manufacturer);
        source.confirmDelivery(ITEM_ID, "Store");

        (, , , SupplyChainSource.Status status, , , , , , , , ) = source.items(
            ITEM_ID
        );

        assertEq(uint(status), uint(SupplyChainSource.Status.Delivered));
    }

    // ─────────────────────────────────────────────
    // FLAG ITEM
    // ─────────────────────────────────────────────

    function testFlagItemByOracle() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        vm.prank(oracle);
        source.flagItem(ITEM_ID, "Fraud detected");

        (, , , SupplyChainSource.Status status, , , , , , , , ) = source.items(
            ITEM_ID
        );

        assertEq(uint(status), uint(SupplyChainSource.Status.Flagged));
    }

    function testFlagItemUnauthorized() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        vm.prank(attacker);
        vm.expectRevert("Not authorized to flag");

        source.flagItem(ITEM_ID, "Hack attempt");
    }

    // ─────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────

    function testGetItemByRFID() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        SupplyChainSource.Item memory item = source.getItemByRFID(RFID);

        assertEq(item.id, ITEM_ID);
    }

    function testGetStatus() public {
        vm.prank(manufacturer);
        source.createItem(RFID, "Factory");

        SupplyChainSource.Status status = source.getStatus(ITEM_ID);

        assertEq(uint(status), uint(SupplyChainSource.Status.Normal));
    }
}
