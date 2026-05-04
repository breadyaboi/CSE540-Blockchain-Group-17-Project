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

function red(text) {
  return `\x1b[31m${text}\x1b[0m`;
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
  const lines = ["```mermaid", "sequenceDiagram", "  autonumber", "  participant P as Producer", "  participant L as Logistics", "  participant W as Warehouse", "  participant R as Retailer", "  participant C as Consumer", "  participant G as Regulator"];
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
      else if (actor.startsWith("regulator")) lines.push(`  G->>G: ${step}`);
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
    console.log(red(`  expected revert: ${label} -> ${expectedText}`));
    console.log(red(`  reason: ${reason}`));
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

async function printProductSnapshot(contract, productId, label, productName = null) {
  const p = await contract.getProduct(productId);
  console.log(`\n[product ${productName ?? productId}] ${label}`);
  console.log(`  metadataHash: ${p.metadataHash}`);
  console.log(`  currentCustodian: ${p.currentCustodian} (${short(p.currentCustodian)})`);
  console.log(`  status: ${statusName(p.status)} (${Number(p.status)})`);
}

async function printHistory(contract, productId, productName = null) {
  const history = await contract.getProvenanceHistory(productId);
  console.log(`\n[history ${productName ?? productId}] records=${history.length}`);
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

async function executeFullLifecycle(contract, actors, productId, productName, metadataHash, labels, options = {}) {
  if (!options.skipRegister) {
    await runTx(`[${productName}] ${labels.producer} registers`, contract.connect(actors.producer).registerProduct(productId, metadataHash), contract);
  }
  await runTx(`[${productName}] ${labels.producer} packs`, contract.connect(actors.producer).updateStatus(productId, STATUS.Packed, `ipfs://cid/packing-${productId}`), contract);
  await runTx(`[${productName}] transfer ${labels.producer}->${labels.logistics}`, contract.connect(actors.producer).transferCustody(productId, actors.logistics.address, `ipfs://cid/handoff-logistics-${productId}`), contract);
  await runTx(`[${productName}] ${labels.logistics} in transit`, contract.connect(actors.logistics).updateStatus(productId, STATUS.InTransit, `ipfs://cid/in-transit-log-${productId}`), contract);
  await runTx(`[${productName}] transfer ${labels.logistics}->${labels.warehouse}`, contract.connect(actors.logistics).transferCustody(productId, actors.warehouse.address, `ipfs://cid/handoff-warehouse-${productId}`), contract);
  await runTx(`[${productName}] ${labels.warehouse} stores`, contract.connect(actors.warehouse).updateStatus(productId, STATUS.Stored, `ipfs://cid/storage-record-${productId}`), contract);
  await runTx(`[${productName}] transfer ${labels.warehouse}->retailer`, contract.connect(actors.warehouse).transferCustody(productId, actors.retailer.address, `ipfs://cid/handoff-retailer-${productId}`), contract);
  await runTx(`[${productName}] retailer lists`, contract.connect(actors.retailer).updateStatus(productId, STATUS.AtRetail, `ipfs://cid/listing-record-${productId}`), contract);
  await runTx(`[${productName}] retailer sells`, contract.connect(actors.retailer).updateStatus(productId, STATUS.Sold, `ipfs://cid/sale-record-${productId}`), contract);
  await runTx(`[${productName}] transfer retailer->consumer`, contract.connect(actors.retailer).transferCustody(productId, actors.consumer.address, `ipfs://cid/handoff-consumer-${productId}`), contract);
  await runTx(`[${productName}] consumer verifies`, contract.connect(actors.consumer).verifyProduct(productId, `ipfs://cid/consumer-verification-${productId}`), contract);
}

async function main() {
  const [owner, producerA, producerB, logisticsA, logisticsB, warehouse, retailer, consumerA, consumerB, regulator, outsider] = await hre.ethers.getSigners();

  console.log("Participants:");
  console.log(`  owner:      ${owner.address}`);
  console.log(`  producerA:  ${producerA.address}`);
  console.log(`  producerB:  ${producerB.address}`);
  console.log(`  logisticsA: ${logisticsA.address}`);
  console.log(`  logisticsB: ${logisticsB.address}`);
  console.log(`  warehouse:  ${warehouse.address}`);
  console.log(`  retailer:   ${retailer.address}`);
  console.log(`  consumerA:  ${consumerA.address}`);
  console.log(`  consumerB:  ${consumerB.address}`);
  console.log(`  regulator:  ${regulator.address}`);
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
  await runTx("assign consumerA", contract.assignRole(consumerA.address, ROLE.Consumer), contract);
  await runTx("assign consumerB", contract.assignRole(consumerB.address, ROLE.Consumer), contract);
  await runTx("assign regulator", contract.assignRole(regulator.address, ROLE.Regulator), contract);

  console.log("\nRoles after assignment:");
  for (const signer of [producerA, producerB, logisticsA, logisticsB, warehouse, retailer, consumerA, consumerB, regulator, outsider]) {
    console.log(`  ${short(signer.address)} -> ${roleName(await contract.getRole(signer.address))}`);
  }

  const P1 = 3001; // producerA -> consumerA success
  const P2 = 3002; // producerA -> recalled at warehouse
  const P3 = 3003; // producerA -> lost in transit
  const P4 = 3004; // producerB -> consumerB success
  const P5 = 3005; // producerB -> damaged at warehouse

  console.log("\nNegative-path checks:");
  await expectRevert("outsider cannot register", () => contract.connect(outsider).registerProduct(9999, "ipfs://unauthorized"), "Only producer");
  await runTx("producerA registers P1", contract.connect(producerA).registerProduct(P1, "ipfs://cid/product-3001-metadata"), contract);
  await expectRevert("producer cannot transfer before ready", () => contract.connect(producerA).transferCustody(P1, logisticsA.address, "too early"), "Invalid custody transfer");
  await expectRevert("producer cannot skip to retailer", () => contract.connect(producerA).transferCustody(P1, retailer.address, "skip"), "Invalid custody transfer");
  await expectRevert("outsider cannot verify", () => contract.connect(outsider).verifyProduct(P1, "fake"), "Only consumer");
  await expectRevert("duplicate register P1", () => contract.connect(producerA).registerProduct(P1, "ipfs://cid/dup"), "Duplicate product");
  await expectRevert("producerA cannot set InTransit directly", () => contract.connect(producerA).updateStatus(P1, STATUS.InTransit, "bad transition"), "Invalid transition");
  await expectRevert("warehouse cannot recall without regulator role", () => contract.connect(warehouse).updateStatus(P1, STATUS.Recalled, "unauthorized recall"), "Only current custodian");
  await expectRevert("consumerB cannot verify before custody", () => contract.connect(consumerB).verifyProduct(P1, "not custodian"), "Only current custodian");

  await runTx("producerA registers P2", contract.connect(producerA).registerProduct(P2, "ipfs://cid/product-3002-metadata"), contract);
  await runTx("producerA registers P3", contract.connect(producerA).registerProduct(P3, "ipfs://cid/product-3003-metadata"), contract);
  await runTx("producerB registers P4", contract.connect(producerB).registerProduct(P4, "ipfs://cid/product-3004-metadata"), contract);
  await runTx("producerB registers P5", contract.connect(producerB).registerProduct(P5, "ipfs://cid/product-3005-metadata"), contract);

  // P1: full success -> consumerA verifies
  await executeFullLifecycle(
    contract,
    { producer: producerA, logistics: logisticsA, warehouse, retailer, consumer: consumerA },
    P1,
    "P1",
    "ipfs://cid/product-3001-metadata",
    { producer: "producerA", logistics: "logisticsA", warehouse: "warehouse" },
    { skipRegister: true }
  );

  // P2: recalled at warehouse by regulator
  await runTx("[P2] producerA packs", contract.connect(producerA).updateStatus(P2, STATUS.Packed, "ipfs://cid/packing-3002"), contract);
  await runTx("[P2] transfer producerA->logisticsA", contract.connect(producerA).transferCustody(P2, logisticsA.address, "ipfs://cid/handoff-logistics-3002"), contract);
  await runTx("[P2] logisticsA in transit", contract.connect(logisticsA).updateStatus(P2, STATUS.InTransit, "ipfs://cid/in-transit-log-3002"), contract);
  await runTx("[P2] transfer logisticsA->warehouse", contract.connect(logisticsA).transferCustody(P2, warehouse.address, "ipfs://cid/handoff-warehouse-3002"), contract);
  await runTx("[P2] warehouse stores", contract.connect(warehouse).updateStatus(P2, STATUS.Stored, "ipfs://cid/storage-record-3002"), contract);
  await expectRevert("retailer cannot take P2 before warehouse transfer", () => contract.connect(warehouse).transferCustody(P2, consumerA.address, "wrong recipient"), "Invalid custody transfer");
  await runTx("[P2] regulator recalls", contract.connect(regulator).updateStatus(P2, STATUS.Recalled, "ipfs://cid/regulatory-recall-3002"), contract);

  // P3: lost in transit
  await runTx("[P3] producerA packs", contract.connect(producerA).updateStatus(P3, STATUS.Packed, "ipfs://cid/packing-3003"), contract);
  await runTx("[P3] transfer producerA->logisticsA", contract.connect(producerA).transferCustody(P3, logisticsA.address, "ipfs://cid/handoff-logistics-3003"), contract);
  await runTx("[P3] logisticsA in transit", contract.connect(logisticsA).updateStatus(P3, STATUS.InTransit, "ipfs://cid/in-transit-log-3003"), contract);
  await expectRevert("producerA cannot reclaim custody from logisticsA", () => contract.connect(producerA).transferCustody(P3, warehouse.address, "not custodian"), "Only current custodian");
  await runTx("[P3] logisticsA marks lost", contract.connect(logisticsA).updateStatus(P3, STATUS.Lost, "ipfs://cid/lost-report-3003"), contract);

  // P4: full success -> consumerB verifies
  await executeFullLifecycle(
    contract,
    { producer: producerB, logistics: logisticsB, warehouse, retailer, consumer: consumerB },
    P4,
    "P4",
    "ipfs://cid/product-3004-metadata",
    { producer: "producerB", logistics: "logisticsB", warehouse: "warehouse" },
    { skipRegister: true }
  );

  // P5: damaged at warehouse
  await runTx("[P5] producerB packs", contract.connect(producerB).updateStatus(P5, STATUS.Packed, "ipfs://cid/packing-3005"), contract);
  await runTx("[P5] transfer producerB->logisticsB", contract.connect(producerB).transferCustody(P5, logisticsB.address, "ipfs://cid/handoff-logistics-3005"), contract);
  await runTx("[P5] logisticsB in transit", contract.connect(logisticsB).updateStatus(P5, STATUS.InTransit, "ipfs://cid/in-transit-log-3005"), contract);
  await runTx("[P5] transfer logisticsB->warehouse", contract.connect(logisticsB).transferCustody(P5, warehouse.address, "ipfs://cid/handoff-warehouse-3005"), contract);
  await runTx("[P5] warehouse stores", contract.connect(warehouse).updateStatus(P5, STATUS.Stored, "ipfs://cid/storage-record-3005"), contract);
  await runTx("[P5] warehouse marks damaged", contract.connect(warehouse).updateStatus(P5, STATUS.Damaged, "ipfs://cid/damage-report-3005"), contract);

  await printProductSnapshot(contract, P1, "final state", "P1");
  await printProductSnapshot(contract, P2, "final state", "P2");
  await printProductSnapshot(contract, P3, "final state", "P3");
  await printProductSnapshot(contract, P4, "final state", "P4");
  await printProductSnapshot(contract, P5, "final state", "P5");
  await printHistory(contract, P1, "P1");
  await printHistory(contract, P2, "P2");
  await printHistory(contract, P3, "P3");
  await printHistory(contract, P4, "P4");
  await printHistory(contract, P5, "P5");

  const expectedSuccessActions = [
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

  await verifyLifecycle(contract, P1, STATUS.Verified, consumerA.address, expectedSuccessActions);
  await verifyLifecycle(contract, P4, STATUS.Verified, consumerB.address, expectedSuccessActions);

  await verifyLifecycle(contract, P2, STATUS.Recalled, warehouse.address, [
    "REGISTER",
    "UPDATE_STATUS",
    "TRANSFER_CUSTODY",
    "UPDATE_STATUS",
    "TRANSFER_CUSTODY",
    "UPDATE_STATUS",
    "UPDATE_STATUS",
  ]);
  await verifyLifecycle(contract, P3, STATUS.Lost, logisticsA.address, [
    "REGISTER",
    "UPDATE_STATUS",
    "TRANSFER_CUSTODY",
    "UPDATE_STATUS",
    "UPDATE_STATUS",
  ]);
  await verifyLifecycle(contract, P5, STATUS.Damaged, warehouse.address, [
    "REGISTER",
    "UPDATE_STATUS",
    "TRANSFER_CUSTODY",
    "UPDATE_STATUS",
    "TRANSFER_CUSTODY",
    "UPDATE_STATUS",
    "UPDATE_STATUS",
  ]);

  const p1History = await contract.getProvenanceHistory(P1);
  const p2History = await contract.getProvenanceHistory(P2);
  const p3History = await contract.getProvenanceHistory(P3);
  const p4History = await contract.getProvenanceHistory(P4);
  const p5History = await contract.getProvenanceHistory(P5);
  const actorNameByAddress = {
    [producerA.address.toLowerCase()]: "producerA",
    [producerB.address.toLowerCase()]: "producerB",
    [logisticsA.address.toLowerCase()]: "logisticsA",
    [logisticsB.address.toLowerCase()]: "logisticsB",
    [warehouse.address.toLowerCase()]: "warehouse",
    [retailer.address.toLowerCase()]: "retailer",
    [consumerA.address.toLowerCase()]: "consumerA",
    [consumerB.address.toLowerCase()]: "consumerB",
    [regulator.address.toLowerCase()]: "regulator",
  };

  const mermaid = buildMermaidDiagram(
    { [P1]: p1History, [P2]: p2History, [P3]: p3History, [P4]: p4History, [P5]: p5History },
    actorNameByAddress
  );
  const visualizationPath = path.join(__dirname, "demo2-visualization.md");
  fs.writeFileSync(visualizationPath, ["# Demo 2 Visualization", "", "Generated from on-chain provenance history in `scripts/demo2.js`.", "", mermaid, ""].join("\n"), "utf8");

  console.log("\nIntegrity checks passed: all product histories and final states match expectations.");
  console.log(`Visualization written to: ${visualizationPath}`);
  console.log("Demo 2 complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
