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
  P->>P: REGISTER | ipfs://batch-A/lot-9001 | 2026-05-01T07:49:32.000Z
  P->>P: UPDATE_STATUS | certified | 2026-05-01T07:49:37.000Z
  P->>P: UPDATE_STATUS | ready for shipment | 2026-05-01T07:49:38.000Z
  P->>P: TRANSFER_CUSTODY | handoff to logistics | 2026-05-01T07:49:39.000Z
  L->>L: UPDATE_STATUS | picked up | 2026-05-01T07:49:40.000Z
  L->>L: UPDATE_STATUS | in transit | 2026-05-01T07:49:41.000Z
  L->>L: UPDATE_STATUS | delivered to warehouse | 2026-05-01T07:49:42.000Z
  L->>L: TRANSFER_CUSTODY | arrived at warehouse | 2026-05-01T07:49:43.000Z
  W->>W: UPDATE_STATUS | received at warehouse | 2026-05-01T07:49:44.000Z
  W->>W: UPDATE_STATUS | stored | 2026-05-01T07:49:45.000Z
  W->>W: UPDATE_STATUS | released | 2026-05-01T07:49:46.000Z
  W->>W: TRANSFER_CUSTODY | delivered to retailer | 2026-05-01T07:49:47.000Z
  R->>R: UPDATE_STATUS | received by retailer | 2026-05-01T07:49:48.000Z
  R->>R: UPDATE_STATUS | available for sale | 2026-05-01T07:49:49.000Z
  R->>R: UPDATE_STATUS | sold | 2026-05-01T07:49:50.000Z
  C->>C: VERIFY_PRODUCT | verification complete | 2026-05-01T07:49:51.000Z
  Note over P,C: Product 3002
  P->>P: REGISTER | ipfs://batch-B/lot-42 | 2026-05-01T07:49:36.000Z
  P->>P: UPDATE_STATUS | certified | 2026-05-01T07:49:52.000Z
  P->>P: UPDATE_STATUS | ready for shipment | 2026-05-01T07:49:53.000Z
  P->>P: TRANSFER_CUSTODY | handoff to logistics | 2026-05-01T07:49:54.000Z
  L->>L: UPDATE_STATUS | picked up | 2026-05-01T07:49:55.000Z
  L->>L: UPDATE_STATUS | in transit | 2026-05-01T07:49:56.000Z
  L->>L: UPDATE_STATUS | delivered to warehouse | 2026-05-01T07:49:57.000Z
  L->>L: TRANSFER_CUSTODY | arrived at warehouse | 2026-05-01T07:49:58.000Z
  W->>W: UPDATE_STATUS | received at warehouse | 2026-05-01T07:49:59.000Z
  W->>W: UPDATE_STATUS | stored | 2026-05-01T07:50:00.000Z
  W->>W: UPDATE_STATUS | released | 2026-05-01T07:50:01.000Z
  W->>W: TRANSFER_CUSTODY | delivered to retailer | 2026-05-01T07:50:02.000Z
  R->>R: UPDATE_STATUS | received by retailer | 2026-05-01T07:50:03.000Z
  R->>R: UPDATE_STATUS | available for sale | 2026-05-01T07:50:04.000Z
  R->>R: UPDATE_STATUS | sold | 2026-05-01T07:50:05.000Z
  C->>C: VERIFY_PRODUCT | verification complete | 2026-05-01T07:50:06.000Z
```
