// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "contracts/DataStructures.sol";

contract SupplyChainProvenance{

    /// @notice Emitted when a new product is registered on-chain
    event ProductRegistered(uint256 indexed productId, address indexed producer, uint256 timestamp);

    /// @notice Emitted when custody of a product changes hands
    event CustodyTransferred(uint256 indexed productId, address indexed from, address indexed to, uint256 timestamp);

    /// @notice Emitted when a status update is appended to provenance history
    event StatusUpdated(uint256 indexed productId, string eventType, address indexed actor, uint256 timestamp);

    // Roles

    function grantRoleTo(address account, bytes32 role) public 
    {

    }

    function revokeRoleFrom(address account, bytes32 role) public {

    }

    function registerProduct(uint256 _productId, bytes32 _metadataHash, string memory _notes) public 
    {// Creates new product record (block)
        require(hasRole(PRODUCER_ROLE, msg.sender), "Only producer can register product");
        require(products[_productId].productId == 0, "Product already exists");
        require(_productId != 0, "Product ID cannot be zero");

        products[_productId] = Product({
            productId:     _productId,
            currentOwner:  msg.sender,
            metadataHash:  string(abi.encodePacked(_metadataHash)),
            currentState:  EventType.Creation,
            eventCount:    1
        });

        // Log initial creation event
        provenanceEvents[_productId].push(ProvenanceEvent({
            eventType:    EventType.Creation,
            actor:        msg.sender,
            timestamp:    block.timestamp,
            metadataHash: string(abi.encodePacked(_metadataHash)),
            notes:        _notes
        }));

        emit ProductRegistered(_productId, msg.sender, block.timestamp);
    }

    function transferCustody(uint256 _productId, address _newOwner, string memory _notes) public 
    {
        //changes custody of product to different owner/role
        // Product must exist before custody can be transferred
        require(products[_productId].productId != 0, "Product does not exist");
        require(products[_productId].currentOwner == msg.sender, "Caller is not the current owner");
        require(_newOwner != address(0), "Invalid new owner address");
        require(_newOwner != msg.sender, "Cannot transfer to yourself");

        address previousOwner = products[_productId].currentOwner;

        products[_productId].currentOwner = _newOwner;
        products[_productId].currentState = EventType.Shipment;
        products[_productId].eventCount   += 1;

        provenanceHistory[_productId].push(ProvenanceEvent({
            eventType:    EventType.Shipment,
            actor:        msg.sender,
            timestamp:    block.timestamp,
            metadataHash: "",
            notes:        _notes
        }));

        emit CustodyTransferred(_productId, previousOwner, _newOwner, block.timestamp);
    }

    function updateStatus(uint256 _productId, string memory _eventType, bytes32 _metadataHash, string memory _notes) public 
    {
        // Product must exist
        require(products[_productId].productId != 0, "Product does not exist");
        require(products[_productId].currentOwner == msg.sender, "Caller is not the current custodian");
        require(
            keccak256(bytes(_eventType)) != keccak256(bytes("CREATED")),
            "Use registerProduct() for creation events"
        );
        require(
            keccak256(bytes(_eventType)) != keccak256(bytes("DELIVERED")),
            "Use confirmDelivery() for delivery events"
        );

        EventType evType = EventType.Storage;
        if (keccak256(bytes(_eventType)) == keccak256(bytes("SHIPPED"))) {
            evType = EventType.Shipment;
        }

        products[_productId].currentState = evType;
        products[_productId].eventCount   += 1;

        provenanceHistory[_productId].push(ProvenanceEvent({
            eventType:    evType,
            actor:        msg.sender,
            timestamp:    block.timestamp,
            metadataHash: string(abi.encodePacked(_metadataHash)),
            notes:        _notes
        }));

        emit StatusUpdated(_productId, _eventType, msg.sender, block.timestamp);
    }
    function confirmDelivery(uint256 _productId, bytes32 _metadataHash, string memory _notes) public 
    {
   
    }
    function getProvenance(uint256 _productId) public view returns (ProvenanceEvent[] memory events) 
    {
 
    }

    function getProductInfo(uint256 _productId) public view returns (string memory name, uint256 id, address manufacturer, address currentOwner, uint256 timestamp, uint256 eventCount) 
    {

    }   

    function getEventAt(uint256 _productId, uint256 index) public view returns (string memory eventType, address actor, uint256 timestamp, bytes32 metadataHash, string memory notes) 
    {

    }
}
