// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SupplyChainSource
 * @notice Deployed on Polygon Amoy (Chain A)
 * @dev Kwala listens to FraudDetected and ConditionBreached events here
 *      and executes flagItem() on Chain B and Chain C automatically
 */
contract SupplyChainSource {
    // ─────────────────────────────────────────────
    //  ROLES
    // ─────────────────────────────────────────────
    address public admin;
    mapping(address => bool) public authorizedManufacturers;
    mapping(address => bool) public authorizedLogistics;
    mapping(address => bool) public authorizedOracles; // IoT gateway addresses

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyManufacturer() {
        require(authorizedManufacturers[msg.sender], "Not a manufacturer");
        _;
    }

    modifier onlyLogistics() {
        require(authorizedLogistics[msg.sender], "Not authorized logistics");
        _;
    }

    modifier onlyOracle() {
        require(authorizedOracles[msg.sender], "Not an authorized IoT oracle");
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

    struct SensorReading {
        int256 temperature; // in °C (e.g. 2500 = 25.00°C)
        uint256 humidity; // in % (0-100)
        bool tiltDetected; // true if tilt exceeded safe angle
        uint256 timestamp;
    }

    struct Item {
        uint256 id;
        address manufacturer;
        address currentCustodian;
        Status status;
        bool exists;
        string lastLocation;
        uint256 lastScanTime;
        address lastScanner;
        uint256 scanCount;
        uint256 windowStart;
        SensorReading lastReading;
        string rfidTag;
    }

    mapping(uint256 => Item) public items;
    mapping(string => uint256) public rfidToItemId; // RFID tag → item ID

    // ─────────────────────────────────────────────
    //  FRAUD THRESHOLDS
    // ─────────────────────────────────────────────
    uint256 public constant FRAUD_TIME_WINDOW = 5 minutes;
    uint256 public constant MAX_SCANS_IN_WINDOW = 3;
    int256 public constant MAX_TEMPERATURE = 3000; // 30.00°C
    uint256 public constant MAX_HUMIDITY = 80; // 80%
    uint256 public itemCounter;

    // ─────────────────────────────────────────────
    //  EVENTS (Kwala listens to FraudDetected & ConditionBreached)
    // ─────────────────────────────────────────────
    event ItemCreated(uint256 indexed id, address manufacturer, string rfidTag);
    event ItemScanned(
        uint256 indexed id,
        address scanner,
        string location,
        uint256 timestamp
    );
    event ItemHandedOff(
        uint256 indexed id,
        address from,
        address to,
        string location
    );
    event SensorDataReported(
        uint256 indexed id,
        int256 temperature,
        uint256 humidity,
        bool tilt
    );
    event ItemDelivered(uint256 indexed id, address receiver, string location);

    // 🚨 These two are what Kwala triggers on
    event FraudDetected(uint256 indexed id, string reason, address flaggedBy);
    event ConditionBreached(
        uint256 indexed id,
        string breachType,
        string details
    );

    // ─────────────────────────────────────────────
    //  CONSTRUCTOR
    // ─────────────────────────────────────────────
    constructor() {
        admin = msg.sender;
    }

    // ─────────────────────────────────────────────
    //  ADMIN FUNCTIONS
    // ─────────────────────────────────────────────
    function addManufacturer(address account) external onlyAdmin {
        authorizedManufacturers[account] = true;
    }

    function addLogistics(address account) external onlyAdmin {
        authorizedLogistics[account] = true;
    }

    function addOracle(address account) external onlyAdmin {
        authorizedOracles[account] = true;
    }

    function removeManufacturer(address account) external onlyAdmin {
        authorizedManufacturers[account] = false;
    }

    function removeLogistics(address account) external onlyAdmin {
        authorizedLogistics[account] = false;
    }

    function removeOracle(address account) external onlyAdmin {
        authorizedOracles[account] = false;
    }

    // ─────────────────────────────────────────────
    //  MANUFACTURER — Create Item (AUTO-INCREMENT ID)
    // ─────────────────────────────────────────────
    function createItem(
        string memory rfidTag,
        string memory originLocation
    ) external onlyManufacturer {
        require(bytes(rfidTag).length > 0, "RFID tag required");
        require(rfidToItemId[rfidTag] == 0, "RFID tag already registered");
        require(bytes(originLocation).length > 0, "Origin location required");

        itemCounter++;
        uint256 id = itemCounter;

        items[id] = Item({
            id: id,
            manufacturer: msg.sender,
            currentCustodian: msg.sender,
            status: Status.Normal,
            exists: true,
            lastLocation: originLocation,
            lastScanTime: block.timestamp,
            lastScanner: msg.sender,
            scanCount: 1,
            windowStart: block.timestamp,
            lastReading: SensorReading(0, 0, false, block.timestamp),
            rfidTag: rfidTag
        });

        rfidToItemId[rfidTag] = id;

        emit ItemCreated(id, msg.sender, rfidTag);
    }

    // ─────────────────────────────────────────────
    //  LOGISTICS — Scan Item via RFID
    // ─────────────────────────────────────────────
    function scanItem(
        uint256 id,
        string memory location
    ) external onlyLogistics {
        require(items[id].exists, "Item not found");
        require(
            items[id].status == Status.Normal ||
                items[id].status == Status.InTransit,
            "Item is not scannable"
        );

        Item storage item = items[id];

        // ✅ Fraud Check 1: Impossible Travel
        if (
            item.lastScanTime > 0 &&
            block.timestamp - item.lastScanTime < FRAUD_TIME_WINDOW &&
            keccak256(bytes(item.lastLocation)) != keccak256(bytes(location))
        ) {
            emit FraudDetected(
                id,
                "Impossible travel: different location within time window",
                msg.sender
            );
        }

        // ✅ Fraud Check 2: Scan Frequency Abuse
        if (block.timestamp - item.windowStart < FRAUD_TIME_WINDOW) {
            item.scanCount++;
            if (item.scanCount > MAX_SCANS_IN_WINDOW) {
                emit FraudDetected(
                    id,
                    "Frequency abuse: too many scans in short window",
                    msg.sender
                );
            }
        } else {
            item.windowStart = block.timestamp;
            item.scanCount = 1;
        }

        // ✅ Fraud Check 3: Unauthorized Scanner
        if (msg.sender != item.currentCustodian) {
            emit FraudDetected(
                id,
                "Unauthorized scan: caller is not current custodian",
                msg.sender
            );
        }

        item.lastLocation = location;
        item.lastScanTime = block.timestamp;
        item.lastScanner = msg.sender;
        item.currentCustodian = msg.sender;
        item.status = Status.InTransit;

        emit ItemScanned(id, msg.sender, location, block.timestamp);
    }

    // ─────────────────────────────────────────────
    //  LOGISTICS — Hand off item to next custodian
    // ─────────────────────────────────────────────
    function handoffItem(
        uint256 id,
        address newCustodian,
        string memory location
    ) external onlyLogistics {
        require(items[id].exists, "Item not found");
        require(
            items[id].currentCustodian == msg.sender,
            "Not current custodian"
        );
        require(
            authorizedLogistics[newCustodian],
            "New custodian not authorized"
        );

        address previous = items[id].currentCustodian;
        items[id].currentCustodian = newCustodian;
        items[id].lastLocation = location;

        emit ItemHandedOff(id, previous, newCustodian, location);
    }

    // ─────────────────────────────────────────────
    //  IoT ORACLE — Report Sensor Data
    // ─────────────────────────────────────────────
    function reportConditions(
        uint256 id,
        int256 temperature,
        uint256 humidity,
        bool tiltDetected
    ) external onlyOracle {
        require(items[id].exists, "Item not found");

        Item storage item = items[id];

        item.lastReading = SensorReading({
            temperature: temperature,
            humidity: humidity,
            tiltDetected: tiltDetected,
            timestamp: block.timestamp
        });

        emit SensorDataReported(id, temperature, humidity, tiltDetected);

        // ✅ Condition Check 1: Temperature
        if (temperature > MAX_TEMPERATURE) {
            emit ConditionBreached(
                id,
                "TEMPERATURE",
                "Temperature exceeded maximum safe threshold"
            );
        }

        // ✅ Condition Check 2: Humidity
        if (humidity > MAX_HUMIDITY) {
            emit ConditionBreached(
                id,
                "HUMIDITY",
                "Humidity exceeded maximum safe threshold"
            );
        }

        // ✅ Condition Check 3: Tilt
        if (tiltDetected) {
            emit ConditionBreached(
                id,
                "TILT",
                "Item was tilted beyond safe angle during transit"
            );
        }
    }

    // ─────────────────────────────────────────────
    //  RETAILER — Confirm Delivery
    // ─────────────────────────────────────────────
    function confirmDelivery(uint256 id, string memory location) external {
        require(items[id].exists, "Item not found");
        require(
            items[id].currentCustodian == msg.sender,
            "Not current custodian"
        );
        require(
            items[id].status != Status.Flagged,
            "Item is flagged, cannot deliver"
        );

        items[id].status = Status.Delivered;
        items[id].lastLocation = location;

        emit ItemDelivered(id, msg.sender, location);
    }

    // ─────────────────────────────────────────────
    //  KWALA — Flag Item (called by Kwala on this chain too if needed)
    // ─────────────────────────────────────────────
    function flagItem(uint256 id, string memory reason) external {
        require(items[id].exists, "Item not found");
        require(
            authorizedOracles[msg.sender] || msg.sender == admin,
            "Not authorized to flag"
        );

        items[id].status = Status.Flagged;

        emit FraudDetected(id, reason, msg.sender);
    }

    // ─────────────────────────────────────────────
    //  HELPERS
    // ─────────────────────────────────────────────
    function getItem(uint256 id) external view returns (Item memory) {
        return items[id];
    }

    function getItemByRFID(
        string memory rfidTag
    ) external view returns (Item memory) {
        uint256 id = rfidToItemId[rfidTag];
        require(items[id].exists, "RFID not found");
        return items[id];
    }

    function getStatus(uint256 id) external view returns (Status) {
        return items[id].status;
    }

    function getNumberOfItems() external view returns (uint256) {
        return itemCounter;
    }

    // Add this to your existing deployed contract if you can't redeploy
    function getAllItemIds() external view returns (uint256[] memory) {
        uint256[] memory ids = new uint256[](itemCounter);
        uint256 count = 0;
        for (uint256 i = 1; i <= itemCounter + 100; i++) {
            // scan buffer for gaps
            if (items[i].exists) {
                ids[count] = i;
                count++;
            }
        }
        // Trim array
        assembly {
            mstore(ids, count)
        }
        return ids;
    }
}
