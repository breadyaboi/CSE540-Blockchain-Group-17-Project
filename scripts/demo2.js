const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const ROLE = {
  None: 0,
  Producer: 1,
  Logistics: 2,
  Warehouse: 3,
  Retailer: 4,
  Consumer: 5,
  SystemAdmin: 6,
  Regulator: 7,
  Auditor: 8,
};

const STATUS = {
  None: 0,
  Created: 1,
  Packed: 2,
  InTransit: 3,
  Stored: 4,
  AtRetail: 5,
  Sold: 6,
  Verified: 7,
  Returned: 8,
  Recalled: 9,
  Damaged: 10,
  Expired: 11,
  Lost: 12,
};

const ROLE_NAMES = ["None", "Producer", "Logistics", "Warehouse", "Retailer", "Consumer", "SystemAdmin", "Regulator", "Auditor"];
const STATUS_NAMES = [
  "None", "Created", "Packed", "InTransit", "Stored", "AtRetail",
  "Sold", "Verified", "Returned", "Recalled", "Damaged", "Expired", "Lost",
];

function roleName(value) {
  return ROLE_NAMES[Number(value)] ?? `Unknown(${value})`;
}

function statusName(value) {
  return STATUS_NAMES[Number(value)] ?? `Unknown(${value})`;
}

function tsToIso(ts) {
  return new Date(Number(ts) * 1000).toISOString();
}

function short(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function parseRevertReason(error) {
  if (error?.shortMessage) return error.shortMessage;
  if (error?.message) return error.message;
  return String(error);
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function sanitizeMermaidText(text) {
  return String(text).replace(/"/g, "'").replace(/\n/g, " ");
}

function toMermaidStepLabel(record) {
  return `${sanitizeMermaidText(record.action)} | ${sanitizeMermaidText(record.eventMetadata)} | ${tsToIso(record.timestamp)}`;
}

function buildMermaidDiagram(historiesByProduct, actorNameByAddress) {
  const lines = ["```mermaid", "sequenceDiagram", "  autonumber", "  participant P as Producer", "  participant L as Logistics", "  participant W as Warehouse", "  participant R as Retailer", "  participant C as Consumer"];
  for (const [productId, history] of Object.entries(historiesByProduct)) {
    lines.push(`  Note over P,C: Product ${productId}`);
    for (const record of history) {
      const actor = actorNameByAddress[record.actor.toLowerCase()] ?? "unknown";
      const step = toMermaidStepLabel(record);
      if (actor.startsWith("producer")) lines.push(`  P->>P: ${step}`);
      else if (actor.startsWith("logistics")) lines.push(`  L->>L: ${step}`);
      else if (actor.startsWith("warehouse")) lines.push(`  W->>W: ${step}`);
      else if (actor.startsWith("retailer")) lines.push(`  R->>R: ${step}`);
      else if (actor.startsWith("consumer")) lines.push(`  C->>C: ${step}`);
    }
  }
  lines.push("```");
  return lines.join("\n");
}

async function expectRevert(label, fn, expectedText) {
  try {
    await fn();
    throw new Error(`[${label}] expected revert but transaction succeeded`);
  } catch (error) {
    const reason = parseRevertReason(error);
    if (!reason.includes(expectedText)) {
      throw new Error(`[${label}] wrong revert reason. expected "${expectedText}", got: ${reason}`);
    }
    console.log(`  expected revert: ${label} -> ${expectedText}`);
  }
}

async function runTx(label, txPromise, contract) {
  const receipt = await (await txPromise).wait();
  console.log(`\n[tx] ${label}`);
  console.log(`  hash: ${receipt.hash}`);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== (await contract.getAddress()).toLowerCase()) continue;
    try {
      const parsed = contract.interface.parseLog(log);
      const args = parsed.fragment.inputs.map((input, i) => `${input.name}=${typeof parsed.args[i] === "bigint" ? parsed.args[i].toString() : parsed.args[i]}`);
      console.log(`  event: ${parsed.name}(${args.join(", ")})`);
    } catch (_) {}
  }
}

async function printProductSnapshot(contract, productId, label) {
  const p = await contract.getProduct(productId);
  console.log(`\n[product ${productId}] ${label}`);
  console.log(`  metadataHash: ${p.metadataHash}`);
  console.log(`  currentCustodian: ${p.currentCustodian} (${short(p.currentCustodian)})`);
  console.log(`  status: ${statusName(p.status)} (${Number(p.status)})`);
}

async function printHistory(contract, productId) {
  const history = await contract.getProvenanceHistory(productId);
  console.log(`\n[history ${productId}] records=${history.length}`);
  history.forEach((r, idx) => {
    console.log(`  #${idx + 1} t=${tsToIso(r.timestamp)} actor=${short(r.actor)} action=${r.action} eventMetadata=${r.eventMetadata}`);
  });
}

async function verifyLifecycle(contract, productId, expectedStatus, expectedCustodian, expectedActions) {
  const p = await contract.getProduct(productId);
  assertCondition(p.exists === true, `product ${productId} must exist`);
  assertCondition(Number(p.status) === expectedStatus, `product ${productId} status mismatch`);
  assertCondition(p.currentCustodian.toLowerCase() === expectedCustodian.toLowerCase(), `product ${productId} custodian mismatch`);
  const actions = (await contract.getProvenanceHistory(productId)).map((r) => r.action);
  assertCondition(actions.length === expectedActions.length, `history length mismatch for ${productId}`);
  expectedActions.forEach((action, idx) => assertCondition(actions[idx] === action, `action mismatch at ${idx}`));
}

async function executeFullLifecycle(contract, actors, productId, metadataHash, labels, options = {}) {
  if (!options.skipRegister) {
    await runTx(`${labels.producer} registers ${productId}`, contract.connect(actors.producer).registerProduct(productId, metadataHash), contract);
  }
  await runTx(`${labels.producer} packs ${productId}`, contract.connect(actors.producer).updateStatus(productId, STATUS.Packed, `ipfs://cid/packing-${productId}`), contract);
  await runTx(`${labels.producer}->${labels.logistics}`, contract.connect(actors.producer).transferCustody(productId, actors.logistics.address, `ipfs://cid/handoff-logistics-${productId}`), contract);
  await runTx(`${labels.logistics} in transit`, contract.connect(actors.logistics).updateStatus(productId, STATUS.InTransit, `ipfs://cid/in-transit-log-${productId}`), contract);
  await runTx(`${labels.logistics}->${labels.warehouse}`, contract.connect(actors.logistics).transferCustody(productId, actors.warehouse.address, `ipfs://cid/handoff-warehouse-${productId}`), contract);
  await runTx(`${labels.warehouse} stores`, contract.connect(actors.warehouse).updateStatus(productId, STATUS.Stored, `ipfs://cid/storage-record-${productId}`), contract);
  await runTx(`${labels.warehouse}->retailer`, contract.connect(actors.warehouse).transferCustody(productId, actors.retailer.address, `ipfs://cid/handoff-retailer-${productId}`), contract);
  await runTx(`retailer lists ${productId}`, contract.connect(actors.retailer).updateStatus(productId, STATUS.AtRetail, `ipfs://cid/listing-record-${productId}`), contract);
  await runTx(`retailer sells ${productId}`, contract.connect(actors.retailer).updateStatus(productId, STATUS.Sold, `ipfs://cid/sale-record-${productId}`), contract);
  await runTx(`retailer->consumer ${productId}`, contract.connect(actors.retailer).transferCustody(productId, actors.consumer.address, `ipfs://cid/handoff-consumer-${productId}`), contract);
  await runTx(`consumer verifies ${productId}`, contract.connect(actors.consumer).verifyProduct(productId, `ipfs://cid/consumer-verification-${productId}`), contract);
}

async function main() {
  const [owner, producerA, producerB, logisticsA, logisticsB, warehouse, retailer, consumer, outsider] = await hre.ethers.getSigners();

  console.log("Participants:");
  console.log(`  owner:      ${owner.address}`);
  console.log(`  producerA:  ${producerA.address}`);
  console.log(`  producerB:  ${producerB.address}`);
  console.log(`  logisticsA: ${logisticsA.address}`);
  console.log(`  logisticsB: ${logisticsB.address}`);
  console.log(`  warehouse:  ${warehouse.address}`);
  console.log(`  retailer:   ${retailer.address}`);
  console.log(`  consumer:   ${consumer.address}`);
  console.log(`  outsider:   ${outsider.address}`);

  const Factory = await hre.ethers.getContractFactory("SupplyChainProvenance");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();
  console.log(`\nContract deployed at: ${await contract.getAddress()}`);

  await runTx("assign producerA", contract.assignRole(producerA.address, ROLE.Producer), contract);
  await runTx("assign producerB", contract.assignRole(producerB.address, ROLE.Producer), contract);
  await runTx("assign logisticsA", contract.assignRole(logisticsA.address, ROLE.Logistics), contract);
  await runTx("assign logisticsB", contract.assignRole(logisticsB.address, ROLE.Logistics), contract);
  await runTx("assign warehouse", contract.assignRole(warehouse.address, ROLE.Warehouse), contract);
  await runTx("assign retailer", contract.assignRole(retailer.address, ROLE.Retailer), contract);
  await runTx("assign consumer", contract.assignRole(consumer.address, ROLE.Consumer), contract);

  console.log("\nRoles after assignment:");
  for (const signer of [producerA, producerB, logisticsA, logisticsB, warehouse, retailer, consumer, outsider]) {
    console.log(`  ${short(signer.address)} -> ${roleName(await contract.getRole(signer.address))}`);
  }

  const P1 = 3001;
  const P2 = 3002;

  console.log("\nNegative-path checks:");
  await expectRevert("outsider cannot register", () => contract.connect(outsider).registerProduct(9999, "ipfs://unauthorized"), "Only producer");
  await runTx("producerA registers P1", contract.connect(producerA).registerProduct(P1, "ipfs://cid/product-3001-metadata"), contract);
  await expectRevert("producer cannot transfer before ready", () => contract.connect(producerA).transferCustody(P1, logisticsA.address, "too early"), "Invalid custody transfer");
  await expectRevert("producer cannot skip to retailer", () => contract.connect(producerA).transferCustody(P1, retailer.address, "skip"), "Invalid custody transfer");
  await expectRevert("outsider cannot verify", () => contract.connect(outsider).verifyProduct(P1, "fake"), "Only consumer");

  await runTx("producerB registers P2", contract.connect(producerB).registerProduct(P2, "ipfs://cid/product-3002-metadata"), contract);

  await executeFullLifecycle(
    contract,
    { producer: producerA, logistics: logisticsA, warehouse, retailer, consumer },
    P1,
    "ipfs://cid/product-3001-metadata",
    { producer: "producerA", logistics: "logisticsA", warehouse: "warehouse" },
    { skipRegister: true }
  );
  await executeFullLifecycle(
    contract,
    { producer: producerB, logistics: logisticsB, warehouse, retailer, consumer },
    P2,
    "ipfs://cid/product-3002-metadata",
    { producer: "producerB", logistics: "logisticsB", warehouse: "warehouse" },
    { skipRegister: true }
  );

  await printProductSnapshot(contract, P1, "final state");
  await printProductSnapshot(contract, P2, "final state");
  await printHistory(contract, P1);
  await printHistory(contract, P2);

  const expectedActions = [
    "REGISTER",
    "UPDATE_STATUS",
    "TRANSFER_CUSTODY",
    "UPDATE_STATUS",
    "TRANSFER_CUSTODY",
    "UPDATE_STATUS",
    "TRANSFER_CUSTODY",
    "UPDATE_STATUS",
    "UPDATE_STATUS",
    "TRANSFER_CUSTODY",
    "VERIFY_PRODUCT",
  ];

  await verifyLifecycle(contract, P1, STATUS.Verified, consumer.address, expectedActions);
  await verifyLifecycle(contract, P2, STATUS.Verified, consumer.address, expectedActions);

  const p1History = await contract.getProvenanceHistory(P1);
  const p2History = await contract.getProvenanceHistory(P2);
  const actorNameByAddress = {
    [producerA.address.toLowerCase()]: "producerA",
    [producerB.address.toLowerCase()]: "producerB",
    [logisticsA.address.toLowerCase()]: "logisticsA",
    [logisticsB.address.toLowerCase()]: "logisticsB",
    [warehouse.address.toLowerCase()]: "warehouse",
    [retailer.address.toLowerCase()]: "retailer",
    [consumer.address.toLowerCase()]: "consumer",
  };

  const mermaid = buildMermaidDiagram({ [P1]: p1History, [P2]: p2History }, actorNameByAddress);
  const visualizationPath = path.join(__dirname, "demo2-visualization.md");
  fs.writeFileSync(visualizationPath, ["# Demo 2 Visualization", "", "Generated from on-chain provenance history in `scripts/demo2.js`.", "", mermaid, ""].join("\n"), "utf8");

  console.log("\nIntegrity checks passed: both product histories and final states match expectations.");
  console.log(`Visualization written to: ${visualizationPath}`);
  console.log("Demo 2 complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
