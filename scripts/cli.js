const readline = require("readline/promises");
const { stdin: input, stdout: output } = require("process");
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

function short(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function parseError(error) {
  if (error?.shortMessage) return error.shortMessage;
  if (error?.reason) return error.reason;
  if (error?.message) return error.message;
  return String(error);
}

function normalizeAddress(value) {
  return value.trim().toLowerCase();
}

async function safeQuestion(rl, prompt) {
  try {
    return await rl.question(prompt);
  } catch (error) {
    if (error?.code === "ERR_USE_AFTER_CLOSE") {
      return null;
    }
    throw error;
  }
}

async function askNonEmpty(rl, prompt) {
  while (true) {
    const answer = await safeQuestion(rl, prompt);
    if (answer === null) return null;
    const value = answer.trim();
    if (value) return value;
    console.log("Input cannot be empty.");
  }
}

async function askNumber(rl, prompt) {
  while (true) {
    const answer = await safeQuestion(rl, prompt);
    if (answer === null) return null;
    const raw = answer.trim();
    if (!raw) {
      console.log("Input cannot be empty.");
      continue;
    }

    if (!/^\d+$/.test(raw)) {
      console.log("Enter a positive integer.");
      continue;
    }

    return BigInt(raw);
  }
}

async function askMenuChoice(rl, validChoices) {
  while (true) {
    const raw = await safeQuestion(rl, "\nSelect an option: ");
    if (raw === null) return null;
    const answer = raw.trim();
    if (validChoices.includes(answer)) return answer;
    console.log(`Invalid choice. Valid options: ${validChoices.join(", ")}`);
  }
}

async function askStatus(rl) {
  const options = [
    ["1", STATUS.Created, "Created"],
    ["2", STATUS.Shipped, "Shipped"],
    ["3", STATUS.Stored, "Stored"],
    ["4", STATUS.Delivered, "Delivered"],
    ["5", STATUS.Verified, "Verified"],
  ];

  console.log("\nAvailable statuses:");
  for (const [key, , label] of options) {
    console.log(`  ${key}. ${label}`);
  }

  while (true) {
    const raw = await safeQuestion(rl, "Choose status number: ");
    if (raw === null) return null;
    const choice = raw.trim();
    const match = options.find(([key]) => key === choice);
    if (match) return match[1];
    console.log("Invalid status choice.");
  }
}

async function askParticipant(env, rl, prompt, includeViewer = true) {
  const entries = [
    ["owner", env.owner],
    ["producer", env.producer],
    ["distributor", env.distributor],
    ["retailer", env.retailer],
    ["regulator", env.regulator],
  ];

  if (includeViewer) {
    entries.push(["viewer", env.viewer]);
  }

  console.log(`\n${prompt}`);
  entries.forEach(([label, signer], index) => {
    console.log(`  ${index + 1}. ${label} (${short(signer.address)})`);
  });

  while (true) {
    const raw = await safeQuestion(rl, "Choose participant number: ");
    if (raw === null) return null;
    const answer = raw.trim();
    const idx = Number(answer) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < entries.length) {
      return entries[idx];
    }
    console.log("Invalid participant choice.");
  }
}

async function deployEnvironment() {
  const [owner, producer, distributor, retailer, regulator, viewer] = await hre.ethers.getSigners();
  const factory = await hre.ethers.getContractFactory("SupplyChainProvenance");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  return {
    contract,
    owner,
    producer,
    distributor,
    retailer,
    regulator,
    viewer,
    currentLabel: "owner",
    currentSigner: owner,
  };
}

async function printHeader(env) {
  console.log("\n========================================");
  console.log("Supply Chain Provenance CLI");
  console.log(`Contract: ${await env.contract.getAddress()}`);
  console.log(
    `Active signer: ${env.currentLabel} (${short(env.currentSigner.address)}) role=${roleName(
      await env.contract.getRole(env.currentSigner.address)
    )}`
  );
  console.log("========================================");
}

async function showParticipants(env) {
  console.log("\nParticipants:");
  for (const [label, signer] of [
    ["owner", env.owner],
    ["producer", env.producer],
    ["distributor", env.distributor],
    ["retailer", env.retailer],
    ["regulator", env.regulator],
    ["viewer", env.viewer],
  ]) {
    const assignedRole = await env.contract.getRole(signer.address);
    console.log(
      `  ${label.padEnd(11)} ${signer.address} role=${roleName(assignedRole)}`
    );
  }
}

async function showProduct(contract, productId) {
  const product = await contract.getProduct(productId);

  if (!product.exists) {
    console.log(`\nProduct ${productId.toString()} not found.`);
    return;
  }

  console.log(`\nProduct ${productId.toString()}`);
  console.log(`  metadataHash: ${product.metadataHash}`);
  console.log(`  currentCustodian: ${product.currentCustodian}`);
  console.log(`  status: ${statusName(product.status)} (${Number(product.status)})`);
  console.log(`  exists: ${product.exists}`);
}

async function showHistory(contract, productId) {
  const history = await contract.getProvenanceHistory(productId);

  console.log(`\nHistory for product ${productId.toString()}: ${history.length} record(s)`);
  if (history.length === 0) {
    return;
  }

  history.forEach((record, index) => {
    const ts = new Date(Number(record.timestamp) * 1000).toISOString();
    console.log(
      `  #${index + 1} ${ts} actor=${short(record.actor)} action=${record.action} details=${record.details}`
    );
  });
}

async function runAsCurrent(env, action) {
  try {
    await action(env.contract.connect(env.currentSigner));
  } catch (error) {
    console.log(`\nTransaction failed: ${parseError(error)}`);
  }
}

async function assignDefaultRoles(env) {
  await env.contract.assignRole(env.producer.address, ROLE.Producer);
  await env.contract.assignRole(env.distributor.address, ROLE.Distributor);
  await env.contract.assignRole(env.retailer.address, ROLE.Retailer);
  await env.contract.assignRole(env.regulator.address, ROLE.Regulator);
}

async function handleAssignDefaultRoles(env) {
  try {
    await assignDefaultRoles(env);
    console.log("\nDefault roles assigned.");
  } catch (error) {
    console.log(`\nRole assignment failed: ${parseError(error)}`);
  }
}

async function handleSwitchSigner(env, rl) {
  const selected = await askParticipant(env, rl, "Available signers:");
  if (!selected) return false;

  const [label, signer] = selected;
  env.currentLabel = label;
  env.currentSigner = signer;
  console.log(`\nActive signer changed to ${label} (${signer.address}).`);
  return true;
}

async function handleRegisterProduct(env, rl) {
  const productId = await askNumber(rl, "Product ID: ");
  if (productId === null) return false;
  const metadataHash = await askNonEmpty(rl, "Metadata hash / IPFS URI: ");
  if (metadataHash === null) return false;

  await runAsCurrent(env, async (contract) => {
    const tx = await contract.registerProduct(productId, metadataHash);
    await tx.wait();
    console.log(`\nProduct ${productId.toString()} registered.`);
  });
  return true;
}

async function handleTransferCustody(env, rl) {
  const productId = await askNumber(rl, "Product ID: ");
  if (productId === null) return false;

  const selected = await askParticipant(env, rl, "Choose new custodian:", false);
  if (!selected) return false;

  const [, recipient] = selected;
  const details = await askNonEmpty(rl, "Transfer details: ");
  if (details === null) return false;

  await runAsCurrent(env, async (contract) => {
    const tx = await contract.transferCustody(productId, recipient.address, details);
    await tx.wait();
    console.log(`\nCustody for product ${productId.toString()} transferred to ${recipient.address}.`);
  });
  return true;
}

async function handleUpdateStatus(env, rl) {
  const productId = await askNumber(rl, "Product ID: ");
  if (productId === null) return false;
  const nextStatus = await askStatus(rl);
  if (nextStatus === null) return false;
  const details = await askNonEmpty(rl, "Status details: ");
  if (details === null) return false;

  await runAsCurrent(env, async (contract) => {
    const tx = await contract.updateStatus(productId, nextStatus, details);
    await tx.wait();
    console.log(`\nProduct ${productId.toString()} status updated to ${statusName(nextStatus)}.`);
  });
  return true;
}

async function handleVerifyProduct(env, rl) {
  const productId = await askNumber(rl, "Product ID: ");
  if (productId === null) return false;
  const details = await askNonEmpty(rl, "Verification details: ");
  if (details === null) return false;

  await runAsCurrent(env, async (contract) => {
    const tx = await contract.verifyProduct(productId, details);
    await tx.wait();
    console.log(`\nProduct ${productId.toString()} verified.`);
  });
  return true;
}

async function handleViewProduct(env, rl) {
  const productId = await askNumber(rl, "Product ID: ");
  if (productId === null) return false;
  await showProduct(env.contract, productId);
  return true;
}

async function handleViewHistory(env, rl) {
  const productId = await askNumber(rl, "Product ID: ");
  if (productId === null) return false;
  await showHistory(env.contract, productId);
  return true;
}

async function handleRunFullDemo(env) {
  const productId = 9001n;
  const metadataHash = "ipfs://demo/certificate-9001";

  try {
    await assignDefaultRoles(env);
  } catch (_) {
    // Ignore duplicate setup failures so the demo can be rerun after a reset.
  }

  try {
    let tx = await env.contract.connect(env.producer).registerProduct(productId, metadataHash);
    await tx.wait();

    tx = await env.contract
      .connect(env.producer)
      .transferCustody(productId, env.distributor.address, "handoff from producer to distributor");
    await tx.wait();

    tx = await env.contract.connect(env.distributor).updateStatus(productId, STATUS.Shipped, "departed origin");
    await tx.wait();

    tx = await env.contract.connect(env.distributor).updateStatus(productId, STATUS.Stored, "stored in warehouse");
    await tx.wait();

    tx = await env.contract
      .connect(env.distributor)
      .transferCustody(productId, env.retailer.address, "delivery handoff to retailer");
    await tx.wait();

    tx = await env.contract.connect(env.retailer).updateStatus(productId, STATUS.Delivered, "received by retailer");
    await tx.wait();

    tx = await env.contract.connect(env.regulator).verifyProduct(productId, "inspection passed");
    await tx.wait();

    console.log("\nFull multi-role demo completed for product 9001.");
    await showProduct(env.contract, productId);
    await showHistory(env.contract, productId);
  } catch (error) {
    console.log(`\nDemo failed: ${parseError(error)}`);
  }
}

async function handleReset(env) {
  const fresh = await deployEnvironment();
  Object.assign(env, fresh);
  console.log("\nEnvironment reset. A new contract was deployed and the active signer was reset to owner.");
}

function printMenu() {
  console.log("\nMenu");
  console.log("  1. Show participants and roles");
  console.log("  2. Assign default roles");
  console.log("  3. Switch active signer");
  console.log("  4. Register product");
  console.log("  5. Transfer custody");
  console.log("  6. Update status");
  console.log("  7. Verify product");
  console.log("  8. View product");
  console.log("  9. View provenance history");
  console.log("  10. Run full demo lifecycle");
  console.log("  11. Reset environment");
  console.log("  0. Exit");
}

async function main() {
  const rl = readline.createInterface({ input, output });
  const env = await deployEnvironment();

  console.log("A fresh in-memory Hardhat network session is ready.");
  console.log("Use option 2 to assign roles, or option 10 to run the entire workflow.");

  try {
    while (true) {
      await printHeader(env);
      printMenu();

      const choice = await askMenuChoice(rl, [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "11",
      ]);

      if (choice === null) {
        console.log("\nInput stream closed. Exiting CLI.");
        break;
      }

      if (choice === "0") {
        console.log("\nExiting CLI.");
        break;
      }

      if (choice === "1") await showParticipants(env);
      if (choice === "2") await handleAssignDefaultRoles(env);
      if (choice === "3") await handleSwitchSigner(env, rl);
      if (choice === "4") await handleRegisterProduct(env, rl);
      if (choice === "5") await handleTransferCustody(env, rl);
      if (choice === "6") await handleUpdateStatus(env, rl);
      if (choice === "7") await handleVerifyProduct(env, rl);
      if (choice === "8") await handleViewProduct(env, rl);
      if (choice === "9") await handleViewHistory(env, rl);
      if (choice === "10") await handleRunFullDemo(env);
      if (choice === "11") await handleReset(env);
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
