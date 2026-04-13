const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const ROLE = {
  None: 0,
  Producer: 1,
  Distributor: 2,
  Retailer: 3,
  Regulator: 4,
};

const STATUS = {
  None: 0,
  Created: 1,
  Shipped: 2,
  Stored: 3,
  Delivered: 4,
  Verified: 5,
};

const ROLE_NAMES = ["None", "Producer", "Distributor", "Retailer", "Regulator"];
const STATUS_NAMES = ["None", "Created", "Shipped", "Stored", "Delivered", "Verified"];

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
  const action = sanitizeMermaidText(record.action);
  const details = sanitizeMermaidText(record.details);
  const at = tsToIso(record.timestamp);
  return `${action} | ${details} | ${at}`;
}

function buildMermaidDiagram(historiesByProduct, actorNameByAddress) {
  const lines = [];
  lines.push("```mermaid");
  lines.push("sequenceDiagram");
  lines.push("  autonumber");
  lines.push("  participant P as Producer");
  lines.push("  participant D as Distributor");
  lines.push("  participant R as Retailer");
  lines.push("  participant G as Regulator");

  for (const [productId, history] of Object.entries(historiesByProduct)) {
    lines.push(`  Note over P,G: Product ${productId}`);
    for (const r of history) {
      const actor = actorNameByAddress[r.actor.toLowerCase()] ?? "Unknown";
      const step = toMermaidStepLabel(r);
      if (actor.startsWith("producer")) {
        lines.push(`  P->>P: ${step}`);
      } else if (actor.startsWith("distributor")) {
        lines.push(`  D->>D: ${step}`);
      } else if (actor.startsWith("retailer")) {
        lines.push(`  R->>R: ${step}`);
      } else if (actor.startsWith("regulator")) {
        lines.push(`  G->>G: ${step}`);
      } else {
        lines.push(`  P-->>G: ${step}`);
      }
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
      throw new Error(`[${label}] wrong revert reason. expected to include "${expectedText}", got: ${reason}`);
    }
    console.log(`  expected revert: ${label} -> ${expectedText}`);
  }
}

async function runTx(label, txPromise, contract) {
  const tx = await txPromise;
  const receipt = await tx.wait();

  console.log(`\n[tx] ${label}`);
  console.log(`  hash: ${receipt.hash}`);
  // console.log(`  gasUsed: ${receipt.gasUsed.toString()}`);

  const decoded = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== (await contract.getAddress()).toLowerCase()) continue;
    try {
      const parsed = contract.interface.parseLog(log);
      decoded.push(parsed);
    } catch (_) {
      // Ignore logs from other interfaces.
    }
  }

  if (decoded.length === 0) {
    console.log("  events: (none decoded)");
  } else {
    for (const ev of decoded) {
      const argStrings = ev.fragment.inputs.map((input, i) => {
        const v = ev.args[i];
        if (typeof v === "bigint") return `${input.name}=${v.toString()}`;
        return `${input.name}=${v}`;
      });
      console.log(`  event: ${ev.name}(${argStrings.join(", ")})`);
    }
  }

  return receipt;
}

async function printProductSnapshot(contract, productId, label) {
  const p = await contract.getProduct(productId);
  console.log(`\n[product ${productId}] ${label}`);
  console.log(`  metadataHash: ${p.metadataHash}`);
  console.log(`  currentCustodian: ${p.currentCustodian} (${short(p.currentCustodian)})`);
  console.log(`  status: ${statusName(p.status)} (${Number(p.status)})`);
  console.log(`  exists: ${p.exists}`);
}

async function printHistory(contract, productId) {
  const history = await contract.getProvenanceHistory(productId);
  console.log(`\n[history ${productId}] records=${history.length}`);
  history.forEach((r, idx) => {
    console.log(
      `  #${idx + 1} t=${tsToIso(r.timestamp)} actor=${short(r.actor)} action=${r.action} details=${r.details}`
    );
  });
}

async function verifyLifecycle(contract, productId, expectedStatus, expectedCustodian, expectedActions) {
  const p = await contract.getProduct(productId);
  assertCondition(p.exists === true, `product ${productId} must exist`);
  assertCondition(Number(p.status) === expectedStatus, `product ${productId} status mismatch`);
  assertCondition(
    p.currentCustodian.toLowerCase() === expectedCustodian.toLowerCase(),
    `product ${productId} custodian mismatch`
  );

  const history = await contract.getProvenanceHistory(productId);
  const actions = history.map((r) => r.action);
  assertCondition(actions.length === expectedActions.length, `product ${productId} history length mismatch`);

  for (let i = 0; i < actions.length; i += 1) {
    assertCondition(actions[i] === expectedActions[i], `product ${productId} action mismatch at index ${i}`);
  }
}

async function main() {
  const [owner, producerA, producerB, distributorA, distributorB, retailer, regulator, outsider] =
    await hre.ethers.getSigners();

  console.log("Participants:");
  console.log(`  owner:        ${owner.address}`);
  console.log(`  producerA:    ${producerA.address}`);
  console.log(`  producerB:    ${producerB.address}`);
  console.log(`  distributorA: ${distributorA.address}`);
  console.log(`  distributorB: ${distributorB.address}`);
  console.log(`  retailer:     ${retailer.address}`);
  console.log(`  regulator:    ${regulator.address}`);
  console.log(`  outsider:     ${outsider.address}`);

  const Factory = await hre.ethers.getContractFactory("SupplyChainProvenance");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  console.log(`\nContract deployed at: ${await contract.getAddress()}`);

  // Role bootstrap.
  await runTx("assign producerA", contract.assignRole(producerA.address, ROLE.Producer), contract);
  await runTx("assign producerB", contract.assignRole(producerB.address, ROLE.Producer), contract);
  await runTx("assign distributorA", contract.assignRole(distributorA.address, ROLE.Distributor), contract);
  await runTx("assign distributorB", contract.assignRole(distributorB.address, ROLE.Distributor), contract);
  await runTx("assign retailer", contract.assignRole(retailer.address, ROLE.Retailer), contract);
  await runTx("assign regulator", contract.assignRole(regulator.address, ROLE.Regulator), contract);

  console.log("\nRoles after assignment:");
  for (const s of [producerA, producerB, distributorA, distributorB, retailer, regulator, outsider]) {
    const role = await contract.getRole(s.address);
    console.log(`  ${short(s.address)} -> ${roleName(role)} (${Number(role)})`);
  }

  const P1 = 3001;
  const P2 = 3002;

  // Intentional failures first.
  console.log("\nNegative-path checks:");
  await expectRevert(
    "outsider cannot register",
    () => contract.connect(outsider).registerProduct(9999, "ipfs://unauthorized"),
    "Only producer"
  );

  await runTx(
    "producerA registers P1",
    contract.connect(producerA).registerProduct(P1, "ipfs://batch-A/lot-9001"),
    contract
  );

  await runTx(
    "producerB registers P2",
    contract.connect(producerB).registerProduct(P2, "ipfs://batch-B/lot-42"),
    contract
  );

  await expectRevert(
    "cannot skip Created->Delivered",
    () => contract.connect(producerA).updateStatus(P1, STATUS.Delivered, "invalid jump"),
    "Invalid transition"
  );

  await expectRevert(
    "producerB cannot modify P1 status",
    () => contract.connect(producerB).updateStatus(P1, STATUS.Shipped, "cross-product tampering"),
    "Only current custodian"
  );

  await expectRevert(
    "outsider cannot verify",
    () => contract.connect(outsider).verifyProduct(P1, "fake verify"),
    "Only regulator"
  );

  // Product 1 lifecycle (through distributorA).
  await runTx(
    "P1 custody producerA->distributorA",
    contract
      .connect(producerA)
      .transferCustody(P1, distributorA.address, "handoff: refrigerated truck"),
    contract
  );

  await expectRevert(
    "producerB cannot transfer P1 custody",
    () =>
      contract
        .connect(producerB)
        .transferCustody(P1, distributorB.address, "unauthorized reroute attempt"),
    "Only current custodian"
  );

  await runTx(
    "P1 status Shipped",
    contract.connect(distributorA).updateStatus(P1, STATUS.Shipped, "left factory gate"),
    contract
  );

  await runTx(
    "P1 status Stored",
    contract.connect(distributorA).updateStatus(P1, STATUS.Stored, "stored at DC-A"),
    contract
  );

  await runTx(
    "P1 custody distributorA->retailer",
    contract.connect(distributorA).transferCustody(P1, retailer.address, "final-mile partner"),
    contract
  );

  await runTx(
    "P1 status Delivered",
    contract.connect(retailer).updateStatus(P1, STATUS.Delivered, "arrived at store #17"),
    contract
  );

  await runTx(
    "P1 regulator verifies",
    contract.connect(regulator).verifyProduct(P1, "temperature logs validated"),
    contract
  );

  // Product 2 lifecycle (through distributorB).
  await runTx(
    "P2 custody producerB->distributorB",
    contract.connect(producerB).transferCustody(P2, distributorB.address, "pickup at origin"),
    contract
  );

  await expectRevert(
    "distributorA cannot move P2",
    () => contract.connect(distributorA).transferCustody(P2, retailer.address, "wrong truck pickup"),
    "Only current custodian"
  );

  await expectRevert(
    "distributorA cannot update P2 status",
    () => contract.connect(distributorA).updateStatus(P2, STATUS.Shipped, "wrong actor update"),
    "Only current custodian"
  );

  await runTx(
    "P2 status Shipped",
    contract.connect(distributorB).updateStatus(P2, STATUS.Shipped, "in transit via rail"),
    contract
  );

  await runTx(
    "P2 status Stored",
    contract.connect(distributorB).updateStatus(P2, STATUS.Stored, "stored at hub B"),
    contract
  );

  await runTx(
    "P2 custody distributorB->retailer",
    contract.connect(distributorB).transferCustody(P2, retailer.address, "cross-dock transfer"),
    contract
  );

  await runTx(
    "P2 status Delivered",
    contract.connect(retailer).updateStatus(P2, STATUS.Delivered, "received at store #3"),
    contract
  );

  await runTx(
    "P2 regulator verifies",
    contract.connect(regulator).verifyProduct(P2, "audit docs complete"),
    contract
  );

  await printProductSnapshot(contract, P1, "final state");
  await printProductSnapshot(contract, P2, "final state");

  await printHistory(contract, P1);
  await printHistory(contract, P2);

  const expectedActions = [
    "REGISTER",
    "TRANSFER_CUSTODY",
    "UPDATE_STATUS",
    "UPDATE_STATUS",
    "TRANSFER_CUSTODY",
    "UPDATE_STATUS",
    "VERIFY_PRODUCT",
  ];

  await verifyLifecycle(contract, P1, STATUS.Verified, retailer.address, expectedActions);
  await verifyLifecycle(contract, P2, STATUS.Verified, retailer.address, expectedActions);

  const p1History = await contract.getProvenanceHistory(P1);
  const p2History = await contract.getProvenanceHistory(P2);
  const actorNameByAddress = {
    [producerA.address.toLowerCase()]: "producerA",
    [producerB.address.toLowerCase()]: "producerB",
    [distributorA.address.toLowerCase()]: "distributorA",
    [distributorB.address.toLowerCase()]: "distributorB",
    [retailer.address.toLowerCase()]: "retailer",
    [regulator.address.toLowerCase()]: "regulator",
  };

  const mermaid = buildMermaidDiagram(
    {
      [P1]: p1History,
      [P2]: p2History,
    },
    actorNameByAddress
  );

  const visualizationPath = path.join(__dirname, "demo2-visualization.md");
  fs.writeFileSync(
    visualizationPath,
    [
      "# Demo 2 Visualization",
      "",
      "Generated from on-chain provenance history in `scripts/demo2.js`.",
      "",
      mermaid,
      "",
    ].join("\n"),
    "utf8"
  );

  console.log("\nIntegrity checks passed: both product histories and final states match expectations.");
  console.log(`Visualization written to: ${visualizationPath}`);
  console.log("Demo 2 complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
