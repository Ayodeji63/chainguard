// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISupplyChainToken {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function burnCrossChain(
        address from,
        uint256 amount,
        address recipient,
        uint256 destinationChainId,
        uint256 nonce
    ) external returns (bytes32 transferId);
    function mintCrossChain(address to, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

contract SupplyChainEscrow {
    address public admin;
    ISupplyChainToken public token;
    uint256 public currentChainId;

    mapping(address => bool) public authorizedOracles;
    mapping(bytes32 => bool) public processedFundRequests;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyOracle() {
        require(
            authorizedOracles[msg.sender] || msg.sender == admin,
            "Not oracle"
        );
        _;
    }

    enum OrderStatus {
        Created,
        CarrierReady,
        Funded,
        InTransit,
        Delivered,
        Disputed,
        Resolved
    }
    enum LiableParty {
        None,
        Manufacturer,
        Carrier,
        Wholesaler
    }

    struct Party {
        address wallet;
        uint256 chainId;
    }

    struct Order {
        uint256 orderId;
        uint256 itemId;
        Party manufacturer;
        Party carrier;
        Party wholesaler;
        uint256 orderValue;
        uint256 shippingFee;
        uint256 carrierDeposit;
        OrderStatus status;
        LiableParty liableParty;
        bool exists;
        uint256 createdAt;
        uint256 pickedUpAt;
        uint256 deliveredAt;
        string breachReason;
    }

    mapping(uint256 => Order) public orders;
    mapping(uint256 => uint256) public itemToOrder;

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
        address indexed wholesaler,
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
        LiableParty liable,
        string reason
    );
    event OrderResolved(uint256 indexed orderId, LiableParty liable);

    uint256 transferId;
    constructor(address tokenAddress, uint256 _currentChainId) {
        admin = msg.sender;
        token = ISupplyChainToken(tokenAddress);
        currentChainId = _currentChainId;
    }

    function addOracle(address account) external onlyAdmin {
        authorizedOracles[account] = true;
    }

    function createOrder(
        uint256 orderId,
        uint256 itemId,
        address carrierWallet,
        uint256 carrierChainId,
        address wholesalerWallet,
        uint256 wholesalerChainId,
        uint256 manufacturerChainId,
        uint256 orderValue,
        string memory location
    ) external {
        require(!orders[orderId].exists, "Order already exists");
        require(itemToOrder[itemId] == 0, "Item already has an order");
        require(orderValue > 0, "Order value must be > 0");

        orders[orderId] = Order({
            orderId: orderId,
            itemId: itemId,
            manufacturer: Party(msg.sender, manufacturerChainId),
            carrier: Party(carrierWallet, carrierChainId),
            wholesaler: Party(wholesalerWallet, wholesalerChainId),
            orderValue: orderValue,
            shippingFee: 0,
            carrierDeposit: 0,
            status: OrderStatus.Created,
            liableParty: LiableParty.None,
            exists: true,
            createdAt: block.timestamp,
            pickedUpAt: 0,
            deliveredAt: 0,
            breachReason: ""
        });

        itemToOrder[itemId] = orderId;
        emit OrderCreated(orderId, location, manufacturerChainId);
    }

    function depositCarrierBond(
        uint256 orderId,
        uint256 shippingFee,
        uint256 carrierDeposit
    ) external {
        Order storage order = orders[orderId];
        require(order.exists, "Order not found");
        require(msg.sender == order.carrier.wallet, "Not the carrier");
        require(order.status == OrderStatus.Created, "Wrong status");
        require(shippingFee > 0, "Shipping fee must be > 0");
        require(carrierDeposit > 0, "Carrier deposit must be > 0");

        require(
            token.transferFrom(msg.sender, address(this), carrierDeposit),
            "Bond transfer failed"
        );

        order.shippingFee = shippingFee;
        order.carrierDeposit = carrierDeposit;
        order.status = OrderStatus.CarrierReady;

        emit CarrierBondDeposited(orderId, msg.sender, carrierDeposit);
        emit CarrierTermsSet(orderId, shippingFee, carrierDeposit);
    }

    function fundEscrow(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(order.exists, "Order not found");
        require(msg.sender == order.wholesaler.wallet, "Not the wholesaler");
        require(
            order.status == OrderStatus.CarrierReady,
            "Carrier bond not deposited yet"
        );

        uint256 totalDue = order.orderValue + order.shippingFee;
        require(
            token.transferFrom(msg.sender, address(this), totalDue),
            "Escrow funding failed"
        );

        order.status = OrderStatus.Funded;
        emit EscrowFunded(orderId, msg.sender, totalDue);
    }

    function fundEscrowByOracle(
        uint256 orderId,
        address wholesaler,
        uint256 amount
    ) external onlyOracle {
        Order storage order = orders[orderId];
        require(order.exists, "Order not found");
        require(order.status == OrderStatus.CarrierReady, "Not ready");
        require(order.wholesaler.wallet == wholesaler, "Wrong wholesaler");

        token.mintCrossChain(address(this), amount);

        uint256 expectedTotal = order.orderValue + order.shippingFee;
        require(amount == expectedTotal, "Amount mismatch");

        order.status = OrderStatus.Funded;
        emit EscrowFundedCrossChain(orderId, wholesaler, amount);
    }

    function confirmPickup(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(order.exists, "Order not found");
        require(msg.sender == order.carrier.wallet, "Not the carrier");
        require(order.status == OrderStatus.Funded, "Not funded yet");

        order.status = OrderStatus.InTransit;
        order.pickedUpAt = block.timestamp;
        emit ItemPickedUp(orderId, msg.sender);
    }

    function confirmDelivery(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(order.exists, "Order not found");
        require(msg.sender == order.wholesaler.wallet, "Not the wholesaler");
        require(order.status == OrderStatus.InTransit, "Not in transit");

        order.status = OrderStatus.Delivered;
        order.deliveredAt = block.timestamp;

        _sendTokens(
            orderId,
            order.manufacturer.wallet,
            order.manufacturer.chainId,
            order.orderValue,
            "Payment: goods delivered"
        );
        _sendTokens(
            orderId,
            order.carrier.wallet,
            order.carrier.chainId,
            order.shippingFee + order.carrierDeposit,
            "Shipping fee + bond returned"
        );

        order.status = OrderStatus.Resolved;
        emit DeliveryConfirmed(orderId, msg.sender);
    }

    function resolveDispute(
        uint256 itemId,
        string memory reason
    ) external onlyOracle {
        uint256 orderId = itemToOrder[itemId];
        Order storage order = orders[orderId];

        require(order.exists, "Order not found");
        require(
            order.status == OrderStatus.Funded ||
                order.status == OrderStatus.InTransit,
            "Cannot dispute at this stage"
        );

        order.status = OrderStatus.Disputed;
        order.breachReason = reason;

        if (order.pickedUpAt == 0) {
            order.liableParty = LiableParty.Manufacturer;

            uint256 wholesalerRefund = order.orderValue + order.shippingFee;
            _sendTokens(
                orderId,
                order.wholesaler.wallet,
                order.wholesaler.chainId,
                wholesalerRefund,
                "Full refund: breach before pickup"
            );
            _sendTokens(
                orderId,
                order.carrier.wallet,
                order.carrier.chainId,
                order.carrierDeposit,
                "Bond returned: Carrier not liable"
            );
        } else {
            order.liableParty = LiableParty.Carrier;

            uint256 wholesalerRefund = order.orderValue + order.shippingFee;
            _sendTokens(
                orderId,
                order.wholesaler.wallet,
                order.wholesaler.chainId,
                wholesalerRefund,
                "Full refund: breach during transit"
            );
            _sendTokens(
                orderId,
                order.manufacturer.wallet,
                order.manufacturer.chainId,
                order.carrierDeposit,
                "Carrier bond slashed: compensation"
            );
        }

        order.status = OrderStatus.Resolved;
        emit DisputeRaised(orderId, order.liableParty, reason);
        emit OrderResolved(orderId, order.liableParty);
    }

    uint256 private nonce = 0;

    function _sendTokens(
        uint256 orderId,
        address recipient,
        uint256 destinationChainId,
        uint256 amount,
        string memory reason
    ) internal {
        if (destinationChainId == currentChainId) {
            require(token.transfer(recipient, amount), "Token transfer failed");
            emit SameChainPayment(orderId, recipient, amount, reason);
        } else {
            nonce++;
            bytes32 transferId = token.burnCrossChain(
                address(this),
                amount,
                recipient,
                uint256(destinationChainId),
                nonce
            );
            emit CrossChainPayment(
                orderId,
                recipient,
                amount,
                uint256(destinationChainId),
                transferId,
                reason
            );
        }
    }

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    function getOrderByItem(
        uint256 itemId
    ) external view returns (Order memory) {
        return orders[itemToOrder[itemId]];
    }

    function getEscrowBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
