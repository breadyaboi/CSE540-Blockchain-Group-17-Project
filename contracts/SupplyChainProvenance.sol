// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ISupplyChainProvenance.sol";

/// @title SupplyChainProvenance
/// @notice Draft smart contract for tracking product provenance across a supply chain.
/// @dev Current version focuses on structure, interfaces, transaction flow, and high-level validation rather than complete functionality.
contract SupplyChainProvenance is ISupplyChainProvenance {
    /// @notice Simple admin model for the draft: deployer manages initial role assignment.
    address public owner;

    /// @notice Stores the role assigned to each address.
    mapping(address => Role) private roles;

    /// @notice Stores product records by product ID.
    mapping(uint256 => Product) private products;

    /// @notice Stores provenance history for each product.
    mapping(uint256 => ProvenanceRecord[]) private histories;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier productExists(uint256 productId) {
        require(products[productId].exists, "Product not found");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @inheritdoc ISupplyChainProvenance
    /// @dev Role assignment is simplified for the draft milestone.
    function assignRole(address account, Role role) external override onlyOwner {
        require(account != address(0), "Invalid account");
        require(role != Role.None, "Invalid role");

        roles[account] = role;
        emit RoleAssigned(account, role);
    }

    /// @inheritdoc ISupplyChainProvenance
    /// @dev Producers create the first on-chain record for a product.
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

    /// @inheritdoc ISupplyChainProvenance
    /// @dev Current custodian transfers responsibility to another known stakeholder.
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

    /// @inheritdoc ISupplyChainProvenance
    /// @dev This function reflects Takeyuki's transaction-flow/validation responsibility:
    /// it records state changes and enforces a simple allowed progression.
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

    /// @inheritdoc ISupplyChainProvenance
    /// @dev Regulator verifies the product after major provenance events are recorded.
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

    /// @notice Validates simplified lifecycle transitions for the draft.
    /// @dev This can be expanded later if the team adds more detailed workflow rules.
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

    /// @inheritdoc ISupplyChainProvenance
    function getProduct(uint256 productId)
        external
        view
        override
        returns (Product memory)
    {
        return products[productId];
    }

    /// @inheritdoc ISupplyChainProvenance
    function getProvenanceHistory(uint256 productId)
        external
        view
        override
        returns (ProvenanceRecord[] memory)
    {
        return histories[productId];
    }

    /// @inheritdoc ISupplyChainProvenance
    function getRole(address account) external view override returns (Role) {
        return roles[account];
    }
}