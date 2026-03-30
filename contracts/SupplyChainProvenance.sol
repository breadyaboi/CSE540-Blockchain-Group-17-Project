// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ISupplyChainProvenance.sol";

/**
 * @title SupplyChainProvenance
 * @notice Implementation of a blockchain-based supply chain provenance system.
 *
 * This contract allows mutually untrusted stakeholders to maintain a shared,
 * tamper-resistant record of a product's lifecycle without relying on a
 * central intermediary. All state-changing actions are recorded on-chain as
 * an append-only history that any party can query at any time.
 *
 * Role-based access control restricts which functions each stakeholder type
 * can call. The contract owner assigns roles to addresses before they can
 * participate in the system.
 *
 * Intended use:
 *   1. Owner assigns roles to known stakeholder addresses.
 *   2. Producer calls registerProduct() to create an on-chain product record.
 *   3. Distributor calls transferCustody() and updateStatus() as the product
 *      moves through shipment and storage.
 *   4. Retailer receives custody and updates status to Delivered.
 *   5. Regulator calls verifyProduct() to confirm compliance.
 *   6. Any party can call getProvenanceHistory() to audit the full record.
 */
contract SupplyChainProvenance is ISupplyChainProvenance {

    // -------------------------------------------------------------------------
    // State Variables
    // -------------------------------------------------------------------------

    /// @notice Address of the contract deployer; the only account that can assign roles.
    address public owner;

    /// @notice Maps each address to its assigned stakeholder role.
    mapping(address => Role) private roles;

    /// @notice Maps each product ID to its on-chain Product record.
    mapping(uint256 => Product) private products;

    /**
     * @notice Maps each product ID to its ordered list of provenance records.
     * @dev This array is append-only. Records are never removed or overwritten,
     *      ensuring the integrity of the historical audit trail.
     */
    mapping(uint256 => ProvenanceRecord[]) private histories;

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    /// @dev Restricts a function to the contract owner only.
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    /**
     * @dev Reverts if a product with the given ID has not been registered.
     *      Used to guard all functions that operate on existing products.
     */
    modifier productExists(uint256 productId) {
        require(products[productId].exists, "Product not found");
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @notice Deploys the contract and sets the deployer as the owner/admin.
    constructor() {
        owner = msg.sender;
    }

    // -------------------------------------------------------------------------
    // Role Management
    // -------------------------------------------------------------------------

    /**
     * @notice Assigns a role to a stakeholder address.
     * @dev Simplified admin model for draft milestone: only the deployer can
     *      assign roles. An address must receive a role before it can call
     *      any write functions in the system.
     * @param account The wallet address to assign the role to.
     * @param role    The Role enum value to assign (must not be Role.None).
     */
    function assignRole(address account, Role role) external override onlyOwner {
        require(account != address(0), "Invalid account");
        require(role != Role.None, "Invalid role");

        roles[account] = role;
        emit RoleAssigned(account, role);
    }

    // -------------------------------------------------------------------------
    // Product Registration  (Evan Zhu - Smart Contract Transaction Logic)
    // -------------------------------------------------------------------------

    /**
     * @notice Registers a new product on-chain, creating the initial provenance record.
     *
     * This is the entry point for a product into the system. The producer provides
     * a unique product ID and a reference to off-chain metadata (stored as a hash
     * to minimize on-chain storage costs). The caller becomes the first custodian,
     * and a REGISTER event is appended to the product's history.
     *
     * @param productId    Unique numeric identifier for the product.
     * @param metadataHash IPFS hash or similar reference to off-chain product metadata.
     */
    function registerProduct(
        uint256 productId,
        string calldata metadataHash
    ) external override {
        require(roles[msg.sender] == Role.Producer, "Only producer");
        require(!products[productId].exists, "Duplicate product");
        require(bytes(metadataHash).length > 0, "Metadata required");

        products[productId] = Product({
            productId: productId,
            metadataHash: metadataHash,
            currentCustodian: msg.sender,
            status: ProductStatus.Created,
            exists: true
        });

        histories[productId].push(
            ProvenanceRecord({
                timestamp: block.timestamp,
                actor: msg.sender,
                action: "REGISTER",
                details: metadataHash
            })
        );

        emit ProductRegistered(productId, msg.sender, metadataHash);
    }

    // -------------------------------------------------------------------------
    // Custody Transfer  (Evan Zhu - Smart Contract Transaction Logic)
    // -------------------------------------------------------------------------

    /**
     * @notice Transfers custody of a product to the next stakeholder in the chain.
     *
     * Called when a product physically moves from one party to another — for
     * example, from a producer to a distributor, or from a distributor to a
     * retailer. The caller must be the current custodian, and the recipient
     * must already have an assigned role. A TRANSFER_CUSTODY record is appended
     * to the product's history, recording who handed off to whom and when.
     *
     * @param productId    The product whose custody is being transferred.
     * @param newCustodian Address of the incoming custodian.
     * @param details      Description of the handoff.
     */
    function transferCustody(
        uint256 productId,
        address newCustodian,
        string calldata details
    ) external override productExists(productId) {
        Product storage p = products[productId];

        require(msg.sender == p.currentCustodian, "Only current custodian");
        require(newCustodian != address(0), "Invalid custodian");
        require(roles[newCustodian] != Role.None, "Unassigned recipient");

        address previousCustodian = p.currentCustodian;
        p.currentCustodian = newCustodian;

        histories[productId].push(
            ProvenanceRecord({
                timestamp: block.timestamp,
                actor: msg.sender,
                action: "TRANSFER_CUSTODY",
                details: details
            })
        );

        emit CustodyTransferred(productId, previousCustodian, newCustodian);
    }

    // -------------------------------------------------------------------------
    // Status Updates  (Evan Zhu - Smart Contract Transaction Logic)
    // -------------------------------------------------------------------------

    /**
     * @notice Advances the lifecycle status of a product.
     *
     * Called by the current custodian to record a change in the product's
     * state — for example, marking it as Shipped when it leaves a warehouse,
     * or Stored when it arrives at a facility. The allowed progression is
     * enforced by _isValidTransition(), preventing steps from being skipped.
     * An UPDATE_STATUS record is appended to the product's history.
     *
     * @param productId The product to update.
     * @param newStatus The next lifecycle state.
     * @param details   Description of the status change.
     */
    function updateStatus(
        uint256 productId,
        ProductStatus newStatus,
        string calldata details
    ) external override productExists(productId) {
        Product storage p = products[productId];

        require(msg.sender == p.currentCustodian, "Only current custodian");
        require(_isValidTransition(p.status, newStatus), "Invalid transition");

        p.status = newStatus;

        histories[productId].push(
            ProvenanceRecord({
                timestamp: block.timestamp,
                actor: msg.sender,
                action: "UPDATE_STATUS",
                details: details
            })
        );

        emit StatusUpdated(productId, newStatus, msg.sender, details);
    }

    // -------------------------------------------------------------------------
    // Product Verification
    // -------------------------------------------------------------------------

    /**
     * @notice Marks a delivered product as verified by a regulator.
     *
     * After a product reaches Delivered status, a regulator can inspect it
     * and call this function to record compliance confirmation on-chain. This
     * is the final step in the product lifecycle. A VERIFY_PRODUCT record is
     * appended to the history.
     *
     * @param productId The product to verify.
     * @param details   Compliance or inspection notes from the regulator.
     */
    function verifyProduct(
        uint256 productId,
        string calldata details
    ) external override productExists(productId) {
        require(roles[msg.sender] == Role.Regulator, "Only regulator");
        require(
            products[productId].status == ProductStatus.Delivered,
            "Must be delivered first"
        );

        products[productId].status = ProductStatus.Verified;

        histories[productId].push(
            ProvenanceRecord({
                timestamp: block.timestamp,
                actor: msg.sender,
                action: "VERIFY_PRODUCT",
                details: details
            })
        );

        emit ProductVerified(productId, msg.sender, details);
    }

    // -------------------------------------------------------------------------
    // Internal Logic  (Takeyuki Oshima - Transaction Flow & Validation)
    // -------------------------------------------------------------------------

    /**
     * @notice Validates that a status transition follows the allowed lifecycle order.
     *
     * Enforces the rule that products must progress through states in sequence:
     *   Created -> Shipped -> Stored -> Delivered
     * Any transition not in this list is rejected. This prevents a custodian
     * from skipping steps or moving a product backward in the lifecycle.
     *
     * @param currentStatus The product's current lifecycle state.
     * @param newStatus     The proposed next lifecycle state.
     * @return True if the transition is valid, false otherwise.
     */
    function _isValidTransition(
        ProductStatus currentStatus,
        ProductStatus newStatus
    ) internal pure returns (bool) {
        if (currentStatus == ProductStatus.Created && newStatus == ProductStatus.Shipped) {
            return true;
        }
        if (currentStatus == ProductStatus.Shipped && newStatus == ProductStatus.Stored) {
            return true;
        }
        if (currentStatus == ProductStatus.Stored && newStatus == ProductStatus.Delivered) {
            return true;
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // Query Functions (read-only, accessible to any caller)
    // -------------------------------------------------------------------------

    /**
     * @notice Returns the current on-chain record for a product.
     * @param productId The product to query.
     * @return The Product struct with current custodian, status, and metadata.
     */
    function getProduct(uint256 productId)
        external
        view
        override
        returns (Product memory)
    {
        return products[productId];
    }

    /**
     * @notice Returns the full append-only provenance history for a product.
     *
     * Returns all recorded actions in chronological order. This is the primary
     * function used by auditors and consumers to verify a product's journey
     * through the supply chain.
     *
     * @param productId The product to query.
     * @return Array of ProvenanceRecord structs in the order they were recorded.
     */
    function getProvenanceHistory(uint256 productId)
        external
        view
        override
        returns (ProvenanceRecord[] memory)
    {
        return histories[productId];
    }

    /**
     * @notice Returns the role currently assigned to a given address.
     * @param account The wallet address to query.
     * @return The Role enum value assigned to the account.
     */
    function getRole(address account) external view override returns (Role) {
        return roles[account];
    }
}
