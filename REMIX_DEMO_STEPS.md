# Remix Demo Steps for Interim Demo

This file gives a clean sequence your team can follow during the Week 5 recording.

## Accounts to Use in Remix

After deploying with the first Remix account:

- Account 1 = Owner/Admin
- Account 2 = Producer
- Account 3 = Distributor
- Account 4 = Retailer
- Account 5 = Regulator

## Enum Values

### Role enum
- None = 0
- Producer = 1
- Distributor = 2
- Retailer = 3
- Regulator = 4

### ProductStatus enum
- None = 0
- Created = 1
- Shipped = 2
- Stored = 3
- Delivered = 4
- Verified = 5

## Suggested Demo Data

- `productId`: `1001`
- `metadataHash`: `QmBatch1001OriginData`
- transfer details: `Factory to distributor`
- shipped details: `Shipment departed origin facility`
- stored details: `Stored in regional warehouse`
- second transfer details: `Distributor to retailer`
- delivered details: `Received by retailer`
- verify details: `Compliance inspection passed`

## Demo Sequence

### 1. Deploy contract
Deploy `SupplyChainProvenance` from the owner account.

### 2. Assign stakeholder roles
Using the owner account, call:
- `assignRole(producerAddress, 1)`
- `assignRole(distributorAddress, 2)`
- `assignRole(retailerAddress, 3)`
- `assignRole(regulatorAddress, 4)`

You can optionally call `getRole` on those addresses to confirm assignment.

### 3. Register product
Switch to the producer account and call:
- `registerProduct(1001, "QmBatch1001OriginData")`

Then call `getProduct(1001)` to show:
- current custodian = producer
- status = Created

### 4. Transfer custody to distributor
Still as producer, call:
- `transferCustody(1001, distributorAddress, "Factory to distributor")`

### 5. Mark as shipped
Switch to distributor and call:
- `updateStatus(1001, 2, "Shipment departed origin facility")`

### 6. Mark as stored
Still as distributor, call:
- `updateStatus(1001, 3, "Stored in regional warehouse")`

### 7. Transfer custody to retailer
Still as distributor, call:
- `transferCustody(1001, retailerAddress, "Distributor to retailer")`

### 8. Mark as delivered
Switch to retailer and call:
- `updateStatus(1001, 4, "Received by retailer")`

### 9. Verify product
Switch to regulator and call:
- `verifyProduct(1001, "Compliance inspection passed")`

### 10. Show final state and full history
Call:
- `getProduct(1001)`
- `getProvenanceHistory(1001)`

Point out that the final status is `Verified` and that the full chain of events is stored on-chain in order.

## Good Talking Points During the Demo

- The owner account sets up stakeholder permissions.
- The producer is the only role allowed to register a new product.
- Only the current custodian can transfer custody or update status.
- Status transitions are controlled so the workflow cannot skip steps.
- The regulator can only verify after delivery.
- The provenance history is append-only and publicly queryable.
