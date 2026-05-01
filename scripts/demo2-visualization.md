# Demo 2 Visualization

Generated from on-chain provenance history in `scripts/demo2.js`.

```mermaid
sequenceDiagram
  autonumber
  participant P as Producer
  participant L as Logistics
  participant W as Warehouse
  participant R as Retailer
  participant G as Regulator
  Note over P,G: Product 3001
  P->>P: REGISTER | ipfs://batch-A/lot-9001 | 2026-04-13T09:24:35.000Z
  P->>P: UPDATE_STATUS | packed | 2026-04-13T09:24:40.000Z
  P->>P: TRANSFER_CUSTODY | handoff to logistics | 2026-04-13T09:24:41.000Z
  L->>L: UPDATE_STATUS | in transit | 2026-04-13T09:24:42.000Z
  L->>L: TRANSFER_CUSTODY | arrived at warehouse | 2026-04-13T09:24:43.000Z
  W->>W: UPDATE_STATUS | stored | 2026-04-13T09:24:44.000Z
  W->>W: TRANSFER_CUSTODY | released for last mile | 2026-04-13T09:24:45.000Z
  L->>L: UPDATE_STATUS | out for delivery | 2026-04-13T09:24:46.000Z
  L->>L: TRANSFER_CUSTODY | delivered to retailer | 2026-04-13T09:24:47.000Z
  R->>R: UPDATE_STATUS | received by retailer | 2026-04-13T09:24:48.000Z
  G->>G: VERIFY_PRODUCT | inspection complete | 2026-04-13T09:24:49.000Z
  Note over P,G: Product 3002
  P->>P: REGISTER | ipfs://batch-B/lot-42 | 2026-04-13T09:24:39.000Z
  P->>P: UPDATE_STATUS | packed | 2026-04-13T09:24:50.000Z
  P->>P: TRANSFER_CUSTODY | handoff to logistics | 2026-04-13T09:24:51.000Z
  L->>L: UPDATE_STATUS | in transit | 2026-04-13T09:24:52.000Z
  L->>L: TRANSFER_CUSTODY | arrived at warehouse | 2026-04-13T09:24:53.000Z
  W->>W: UPDATE_STATUS | stored | 2026-04-13T09:24:54.000Z
  W->>W: TRANSFER_CUSTODY | released for last mile | 2026-04-13T09:24:55.000Z
  L->>L: UPDATE_STATUS | out for delivery | 2026-04-13T09:24:56.000Z
  L->>L: TRANSFER_CUSTODY | delivered to retailer | 2026-04-13T09:24:57.000Z
  R->>R: UPDATE_STATUS | received by retailer | 2026-04-13T09:24:58.000Z
  G->>G: VERIFY_PRODUCT | inspection complete | 2026-04-13T09:24:59.000Z
```
