// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ISupplyChainProvenance.sol";

// Main contract for the supply chain provenance system.
// Implements ISupplyChainProvenance.
//
// The basic flow is:
//   1. Owner assigns roles to stakeholder addresses
//   2. Producer registers a product
//   3. Producer certifies and prepares it for shipment
//   4. Logistics transports it and hands off to warehouse
//   5. Warehouse stores it and releases it to retailer
//   6. Retailer marks it sold
//   7. Verifier/consumer verifies the product
//   8. Anyone can query the full history at any point
//
// Every write operation appends a record to the product's history.
// Nothing is ever deleted or modified after the fact.

contract SupplyChainProvenance is ISupplyChainProvenance {

    // deployer becomes the owner/admin
    address public owner;

    // maps addresses to their assigned role
    mapping(address => Role) private roles;

    // stores the product record for each productId
    mapping(uint256 => Product) private products;

    // append-only event history for each product
    // every action adds one entry, nothing is ever removed
    mapping(uint256 => ProvenanceRecord[]) private histories;

    // owner or system admin can manage roles
    modifier onlyAdmin() {
        require(msg.sender == owner || roles[msg.sender] == Role.SystemAdmin, "Only admin");
        _;
    }

    // prevents operations on products that haven't been registered yet
    modifier productExists(uint256 productId) {
        require(products[productId].exists, "Product not found");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // gives a role to a stakeholder address
    // address needs this before it can call any write functions
    function assignRole(address account, Role role) external override onlyAdmin {
        require(account != address(0), "Invalid account");
        require(role != Role.None, "Invalid role");

        roles[account] = role;
        emit RoleAssigned(account, role);
    }

    // -- registerProduct (Evan Zhu) --
    // entry point for a new product into the system
    // producer provides a unique id and a hash pointing to off-chain metadata
    // caller becomes the first custodian, Creation event gets added to history
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
            status: ProductStatus.Registered,
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

    // -- transferCustody (Evan Zhu) --
    // called when a product physically moves from one party to another
    // caller must be the current custodian
    // recipient must have a role assigned, otherwise rejected
    // records who handed off to whom and when
    function transferCustody(
        uint256 productId,
        address newCustodian,
        string calldata details
    ) external override productExists(productId) {
        Product storage p = products[productId];
        Role senderRole = roles[msg.sender];
        Role recipientRole = roles[newCustodian];

        require(msg.sender == p.currentCustodian, "Only current custodian");
        require(newCustodian != address(0), "Invalid custodian");
        require(recipientRole != Role.None, "Unassigned recipient");
        require(
            _isValidCustodyTransfer(senderRole, recipientRole, p.status),
            "Invalid custody transfer"
        );

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

    // -- updateStatus (Evan Zhu) --
    // called by the current custodian to advance the product's lifecycle state
    // e.g. marking it as Shipped when it leaves, or Stored when it arrives
    // _isValidTransition() makes sure steps aren't skipped
    function updateStatus(
        uint256 productId,
        ProductStatus newStatus,
        string calldata details
    ) external override productExists(productId) {
        Product storage p = products[productId];
        Role callerRole = roles[msg.sender];

        require(msg.sender == p.currentCustodian, "Only current custodian");
        require(_isValidTransition(p.status, newStatus), "Invalid transition");
        require(
            _canUpdateStatus(callerRole, newStatus),
            "Role cannot set this status"
        );

        _recordStatusTransition(productId, newStatus, "UPDATE_STATUS", details);
    }

    // called by a verifier/consumer after the product has been sold
    // final step in the lifecycle, records compliance confirmation
    function verifyProduct(
        uint256 productId,
        string calldata details
    ) external override productExists(productId) {
        require(roles[msg.sender] == Role.Consumer, "Only verifier");
        require(
            products[productId].status == ProductStatus.Sold,
            "Must be sold first"
        );

        _recordStatusTransition(productId, ProductStatus.Verified, "VERIFY_PRODUCT", details);
        emit ProductVerified(productId, msg.sender, details);
    }

    function _recordStatusTransition(
        uint256 productId,
        ProductStatus newStatus,
        string memory action,
        string memory details
    ) internal {
        products[productId].status = newStatus;

        histories[productId].push(
            ProvenanceRecord({
                timestamp: block.timestamp,
                actor: msg.sender,
                action: action,
                details: details
            })
        );

        emit StatusUpdated(productId, newStatus, msg.sender, details);
    }

    // -- _isValidTransition (Takeyuki Oshima) --
    // enforces that products move through states in the correct order
    // only these transitions are allowed, anything else gets rejected
    function _isValidTransition(
        ProductStatus currentStatus,
        ProductStatus newStatus
    ) internal pure returns (bool) {
        if (currentStatus == ProductStatus.Registered && newStatus == ProductStatus.Certified) return true;
        if (currentStatus == ProductStatus.Certified && newStatus == ProductStatus.ReadyForShipment) return true;
        if (currentStatus == ProductStatus.ReadyForShipment && newStatus == ProductStatus.PickedUp) return true;
        if (currentStatus == ProductStatus.PickedUp && newStatus == ProductStatus.InTransit) return true;
        if (currentStatus == ProductStatus.InTransit && newStatus == ProductStatus.Delivered) return true;
        if (currentStatus == ProductStatus.Delivered && newStatus == ProductStatus.ReceivedAtWarehouse) return true;
        if (currentStatus == ProductStatus.ReceivedAtWarehouse && newStatus == ProductStatus.Stored) return true;
        if (currentStatus == ProductStatus.Stored && newStatus == ProductStatus.ReleasedFromWarehouse) return true;
        if (currentStatus == ProductStatus.ReleasedFromWarehouse && newStatus == ProductStatus.ReceivedAtRetailer) return true;
        if (currentStatus == ProductStatus.ReceivedAtRetailer && newStatus == ProductStatus.AvailableForSale) return true;
        if (currentStatus == ProductStatus.AvailableForSale && newStatus == ProductStatus.Sold) return true;

        if (currentStatus == ProductStatus.Sold && newStatus == ProductStatus.Verified) return true;

        if (
            (currentStatus == ProductStatus.PickedUp || currentStatus == ProductStatus.InTransit) &&
            newStatus == ProductStatus.Lost
        ) return true;

        if (
            currentStatus == ProductStatus.InTransit ||
            currentStatus == ProductStatus.Stored ||
            currentStatus == ProductStatus.AvailableForSale
        ) {
            if (newStatus == ProductStatus.Damaged) return true;
        }

        if (currentStatus == ProductStatus.Stored || currentStatus == ProductStatus.AvailableForSale) {
            if (newStatus == ProductStatus.Expired) return true;
        }

        if (currentStatus == ProductStatus.Sold || currentStatus == ProductStatus.Verified) {
            if (newStatus == ProductStatus.Returned) return true;
        }

        if (newStatus == ProductStatus.Recalled) {
            return (
                currentStatus != ProductStatus.None &&
                currentStatus != ProductStatus.Recalled &&
                currentStatus != ProductStatus.Lost
            );
        }

        return false;
    }

    function _canUpdateStatus(
        Role callerRole,
        ProductStatus newStatus
    ) internal pure returns (bool) {
        if (callerRole == Role.Producer) {
            return (
                newStatus == ProductStatus.Certified ||
                newStatus == ProductStatus.ReadyForShipment
            );
        }

        if (callerRole == Role.Logistics) {
            return (
                newStatus == ProductStatus.PickedUp ||
                newStatus == ProductStatus.InTransit ||
                newStatus == ProductStatus.Delivered ||
                newStatus == ProductStatus.Damaged ||
                newStatus == ProductStatus.Lost
            );
        }

        if (callerRole == Role.Warehouse) {
            return (
                newStatus == ProductStatus.ReceivedAtWarehouse ||
                newStatus == ProductStatus.Stored ||
                newStatus == ProductStatus.ReleasedFromWarehouse ||
                newStatus == ProductStatus.Damaged ||
                newStatus == ProductStatus.Expired
            );
        }

        if (callerRole == Role.Retailer) {
            return (
                newStatus == ProductStatus.ReceivedAtRetailer ||
                newStatus == ProductStatus.AvailableForSale ||
                newStatus == ProductStatus.Sold ||
                newStatus == ProductStatus.Returned ||
                newStatus == ProductStatus.Damaged ||
                newStatus == ProductStatus.Expired
            );
        }

        if (callerRole == Role.Consumer) {
            return newStatus == ProductStatus.Verified;
        }

        if (callerRole == Role.Regulator) {
            return newStatus == ProductStatus.Recalled;
        }

        return false;
    }

    function _isValidCustodyTransfer(
        Role senderRole,
        Role recipientRole,
        ProductStatus currentStatus
    ) internal pure returns (bool) {
        if (
            senderRole == Role.Producer &&
            recipientRole == Role.Logistics &&
            currentStatus == ProductStatus.ReadyForShipment
        ) {
            return true;
        }

        if (
            senderRole == Role.Logistics &&
            recipientRole == Role.Warehouse &&
            currentStatus == ProductStatus.Delivered
        ) {
            return true;
        }

        if (
            senderRole == Role.Warehouse &&
            recipientRole == Role.Retailer &&
            currentStatus == ProductStatus.ReleasedFromWarehouse
        ) {
            return true;
        }

        return false;
    }

    // returns the current product record
    function getProduct(uint256 productId)
        external view override returns (Product memory)
    {
        return products[productId];
    }

    // returns the full history in chronological order
    // used by auditors and consumers to verify the product's journey
    function getProvenanceHistory(uint256 productId)
        external view override returns (ProvenanceRecord[] memory)
    {
        return histories[productId];
    }

    // returns the role assigned to an address
    function getRole(address account) external view override returns (Role) {
        return roles[account];
    }
}
