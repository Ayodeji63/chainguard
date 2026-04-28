// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ChainGuard {

    enum Status { InTransit, Delivered, Frozen }

    struct Batch {
        uint256 id;
        address currentOwner;
        Status status;
        bool exists;
    }

    mapping(uint256 => Batch) public batches;
    mapping(uint256 => address[]) public custodyHistory;

    event BatchCreated(uint256 id, address owner);
    event CustodyTransferred(uint256 id, address from, address to);
    event ScanLogged(uint256 id, address scanner, string location);
    event FraudDetected(uint256 id, address scanner, string reason);
    event BatchFrozen(uint256 id);

    modifier onlyOwner(uint256 id) {
        require(batches[id].currentOwner == msg.sender, "Not owner");
        _;
    }

    function createBatch(uint256 id) external {
        require(!batches[id].exists, "Batch exists");

        batches[id] = Batch({
            id: id,
            currentOwner: msg.sender,
            status: Status.InTransit,
            exists: true
        });

        custodyHistory[id].push(msg.sender);

        emit BatchCreated(id, msg.sender);
    }

    function transferCustody(uint256 id, address newOwner) external onlyOwner(id) {
        require(batches[id].status != Status.Frozen, "Frozen");

        address prev = batches[id].currentOwner;
        batches[id].currentOwner = newOwner;
        custodyHistory[id].push(newOwner);

        emit CustodyTransferred(id, prev, newOwner);
    }

    function logScan(uint256 id, string memory location) external {
        require(batches[id].exists, "Invalid batch");

        emit ScanLogged(id, msg.sender, location);
    }

    function flagFraud(uint256 id, address scanner, string memory reason) external {
        require(batches[id].exists, "Invalid batch");

        batches[id].status = Status.Frozen;

        emit FraudDetected(id, scanner, reason);
        emit BatchFrozen(id);
    }

    function getCurrentOwner(uint256 id) external view returns (address) {
        return batches[id].currentOwner;
    }

    function getStatus(uint256 id) external view returns (Status) {
        return batches[id].status;
    }
}