// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Interface for the supply chain provenance system.
// Defines all the data types, events, and function signatures
// that the main contract needs to implement.
//
// The idea is that a producer registers a product, then it gets
// passed along through distributors and retailers, with every
// action recorded on-chain. Anyone can look up the full history.
//
// Main lifecycle order:
// Registered -> Certified -> ReadyForShipment -> PickedUp -> InTransit -> Delivered
// -> ReceivedAtWarehouse -> Stored -> ReleasedFromWarehouse
// -> ReceivedAtRetailer -> AvailableForSale -> Sold -> Verified

interface ISupplyChainProvenance {

    // -- Roles --
    // Each address in the system gets assigned one of these.
    // None means the address hasn't been set up yet and can't do anything.
    enum Role {
        None,
        Producer,          // registers and prepares products at origin
        Logistics,         // handles transport legs
        Warehouse,         // receives and stores products
        Retailer,          // receives final inventory and sells
        Consumer,          // verifies provenance at the end
        SystemAdmin,       // governance/admin role
        Regulator,         // compliance and recall authority
        Auditor            // read-only audit role
    }

    // -- Product lifecycle states --
    // Products have to go through these in order, no skipping allowed.
    // _isValidTransition() in the main contract enforces this.
    enum ProductStatus {
        None,
        Registered,
        Certified,
        ReadyForShipment,
        PickedUp,
        InTransit,
        Delivered,
        ReceivedAtWarehouse,
        Stored,
        ReleasedFromWarehouse,
        ReceivedAtRetailer,
        AvailableForSale,
        Sold,
        Verified,
        Returned,
        Recalled,
        Damaged,
        Expired,
        Lost
    }

    // -- Product record --
    // This is what gets stored on-chain for each product.
    // metadataHash points to off-chain data (e.g. IPFS) to keep storage costs low.
    // exists is used to check if a productId has been registered before.
    struct Product {
        uint256 productId;
        string metadataHash;
        address currentCustodian;
        ProductStatus status;
        bool exists;
    }

    // -- Provenance record --
    // Every action on a product appends one of these to the history.
    // Records are never deleted or changed, so the trail is always intact.
    // action will be one of: "REGISTER", "TRANSFER_CUSTODY", "UPDATE_STATUS", "VERIFY_PRODUCT"
    struct ProvenanceRecord {
        uint256 timestamp;
        address actor;
        string action;
        string eventMetadata;
    }

    // emitted when owner gives a role to an address
    event RoleAssigned(address indexed account, Role indexed role);

    // emitted when a producer registers a new product
    event ProductRegistered(
        uint256 indexed productId,
        address indexed registeredBy,
        string metadataHash
    );

    // emitted when custody changes hands between two parties
    event CustodyTransferred(
        uint256 indexed productId,
        address indexed from,
        address indexed to
    );

    // emitted when the current custodian moves the product to a new status
    event StatusUpdated(
        uint256 indexed productId,
        ProductStatus indexed newStatus,
        address indexed updatedBy,
        string eventMetadata
    );

    // emitted when a verifier/consumer signs off on a sold product
    event ProductVerified(
        uint256 indexed productId,
        address indexed verifier,
        string eventMetadata
    );

    // only the contract owner can call this
    // address needs a role before it can interact with anything
    function assignRole(address account, Role role) external;

    // only producers can call this
    // creates the first on-chain record for a product
    function registerProduct(
        uint256 productId,
        string calldata metadataHash
    ) external;

    // caller must be current custodian
    // recipient must already have a role assigned
    function transferCustody(
        uint256 productId,
        address newCustodian,
        string calldata eventMetadata
    ) external;

    // caller must be current custodian
    // only valid lifecycle/exception transitions allowed
    function updateStatus(
        uint256 productId,
        ProductStatus newStatus,
        string calldata eventMetadata
    ) external;

    // only Consumer can call this
    // product must already be in Sold status
    function verifyProduct(
        uint256 productId,
        string calldata eventMetadata
    ) external;

    // read-only, anyone can call
    function getProduct(uint256 productId) external view returns (Product memory);

    // returns the full history in order, anyone can call
    function getProvenanceHistory(
        uint256 productId
    ) external view returns (ProvenanceRecord[] memory);

    // returns the role assigned to an address
    function getRole(address account) external view returns (Role);
}
