// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract SupplyChainToken is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    mapping(bytes32 => bool) public processedTransfers;
    mapping(bytes32 => bool) public processedFundRequests;

    event TokensBurned(
        address indexed from,
        uint256 amount,
        address indexed recipient,
        uint64 destinationChainId,
        bytes32 transferId
    );
    event TokensMinted(address indexed to, uint256 indexed amount);
    event EscrowFundRequest(
        uint256 indexed orderId,
        address indexed wholesaler,
        uint256 indexed amount,
        uint256 sourceChainId,
        uint256 destinationChainId
    );

    constructor(uint256 initialSupply) ERC20("SupplyChainToken", "SCT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);
        _mint(msg.sender, initialSupply);
    }

    function addMinter(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MINTER_ROLE, account);
    }

    function addBurner(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(BURNER_ROLE, account);
    }

    function mintCrossChain(
        address to,
        uint256 amount
    ) external onlyRole(MINTER_ROLE) {
        // require(!processedTransfers[transferId], "Transfer already processed");
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    function burnCrossChain(
        address from,
        uint256 amount,
        address recipient,
        uint256 destinationChainId,
        uint256 nonce
    ) external onlyRole(BURNER_ROLE) returns (bytes32 transferId) {
        require(amount > 0, "Insufficient balance");
        require(balanceOf(from) >= amount, "Insufficient balance");

        if (from != msg.sender) {
            require(
                allowance(from, msg.sender) >= amount,
                "Insufficient allowance"
            );
            _spendAllowance(from, msg.sender, amount);
        }

        _burn(from, amount);

        transferId = keccak256(
            abi.encodePacked(
                from,
                recipient,
                amount,
                destinationChainId,
                nonce,
                block.timestamp
            )
        );

        emit TokensBurned(
            from,
            amount,
            recipient,
            uint64(destinationChainId),
            transferId
        );
        return transferId;
    }

    function fundEscrowCrossChain(
        uint256 orderId,
        uint256 amount,
        uint256 destinationChainId
    ) external returns (bytes32 transferId) {
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");

        _burn(msg.sender, amount);

        transferId = keccak256(
            abi.encodePacked(
                msg.sender,
                orderId,
                amount,
                destinationChainId,
                block.timestamp
            )
        );

        require(
            !processedFundRequests[transferId],
            "Request already processed"
        );
        processedFundRequests[transferId] = true;

        emit EscrowFundRequest(
            orderId,
            msg.sender,
            amount,
            block.chainid,
            destinationChainId
        );

        return transferId;
    }
}
