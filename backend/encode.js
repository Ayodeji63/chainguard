import {
  supplyChainEscrowAbi,
  SupplyChainSourceAbi,
  SupplyChainTokenAbi,
} from "./contract.js";
// const abi = [
//   {
//     inputs: [
//       {
//         internalType: "uint256",
//         name: "id",
//         type: "uint256",
//       },
//     ],
//     name: "createItem",
//     outputs: [],
//     stateMutability: "nonpayable",
//     type: "function",
//   },
//   {
//     inputs: [
//       {
//         internalType: "uint256",
//         name: "id",
//         type: "uint256",
//       },
//       {
//         internalType: "string",
//         name: "reason",
//         type: "string",
//       },
//     ],
//     name: "flagItem",
//     outputs: [],
//     stateMutability: "nonpayable",
//     type: "function",
//   },
//   {
//     anonymous: false,
//     inputs: [
//       {
//         indexed: false,
//         internalType: "uint256",
//         name: "id",
//         type: "uint256",
//       },
//       {
//         indexed: false,
//         internalType: "address",
//         name: "scanner",
//         type: "address",
//       },
//       {
//         indexed: false,
//         internalType: "string",
//         name: "location",
//         type: "string",
//       },
//       {
//         indexed: false,
//         internalType: "string",
//         name: "reason",
//         type: "string",
//       },
//     ],
//     name: "FraudDetected",
//     type: "event",
//   },
//   {
//     anonymous: false,
//     inputs: [
//       {
//         indexed: false,
//         internalType: "uint256",
//         name: "id",
//         type: "uint256",
//       },
//       {
//         indexed: false,
//         internalType: "address",
//         name: "owner",
//         type: "address",
//       },
//     ],
//     name: "ItemCreated",
//     type: "event",
//   },
//   {
//     anonymous: false,
//     inputs: [
//       {
//         indexed: false,
//         internalType: "uint256",
//         name: "id",
//         type: "uint256",
//       },
//       {
//         indexed: false,
//         internalType: "string",
//         name: "reason",
//         type: "string",
//       },
//     ],
//     name: "ItemFlagged",
//     type: "event",
//   },
//   {
//     anonymous: false,
//     inputs: [
//       {
//         indexed: false,
//         internalType: "uint256",
//         name: "id",
//         type: "uint256",
//       },
//       {
//         indexed: false,
//         internalType: "address",
//         name: "scanner",
//         type: "address",
//       },
//       {
//         indexed: false,
//         internalType: "string",
//         name: "location",
//         type: "string",
//       },
//     ],
//     name: "ItemScanned",
//     type: "event",
//   },
//   {
//     inputs: [
//       {
//         internalType: "uint256",
//         name: "id",
//         type: "uint256",
//       },
//       {
//         internalType: "string",
//         name: "location",
//         type: "string",
//       },
//     ],
//     name: "scanItem",
//     outputs: [],
//     stateMutability: "nonpayable",
//     type: "function",
//   },
//   {
//     inputs: [],
//     name: "FRAUD_TIME_WINDOW",
//     outputs: [
//       {
//         internalType: "uint256",
//         name: "",
//         type: "uint256",
//       },
//     ],
//     stateMutability: "view",
//     type: "function",
//   },
//   {
//     inputs: [
//       {
//         internalType: "uint256",
//         name: "id",
//         type: "uint256",
//       },
//     ],
//     name: "getStatus",
//     outputs: [
//       {
//         internalType: "enum KwalaTest.Status",
//         name: "",
//         type: "uint8",
//       },
//     ],
//     stateMutability: "view",
//     type: "function",
//   },
//   {
//     inputs: [
//       {
//         internalType: "uint256",
//         name: "",
//         type: "uint256",
//       },
//     ],
//     name: "items",
//     outputs: [
//       {
//         internalType: "uint256",
//         name: "id",
//         type: "uint256",
//       },
//       {
//         internalType: "address",
//         name: "owner",
//         type: "address",
//       },
//       {
//         internalType: "enum KwalaTest.Status",
//         name: "status",
//         type: "uint8",
//       },
//       {
//         internalType: "bool",
//         name: "exists",
//         type: "bool",
//       },
//       {
//         internalType: "string",
//         name: "lastLocation",
//         type: "string",
//       },
//       {
//         internalType: "uint256",
//         name: "lastScanTime",
//         type: "uint256",
//       },
//       {
//         internalType: "address",
//         name: "lastScanner",
//         type: "address",
//       },
//       {
//         internalType: "uint256",
//         name: "scanCount",
//         type: "uint256",
//       },
//       {
//         internalType: "uint256",
//         name: "windowStart",
//         type: "uint256",
//       },
//     ],
//     stateMutability: "view",
//     type: "function",
//   },
//   {
//     inputs: [],
//     name: "MAX_SCANS_IN_WINDOW",
//     outputs: [
//       {
//         internalType: "uint256",
//         name: "",
//         type: "uint256",
//       },
//     ],
//     stateMutability: "view",
//     type: "function",
//   },
// ];

// const encoded = Buffer.from(JSON.stringify(abi)).toString("base64");

// console.log(`${encoded} \n \n`);

// const encodeFlag = {
//   inputs: [
//     {
//       internalType: "uint256",
//       name: "id",
//       type: "uint256",
//     },
//     {
//       internalType: "string",
//       name: "reason",
//       type: "string",
//     },
//   ],
//   name: "flagItem",
//   outputs: [],
//   stateMutability: "nonpayable",
//   type: "function",
// };

// const encodedFlag = Buffer.from(JSON.stringify(encodeFlag)).toString("base64");

// console.log(`${encodedFlag} \n \n`);

const encodeSupplyChainAbi = Buffer.from(
  JSON.stringify(SupplyChainSourceAbi),
).toString("base64");

console.log(
  `============================== Encoded Supply Chain ABI: \n${encodeSupplyChainAbi} \n==============================`,
);

// const encodeFlagAbi = {
//   type: "function",
//   name: "flagItem",
//   inputs: [
//     { name: "id", type: "uint256", internalType: "uint256" },
//     { name: "reason", type: "string", internalType: "string" },
//   ],
//   outputs: [],
//   stateMutability: "nonpayable",
// };
// const encodeFlagItem = Buffer.from(JSON.stringify(encodeFlagAbi)).toString(
//   "base64",
// );

// console.log(
//   `============================== Encoded flagItem ABI: \n${encodeFlagItem} \n==============================`,
// );

// const encodeEscrowContract = Buffer.from(
//   JSON.stringify(supplyChainEscrowAbi),
// ).toString("base64");

// console.log(
//   `============================== Encoded Escrow Contract ABI: \n${encodeEscrowContract} \n==============================`,
// );

// const resolveDisputeAbi = {
//   type: "function",
//   name: "resolveDispute",
//   inputs: [
//     { name: "itemId", type: "uint256", internalType: "uint256" },
//     { name: "reason", type: "string", internalType: "string" },
//   ],
//   outputs: [],
//   stateMutability: "nonpayable",
// };

// const encodeResolveDispute = Buffer.from(
//   JSON.stringify(resolveDisputeAbi),
// ).toString("base64");

// console.log(
//   `============================== Encoded resolveDispute ABI: \n${encodeResolveDispute} \n==============================`,
// );

// const mintCrossChainAbi = {
//   type: "function",
//   name: "mintCrossChain",
//   inputs: [
//     { name: "to", type: "address", internalType: "address" },
//     { name: "amount", type: "uint256", internalType: "uint256" },
//     { name: "sourceChainId", type: "uint64", internalType: "uint64" },
//     { name: "transferId", type: "bytes32", internalType: "bytes32" },
//   ],
//   outputs: [],
//   stateMutability: "nonpayable",
// };

// const TokenBurnedAbi = {
//   type: "event",
//   name: "TokensBurned",
//   inputs: [
//     { name: "from", type: "address", indexed: true, internalType: "address" },
//     {
//       name: "amount",
//       type: "uint256",
//       indexed: false,
//       internalType: "uint256",
//     },
//     {
//       name: "recipient",
//       type: "address",
//       indexed: true,
//       internalType: "address",
//     },
//     {
//       name: "destinationChainId",
//       type: "uint64",
//       indexed: false,
//       internalType: "uint64",
//     },
//     {
//       name: "transferId",
//       type: "bytes32",
//       indexed: false,
//       internalType: "bytes32",
//     },
//   ],
//   anonymous: false,
// };
// const encodeTokenBurned = Buffer.from(JSON.stringify(TokenBurnedAbi)).toString(
//   "base64",
// );

// console.log(
//   `============================== Encoded Token Burned ABI: \n${encodeTokenBurned} \n==============================`,
// );

// const itemScannedAbi = {
//   type: "event",
//   name: "ItemScanned",
//   inputs: [
//     { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
//     {
//       name: "scanner",
//       type: "address",
//       indexed: false,
//       internalType: "address",
//     },
//     {
//       name: "location",
//       type: "string",
//       indexed: false,
//       internalType: "string",
//     },
//     {
//       name: "timestamp",
//       type: "uint256",
//       indexed: false,
//       internalType: "uint256",
//     },
//   ],
//   anonymous: false,
// };
// const encodeItemScanned = Buffer.from(JSON.stringify(itemScannedAbi)).toString(
//   "base64",
// );

// console.log(
//   `============================== Encoded Item Scanned ABI: \n${encodeItemScanned} \n==============================`,
// );

// const mirrotItemScannedAbi = {
//   type: "function",
//   name: "mirrorItem",
//   inputs: [
//     { name: "id", type: "uint256", internalType: "uint256" },
//     { name: "location", type: "string", internalType: "string" },
//     { name: "sourceChainId", type: "uint64", internalType: "uint64" },
//   ],
//   outputs: [],
//   stateMutability: "nonpayable",
// };
// const encodeMirrorItemScanned = Buffer.from(
//   JSON.stringify(mirrotItemScannedAbi),
// ).toString("base64");

// console.log(
//   `============================== Encoded Mirror Item Scanned ABI: \n${encodeMirrorItemScanned} \n==============================`,
// );

const kwalaTestAbi = [
  {
    type: "function",
    name: "count",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "receiveTrigger",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "user", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "message", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "trigger",
    inputs: [
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "message", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "TokenTest",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "user", type: "address", indexed: true, internalType: "address" },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "message",
        type: "string",
        indexed: false,
        internalType: "string",
      },
    ],
    anonymous: false,
  },
];

const encodeKwala = Buffer.from(JSON.stringify(kwalaTestAbi)).toString(
  "base64",
);

console.log(encodeKwala);
