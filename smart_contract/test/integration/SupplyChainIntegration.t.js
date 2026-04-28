// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

import {SupplyChainToken} from "../../src/SupplyChainToken.sol";
import {SupplyChainSource} from "../../src/SupplyChainSource.sol";
import {SupplyChainReceiver} from "../../src/SupplyChainReceiver.sol";
import {SupplyChainEscrow} from "../../src/SupplyChainEscrow.sol";

contract SupplyChainIntegrationTest is Test {
    SupplyChainToken tokenA;
    SupplyChainToken tokenB;
    SupplyChainSource source;
    SupplyChainReceiver receiver;
    SupplyChainEscrow escrow;

    address admin;
    address manufacturer;
    address logistics;
    address oracle;
    address wholesaler;
    address kwala;
    address attacker;

    uint64 constant CHAIN_A = 80002;
    uint64 constant CHAIN_B = 84532;
    uint256 constant ITEM_ID = 1;
    uint256 constant ORDER_ID = 1;
    uint256 constant ORDER_VALUE = 100 ether;
    uint256 constant BOND = 20 ether;

    // ✅ FIX: Match event names EXACTLY to contract event signatures
    //         so Foundry topic0 hashes align correctly
    event FraudDetected(uint256 indexed id, string reason, address flaggedBy);
    event ConditionBreached(
        uint256 indexed id,
        string breachType,
        string details
    );

    function setUp() public {
        admin = address(this);
        manufacturer = makeAddr("manufacturer");
        logistics = makeAddr("logistics");
        oracle = makeAddr("oracle");
        wholesaler = makeAddr("wholesaler");
        kwala = makeAddr("kwala");
        attacker = makeAddr("attacker");

        tokenA = new SupplyChainToken(10_000_000 ether);
        tokenB = new SupplyChainToken(0);

        source = new SupplyChainSource();
        receiver = new SupplyChainReceiver();
        escrow = new SupplyChainEscrow(address(tokenA), CHAIN_A);

        source.addManufacturer(manufacturer);
        source.addLogistics(logistics);
        source.addOracle(oracle);

        receiver.addAuthorizedCaller(kwala);

        tokenA.addBurner(address(escrow));
        tokenB.addMinter(kwala);

        tokenA.transfer(manufacturer, 10_000 ether);
        tokenA.transfer(logistics, 10_000 ether);
        tokenA.transfer(wholesaler, 10_000 ether);

        vm.prank(logistics);
        tokenA.approve(address(escrow), type(uint256).max);

        vm.prank(wholesaler);
        tokenA.approve(address(escrow), type(uint256).max);
    }

    // ─────────────────────────────────────────────
    //  ✅ FULL HAPPY PATH
    // ─────────────────────────────────────────────

    function testFullHappyPathCrossChainPayment() public {
        vm.prank(manufacturer);
        source.createItem(ITEM_ID, "RFID-001", "Factory Lagos");

        vm.prank(manufacturer);
        escrow.createOrder(
            ORDER_ID,
            ITEM_ID,
            logistics,
            CHAIN_A,
            wholesaler,
            CHAIN_A,
            CHAIN_B,
            ORDER_VALUE,
            BOND
        );

        vm.prank(logistics);
        escrow.depositCarrierBond(ORDER_ID);

        vm.prank(wholesaler);
        escrow.fundEscrow(ORDER_ID);

        assertEq(tokenA.balanceOf(address(escrow)), ORDER_VALUE + BOND);

        // ✅ scanItem now sets currentCustodian = logistics
        vm.prank(logistics);
        source.scanItem(ITEM_ID, "Warehouse Apapa");

        vm.prank(logistics);
        escrow.confirmPickup(ORDER_ID);

        vm.prank(oracle);
        source.reportConditions(ITEM_ID, 2500, 60, false);

        uint256 supplyBefore = tokenA.totalSupply();
        uint256 logisticsBefore = tokenA.balanceOf(logistics);

        vm.prank(wholesaler);
        escrow.confirmDelivery(ORDER_ID);

        // Manufacturer on CHAIN_B → cross-chain burn
        assertEq(tokenA.totalSupply(), supplyBefore - ORDER_VALUE);

        // Logistics bond returned same-chain
        assertEq(tokenA.balanceOf(logistics), logisticsBefore + BOND);

        assertEq(tokenA.balanceOf(address(escrow)), 0);
        assertEq(
            uint(escrow.getOrder(ORDER_ID).status),
            uint(SupplyChainEscrow.OrderStatus.Resolved)
        );

        // Kwala mints on Chain B for manufacturer
        vm.prank(kwala);
        tokenB.mintCrossChain(
            manufacturer,
            ORDER_VALUE,
            CHAIN_A,
            keccak256(abi.encodePacked("manufacturer-payment", ORDER_ID))
        );

        assertEq(tokenB.balanceOf(manufacturer), ORDER_VALUE);
    }

    // ─────────────────────────────────────────────
    //  🚨 BREACH DURING TRANSIT — CARRIER LIABLE
    // ─────────────────────────────────────────────

    function testBreachDuringTransitCarrierLiable() public {
        // ─────────────────────────────────────────────
        //  SETUP — Create item and order
        //  Carrier   → CHAIN_A (same-chain, direct transfers)
        //  Wholesaler → CHAIN_B (cross-chain, refund will be burned)
        //  Manufacturer → CHAIN_A (same-chain, bond slash is direct transfer)
        // ─────────────────────────────────────────────
        vm.prank(manufacturer);
        source.createItem(ITEM_ID, "RFID-002", "Factory Kano");

        vm.prank(manufacturer);
        escrow.createOrder(
            ORDER_ID,
            ITEM_ID,
            logistics,
            CHAIN_A, // carrier on Chain A
            wholesaler,
            CHAIN_B, // wholesaler on Chain B
            CHAIN_A, // manufacturer on Chain A
            ORDER_VALUE,
            BOND
        );

        // ─────────────────────────────────────────────
        //  FUNDING — Carrier deposits bond, wholesaler funds escrow
        // ─────────────────────────────────────────────
        vm.prank(logistics);
        escrow.depositCarrierBond(ORDER_ID);

        vm.prank(wholesaler);
        escrow.fundEscrow(ORDER_ID);

        // Escrow holds ORDER_VALUE + BOND
        assertEq(tokenA.balanceOf(address(escrow)), ORDER_VALUE + BOND);

        // ─────────────────────────────────────────────
        //  TRANSIT — Carrier scans and confirms pickup
        // ─────────────────────────────────────────────
        vm.prank(logistics);
        source.scanItem(ITEM_ID, "Port Tin Can");

        vm.prank(logistics);
        escrow.confirmPickup(ORDER_ID);

        // ─────────────────────────────────────────────
        //  BREACH — Oracle reports bad sensor data
        //  Expect at least the first ConditionBreached event
        // ─────────────────────────────────────────────
        vm.expectEmit(true, false, false, true);
        emit ConditionBreached(
            ITEM_ID,
            "TEMPERATURE",
            "Temperature exceeded maximum safe threshold"
        );

        vm.prank(oracle);
        source.reportConditions(ITEM_ID, 4500, 95, true);
        // This emits 3 ConditionBreached events: TEMPERATURE, HUMIDITY, TILT

        // ─────────────────────────────────────────────
        //  FLAGGING — Kwala flags item on both chains
        // ─────────────────────────────────────────────
        vm.prank(kwala);
        receiver.flagItem(ITEM_ID, "Temp, Humidity and Tilt breach");
        assertTrue(receiver.isFlagged(ITEM_ID));

        vm.prank(oracle);
        source.flagItem(ITEM_ID, "Temp, Humidity and Tilt breach");
        assertEq(
            uint(source.getStatus(ITEM_ID)),
            uint(SupplyChainSource.Status.Flagged)
        );

        // ─────────────────────────────────────────────
        //  SNAPSHOT — Capture balances before resolution
        // ─────────────────────────────────────────────
        // Wholesaler deposited ORDER_VALUE into escrow, so their Chain A
        // balance is now 10_000 - 100 = 9_900 ether. It will NOT increase
        // after resolveDispute because their refund goes cross-chain (burned).
        uint256 wholesalerChainABefore = tokenA.balanceOf(wholesaler);
        uint256 manufacturerChainABefore = tokenA.balanceOf(manufacturer);
        uint256 supplyBefore = tokenA.totalSupply();

        // ─────────────────────────────────────────────
        //  DISPUTE RESOLUTION — Admin/Kwala resolves
        // ─────────────────────────────────────────────
        escrow.resolveDispute(ITEM_ID, "Condition breach during transit");

        SupplyChainEscrow.Order memory order = escrow.getOrder(ORDER_ID);

        // Carrier is liable (breach happened after pickup)
        assertEq(
            uint(order.liableParty),
            uint(SupplyChainEscrow.LiableParty.Carrier)
        );

        // ─────────────────────────────────────────────
        //  CHAIN A BALANCE ASSERTIONS
        // ─────────────────────────────────────────────

        // Wholesaler is on CHAIN_B → refund was BURNED not transferred
        // Their Chain A balance is unchanged
        assertEq(tokenA.balanceOf(wholesaler), wholesalerChainABefore);

        // Manufacturer is on CHAIN_A → carrier bond slashed directly to them
        assertEq(
            tokenA.balanceOf(manufacturer),
            manufacturerChainABefore + BOND
        );

        // Only ORDER_VALUE was burned (wholesaler cross-chain refund)
        // BOND was a same-chain transfer to manufacturer, not burned
        assertEq(tokenA.totalSupply(), supplyBefore - ORDER_VALUE);

        // Escrow fully drained
        assertEq(tokenA.balanceOf(address(escrow)), 0);

        // ─────────────────────────────────────────────
        //  CHAIN B MINTING — Kwala mints for wholesaler only
        //  Manufacturer already received BOND on Chain A — no Chain B mint
        // ─────────────────────────────────────────────
        vm.prank(kwala);
        tokenB.mintCrossChain(
            wholesaler,
            ORDER_VALUE,
            CHAIN_A,
            keccak256(abi.encodePacked("ws-refund", ORDER_ID))
        );

        assertEq(tokenB.balanceOf(wholesaler), ORDER_VALUE);
        assertEq(tokenB.balanceOf(manufacturer), 0); // paid on Chain A, nothing on Chain B
    }

    // ─────────────────────────────────────────────
    //  🚨 BREACH BEFORE PICKUP — MANUFACTURER LIABLE
    // ─────────────────────────────────────────────

    function testBreachBeforePickupManufacturerLiable() public {
        vm.prank(manufacturer);
        source.createItem(ITEM_ID, "RFID-003", "Factory Abuja");

        vm.prank(manufacturer);
        escrow.createOrder(
            ORDER_ID,
            ITEM_ID,
            logistics,
            CHAIN_A,
            wholesaler,
            CHAIN_A,
            CHAIN_B,
            ORDER_VALUE,
            BOND
        );

        vm.prank(logistics);
        escrow.depositCarrierBond(ORDER_ID);

        vm.prank(wholesaler);
        escrow.fundEscrow(ORDER_ID);

        // Breach before pickup (pickedUpAt == 0)
        vm.prank(oracle);
        source.reportConditions(ITEM_ID, 5000, 99, false);

        vm.prank(kwala);
        receiver.flagItem(ITEM_ID, "Pre-pickup breach");
        assertTrue(receiver.isFlagged(ITEM_ID));

        // ✅ FIX: Wholesaler on CHAIN_A and Carrier on CHAIN_A
        //         → both are same-chain direct transfers, NO tokens burned
        //         → assert balances not totalSupply
        uint256 wholesalerBefore = tokenA.balanceOf(wholesaler);
        uint256 logisticsBefore = tokenA.balanceOf(logistics);

        escrow.resolveDispute(ITEM_ID, "Pre-pickup condition breach");

        SupplyChainEscrow.Order memory order = escrow.getOrder(ORDER_ID);

        assertEq(
            uint(order.liableParty),
            uint(SupplyChainEscrow.LiableParty.Manufacturer)
        );

        // ✅ Wholesaler refunded directly (same chain)
        assertEq(tokenA.balanceOf(wholesaler), wholesalerBefore + ORDER_VALUE);

        // ✅ Carrier bond returned directly (same chain)
        assertEq(tokenA.balanceOf(logistics), logisticsBefore + BOND);

        // ✅ Escrow empty
        assertEq(tokenA.balanceOf(address(escrow)), 0);
    }

    // ─────────────────────────────────────────────
    //  🔒 FRAUD DETECTION — Impossible Travel
    // ─────────────────────────────────────────────

    function testFraudDetectedImpossibleTravel() public {
        vm.prank(manufacturer);
        source.createItem(ITEM_ID, "RFID-004", "Factory Lagos");

        // First scan — establishes location and sets custodian = logistics
        vm.prank(logistics);
        source.scanItem(ITEM_ID, "Lagos Port");

        // ✅ FIX: Use exact contract event name
        vm.expectEmit(true, false, false, false);
        emit FraudDetected(ITEM_ID, "", logistics);

        // Immediately scan from different location — impossible travel
        vm.prank(logistics);
        source.scanItem(ITEM_ID, "London Heathrow");
    }

    // ─────────────────────────────────────────────
    //  🔒 FRAUD DETECTION — Unauthorized Scanner
    // ─────────────────────────────────────────────

    function testFraudDetectedUnauthorizedScanner() public {
        vm.prank(manufacturer);
        source.createItem(ITEM_ID, "RFID-005", "Factory Abuja");

        // Logistics scans first → currentCustodian = logistics (after fix)
        vm.prank(logistics);
        source.scanItem(ITEM_ID, "Warehouse");

        // Add a different address as authorized logistics
        address fakeScannerAddr = makeAddr("fakeScanner");
        source.addLogistics(fakeScannerAddr);

        // ✅ FIX: fakeScannerAddr is authorized logistics but NOT custodian
        //         No handoffItem needed — custodian mismatch triggers fraud
        vm.expectEmit(true, false, false, false);
        emit FraudDetected(ITEM_ID, "", fakeScannerAddr);

        vm.prank(fakeScannerAddr);
        source.scanItem(ITEM_ID, "Unknown Location");
    }

    // ─────────────────────────────────────────────
    //  🚫 CANNOT DELIVER FLAGGED ITEM
    // ─────────────────────────────────────────────

    function testCannotDeliverFlaggedItem() public {
        vm.prank(manufacturer);
        source.createItem(ITEM_ID, "RFID-006", "Factory");

        vm.prank(manufacturer);
        escrow.createOrder(
            ORDER_ID,
            ITEM_ID,
            logistics,
            CHAIN_A,
            wholesaler,
            CHAIN_A,
            CHAIN_A,
            ORDER_VALUE,
            BOND
        );

        vm.prank(logistics);
        escrow.depositCarrierBond(ORDER_ID);

        vm.prank(wholesaler);
        escrow.fundEscrow(ORDER_ID);

        // ✅ Scan sets currentCustodian = logistics
        vm.prank(logistics);
        source.scanItem(ITEM_ID, "Warehouse");

        vm.prank(logistics);
        escrow.confirmPickup(ORDER_ID);

        // Flag the item
        vm.prank(oracle);
        source.flagItem(ITEM_ID, "Fraudulent activity");

        assertEq(
            uint(source.getStatus(ITEM_ID)),
            uint(SupplyChainSource.Status.Flagged)
        );

        // ✅ FIX: logistics IS now custodian (set by scanItem)
        //         confirmDelivery from logistics hits "Item is flagged" check
        vm.prank(logistics);
        vm.expectRevert("Item is flagged, cannot deliver");
        source.confirmDelivery(ITEM_ID, "Retailer Lagos");
    }

    // ─────────────────────────────────────────────
    //  🔒 DOUBLE MINT PROTECTION
    // ─────────────────────────────────────────────

    function testCannotMintSameTransferIdTwice() public {
        bytes32 transferId = keccak256("unique-transfer-1");

        vm.prank(kwala);
        tokenB.mintCrossChain(wholesaler, 100 ether, CHAIN_A, transferId);

        vm.prank(kwala);
        vm.expectRevert("Transfer already processed");
        tokenB.mintCrossChain(wholesaler, 100 ether, CHAIN_A, transferId);
    }

    // ─────────────────────────────────────────────
    //  🔒 ACCESS CONTROL
    // ─────────────────────────────────────────────

    function testAttackerCannotFlagOnReceiver() public {
        vm.prank(attacker);
        vm.expectRevert("Not authorized");
        receiver.flagItem(ITEM_ID, "Attack");
    }

    function testAttackerCannotResolveDispute() public {
        _setupFullOrder();

        vm.prank(attacker);
        vm.expectRevert("Not admin");
        escrow.resolveDispute(ITEM_ID, "Attack");
    }

    function testAttackerCannotMintTokens() public {
        vm.prank(attacker);
        vm.expectRevert("Not a minter");
        tokenB.mintCrossChain(
            attacker,
            9999 ether,
            CHAIN_A,
            keccak256("attack-mint")
        );
    }
    uint256 private mintNonce = 0; // For generating unique transfer IDs in tests if needed
    function testAttackerCannotBurnTokens() public {
        vm.prank(attacker);
        vm.expectRevert("Not a burner");
        tokenA.burnCrossChain(attacker, 100 ether, attacker, CHAIN_B, mintNonce);
    }

    // ─────────────────────────────────────────────
    //  INTERNAL HELPERS
    // ─────────────────────────────────────────────

    function _setupFullOrder() internal {
        vm.prank(manufacturer);
        source.createItem(ITEM_ID, "RFID-999", "Factory");

        vm.prank(manufacturer);
        escrow.createOrder(
            ORDER_ID,
            ITEM_ID,
            logistics,
            CHAIN_A,
            wholesaler,
            CHAIN_A,
            CHAIN_B,
            ORDER_VALUE,
            BOND
        );

        vm.prank(logistics);
        escrow.depositCarrierBond(ORDER_ID);

        vm.prank(wholesaler);
        escrow.fundEscrow(ORDER_ID);
    }
}
