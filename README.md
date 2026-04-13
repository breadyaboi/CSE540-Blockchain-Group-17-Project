# Blockchain-Based Supply Chain Provenance System

CSE 540 – Group 17  
Alvin Ton · Evan Zhu · Jiayang Xiao · Takeyuki Oshima · Yijin Yang

## Project Description

This project implements a blockchain-based supply chain provenance system in Solidity. The goal is to maintain an immutable, append-only record of a product's lifecycle as it moves through multiple stakeholders such as producers, distributors, retailers, and regulators.

The system addresses a common supply chain problem: different organizations maintain separate records, making it difficult to verify product origin, custody, and status changes across the full lifecycle. By recording key events on-chain, the system improves traceability, transparency, and auditability.

## Current Scope for Interim Demo

This repository contains the core smart contract prototype for the Week 5 Interim Demo. The implemented functionality focuses on the main on-chain workflow described in the project proposal:

- role assignment for stakeholders
- product registration by a producer
- custody transfer between supply chain participants
- status updates across the product lifecycle
- regulator verification after delivery
- public provenance history lookup

This is an implementation-focused checkpoint. A full frontend and final analysis are planned for later milestones.

## Repository Structure

```text
/
├── contracts/
│   ├── ISupplyChainProvenance.sol
│   └── SupplyChainProvenance.sol
├── README.md
└── REMIX_DEMO_STEPS.md
```

## Contracts

### `ISupplyChainProvenance.sol`
Defines the shared interface for the system, including:
- stakeholder roles
- product lifecycle statuses
- core data structures
- events
- function signatures

### `SupplyChainProvenance.sol`
Implements the main smart contract logic for:
- role-based access control
- product registration
- custody transfer
- status transitions
- regulator verification
- provenance queries

## Remix Setup and Deployment

This project is designed to be compiled and demonstrated in **Remix IDE**.

### 1. Open Remix
Go to the Remix IDE in your browser.

### 2. Upload the contract files
Upload both files from the `contracts/` folder:
- `ISupplyChainProvenance.sol`
- `SupplyChainProvenance.sol`

Keep them in the same folder structure so the import path works.

### 3. Compile
In the Solidity Compiler tab:
- select compiler version **0.8.20** or a compatible `0.8.x` version
- compile `SupplyChainProvenance.sol`

### 4. Deploy
In the Deploy & Run tab:
- environment: **Remix VM (Cancun)** for local demo purposes
- deploy `SupplyChainProvenance`

The deployer account becomes the contract owner and can assign stakeholder roles.

## Demo Workflow

The contract supports this lifecycle:

```text
Created → Shipped → Stored → Delivered → Verified
```

Recommended stakeholder accounts in Remix:
- Account 1: Owner/Admin
- Account 2: Producer
- Account 3: Distributor
- Account 4: Retailer
- Account 5: Regulator

Recommended interim demo flow:

1. Deploy the contract from the owner account.
2. Assign roles to the producer, distributor, retailer, and regulator.
3. Register a product as the producer.
4. Transfer custody from producer to distributor.
5. Update status from `Created` to `Shipped` as distributor.
6. Update status from `Shipped` to `Stored` as distributor.
7. Transfer custody from distributor to retailer.
8. Update status from `Stored` to `Delivered` as retailer.
9. Verify the product as regulator.
10. Call `getProduct` and `getProvenanceHistory` to show the final on-chain record.

A step-by-step click path for the live demo is included in `REMIX_DEMO_STEPS.md`.

## Key Contract Design Decisions

- **RBAC:** Only authorized roles can perform sensitive actions.
- **Append-only provenance history:** Each write operation appends a new provenance record.
- **Ordered lifecycle transitions:** Status values cannot skip required stages.
- **Lightweight metadata storage:** The contract stores a metadata hash/string rather than large off-chain documents.
- **Public query functions:** Any observer can inspect the current product state and history.

## Key Functions

- `assignRole(address account, Role role)`
- `registerProduct(uint256 productId, string metadataHash)`
- `transferCustody(uint256 productId, address newCustodian, string details)`
- `updateStatus(uint256 productId, ProductStatus newStatus, string details)`
- `verifyProduct(uint256 productId, string details)`
- `getProduct(uint256 productId)`
- `getProvenanceHistory(uint256 productId)`
- `getRole(address account)`

## Interim Demo Readiness

The current repository is organized for the Week 5 Interim Demo rubric:
- functional components are implemented
- stakeholder interactions can be demonstrated live in Remix
- relevant contract files can be explained at a high level during code walkthrough

## Planned Future Work

For the final submission, the team may extend this prototype with:
- a simple web interface for stakeholder interactions
- stronger test coverage
- gas/scalability analysis
- optional off-chain metadata storage integration
- additional reporting and audit functionality
