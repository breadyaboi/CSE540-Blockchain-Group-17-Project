// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Data Structures for Supply Chain Provenance System
/// @notice Defines core data models: Product, ProvenanceEvent, and lifecycle model
/// @dev This contract only defines data structures (no business logic)

contract DataStructures {

    /// @notice Lifecycle states of a product in the supply chain
    /// @dev Must follow: Creation → Shipment → Storage → Delivery
    enum EventType {
        Creation,
        Shipment,
        Storage,
        Delivery
    }

    /// @notice Represents a single provenance event
    /// @param eventType Type of lifecycle event
    /// @param actor Address performing the action
    /// @param timestamp Block timestamp when event is recorded
    /// @param metadataHash Off-chain data reference (e.g., IPFS hash)
    /// @param notes Optional human-readable notes
    struct ProvenanceEvent {
        EventType eventType;
        address actor;
        uint256 timestamp;
        string metadataHash;
        string notes;
    }

    /// @notice Represents a product tracked in the supply chain
    /// @param productId Unique identifier
    /// @param currentOwner Current custodian of the product
    /// @param metadataHash Initial metadata reference
    /// @param currentState Current lifecycle state
    /// @param eventCount Number of recorded events
    struct Product {
        uint256 productId;
        address currentOwner;
        string metadataHash;
        EventType currentState;
        uint256 eventCount;
    }

    /// @notice Mapping from product ID to Product
    mapping(uint256 => Product) internal products;

    /// @notice Mapping from product ID to its full provenance history
    /// @dev Append-only event log
    mapping(uint256 => ProvenanceEvent[]) internal provenanceHistory;

}