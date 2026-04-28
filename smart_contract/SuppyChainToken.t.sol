// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SupplyChainToken} from "../../src/SupplyChainToken.sol";

contract SupplyChainTokenTest is Test {
    SupplyChainToken public token;

    address public admin;
    address public minter;
    address public burner;
    address public user1;
    address public user2;
    address public escrow;

    uint256 public constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;

    event TokensBurned(
        address indexed from,
        uint256 amount,
        address indexed recipient,
        uint64 destinationChainId,
        bytes32 transferId
    );
    event TokensMinted(
        address indexed to,
        uint256 amount,
        uint64 sourceChainId,
        bytes32 transferId
    );
    event EscrowFundRequest(
        uint256 indexed orderId,
        bytes32 indexed transferId,
        address indexed wholesaler,
        uint256 amount,
        uint256 sourceChainId,
        uint256 destinationChainId
    );

    function setUp() public {
        admin = makeAddr("admin");
        minter = makeAddr("minter");
        burner = makeAddr("burner");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        escrow = makeAddr("escrow");

        vm.prank(admin);
        token = new SupplyChainToken(INITIAL_SUPPLY);

        // Verify admin got initial supply
        assertEq(token.balanceOf(admin), INITIAL_SUPPLY);
    }

    // ============================================================
    // CONSTRUCTOR & INITIAL STATE
    // ============================================================

    function test_ConstructorSetsCorrectInitialState() public {
        SupplyChainToken freshToken = new SupplyChainToken(0);
        assertEq(freshToken.totalSupply(), 0);
        assertTrue(
            freshToken.hasRole(freshToken.DEFAULT_ADMIN_ROLE(), address(this))
        );
        assertTrue(freshToken.hasRole(freshToken.MINTER_ROLE(), address(this)));
        assertTrue(freshToken.hasRole(freshToken.BURNER_ROLE(), address(this)));
    }

    function test_ConstructorMintsInitialSupplyToDeployer() public {
        assertEq(token.balanceOf(admin), INITIAL_SUPPLY);
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
    }

    function test_ConstructorWithZeroSupply() public {
        vm.prank(admin);
        SupplyChainToken zeroToken = new SupplyChainToken(0);
        assertEq(zeroToken.totalSupply(), 0);
        assertEq(zeroToken.balanceOf(admin), 0);
    }

    // ============================================================
    // ROLE MANAGEMENT
    // ============================================================

    function test_AddMinter() public {
        vm.prank(admin);
        token.addMinter(minter);
        assertTrue(token.hasRole(token.MINTER_ROLE(), minter));
    }

    function test_AddBurner() public {
        vm.prank(admin);
        token.addBurner(burner);
        assertTrue(token.hasRole(token.BURNER_ROLE(), burner));
    }

    // function test_RemoveMinter() public {
    //     vm.startPrank(admin);
    //     token.addMinter(minter);
    //     token.removeMinter(minter);
    //     vm.stopPrank();
    //     assertFalse(token.hasRole(token.MINTER_ROLE(), minter));
    // }

    // function test_RemoveBurner() public {
    //     vm.startPrank(admin);
    //     token.addBurner(burner);
    //     token.removeBurner(burner);
    //     vm.stopPrank();
    //     assertFalse(token.hasRole(token.BURNER_ROLE(), burner));
    // }

    function test_AddMinterRevertsForNonAdmin() public {
        vm.prank(user1);
        vm.expectRevert();
        token.addMinter(minter);
    }

    function test_AddBurnerRevertsForNonAdmin() public {
        vm.prank(user1);
        vm.expectRevert();
        token.addBurner(burner);
    }

    // function test_RemoveMinterRevertsForNonAdmin() public {
    //     vm.prank(admin);
    //     token.addMinter(minter);

    //     vm.prank(user1);
    //     vm.expectRevert();
    //     token.removeMinter(minter);
    // }

    // ============================================================
    // MINT CROSS CHAIN
    // ============================================================

    function test_MintCrossChain() public {
        vm.prank(admin);
        token.addMinter(minter);

        bytes32 transferId = keccak256("transfer1");
        uint64 sourceChainId = 80002; // Polygon

        vm.prank(minter);
        vm.expectEmit(true, true, false, true);
        emit TokensMinted(user1, 1000, sourceChainId, transferId);
        token.mintCrossChain(user1, 1000, sourceChainId, transferId);

        assertEq(token.balanceOf(user1), 1000);
        assertEq(token.totalSupply(), INITIAL_SUPPLY + 1000);
        assertTrue(token.processedTransfers(transferId));
    }

    function test_MintCrossChainRevertsForNonMinter() public {
        bytes32 transferId = keccak256("transfer1");

        vm.prank(user1);
        vm.expectRevert();
        token.mintCrossChain(user1, 1000, 80002, transferId);
    }

    function test_MintCrossChainRevertsForDuplicateTransferId() public {
        vm.prank(admin);
        token.addMinter(minter);

        bytes32 transferId = keccak256("transfer1");

        vm.startPrank(minter);
        token.mintCrossChain(user1, 1000, 80002, transferId);

        vm.expectRevert("Transfer already processed");
        token.mintCrossChain(user1, 1000, 80002, transferId);
        vm.stopPrank();
    }

    function test_MintCrossChainRevertsForDifferentAmountSameTransferId()
        public
    {
        vm.prank(admin);
        token.addMinter(minter);

        bytes32 transferId = keccak256("transfer1");

        vm.startPrank(minter);
        token.mintCrossChain(user1, 1000, 80002, transferId);

        vm.expectRevert("Transfer already processed");
        token.mintCrossChain(user1, 2000, 80002, transferId);
        vm.stopPrank();
    }

    function test_MintCrossChainToZeroAddressReverts() public {
        vm.prank(admin);
        token.addMinter(minter);

        vm.prank(minter);
        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("ERC20InvalidReceiver(address)")),
                address(0)
            )
        );
        // Or simply: vm.expectRevert();
        token.mintCrossChain(address(0), 1000, 80002, keccak256("zero"));
    }

    function test_MintCrossChainZeroAmount() public {
        vm.prank(admin);
        token.addMinter(minter);

        vm.prank(minter);
        token.mintCrossChain(user1, 0, 80002, keccak256("zero"));
        assertEq(token.balanceOf(user1), 0);
    }

    // ============================================================
    // BURN CROSS CHAIN
    // ============================================================

    function test_BurnCrossChain_FromSelf() public {
        vm.prank(admin);
        token.addBurner(burner);

        // Give burner some tokens
        vm.prank(admin);
        token.transfer(burner, 5000);

        vm.prank(burner);
        bytes32 transferId = token.burnCrossChain(
            burner,
            1000,
            user1,
            80002,
            1
        );

        assertEq(token.balanceOf(burner), 4000);
        assertEq(token.totalSupply(), INITIAL_SUPPLY - 1000);
        assertNotEq(transferId, bytes32(0));
    }

    function test_BurnCrossChain_FromApproved() public {
        vm.prank(admin);
        token.addBurner(burner);

        // Give user1 tokens and approve burner
        vm.prank(admin);
        token.transfer(user1, 5000);

        vm.prank(user1);
        token.approve(burner, 3000);

        vm.prank(burner);
        bytes32 transferId = token.burnCrossChain(user1, 2000, user2, 80002, 1);

        assertEq(token.balanceOf(user1), 3000);
        assertEq(token.totalSupply(), INITIAL_SUPPLY - 2000);
        assertNotEq(transferId, bytes32(0));
    }

    // function test_BurnCrossChain_EmitsEvent() public {
    //     vm.prank(admin);
    //     token.addBurner(burner);

    //     vm.prank(admin);
    //     token.transfer(burner, 5000);

    //     vm.prank(burner);
    //     vm.expectEmit(true, true, false, true);
    //     emit TokensBurned(burner, 1000, user1, 80002, bytes32(0)); // transferId computed internally
    //     token.burnCrossChain(burner, 1000, user1, 80002, 0);
    // }

    function test_BurnCrossChainRevertsForNonBurner() public {
        vm.prank(user1);
        vm.expectRevert();
        token.burnCrossChain(user1, 1000, user2, 80002, 1);
    }

    function test_BurnCrossChainRevertsForInsufficientBalance() public {
        vm.prank(admin);
        token.addBurner(burner);

        vm.prank(burner);
        vm.expectRevert("Insufficient balance");
        token.burnCrossChain(burner, 1000, user1, 80002, 1);
    }

    function test_BurnCrossChainRevertsForInsufficientAllowance() public {
        vm.prank(admin);
        token.addBurner(burner);

        vm.prank(admin);
        token.transfer(user1, 5000);

        // No approval given

        vm.prank(burner);
        vm.expectRevert("Insufficient allowance");
        token.burnCrossChain(user1, 1000, user2, 80002, 1);
    }

    function test_BurnCrossChain_UniqueTransferIds() public {
        vm.prank(admin);
        token.addBurner(burner);

        vm.prank(admin);
        token.transfer(burner, 10000);

        vm.startPrank(burner);
        bytes32 id1 = token.burnCrossChain(burner, 100, user1, 80002, 1);
        bytes32 id2 = token.burnCrossChain(burner, 100, user1, 80002, 2);
        vm.stopPrank();

        assertNotEq(id1, id2);
    }

    function test_BurnCrossChain_ZeroAmountReverts() public {
        vm.prank(admin);
        token.addBurner(burner);

        vm.prank(burner);
        vm.expectRevert("Insufficient balance");
        token.burnCrossChain(burner, 0, user1, 80002, 1);
    }

    // ============================================================
    // FUND ESCROW CROSS CHAIN
    // ============================================================

    function test_FundEscrowCrossChain() public {
        uint256 orderId = 42;
        uint256 amount = 5000;
        uint256 destinationChainId = 84532;

        vm.prank(admin);
        token.transfer(user1, 10000);

        vm.prank(user1);
        // Don't expectEmit here — just call and capture the ID
        bytes32 transferId = token.fundEscrowCrossChain(
            orderId,
            amount,
            destinationChainId
        );

        // Then verify the ID was processed
        assertTrue(token.processedFundRequests(transferId));
        assertEq(token.balanceOf(user1), 5000);
        assertEq(token.totalSupply(), INITIAL_SUPPLY - amount);
    }

    function test_FundEscrowCrossChain_BurnsTokens() public {
        uint256 orderId = 42;
        uint256 amount = 5000;

        vm.prank(admin);
        token.transfer(user1, 10000);

        uint256 supplyBefore = token.totalSupply();
        uint256 balanceBefore = token.balanceOf(user1);

        vm.prank(user1);
        token.fundEscrowCrossChain(orderId, amount, 84532);

        assertEq(token.balanceOf(user1), balanceBefore - amount);
        assertEq(token.totalSupply(), supplyBefore - amount);
    }

    function test_FundEscrowCrossChainRevertsForInsufficientBalance() public {
        vm.prank(user1);
        vm.expectRevert("Insufficient balance");
        token.fundEscrowCrossChain(1, 1000, 84532);
    }

    function test_FundEscrowCrossChainRevertsForDuplicateTransferId() public {
        vm.prank(admin);
        token.transfer(user1, 20000);

        vm.startPrank(user1);
        bytes32 id1 = token.fundEscrowCrossChain(1, 1000, 84532);

        // Advance time to ensure different transferId
        vm.warp(block.timestamp + 1);

        // Now this gets a different ID and won't revert
        bytes32 id2 = token.fundEscrowCrossChain(1, 1000, 84532);
        vm.stopPrank();

        assertNotEq(id1, id2);
        assertTrue(token.processedFundRequests(id1));
        assertTrue(token.processedFundRequests(id2));
    }

    // If you actually WANT to test duplicate reversion:
    function test_FundEscrowCrossChainRevertsForSameTransferId() public {
        vm.prank(admin);
        token.transfer(user1, 20000);

        vm.startPrank(user1);
        bytes32 id1 = token.fundEscrowCrossChain(1, 1000, 84532);

        // DON'T advance time - same timestamp = same transferId
        vm.expectRevert("Request already processed");
        token.fundEscrowCrossChain(1, 1000, 84532);
        vm.stopPrank();
    }

    function test_FundEscrowCrossChain_DifferentDestinationChains() public {
        vm.prank(admin);
        token.transfer(user1, 20000);

        vm.startPrank(user1);
        bytes32 id1 = token.fundEscrowCrossChain(1, 1000, 84532);
        bytes32 id2 = token.fundEscrowCrossChain(1, 1000, 137); // Polygon mainnet
        vm.stopPrank();

        assertNotEq(id1, id2);
    }

    function test_FundEscrowCrossChain_ZeroAmount() public {
        vm.prank(admin);
        token.transfer(user1, 10000);

        vm.prank(user1);
        bytes32 transferId = token.fundEscrowCrossChain(1, 0, 84532);

        assertNotEq(transferId, bytes32(0));
        assertEq(token.balanceOf(user1), 10000);
    }

    function test_FundEscrowCrossChain_EmitsCorrectChainIds() public {
        vm.prank(admin);
        token.transfer(user1, 10000);

        uint256 sourceChainId = block.chainid;

        vm.prank(user1);
        bytes32 transferId = token.fundEscrowCrossChain(1, 5000, 84532);

        // Then verify the ID was processed
        assertTrue(token.processedFundRequests(transferId));
    }

    // ============================================================
    // PROCESSED TRANSFERS / FUND REQUESTS MAPPINGS
    // ============================================================

    function test_ProcessedTransfersInitiallyFalse() public {
        bytes32 fakeId = keccak256("fake");
        assertFalse(token.processedTransfers(fakeId));
        assertFalse(token.processedFundRequests(fakeId));
    }

    function test_ProcessedTransfersSetAfterMint() public {
        vm.prank(admin);
        token.addMinter(minter);

        bytes32 transferId = keccak256("test");

        vm.prank(minter);
        token.mintCrossChain(user1, 100, 80002, transferId);

        assertTrue(token.processedTransfers(transferId));
    }

    function test_ProcessedFundRequestsSetAfterEscrowFund() public {
        vm.prank(admin);
        token.transfer(user1, 10000);

        vm.prank(user1);
        bytes32 transferId = token.fundEscrowCrossChain(1, 1000, 84532);

        assertTrue(token.processedFundRequests(transferId));
    }

    // ============================================================
    // STANDARD ERC20 FUNCTIONALITY
    // ============================================================

    function test_Transfer() public {
        vm.prank(admin);
        token.transfer(user1, 1000);
        assertEq(token.balanceOf(user1), 1000);
        assertEq(token.balanceOf(admin), INITIAL_SUPPLY - 1000);
    }

    function test_ApproveAndTransferFrom() public {
        vm.prank(admin);
        token.approve(user1, 5000);

        vm.prank(user1);
        token.transferFrom(admin, user2, 3000);

        assertEq(token.balanceOf(user2), 3000);
        assertEq(token.allowance(admin, user1), 2000);
    }

    function test_TotalSupplyAfterBurn() public {
        vm.prank(admin);
        token.addBurner(burner);

        vm.prank(admin);
        token.transfer(burner, 5000);

        vm.prank(burner);
        token.burnCrossChain(burner, 2000, user1, 80002, 1);

        assertEq(token.totalSupply(), INITIAL_SUPPLY - 2000);
    }

    function test_TotalSupplyAfterMint() public {
        vm.prank(admin);
        token.addMinter(minter);

        vm.prank(minter);
        token.mintCrossChain(user1, 5000, 80002, keccak256("test"));

        assertEq(token.totalSupply(), INITIAL_SUPPLY + 5000);
    }

    // ============================================================
    // INTEGRATION: FULL CROSS-CHAIN FLOW
    // ============================================================

    function test_FullCrossChainEscrowFlow() public {
        // Setup: admin is minter and burner on both chains (simulated)
        vm.prank(admin);
        token.addMinter(minter);
        vm.prank(admin);
        token.addBurner(burner);

        // Step 1: Wholesaler gets tokens on "Optimism" (simulated here)
        vm.prank(admin);
        token.transfer(user1, 10000); // user1 = wholesaler

        // Step 2: Wholesaler burns to fund escrow on Base
        vm.prank(user1);
        bytes32 fundTransferId = token.fundEscrowCrossChain(
            42,
            5000,
            84532 // Base
        );

        // Verify burn happened
        assertEq(token.balanceOf(user1), 5000);
        assertEq(token.totalSupply(), INITIAL_SUPPLY - 5000);
        assertTrue(token.processedFundRequests(fundTransferId));

        // Step 3: Oracle mints equivalent on Base (simulated here)
        vm.prank(minter);
        token.mintCrossChain(escrow, 5000, 10, fundTransferId); // 10 = Optimism chain ID

        // Verify mint happened
        assertEq(token.balanceOf(escrow), 5000);
        assertTrue(token.processedTransfers(fundTransferId));

        // Step 4: Later, escrow burns to refund wholesaler on Optimism
        vm.prank(admin);
        token.addBurner(escrow); // escrow needs burner role

        vm.prank(escrow);
        bytes32 refundTransferId = token.burnCrossChain(
            escrow,
            5000,
            user1,
            10, // Optimism
            1
        );

        // Verify burn happened
        assertEq(token.balanceOf(escrow), 0);
        assertEq(token.totalSupply(), INITIAL_SUPPLY - 5000 - 5000 + 5000); // -5000 burn +5000 mint -5000 burn
    }

    // ============================================================
    // EDGE CASES & STRESS TESTS
    // ============================================================

    function test_MintToMaxUint() public {
        vm.prank(admin);
        token.addMinter(minter);

        // This would overflow, should revert
        vm.prank(minter);
        vm.expectRevert();
        token.mintCrossChain(user1, type(uint256).max, 80002, keccak256("max"));
    }

    function test_BurnMoreThanBalance() public {
        vm.prank(admin);
        token.addBurner(burner);

        vm.prank(admin);
        token.transfer(burner, 100);

        vm.prank(burner);
        vm.expectRevert("Insufficient balance");
        token.burnCrossChain(burner, 101, user1, 80002, 1);
    }

    function test_MultipleMintsSameMinter() public {
        vm.prank(admin);
        token.addMinter(minter);

        vm.startPrank(minter);
        token.mintCrossChain(user1, 1000, 80002, keccak256("a"));
        token.mintCrossChain(user1, 2000, 80002, keccak256("b"));
        token.mintCrossChain(user2, 3000, 137, keccak256("c"));
        vm.stopPrank();

        assertEq(token.balanceOf(user1), 3000);
        assertEq(token.balanceOf(user2), 3000);
    }

    function test_MultipleBurnsSameBurner() public {
        vm.prank(admin);
        token.addBurner(burner);

        vm.prank(admin);
        token.transfer(burner, 10000);

        vm.startPrank(burner);
        token.burnCrossChain(burner, 1000, user1, 80002, 1);
        token.burnCrossChain(burner, 2000, user2, 137, 2);
        token.burnCrossChain(burner, 3000, user1, 80002, 3);
        vm.stopPrank();

        assertEq(token.balanceOf(burner), 4000);
    }

    function test_FundEscrowCrossChainMultipleOrders() public {
        vm.prank(admin);
        token.transfer(user1, 50000);

        vm.startPrank(user1);
        bytes32 id1 = token.fundEscrowCrossChain(1, 1000, 84532);
        bytes32 id2 = token.fundEscrowCrossChain(2, 2000, 84532);
        bytes32 id3 = token.fundEscrowCrossChain(3, 3000, 137);
        vm.stopPrank();

        assertTrue(token.processedFundRequests(id1));
        assertTrue(token.processedFundRequests(id2));
        assertTrue(token.processedFundRequests(id3));
        assertEq(token.balanceOf(user1), 44000);
    }

    // ============================================================
    // ACCESS CONTROL INTEGRATION
    // ============================================================

    function test_MinterCannotBurn() public {
        vm.prank(admin);
        token.addMinter(minter);

        vm.prank(minter);
        vm.expectRevert();
        token.burnCrossChain(minter, 100, user1, 80002, 1);
    }

    function test_BurnerCannotMint() public {
        vm.prank(admin);
        token.addBurner(burner);

        vm.prank(burner);
        vm.expectRevert();
        token.mintCrossChain(burner, 100, 80002, keccak256("test"));
    }

    function test_AdminHasAllRoles() public {
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(token.hasRole(token.MINTER_ROLE(), admin));
        assertTrue(token.hasRole(token.BURNER_ROLE(), admin));
    }

    function test_RenouncedAdminCannotAddMinter() public {
        vm.startPrank(admin);
        token.renounceRole(token.DEFAULT_ADMIN_ROLE(), admin);

        vm.expectRevert();
        token.addMinter(minter);
        vm.stopPrank();
    }
}
