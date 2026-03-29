# Blockchain-Based Supply Chain Provenance System

CSE 540 – Group 17 Alvin Ton · Evan Zhu · Jiayang Xiao · Takeyuki Oshima · Yijin Yang
## Description
A Solidity smart contract deployed on Ethereum that records an immutable, append-only
provenance history for products as they move through a multi-party supply chain.
Stakeholders — producers, handlers, retailers, and auditors — each hold a role that governs
which contract functions they may call. All key lifecycle events (creation, shipment, storage,
delivery) are stored on-chain with actor address, timestamp, and an optional off-chain
metadata hash.
###
**Problem addressed** : Fragmented, mutable, and non-interoperable tracking systems across
supply chain participants. This system replaces centralized trust with a shared, verifiable
on-chain record.
## Repository Structure
/
├── contracts \
│ └── SupplyChainProvenance.sol # Core smart contract (draft) \
├── frontend/ # Web UI (Web3.js integration, in progress) \
├── test/ # Unit tests (in progress) \
├── README.md \
└── package.json
#
| Tool                    | Version    | Purpose                                      |
| :---                    | :----:     |    ---:                                      |
| Node.js                 | >= 18.x    | Runtime for Hardhat and tooling              |
| Hardhat                 | ^2.22      | Ethereum development environment             |
| OpenZeppelin Contracts  | ^5.x       | (optional) Standard access control utilities |
| Web3.js or Ethers.js    | ^6.x       | Frontend-to-contract interaction             |
| MetaMask                | latest     | Browser wallet for testing                   |
### Install
```
git clone https://github.com/<org>/cse540-group17-provenance.git
cd cse540-group17-provenance
npm install
```
### Compile the Contract
```
npx hardhat compile
```
### Run Tests (stub — in progress)
```
npx hardhat test
```
## Deployment (Draft)
### Local Hardhat Network
```
npx hardhat node # Start local chain
npx hardhat run scripts/deploy.js --network localhost
```
### Testnet (Sepolia)
```
npx hardhat run scripts/deploy.js --network sepolia
```
> Deployment script ( `scripts/deploy.js` ) is in progress. A `.env` file with PRIVATE_KEY
and `ALCHEMY_API_URL` will be required for testnet deployment.
## Smart Contract Overview
### Roles

| Role     | Permissions                           |
| :---     |                                 ---:  |
| ADMIN    |Grant / revoke roles                   |
| PRODUCER | Register products                     |
| HANDLER  | Transfer custody, update status       |
| RETAILER | Confirm delivery                      |
| AUDITOR  | Read-only provenance queries          |
| CONSUMER | Read-only provenance queries (public) |

### Key Functions

| Function                                                | Caller           | Description                                      |
| :---                                                    | :----:           |    ---:                                          |
| grantRole(address, Role)                                | ADMIN            | Assign a role to a stakeholder                   |
| revokeRole(address)                                     | ADMIN            | Remove a stakeholder’s role                      |
| registerProduct(productId, metadataHash, notes)         | PRODUCER         | Create initial on-chain product record           |
| transferCustody(productId, newOwner, notes)             | HANDLER/PRODUCER | Hand off custody to next party                   |
| updateStatus(productId, eventType, metadataHash, notes) | HANDLER/PRODUCER | Append a status event (Shipment, Storage, etc.)  |
| confirmDelivery(productId, metadataHash, notes)         | RETAILER         | Record final delivery event                      |
| getProvenance(productId)                                | Anyone           | Return full event history array                  |
| getProductInfo(productId)                               | Anyone           | Return current owner, metadata hash, event count |
| getEventAt(productId, index)                            | Anyone           | Return a single event by index (for pagination)  |

### Event Types
```Creation → Shipment → Storage → Shipment → Delivery```
Each event stores: `EventType` , `actor address` , `block.timestamp` , `metadataHash` , `notes` 
## Team Role Mapping
| Member          |  Contract Responsibility                                                      |
| :---            |                                                                         ---:  |
| Evan Zhu        | Core transaction logic (`registerProduct`, `transferCustody`, `updateStatus`) | 
| Jiayang Xiao    | Data structures ( Product , ProvenanceEvent structs, lifecycle model)         | 
| Takeyuki Oshima | Transaction flow and state transition validation                              | 
| Yijin Yang      | RBAC design ( Role enum, modifiers, grantRole / revokeRole )                  | 
| Alvin Ton       | Stakeholder interface design ( confirmDelivery , UI interaction spec)         | 

## Status
This is a **draft submission** for Week 2. Core contract signatures and data structures are
defined. Implementation details, frontend integration, and tests are in progress per the
project timeline.
