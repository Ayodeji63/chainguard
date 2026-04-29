# ChainGuard

> **Blockchain + IoT Supply Chain Security**  Real-time condition monitoring, smart contract escrow, and automated cross-chain dispute resolution powered by Kwala Serverless.

---

## Overview

ChainGuard is a decentralized supply chain security system built for global oil & gas and goods logistics. It combines IoT sensor simulation with smart contracts to enforce accountability between manufacturers, carriers, and wholesalers automatically, without human intervention.

When goods are damaged in transit, sensors detect the breach, Kwala triggers dispute resolution, and funds are redistributed all on-chain, in seconds.

---

## The Problem

- Temperature, humidity, and tilt breaches go **undetected** during transit
- Payments rely on **paper contracts** and trust  disputes take 60+ days
- Manufacturers and wholesalers in **different jurisdictions** have no shared enforcement system
- Fraud (unauthorized RFID scans, impossible travel) has **no on-chain evidence trail**

---

## The Solution

ChainGuard connects three layers:

```
IoT Playground → Oracle Backend → Smart Contracts → Kwala Automation → Cross-Chain Settlement
```

1. An **IoT Playground** simulates real sensor readings (temperature, humidity, tilt, RFID)
2. An **Oracle Backend** signs and submits readings on-chain via `reportConditions()`
3. **Smart contracts** on Base hold escrow funds and track item state
4. **Kwala Serverless** listens to on-chain events and automatically calls `resolveDispute()`, `flagItem()`, and `mintCrossChain()`
5. Wholesalers on **Optimism** receive refunds cross-chain via a burn-and-mint bridge

---

## Architecture

```
                        BASE CHAIN
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  IoT Playground                                         │
│       │                                                 │
│       ▼                                                 │
│  Oracle Backend ──► reportConditions()                  │
│                          │                              │
│                   SupplyChainSource.sol                 │
│                    ├─ ItemScanned ──────────────────┐   │
│                    ├─ ConditionBreached ──────────┐ │   │
│                    └─ FraudDetected ────────────┐ │ │   │
│                                                 │ │ │   │
│  SupplyChainEscrow.sol                          │ │ │   │
│    └─ resolveDispute() ◄── Kwala ───────────────┘ │ │   │
│                                                   │ │   │
│  SupplyChainToken.sol (tokenA)                    │ │   │
│    └─ burnCrossChain() ◄──────────────────────────┘ │   │
│                                                     │   │
└─────────────────────────────────────────────────────│───┘
                                                      │
                         KWALA                        │
                   (event listener +                  │
                    cross-chain executor)             │
                         │◄────────────────────────────┘
                         │
              ┌──────────┼──────────────┐
              ▼          ▼              ▼
         mirrorItem() flagItem()  mintCrossChain()
              │          │              │
              └──────────┴──────────────┘
                         │
                  OPTIMISM CHAIN
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  SupplyChainReceiver.sol    SupplyChainToken.sol (tokenB)│
│    ├─ mirrorItem()            └─ mintCrossChain()        │
│    └─ flagItem()                  Wholesaler receives    │
│                                   refund here            │
└─────────────────────────────────────────────────────────┘
```

---

## Smart Contracts

All contracts are deployed on **Base** except the token and receiver on **Optimism**.

### SupplyChainSource.sol `[Base]`

Tracks item state, records sensor readings, and detects breaches and fraud.

| Function                                     | Caller         | Description                         |
| -------------------------------------------- | -------------- | ----------------------------------- |
| `createItem(id, rfidTag, location)`          | Manufacturer   | Register a new item on-chain        |
| `scanItem(id, location)`                     | Carrier        | Record a custody scan with location |
| `reportConditions(id, temp, humidity, tilt)` | Oracle         | Submit IoT sensor data              |
| `flagItem(id, reason)`                       | Oracle / Kwala | Flag an item for fraud or breach    |
| `getItem(id)`                                | Anyone         | Read full item state                |

**Events emitted:**

- `ItemCreated`  new item registered
- `ItemScanned`  custody scan recorded
- `SensorDataReported`  sensor reading logged
- `ConditionBreached`  threshold exceeded (temp/humidity/tilt)
- `FraudDetected`  unauthorized scan or impossible travel

---

### SupplyChainEscrow.sol `[Base]`

Holds funds during transit and auto-disburses on delivery or breach.

**Order lifecycle:**

```
createOrder() → depositCarrierBond() → fundEscrow() → confirmPickup() → confirmDelivery()
                                                                      ↘ resolveDispute() (Kwala)
```

| Function                                            | Caller       | Description                                    |
| --------------------------------------------------- | ------------ | ---------------------------------------------- |
| `createOrder(...)`                                  | Manufacturer | Create order with carrier + wholesaler details |
| `depositCarrierBond(orderId, shippingFee, deposit)` | Carrier      | Lock bond + set shipping fee                   |
| `fundEscrow(orderId)`                               | Wholesaler   | Pay `orderValue + shippingFee`                 |
| `fundEscrowByOracle(orderId, transferId, ...)`      | Kwala        | Fund escrow from cross-chain burn              |
| `confirmPickup(orderId)`                            | Carrier      | Start transit phase                            |
| `confirmDelivery(orderId)`                          | Wholesaler   | Release funds on successful delivery           |
| `resolveDispute(itemId, reason)`                    | Kwala        | Auto-resolve on breach or fraud                |

**Money flow:**

| Scenario                 | Manufacturer     | Carrier              | Wholesaler  |
| ------------------------ | ---------------- | -------------------- | ----------- |
| ✅ Delivered             | `orderValue`     | `shippingFee + bond` | Gets goods  |
| 🚨 Breach before pickup  | Nothing          | Bond returned        | Full refund |
| 🚨 Breach during transit | `carrierDeposit` | Bond slashed         | Full refund |

---

### SupplyChainToken.sol `[Base + Optimism]`

Standard ERC20 with cross-chain burn/mint capability. Deployed on both chains with different roles.

| Chain    | Token  | Supply               | Key Role                                |
| -------- | ------ | -------------------- | --------------------------------------- |
| Base     | tokenA | 10,000,000 SCT       | Burned by Escrow on cross-chain payment |
| Optimism | tokenB | 0 (minted on demand) | Minted by Kwala on cross-chain receipt  |

| Function                                                      | Description                                  |
| ------------------------------------------------------------- | -------------------------------------------- |
| `burnCrossChain(from, amount, recipient, destChainId, nonce)` | Burns tokenA, emits `TokensBurned` for Kwala |
| `mintCrossChain(to, amount, sourceChainId, transferId)`       | Mints tokenB when Kwala relays a burn        |

---

### SupplyChainReceiver.sol `[Optimism]`

Lightweight mirror of item state on the wholesaler's chain.

| Function                                  | Caller | Description                            |
| ----------------------------------------- | ------ | -------------------------------------- |
| `mirrorItem(id, location, sourceChainId)` | Kwala  | Register item on Optimism              |
| `flagItem(id, reason)`                    | Kwala  | Flag item when breach detected on Base |
| `isFlagged(id)`                           | Anyone | Check if item is flagged               |

---

## Kwala Workflows

Kwala Serverless automates all cross-chain actions. Four workflows are configured:

| #   | Trigger             | Chain | Action                            | Target Chain    |
| --- | ------------------- | ----- | --------------------------------- | --------------- |
| 1   | `ItemScanned`       | Base  | `mirrorItem()`                    | Optimism        |
| 2   | `ConditionBreached` | Base  | `flagItem()` + `resolveDispute()` | Optimism + Base |
| 3   | `FraudDetected`     | Base  | `flagItem()` + `resolveDispute()` | Optimism + Base |
| 4   | `TokensBurned`      | Base  | `mintCrossChain()`                | Optimism        |

Kwala's SmartWallet is registered via:

```solidity
escrow.addOracle(kwalaSmartWallet);
receiver.addAuthorizedCaller(kwalaSmartWallet);
```

---

## Project Structure

```
chainguard/
├── smart_contract/              # Foundry project
│   ├── src/
│   │   ├── SupplyChainSource.sol
│   │   ├── SupplyChainEscrow.sol
│   │   ├── SupplyChainToken.sol
│   │   └── SupplyChainReceiver.sol
│   └── test/
│       └── integration/
│           └── SupplyChainIntegration.t.sol
├── backend/                     # Oracle backend (Node.js + Viem)
│   └── src/
│       ├── server.ts            # Express + WebSocket entry point
│       ├── abis/                # Contract ABI fragments
│       ├── lib/                 # Viem clients (Base + Optimism)
│       ├── services/
│       │   ├── oracle.ts        # Submits sensor data on-chain
│       │   ├── simulator.ts     # IoT Playground simulator
│       │   └── eventWatcher.ts  # Watches on-chain events → WebSocket
│       └── routes/
│           ├── sensors.ts       # POST /api/sensors/report
│           ├── simulator.ts     # POST /api/simulator/start|stop|inject
│           └── items.ts         # GET /api/items/* (chain reads)
├── IoT/                         # Frontend (React + Wagmi)
│   └── src/
│       ├── pages/
│       │   ├── Landing.tsx
│       │   ├── Manufacturer.tsx
│       │   ├── Carrier.tsx
│       │   ├── Wholesaler.tsx
│       │   └── Playground.tsx
│       └── components/
│           ├── ShipmentMap.tsx
│           ├── SensorPanel.tsx
│           └── AlertBanner.tsx
├── kwala.yaml                   # Kwala workflow definitions
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- pnpm or npm

### 1. Clone the repo

```bash
git clone https://github.com/your-username/chainguard.git
cd chainguard
```

### 2. Deploy smart contracts

```bash
cd smart_contract
forge install
forge build
forge test

# Deploy to Base Sepolia
forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify

# Deploy token + receiver to Optimism Sepolia
forge script script/DeployOptimism.s.sol --rpc-url $OPTIMISM_RPC_URL --broadcast --verify
```

### 3. Start the oracle backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in .env with contract addresses + oracle private key
npm run dev
```

Backend starts at:

- REST API → `http://localhost:3001`
- WebSocket → `ws://localhost:3001`

### 4. Start the frontend

```bash
cd IoT
npm install
npm run dev
```

Frontend starts at `http://localhost:5173`

### 5. Post-deploy setup

After deploying, register Kwala's SmartWallet:

```solidity
// On Base
escrow.addOracle(0xKwalaSmartWallet);
source.addOracle(0xYourOracleBackendWallet);

// On Optimism
receiver.addAuthorizedCaller(0xKwalaSmartWallet);
tokenB.addMinter(0xKwalaSmartWallet);
```

---

## Environment Variables

```env
# Oracle wallet (registered via addOracle())
ORACLE_PRIVATE_KEY=0x...

# RPC endpoints
BASE_RPC_URL=https://mainnet.base.org
OPTIMISM_RPC_URL=https://mainnet.optimism.io

# Chain IDs
BASE_CHAIN_ID=8453
OPTIMISM_CHAIN_ID=10

# Contract addresses  Base
SOURCE_CONTRACT_ADDRESS=0x...
ESCROW_CONTRACT_ADDRESS=0x...
TOKEN_A_CONTRACT_ADDRESS=0x...

# Contract addresses  Optimism
RECEIVER_CONTRACT_ADDRESS=0x...
TOKEN_B_CONTRACT_ADDRESS=0x...

# Raspberry Pi auth
RASPBERRY_PI_SECRET=your-secret-here

# Server
PORT=3001
FRONTEND_URL=http://localhost:5173
```

---

## API Reference

### Sensor Ingest

```bash
# Submit a sensor reading (Playground or Pi)
POST /api/sensors/report
{
  "itemId": 1,
  "temperature": 24.5,
  "humidity": 65,
  "tiltDetected": false,
  "source": "playground"  # or "pi"
}
```

### Simulator Control

```bash
POST /api/simulator/start    # Start recurring simulation
POST /api/simulator/stop     # Stop simulator
POST /api/simulator/inject   # One-shot reading (preset injection)
GET  /api/simulator/status   # Check if simulator is running
```

### Chain Reads

```bash
GET /api/items/:id              # Full item state from Base
GET /api/items/:id/status       # Item status (0=Normal 1=Flagged 2=InTransit 3=Delivered)
GET /api/items/rfid/:tag        # Look up item by RFID tag
GET /api/items/:id/order        # Linked escrow order
GET /api/items/:id/mirrored     # Mirrored state on Optimism
GET /api/items/:id/flagged      # Is item flagged on Optimism?
GET /api/items/token-balance/:address/:chain  # SCT balance (base or optimism)
```

### WebSocket Events

Connect to `ws://localhost:3001`  the backend streams these events to the frontend:

| Event             | Trigger                                    |
| ----------------- | ------------------------------------------ |
| `sensor_reading`  | New reading received or confirmed on-chain |
| `tx_sent`         | Transaction submitted to mempool           |
| `tx_confirmed`    | Transaction mined                          |
| `tx_error`        | Transaction failed or reverted             |
| `breach_detected` | `ConditionBreached` event on Base          |
| `fraud_detected`  | `FraudDetected` event on Base              |
| `item_flagged`    | `ItemFlagged` event on Optimism            |
| `item_mirrored`   | `ItemMirrored` event on Optimism           |
| `order_event`     | Any escrow event                           |
| `simulator_state` | Simulator started or stopped               |

---

## Running Tests

```bash
cd smart_contract

# Run all tests
forge test -vvvv

# Run specific test
forge test --match-test testFullHappyPathCrossChainPayment -vvvv
forge test --match-test testBreachDuringTransitCarrierLiable -vvvv
forge test --match-test testFraudDetectedImpossibleTravel -vvvv
```

---

## Deployment Addresses

| Contract             | Chain    | Address                                      |
| -------------------- | -------- | -------------------------------------------- |
| SupplyChainSource    | Base     | `0x0c524712a77aD9F72F6482F66e3845382675A3E3` |
| SupplyChainEscrow    | Base     | `0x29CE120E1246E8ea6e3BaAf3AEcd4be58582f526` |
| SupplyChainToken (A) | Base     | `0x1DE0046d87736c32DB5e10459F3409Afc5C3E0DE` |
| SupplyChainToken (B) | Optimism | `0xC3BaE3b62e56b451a1aA5C96e50B859FfC20340a` |

---

## Tech Stack

| Layer                  | Technology                                          |
| ---------------------- | --------------------------------------------------- |
| Smart Contracts        | Solidity 0.8.20, OpenZeppelin, Foundry              |
| Blockchain             | Base (Chain A), Optimism (Chain B)                  |
| Cross-Chain Automation | Kwala Serverless                                    |
| Oracle Backend         | Node.js, TypeScript, Viem, Express, WebSocket       |
| Frontend               | React, TypeScript, Wagmi, RainbowKit, Framer Motion |
| IoT Simulation         | Custom Playground (temp · humidity · tilt · RFID)   |

---

## Future Plans

- **Real IoT hardware**  Replace Playground with Raspberry Pi (DHT22 + MPU6050 + RC522 RFID)
- **Multi-hop supply chains**  Distributor and retailer roles with nested escrow
- **Cross-chain escrow funding**  Wholesaler funds escrow natively from Optimism via `burnCrossChain`
- **ZK compliance proofs**  Privacy-preserving sensor data for regulatory submissions
- **NAFDAC / FDA compliance layer**  On-chain regulatory reporting for pharmaceutical shipments

---

## License

MIT

---

_Built for the Kwala Hackathon  Modernizing African Finance & Energy_
