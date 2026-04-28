// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SupplyChainEscrow} from "../../src/SupplyChainEscrow.sol";
import {SupplyChainToken} from "../../src/SupplyChainToken.sol";

contract SupplyChainEscrowTest is Test {
    SupplyChainEscrow public escrow;
    SupplyChainToken public token;

    address public admin;
    address public manufacturer;
    address public carrier;
    address public wholesaler;
    address public oracle;
    address public user;

    uint256 public constant BASE_CHAIN_ID = 84532;
    uint256 public constant POLYGON_CHAIN_ID = 80002;

    event OrderCreated(
        uint256 indexed orderId,
        string location,
        uint256 indexed sourceChain
    );
    event CarrierTermsSet(
        uint256 indexed orderId,
        uint256 shippingFee,
        uint256 carrierDeposit
    );
    event CarrierBondDeposited(
        uint256 indexed orderId,
        address carrier,
        uint256 deposit
    );
    event EscrowFunded(
        uint256 indexed orderId,
        address wholesaler,
        uint256 amount
    );
    event EscrowFundedCrossChain(
        uint256 indexed orderId,
        bytes32 indexed transferId,
        address wholesaler,
        uint256 amount
    );
    event ItemPickedUp(uint256 indexed orderId, address carrier);
    event DeliveryConfirmed(uint256 indexed orderId, address wholesaler);
    event SameChainPayment(
        uint256 indexed orderId,
        address recipient,
        uint256 amount,
        string reason
    );
    event CrossChainPayment(
        uint256 indexed orderId,
        address recipient,
        uint256 amount,
        uint256 destinationChainId,
        bytes32 transferId,
        string reason
    );
    event DisputeRaised(
        uint256 indexed orderId,
        SupplyChainEscrow.LiableParty liable,
        string reason
    );
    event OrderResolved(
        uint256 indexed orderId,
        SupplyChainEscrow.LiableParty liable
    );

    function setUp() public {
        admin = makeAddr("admin");
        manufacturer = makeAddr("manufacturer");
        carrier = makeAddr("carrier");
        wholesaler = makeAddr("wholesaler");
        oracle = makeAddr("oracle");
        user = makeAddr("user");

        vm.startPrank(admin);
        token = new SupplyChainToken(1_000_000 ether);
        escrow = new SupplyChainEscrow(address(token), BASE_CHAIN_ID);
        vm.stopPrank();

        // Distribute tokens
        vm.startPrank(admin);
        token.transfer(manufacturer, 100_000 ether);
        token.transfer(carrier, 100_000 ether);
        token.transfer(wholesaler, 100_000 ether);
        vm.stopPrank();

        // Setup roles
        vm.startPrank(admin);
        escrow.addOracle(oracle);
        token.addMinter(address(escrow));
        vm.stopPrank();
    }

    // ============================================================
    // CONSTRUCTOR & INITIAL STATE
    // ============================================================

    function test_ConstructorSetsCorrectState() public {
        assertEq(escrow.admin(), admin);
        assertEq(address(escrow.token()), address(token));
        assertEq(escrow.currentChainId(), BASE_CHAIN_ID);
    }

    function test_InitialEscrowBalanceIsZero() public {
        assertEq(escrow.getEscrowBalance(), 0);
    }

    // ============================================================
    // CREATE ORDER
    // ============================================================

    function test_CreateOrder() public {
        vm.prank(manufacturer);
        vm.expectEmit(true, false, false, true);
        emit OrderCreated(1, "Shenzhen", BASE_CHAIN_ID);
        escrow.createOrder(
            1,
            1,
            carrier,
            BASE_CHAIN_ID,
            wholesaler,
            BASE_CHAIN_ID,
            BASE_CHAIN_ID,
            1000 ether,
            "Shenzhen"
        );

        SupplyChainEscrow.Order memory order = escrow.getOrder(1);
        assertTrue(order.exists);
        assertEq(order.orderValue, 1000 ether);
        assertEq(order.manufacturer.wallet, manufacturer);
        assertEq(order.carrier.wallet, carrier);
        assertEq(order.wholesaler.wallet, wholesaler);
        assertEq(
            uint(order.status),
            uint(SupplyChainEscrow.OrderStatus.Created)
        );
    }

    function test_CreateOrderRevertsForDuplicateOrderId() public {
        vm.startPrank(manufacturer);
        escrow.createOrder(
            1,
            1,
            carrier,
            BASE_CHAIN_ID,
            wholesaler,
            BASE_CHAIN_ID,
            BASE_CHAIN_ID,
            1000 ether,
            "Shenzhen"
        );

        vm.expectRevert("Order already exists");
        escrow.createOrder(
            1,
            2,
            carrier,
            BASE_CHAIN_ID,
            wholesaler,
            BASE_CHAIN_ID,
            BASE_CHAIN_ID,
            500 ether,
            "Beijing"
        );
        vm.stopPrank();
    }

    function test_CreateOrderRevertsForDuplicateItemId() public {
        vm.startPrank(manufacturer);
        escrow.createOrder(
            1,
            1,
            carrier,
            BASE_CHAIN_ID,
            wholesaler,
            BASE_CHAIN_ID,
            BASE_CHAIN_ID,
            1000 ether,
            "Shenzhen"
        );

        vm.expectRevert("Item already has an order");
        escrow.createOrder(
            2,
            1,
            carrier,
            BASE_CHAIN_ID,
            wholesaler,
            BASE_CHAIN_ID,
            BASE_CHAIN_ID,
            500 ether,
            "Beijing"
        );
        vm.stopPrank();
    }

    function test_CreateOrderRevertsForZeroValue() public {
        vm.prank(manufacturer);
        vm.expectRevert("Order value must be > 0");
        escrow.createOrder(
            1,
            1,
            carrier,
            BASE_CHAIN_ID,
            wholesaler,
            BASE_CHAIN_ID,
            BASE_CHAIN_ID,
            0,
            "Shenzhen"
        );
    }

    // ============================================================
    // DEPOSIT CARRIER BOND
    // ============================================================

    function test_DepositCarrierBond() public {
        _createOrder();

        vm.startPrank(carrier);
        token.approve(address(escrow), 500 ether);
        vm.expectEmit(true, false, false, true);
        emit CarrierBondDeposited(1, carrier, 200 ether);
        escrow.depositCarrierBond(1, 100 ether, 200 ether);
        vm.stopPrank();

        SupplyChainEscrow.Order memory order = escrow.getOrder(1);
        assertEq(order.shippingFee, 100 ether);
        assertEq(order.carrierDeposit, 200 ether);
        assertEq(
            uint(order.status),
            uint(SupplyChainEscrow.OrderStatus.CarrierReady)
        );
        assertEq(escrow.getEscrowBalance(), 200 ether);
    }

    function test_DepositCarrierBondRevertsForNonCarrier() public {
        _createOrder();

        vm.prank(user);
        vm.expectRevert("Not the carrier");
        escrow.depositCarrierBond(1, 100 ether, 200 ether);
    }

    function test_DepositCarrierBondRevertsForWrongStatus() public {
        _createOrder();
        _depositBond();

        vm.prank(carrier);
        vm.expectRevert("Wrong status");
        escrow.depositCarrierBond(1, 100 ether, 200 ether);
    }

    function test_DepositCarrierBondRevertsForZeroShippingFee() public {
        _createOrder();

        vm.prank(carrier);
        vm.expectRevert("Shipping fee must be > 0");
        escrow.depositCarrierBond(1, 0, 200 ether);
    }

    function test_DepositCarrierBondRevertsForZeroDeposit() public {
        _createOrder();

        vm.prank(carrier);
        vm.expectRevert("Carrier deposit must be > 0");
        escrow.depositCarrierBond(1, 100 ether, 0);
    }

    function test_DepositCarrierBondRevertsForInsufficientAllowance() public {
        _createOrder();

        vm.prank(carrier);
        vm.expectRevert();
        escrow.depositCarrierBond(1, 100 ether, 200 ether);
    }

    // ============================================================
    // FUND ESCROW (SAME CHAIN)
    // ============================================================

    function test_FundEscrow() public {
        _createOrder();
        _depositBond();

        vm.startPrank(wholesaler);
        token.approve(address(escrow), 1100 ether);
        vm.expectEmit(true, false, false, true);
        emit EscrowFunded(1, wholesaler, 1100 ether);
        escrow.fundEscrow(1);
        vm.stopPrank();

        SupplyChainEscrow.Order memory order = escrow.getOrder(1);
        assertEq(
            uint(order.status),
            uint(SupplyChainEscrow.OrderStatus.Funded)
        );
        assertEq(escrow.getEscrowBalance(), 1300 ether); // 200 deposit + 1000 value + 100 fee
    }

    function test_FundEscrowRevertsForNonWholesaler() public {
        _createOrder();
        _depositBond();

        vm.prank(user);
        vm.expectRevert("Not the wholesaler");
        escrow.fundEscrow(1);
    }

    function test_FundEscrowRevertsForWrongStatus() public {
        _createOrder();

        vm.prank(wholesaler);
        vm.expectRevert("Carrier bond not deposited yet");
        escrow.fundEscrow(1);
    }

    function test_FundEscrowRevertsForInsufficientAllowance() public {
        _createOrder();
        _depositBond();

        vm.prank(wholesaler);
        vm.expectRevert();
        escrow.fundEscrow(1);
    }

    // ============================================================
    // FUND ESCROW BY ORACLE (CROSS-CHAIN)
    // ============================================================

    function test_FundEscrowByOracle() public {
        _createOrder();
        _depositBond();

        bytes32 transferId = keccak256("cross-chain-fund");

        vm.prank(oracle);
        vm.expectEmit(true, true, false, true);
        emit EscrowFundedCrossChain(1, transferId, wholesaler, 1100 ether);
        escrow.fundEscrowByOracle(
            1,
            transferId,
            wholesaler,
            1100 ether,
            uint64(POLYGON_CHAIN_ID)
        );

        SupplyChainEscrow.Order memory order = escrow.getOrder(1);
        assertEq(
            uint(order.status),
            uint(SupplyChainEscrow.OrderStatus.Funded)
        );
    }

    function test_FundEscrowByOracleRevertsForNonOracle() public {
        _createOrder();
        _depositBond();

        vm.prank(user);
        vm.expectRevert("Not oracle");
        escrow.fundEscrowByOracle(
            1,
            keccak256("test"),
            wholesaler,
            1100 ether,
            uint64(POLYGON_CHAIN_ID)
        );
    }

    function test_FundEscrowByOracleRevertsForDuplicateTransferId() public {
        _createOrder();
        _depositBond();

        bytes32 transferId = keccak256("cross-chain-fund");

        vm.startPrank(oracle);
        escrow.fundEscrowByOracle(
            1,
            transferId,
            wholesaler,
            1100 ether,
            uint64(POLYGON_CHAIN_ID)
        );

        vm.expectRevert("Already processed");
        escrow.fundEscrowByOracle(
            1,
            transferId,
            wholesaler,
            1100 ether,
            uint64(POLYGON_CHAIN_ID)
        );
        vm.stopPrank();
    }

    function test_FundEscrowByOracleRevertsForWrongAmount() public {
        _createOrder();
        _depositBond();

        vm.prank(oracle);
        vm.expectRevert("Amount mismatch");
        escrow.fundEscrowByOracle(
            1,
            keccak256("test"),
            wholesaler,
            1000 ether,
            uint64(POLYGON_CHAIN_ID)
        );
    }

    function test_FundEscrowByOracleRevertsForWrongWholesaler() public {
        _createOrder();
        _depositBond();

        vm.prank(oracle);
        vm.expectRevert("Wrong wholesaler");
        escrow.fundEscrowByOracle(
            1,
            keccak256("test"),
            user,
            1100 ether,
            uint64(POLYGON_CHAIN_ID)
        );
    }

    // ============================================================
    // CONFIRM PICKUP
    // ============================================================

    function test_ConfirmPickup() public {
        _createOrder();
        _depositBond();
        _fundEscrow();

        vm.prank(carrier);
        vm.expectEmit(true, false, false, true);
        emit ItemPickedUp(1, carrier);
        escrow.confirmPickup(1);

        SupplyChainEscrow.Order memory order = escrow.getOrder(1);
        assertEq(
            uint(order.status),
            uint(SupplyChainEscrow.OrderStatus.InTransit)
        );
        assertGt(order.pickedUpAt, 0);
    }

    function test_ConfirmPickupRevertsForNonCarrier() public {
        _createOrder();
        _depositBond();
        _fundEscrow();

        vm.prank(user);
        vm.expectRevert("Not the carrier");
        escrow.confirmPickup(1);
    }

    function test_ConfirmPickupRevertsForNotFunded() public {
        _createOrder();
        _depositBond();

        vm.prank(carrier);
        vm.expectRevert("Not funded yet");
        escrow.confirmPickup(1);
    }

    // ============================================================
    // CONFIRM DELIVERY (HAPPY PATH)
    // ============================================================

    function test_ConfirmDelivery() public {
        _createOrder();
        _depositBond();
        _fundEscrow();
        _confirmPickup();

        uint256 mfgBefore = token.balanceOf(manufacturer);
        uint256 carBefore = token.balanceOf(carrier);

        vm.prank(wholesaler);
        vm.expectEmit(true, false, false, true);
        emit DeliveryConfirmed(1, wholesaler);
        escrow.confirmDelivery(1);

        SupplyChainEscrow.Order memory order = escrow.getOrder(1);
        assertEq(
            uint(order.status),
            uint(SupplyChainEscrow.OrderStatus.Resolved)
        );

        // Manufacturer gets orderValue
        assertEq(token.balanceOf(manufacturer), mfgBefore + 1000 ether);
        // Carrier gets shippingFee + deposit
        assertEq(token.balanceOf(carrier), carBefore + 100 ether + 200 ether);
        // Escrow empty
        assertEq(escrow.getEscrowBalance(), 0);
    }

    function test_ConfirmDeliveryRevertsForNonWholesaler() public {
        _createOrder();
        _depositBond();
        _fundEscrow();
        _confirmPickup();

        vm.prank(user);
        vm.expectRevert("Not the wholesaler");
        escrow.confirmDelivery(1);
    }

    function test_ConfirmDeliveryRevertsForNotInTransit() public {
        _createOrder();
        _depositBond();
        _fundEscrow();

        vm.prank(wholesaler);
        vm.expectRevert("Not in transit");
        escrow.confirmDelivery(1);
    }

    // ============================================================
    // RESOLVE DISPUTE
    // ============================================================

    function test_ResolveDisputeBeforePickup_ManufacturerLiable() public {
        _createOrder();
        _depositBond();
        _fundEscrow();

        uint256 wsBefore = token.balanceOf(wholesaler);
        uint256 carBefore = token.balanceOf(carrier);

        vm.prank(oracle);
        escrow.resolveDispute(1, "Breach before pickup");

        SupplyChainEscrow.Order memory order = escrow.getOrder(1);
        assertEq(
            uint(order.status),
            uint(SupplyChainEscrow.OrderStatus.Resolved)
        );
        assertEq(
            uint(order.liableParty),
            uint(SupplyChainEscrow.LiableParty.Manufacturer)
        );

        // Wholesaler gets full refund
        assertEq(
            token.balanceOf(wholesaler),
            wsBefore + 1000 ether + 100 ether
        );
        // Carrier gets bond back
        assertEq(token.balanceOf(carrier), carBefore + 200 ether);
        assertEq(escrow.getEscrowBalance(), 0);
    }

    function test_ResolveDisputeDuringTransit_CarrierLiable() public {
        _createOrder();
        _depositBond();
        _fundEscrow();
        _confirmPickup();

        uint256 wsBefore = token.balanceOf(wholesaler);
        uint256 mfgBefore = token.balanceOf(manufacturer);

        vm.prank(oracle);
        escrow.resolveDispute(1, "Temperature breach");

        SupplyChainEscrow.Order memory order = escrow.getOrder(1);
        assertEq(
            uint(order.status),
            uint(SupplyChainEscrow.OrderStatus.Resolved)
        );
        assertEq(
            uint(order.liableParty),
            uint(SupplyChainEscrow.LiableParty.Carrier)
        );

        // Wholesaler gets full refund
        assertEq(
            token.balanceOf(wholesaler),
            wsBefore + 1000 ether + 100 ether
        );
        // Manufacturer gets carrier's bond as compensation
        assertEq(token.balanceOf(manufacturer), mfgBefore + 200 ether);
        assertEq(escrow.getEscrowBalance(), 0);
    }

    function test_ResolveDisputeRevertsForNonOracle() public {
        _createOrder();
        _depositBond();
        _fundEscrow();

        vm.prank(user);
        vm.expectRevert("Not oracle");
        escrow.resolveDispute(1, "Breach");
    }

    function test_ResolveDisputeRevertsForWrongStatus() public {
        _createOrder();

        vm.prank(oracle);
        vm.expectRevert("Cannot dispute at this stage");
        escrow.resolveDispute(1, "Breach");
    }

    function test_ResolveDisputeRevertsForNonExistentItem() public {
        vm.prank(oracle);
        vm.expectRevert(); // Will revert on itemToOrder[999] = 0, then orders[0].exists = false
        escrow.resolveDispute(999, "Breach");
    }

    // ============================================================
    // CROSS-CHAIN PAYMENTS
    // ============================================================

    function test_CrossChainPaymentEmitsEvent() public {
        _createOrder();
        _depositBond();
        _fundEscrow();
        _confirmPickup();

        vm.prank(admin);
        token.addBurner(address(escrow));

        // Set manufacturer to receive on Polygon
        vm.startPrank(manufacturer);
        // Need to recreate order with different chainId
        vm.stopPrank();

        // Create order with cross-chain manufacturer
        vm.prank(manufacturer);
        escrow.createOrder(
            2,
            2,
            carrier,
            BASE_CHAIN_ID,
            wholesaler,
            BASE_CHAIN_ID,
            POLYGON_CHAIN_ID,
            1000 ether,
            "Shenzhen"
        );

        vm.startPrank(carrier);
        token.approve(address(escrow), 300 ether);
        escrow.depositCarrierBond(2, 100 ether, 200 ether);
        vm.stopPrank();

        vm.startPrank(wholesaler);
        token.approve(address(escrow), 1100 ether);
        escrow.fundEscrow(2);
        vm.stopPrank();

        vm.prank(carrier);
        escrow.confirmPickup(2);

        vm.prank(wholesaler);
        vm.expectEmit(true, true, false, false);
        emit CrossChainPayment(
            2,
            manufacturer,
            1000 ether,
            POLYGON_CHAIN_ID,
            bytes32(0),
            "Payment: goods delivered"
        );
        escrow.confirmDelivery(2);
    }

    // ============================================================
    // GETTERS
    // ============================================================

    function test_GetOrderByItem() public {
        _createOrder();

        SupplyChainEscrow.Order memory order = escrow.getOrderByItem(1);
        assertTrue(order.exists);
        assertEq(order.orderId, 1);
    }

    function test_GetOrderByItemNonExistent() public {
        SupplyChainEscrow.Order memory order = escrow.getOrderByItem(999);
        assertFalse(order.exists);
    }

    function test_GetEscrowBalance() public {
        assertEq(escrow.getEscrowBalance(), 0);

        _createOrder();
        _depositBond();

        assertEq(escrow.getEscrowBalance(), 200 ether);
    }

    // ============================================================
    // ORACLE MANAGEMENT
    // ============================================================

    function test_AddOracle() public {
        vm.prank(admin);
        escrow.addOracle(user);
        assertTrue(escrow.authorizedOracles(user));
    }

    function test_AddOracleRevertsForNonAdmin() public {
        vm.prank(user);
        vm.expectRevert("Not admin");
        escrow.addOracle(user);
    }

    // ============================================================
    // FULL INTEGRATION FLOW
    // ============================================================

    function test_FullHappyPath() public {
        // 1. Create
        _createOrder();

        // 2. Carrier deposits bond
        _depositBond();

        // 3. Wholesaler funds
        _fundEscrow();

        // 4. Carrier picks up
        _confirmPickup();

        // 5. Wholesaler confirms delivery
        vm.prank(wholesaler);
        escrow.confirmDelivery(1);

        // Verify final state
        SupplyChainEscrow.Order memory order = escrow.getOrder(1);
        assertEq(
            uint(order.status),
            uint(SupplyChainEscrow.OrderStatus.Resolved)
        );
        assertEq(escrow.getEscrowBalance(), 0);
    }

    function test_FullDisputePath() public {
        // 1-4. Setup through pickup
        _createOrder();
        _depositBond();
        _fundEscrow();
        _confirmPickup();

        // 5. Oracle resolves dispute
        vm.prank(oracle);
        escrow.resolveDispute(1, "Temperature exceeded threshold");

        SupplyChainEscrow.Order memory order = escrow.getOrder(1);
        assertEq(
            uint(order.status),
            uint(SupplyChainEscrow.OrderStatus.Resolved)
        );
        assertEq(
            uint(order.liableParty),
            uint(SupplyChainEscrow.LiableParty.Carrier)
        );
        assertEq(escrow.getEscrowBalance(), 0);
    }

    // ============================================================
    // ECONOMIC INVARIANTS
    // ============================================================

    function test_EscrowBalanceInvariantHappyPath() public {
        _createOrder();
        _depositBond();
        _fundEscrow();
        _confirmPickup();

        uint256 escrowBefore = escrow.getEscrowBalance();
        uint256 totalSupplyBefore = token.totalSupply();

        vm.prank(wholesaler);
        escrow.confirmDelivery(1);

        // No tokens should be minted or burned in same-chain flow
        assertEq(token.totalSupply(), totalSupplyBefore);
        assertEq(escrow.getEscrowBalance(), 0);
    }

    function test_NoDoubleSpending() public {
        _createOrder();
        _depositBond();
        _fundEscrow();
        _confirmPickup();

        vm.prank(wholesaler);
        escrow.confirmDelivery(1);

        // Try to confirm again
        vm.prank(wholesaler);
        vm.expectRevert("Not in transit");
        escrow.confirmDelivery(1);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function _createOrder() internal {
        vm.prank(manufacturer);
        escrow.createOrder(
            1,
            1,
            carrier,
            BASE_CHAIN_ID,
            wholesaler,
            BASE_CHAIN_ID,
            BASE_CHAIN_ID,
            1000 ether,
            "Shenzhen"
        );
    }

    function _depositBond() internal {
        vm.startPrank(carrier);
        token.approve(address(escrow), 300 ether);
        escrow.depositCarrierBond(1, 100 ether, 200 ether);
        vm.stopPrank();
    }

    function _fundEscrow() internal {
        vm.startPrank(wholesaler);
        token.approve(address(escrow), 1100 ether);
        escrow.fundEscrow(1);
        vm.stopPrank();
    }

    function _confirmPickup() internal {
        vm.prank(carrier);
        escrow.confirmPickup(1);
    }
}
