# Demo 2 Visualization

Generated from on-chain provenance history in `scripts/demo2.js`.

```mermaid
sequenceDiagram
  autonumber
  participant P as Producer
  participant L as Logistics
  participant W as Warehouse
  participant R as Retailer
  participant C as Consumer
  Note over P,C: Product 3001
  P->>P: REGISTER | ipfs://cid/product-3001-metadata | 2026-05-01T18:32:51.000Z
  P->>P: UPDATE_STATUS | ipfs://cid/packing-3001 | 2026-05-01T18:32:56.000Z
  P->>P: TRANSFER_CUSTODY | ipfs://cid/handoff-logistics-3001 | 2026-05-01T18:32:57.000Z
  L->>L: UPDATE_STATUS | ipfs://cid/in-transit-log-3001 | 2026-05-01T18:32:58.000Z
  L->>L: TRANSFER_CUSTODY | ipfs://cid/handoff-warehouse-3001 | 2026-05-01T18:32:59.000Z
  W->>W: UPDATE_STATUS | ipfs://cid/storage-record-3001 | 2026-05-01T18:33:00.000Z
  W->>W: TRANSFER_CUSTODY | ipfs://cid/handoff-retailer-3001 | 2026-05-01T18:33:01.000Z
  R->>R: UPDATE_STATUS | ipfs://cid/listing-record-3001 | 2026-05-01T18:33:02.000Z
  R->>R: UPDATE_STATUS | ipfs://cid/sale-record-3001 | 2026-05-01T18:33:03.000Z
  R->>R: TRANSFER_CUSTODY | ipfs://cid/handoff-consumer-3001 | 2026-05-01T18:33:04.000Z
  C->>C: VERIFY_PRODUCT | ipfs://cid/consumer-verification-3001 | 2026-05-01T18:33:05.000Z
  Note over P,C: Product 3002
  P->>P: REGISTER | ipfs://cid/product-3002-metadata | 2026-05-01T18:32:55.000Z
  P->>P: UPDATE_STATUS | ipfs://cid/packing-3002 | 2026-05-01T18:33:06.000Z
  P->>P: TRANSFER_CUSTODY | ipfs://cid/handoff-logistics-3002 | 2026-05-01T18:33:07.000Z
  L->>L: UPDATE_STATUS | ipfs://cid/in-transit-log-3002 | 2026-05-01T18:33:08.000Z
  L->>L: TRANSFER_CUSTODY | ipfs://cid/handoff-warehouse-3002 | 2026-05-01T18:33:09.000Z
  W->>W: UPDATE_STATUS | ipfs://cid/storage-record-3002 | 2026-05-01T18:33:10.000Z
  W->>W: TRANSFER_CUSTODY | ipfs://cid/handoff-retailer-3002 | 2026-05-01T18:33:11.000Z
  R->>R: UPDATE_STATUS | ipfs://cid/listing-record-3002 | 2026-05-01T18:33:12.000Z
  R->>R: UPDATE_STATUS | ipfs://cid/sale-record-3002 | 2026-05-01T18:33:13.000Z
  R->>R: TRANSFER_CUSTODY | ipfs://cid/handoff-consumer-3002 | 2026-05-01T18:33:14.000Z
  C->>C: VERIFY_PRODUCT | ipfs://cid/consumer-verification-3002 | 2026-05-01T18:33:15.000Z
```
