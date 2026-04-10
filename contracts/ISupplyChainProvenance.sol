// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ISupplyChainProvenance
/// @notice Interface for a draft blockchain-based supply chain provenance system.
interface ISupplyChainProvenance {
    /// @notice Stakeholder roles in the supply chain.
    enum Role {
        None,
        Producer,
        Distributor,
        Retailer,
        Regulator
    }

    /// @notice Main lifecycle states used in the draft system.
    enum ProductStatus {
        None,
        Created,
        Shipped,
        Stored,
        Delivered,
        Verified
    }

    /// @notice Core product record stored on-chain.
    struct Product {
        uint256 productId;
        string metadataHash;
        address currentCustodian;
        ProductStatus status;
        bool exists;
    }

    /// @notice Historical event record for provenance tracking.
    struct ProvenanceRecord {
        uint256 timestamp;
        address actor;
        string action;
        string details;
    }

    event RoleAssigned(address indexed account, Role indexed role);

    event ProductRegistered(
        uint256 indexed productId,
        address indexed registeredBy,
        string metadataHash
    );

    event CustodyTransferred(
        uint256 indexed productId,
        address indexed from,
        address indexed to
    );

    event StatusUpdated(
        uint256 indexed productId,
        ProductStatus indexed newStatus,
        address indexed updatedBy,
        string details
    );

    event ProductVerified(
        uint256 indexed productId,
        address indexed regulator,
        string details
    );

    function assignRole(address account, Role role) external;

    function registerProduct(
        uint256 productId,
        string calldata metadataHash
    ) external;

    function transferCustody(
        uint256 productId,
        address newCustodian,
        string calldata details
    ) external;

    function updateStatus(
        uint256 productId,
        ProductStatus newStatus,
        string calldata details
    ) external;

    function verifyProduct(
        uint256 productId,
        string calldata details
    ) external;

    function getProduct(uint256 productId) external view returns (Product memory);

    function getProvenanceHistory(
        uint256 productId
    ) external view returns (ProvenanceRecord[] memory);

    function getRole(address account) external view returns (Role);
}