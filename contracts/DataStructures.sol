// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Data Structures for Supply Chain Provenance System
/// @dev Defines shared data models used across contracts

contract DataStructures {

    // =========================
    // Roles (for access control)
    // =========================
    bytes32 public constant PRODUCER_ROLE = keccak256("PRODUCER");
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR");
    bytes32 public constant RETAILER_ROLE = keccak256("RETAILER");

    mapping(address => mapping(bytes32 => bool)) internal roles;

    function hasRole(bytes32 role, address account) internal view returns (bool) {
        return roles[account][role];
    }

    // =========================
    // Product structure
    // =========================
    struct Product {
        string productName;
        uint256 productId;
        address manufacturer;
        address currentOwner;
        uint256 timestamp;
    }

    // =========================
    // Provenance Event structure
    // =========================
    struct ProvenanceEvent {
        string eventType;
        address actor;
        uint256 timestamp;
        bytes32 metadataHash;
        string notes;
    }

    // =========================
    // Storage
    // =========================
    mapping(uint256 => Product) internal products;
    mapping(uint256 => ProvenanceEvent[]) internal provenanceEvents;
}