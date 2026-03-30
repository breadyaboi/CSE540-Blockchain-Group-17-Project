// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../utils/node_modules/@openzeppelin/contracts/access/AccessControl.sol";

contract SupplyChainProvenance is AccessControl {

    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant PRODUCER_ROLE = keccak256("PRODUCER_ROLE");
    bytes32 public constant HANDLER_ROLE = keccak256("HANDLER_ROLE");
    bytes32 public constant RETAILER_ROLE = keccak256("RETAILER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender); // default admin
        _grantRole(ADMIN_ROLE, msg.sender);         // custom admin role
    }

    // Product block
    struct Product {
        string productName;
        uint256 productId;
        address manufacturer;
        address currentOwner;
        uint256 timestamp;
    }

    // Event block
    struct ProvenanceEvent {
        string eventType;
        address actor;
        uint256 timestamp;
        bytes32 metadataHash;
        string notes;
    }

    // Storage mappings
    mapping(uint256 => Product) public products;
    mapping(uint256 => ProvenanceEvent[]) public provenanceEvents;


    function grantRoleTo(address account, bytes32 role) public 
    {

    }

    function revokeRoleFrom(address account, bytes32 role) public {

    }

    function registerProduct(uint256 _productId, string memory _productName, bytes32 _metadataHash, string memory _notes) public 
    {// Creates new product record (block)
        require(hasRole(PRODUCER_ROLE, msg.sender), "Only producer can register product");
        require(products[_productId].productId == 0, "Product already exists");

        products[_productId] = Product({
            productName: _productName,
            productId: _productId,
            manufacturer: msg.sender,
            currentOwner: msg.sender,
            timestamp: block.timestamp
        });

        // Log initial creation event
        provenanceEvents[_productId].push(ProvenanceEvent({
            eventType: "CREATED",
            actor: msg.sender,
            timestamp: block.timestamp,
            metadataHash: _metadataHash,
            notes: _notes
        }));
    }

    function transferCustody(uint256 _productId, address _newOwner, string memory _notes) public 
    {//changes custody of product to different owner/role
       
    }

    function updateStatus(uint256 _productId, string memory _eventType, bytes32 _metadataHash, string memory _notes) public 
    {
      
    }

    function confirmDelivery(uint256 _productId, bytes32 _metadataHash, string memory _notes) public 
    {
   
    }
    function getProvenance(uint256 _productId) public view returns (ProvenanceEvent[] memory) 
    {
 
    }

    function getProductInfo(uint256 _productId) public view returns (string memory name, uint256 id, address manufacturer, address currentOwner, uint256 timestamp, uint256 eventCount) 
    {

    }   

    function getEventAt(uint256 _productId, uint256 index) public view returns (string memory eventType, address actor, uint256 timestamp, bytes32 metadataHash, string memory notes) 
    {

    }
}