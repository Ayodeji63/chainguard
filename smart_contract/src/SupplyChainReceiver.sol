// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SupplyChainReceiver
 * @notice Deploy this same contract on BOTH Base Sepolia and ETH Sepolia
 * @dev Kwala calls flagItem() here when it detects fraud/breach on Chain A
 *      This contract is intentionally lightweight — Kwala is the bridge
 */
contract SupplyChainReceiver {
    // ─────────────────────────────────────────────
    //  ROLES
    // ─────────────────────────────────────────────
    address public admin;
    mapping(address => bool) public authorizedCallers; // Kwala smart wallet goes here

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyAuthorized() {
        require(
            authorizedCallers[msg.sender] || msg.sender == admin,
            "Not authorized"
        );
        _;
    }

    // ─────────────────────────────────────────────
    //  DATA STRUCTURES
    // ─────────────────────────────────────────────
    enum Status {
        Normal,
        Flagged,
        InTransit,
        Delivered
    }

    struct MirroredItem {
        uint256 id;
        Status status;
        bool exists;
        string lastKnownLocation;
        string flagReason;
        uint256 lastUpdated;
        uint256 sourceChainId; // Which chain did this come from
    }

    mapping(uint256 => MirroredItem) public items;

    // ─────────────────────────────────────────────
    //  EVENTS
    // ─────────────────────────────────────────────
    event ItemMirrored(
        uint256 indexed id,
        uint256 sourceChainId,
        string location
    );
    event ItemFlagged(uint256 indexed id, string reason, address flaggedBy);
    event ItemStatusUpdated(uint256 indexed id, Status newStatus);

    // ─────────────────────────────────────────────
    //  CONSTRUCTOR
    // ─────────────────────────────────────────────
    constructor() {
        admin = msg.sender;
    }

    // ─────────────────────────────────────────────
    //  ADMIN
    // ─────────────────────────────────────────────
    function addAuthorizedCaller(address account) external onlyAdmin {
        authorizedCallers[account] = true;
    }

    function removeAuthorizedCaller(address account) external onlyAdmin {
        authorizedCallers[account] = false;
    }

    // ─────────────────────────────────────────────
    //  MIRROR ITEM (called by admin/oracle to register item on this chain)
    // ─────────────────────────────────────────────
    function mirrorItem(
        uint256 id,
        string memory location,
        uint256 sourceChainId
    ) external {
        items[id] = MirroredItem({
            id: id,
            status: Status.Normal,
            exists: true,
            lastKnownLocation: location,
            flagReason: "",
            lastUpdated: block.timestamp,
            sourceChainId: sourceChainId
        });

        emit ItemMirrored(id, sourceChainId, location);
    }

    // ─────────────────────────────────────────────
    //  FLAG ITEM — Kwala calls this from Chain A events
    // ─────────────────────────────────────────────
    function flagItem(
        uint256 id,
        string memory reason
    ) external onlyAuthorized {
        // Auto-create a mirrored record if it doesn't exist yet
        // so Kwala can flag even before mirrorItem is called
        if (!items[id].exists) {
            items[id] = MirroredItem({
                id: id,
                status: Status.Normal,
                exists: true,
                lastKnownLocation: "Unknown",
                flagReason: "",
                lastUpdated: block.timestamp,
                sourceChainId: 0
            });
        }

        items[id].status = Status.Flagged;
        items[id].flagReason = reason;
        items[id].lastUpdated = block.timestamp;

        emit ItemFlagged(id, reason, msg.sender);
        emit ItemStatusUpdated(id, Status.Flagged);
    }

    // ─────────────────────────────────────────────
    //  HELPERS
    // ─────────────────────────────────────────────
    function getItem(uint256 id) external view returns (MirroredItem memory) {
        return items[id];
    }

    function getStatus(uint256 id) external view returns (Status) {
        require(items[id].exists, "Item not found");
        return items[id].status;
    }

    function isFlagged(uint256 id) external view returns (bool) {
        return items[id].status == Status.Flagged;
    }
}
