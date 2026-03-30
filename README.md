# Blockchain-Based Supply Chain Provenance System

CSE 540 – Group 17  
Alvin Ton · Evan Zhu · Jiayang Xiao · Takeyuki Oshima · Yijin Yang

## Description

This project is a draft blockchain-based supply chain provenance system implemented in Solidity.  
Its goal is to maintain an immutable, append-only record of key product lifecycle events as a product moves through a multi-party supply chain.

The system is designed around a smart contract that records:

- product registration,
- custody transfer,
- status updates,
- verification events,
- and provenance history queries.

Stakeholders such as producers, distributors, retailers, and regulators interact with the contract according to role-based permissions. The overall purpose of the project is to improve traceability, transparency, and trust across organizations that would otherwise rely on separate and potentially inconsistent tracking systems.

### Problem Addressed

Traditional supply chain tracking often depends on fragmented and mutable systems maintained by different parties. This makes it difficult to verify a product’s history, resolve disputes, and establish a shared source of truth.  
Our project uses blockchain to provide a common, verifiable on-chain record of product movement and state changes.

---

## Current Scope

This repository is for the **Smart Contract Design Draft** milestone.

At this stage, the focus is on:

- smart contract structure,
- function signatures and interfaces,
- core data models,
- intended transaction flow,
- and high-level comments/documentation.

This is **not yet the final implementation**. Some components are intentionally incomplete and will be expanded in later milestones.

---

## Repository Structure

```text
.
├── contracts/
│   ├── ISupplyChainProvenance.sol
│   └── SupplyChainProvenance.sol
├── README.md
└── package.json
```

The `contracts/` directory contains the Solidity smart contract interface and implementation drafts for the provenance system.

Additional components such as frontend integration, deployment scripts, and tests may be added in later phases of the project.

---

## Dependencies / Setup

Recommended tools for this project:

| Tool | Version | Purpose |
| :--- | :--- | :--- |
| Node.js | >= 18.x | JavaScript runtime for development tooling |
| Hardhat | 2.x | Ethereum smart contract development environment |
| Solidity | ^0.8.20 | Smart contract language |
| Ethers.js or Web3.js | optional | Future contract interaction from a UI or script |
| MetaMask | optional | Wallet for local/testnet interaction |

### Basic Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/<org-or-user>/<repo-name>.git
cd <repo-name>
npm install
```

---

## How to Use / Deploy

This repository currently contains the draft smart contract design for the project.

Typical intended workflow:

1. Review the smart contract interface and implementation draft in the `contracts/` folder.
2. Compile the contract in a Solidity development environment such as Hardhat.
3. Extend the draft in later milestones with additional validation, testing, deployment scripts, and stakeholder interaction support.

### Example Compile Command

If Hardhat is configured in the repository, the contract can be compiled with:

```bash
npx hardhat compile
```

---

## Draft Deployment Note

Deployment details are still in progress for this milestone.  
The intended future workflow is to deploy the contract to a local Hardhat network or Ethereum testnet for stakeholder interaction demos.

---

## Smart Contract Overview

### Stakeholder Roles

The contract draft is designed around the following roles:

| Role | Responsibility |
| :--- | :--- |
| Producer | Registers new products on-chain |
| Distributor | Handles custody transfer and shipment/storage updates |
| Retailer | Participates in final delivery-stage interactions |
| Regulator | Verifies or audits provenance records |
| Consumer / Public User | Reads provenance information through future query interfaces |

---

## Main Contract Responsibilities

The draft contract is intended to support:

- **Product Registration**  
  Create an initial on-chain record for a product using a unique product ID and metadata reference.

- **Custody Transfer**  
  Record transfer of responsibility between supply chain participants.

- **Status Updates**  
  Track lifecycle changes such as created, shipped, stored, and delivered.

- **Verification**  
  Allow regulator-type roles to confirm authenticity or compliance events.

- **Provenance Queries**  
  Retrieve current product information and historical provenance records.

---

## Draft Function Categories

The current draft focuses on function signatures and intended behavior for operations such as:

- role assignment,
- product registration,
- custody transfer,
- status update,
- product verification,
- product lookup,
- provenance history retrieval.

Exact implementation details may change as the project evolves.

---

## Team Role Mapping

| Member | Contract Responsibility |
| :--- | :--- |
| Evan Zhu | Core transaction logic |
| Jiayang Xiao | Data structures and provenance model |
| Takeyuki Oshima | Transaction flow and state transition validation |
| Yijin Yang | Role-based access control and permission design |
| Alvin Ton | Stakeholder interaction and interface planning |

---

## Status

This repository is a **draft submission** for the Smart Contract Design milestone.

The current emphasis is on:

- organized repository structure,
- clear smart contract direction,
- documented interfaces,
- and maintainable foundations for future implementation.

Frontend integration, testing, and full deployment workflow are planned for later development stages.
