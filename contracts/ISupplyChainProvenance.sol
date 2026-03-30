// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 title: ISupplyChainProvenance
 notice: Interface for a blockchain-based supply chain provenance system.
 *
 * This interface defines all data structures, enumerations, events, and
 * function signatures used by the SupplyChainProvenance contract. Separating
 * the interface allows other contracts or systems to interact with the
 * provenance system without depending on implementation details.
 *
 * System overview:
 *   A producer registers a product on-chain. Authorized stakeholders then
 *   transfer custody and update status as the product moves through the
 *   supply chain. Every action is recorded as an append-only ProvenanceRecord,
 *   creating a tamper-resistant history that any party can query.
 *
 * Lifecycle:
 *   Created -> Shipped -> Stored -> Delivered -> Verified
 */
interface ISupplyChainProvenance {


    // ********** Enumerations **********

    /**
     * @notice Roles that stakeholders may hold in the supply chain.
     *
     * Role.None        - Default state; address has no permissions.
     * Role.Producer    - Can register new products on-chain.
     * Role.Distributor - Can transfer custody and update product status.
     * Role.Retailer    - Can receive custody and confirm delivery.
     * Role.Regulator   - Can verify a product after it has been delivered.
     *
     * Roles are assigned by the contract owner via assignRole().
     * An address with Role.None cannot call any write functions.
     */
    enum Role {
        None,
        Producer,
        Distributor,
        Retailer,
        Regulator
    }

    /**
     * @notice Lifecycle states a product passes through in the supply chain.
     *
     * ProductStatus.None      - Default; product does not exist yet.
     * ProductStatus.Created   - Product has been registered by a producer.
     * ProductStatus.Shipped   - Product is in transit between parties.
     * ProductStatus.Stored    - Product is held at a warehouse or facility.
     * ProductStatus.Delivered - Product has reached its final destination.
     * ProductStatus.Verified  - A regulator has confirmed compliance.
     *
     * State transitions are enforced by _isValidTransition() in the contract.
     * Skipping states (e.g., Created -> Delivered) is not permitted.
     */
    enum ProductStatus {
        None,
        Created,
        Shipped,
        Stored,
        Delivered,
        Verified
    }

    // -------------------------------------------------------------------------
    // Data Structures
    // -------------------------------------------------------------------------

    /**
     * @notice Core on-chain record for a registered product.
     *
     * productId        - Unique numeric identifier supplied by the producer.
     * metadataHash     - IPFS hash or similar reference to off-chain metadata
     *                    (e.g., product name, batch number, origin). Storing
     *                    only the hash keeps on-chain storage costs low.
     * currentCustodian - Address of the stakeholder currently responsible
     *                    for the product. Updated on every custody transfer.
     * status           - Current lifecycle state of the product.
     * exists           - Guards against operations on unregistered product IDs.
     */
    struct Product {
        uint256 productId;
        string metadataHash;
        address currentCustodian;
        ProductStatus status;
        bool exists;
    }

    /**
     * @notice A single entry in a product's append-only provenance history.
     *
     * Every state-changing operation (register, transfer, update, verify)
     * appends one ProvenanceRecord. Records are never modified or deleted,
     * providing an auditable trail of all actions taken on a product.
     *
     * timestamp - Block timestamp when the action was recorded.
     * actor     - Address of the stakeholder who performed the action.
     * action    - String label: "REGISTER", "TRANSFER_CUSTODY",
     *             "UPDATE_STATUS", or "VERIFY_PRODUCT".
     * details   - Description or metadata hash provided by the actor.
     */
    struct ProvenanceRecord {
        uint256 timestamp;
        address actor;
        string action;
        string details;
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a role is assigned to a stakeholder address.
    event RoleAssigned(address indexed account, Role indexed role);

    /// @notice Emitted when a new product is registered on-chain by a producer.
    event ProductRegistered(
        uint256 indexed productId,
        address indexed registeredBy,
        string metadataHash
    );

    /// @notice Emitted when the current custodian transfers a product to another party.
    event CustodyTransferred(
        uint256 indexed productId,
        address indexed from,
        address indexed to
    );

    /// @notice Emitted when the current custodian advances the product lifecycle status.
    event StatusUpdated(
        uint256 indexed productId,
        ProductStatus indexed newStatus,
        address indexed updatedBy,
        string details
    );

    /// @notice Emitted when a regulator verifies a delivered product.
    event ProductVerified(
        uint256 indexed productId,
        address indexed regulator,
        string details
    );

    // -------------------------------------------------------------------------
    // Function Signatures
    // -------------------------------------------------------------------------

    /**
     * @notice Assigns a role to a stakeholder address.
     * @dev Only the contract owner may call this. An address must have a role
     *      before it can interact with write functions in the system.
     * @param account The wallet address to assign the role to.
     * @param role    The Role enum value to assign.
     */
    function assignRole(address account, Role role) external;

    /**
     * @notice Registers a new product on-chain, creating its initial provenance record.
     * @dev Only Role.Producer may call this. Reverts if productId already exists
     *      or metadataHash is empty. Sets caller as the first custodian.
     * @param productId    Unique numeric identifier for the product.
     * @param metadataHash Reference to off-chain product metadata (e.g., IPFS hash).
     */
    function registerProduct(
        uint256 productId,
        string calldata metadataHash
    ) external;

    /**
     * @notice Transfers custody of a product to the next stakeholder in the chain.
     * @dev Caller must be the current custodian. Recipient must have an assigned role.
     *      Appends a TRANSFER_CUSTODY record to the provenance history.
     * @param productId    The product whose custody is being transferred.
     * @param newCustodian Address of the incoming custodian.
     * @param details      Description of the handoff (e.g., "Shipped to Warehouse B").
     */
    function transferCustody(
        uint256 productId,
        address newCustodian,
        string calldata details
    ) external;

    /**
     * @notice Advances the lifecycle status of a product.
     * @dev Caller must be the current custodian. Only valid transitions are accepted:
     *      Created -> Shipped -> Stored -> Delivered.
     *      Appends an UPDATE_STATUS record to the provenance history.
     * @param productId The product to update.
     * @param newStatus The next lifecycle state.
     * @param details   Description of the status change.
     */
    function updateStatus(
        uint256 productId,
        ProductStatus newStatus,
        string calldata details
    ) external;

    /**
     * @notice Marks a delivered product as verified by a regulator.
     * @dev Only Role.Regulator may call this. Product must be in Delivered status.
     *      Appends a VERIFY_PRODUCT record to the provenance history.
     * @param productId The product to verify.
     * @param details   Compliance or inspection notes from the regulator.
     */
    function verifyProduct(
        uint256 productId,
        string calldata details
    ) external;

    /**
     * @notice Returns the current on-chain record for a product.
     * @param productId The product to query.
     * @return The Product struct containing current state and custodian.
     */
    function getProduct(uint256 productId) external view returns (Product memory);

    /**
     * @notice Returns the full append-only provenance history for a product.
     * @dev Each entry corresponds to one state-changing action on the product.
     *      History is in chronological order and cannot be modified after recording.
     * @param productId The product to query.
     * @return Array of ProvenanceRecord structs in the order they were recorded.
     */
    function getProvenanceHistory(
        uint256 productId
    ) external view returns (ProvenanceRecord[] memory);

    /**
     * @notice Returns the role currently assigned to a given address.
     * @param account The wallet address to query.
     * @return The Role enum value assigned to the account.
     */
    function getRole(address account) external view returns (Role);
}
