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

function participantDefinitions(env) {
  return [
    { key: "owner", name: "System Admin", address: env.owner.address },
    { key: "producer", name: "Sunrise Farms", address: env.producer.address },
    { key: "distributor", name: "BlueLine Logistics", address: env.distributor.address },
    { key: "retailer", name: "Metro Market", address: env.retailer.address },
    { key: "regulator", name: "Food Safety Office", address: env.regulator.address },
    { key: "viewer", name: "Public Viewer", address: env.viewer.address },
  ];
}

function participantDefinitionForAddress(env, address) {
  const normalized = normalizeAddress(address);
  return (
    participantDefinitions(env).find(
      (participant) => normalizeAddress(participant.address) === normalized
    ) ?? null
  );
}

async function participantDisplayName(env, participant) {
  const onChainRole = await env.contract.getRole(participant.address);
  const roleLabel = participant.key === "owner" ? "Owner/Admin" : roleName(onChainRole);
  return `${participant.name} (${roleLabel})`;
}

function participantLabelForAddress(env, address) {
  const participant = participantDefinitionForAddress(env, address);
  return participant;
}

async function formatActor(env, address) {
  const participant = participantDefinitionForAddress(env, address);
  if (participant) return `${await participantDisplayName(env, participant)} [${short(address)}]`;

  const role = await env.contract.getRole(address);
  const roleLabel = roleName(role);
  return `${roleLabel} [${short(address)}]`;
}

function bold(text) {
  return `\x1b[1m${text}\x1b[0m`;
}

function printSectionTitle(title) {
  console.log(`\n${bold(title)}`);
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
    const answer = raw.trim().toLowerCase();
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
  const deploymentTx = contract.deploymentTransaction();
  const receipt = deploymentTx ? await deploymentTx.wait() : null;

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
    deploymentBlock: receipt ? receipt.blockNumber : 0,
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
  printSectionTitle("Participants");
  for (const participant of participantDefinitions(env)) {
    const assignedRole = await env.contract.getRole(participant.address);
    const displayName = await participantDisplayName(env, participant);
    console.log(
      `  ${displayName} ${participant.address} role=${roleName(assignedRole)}`
    );
  }
}

async function showWhoAmI(env) {
  const onChainRole = await env.contract.getRole(env.currentSigner.address);
  const participant = participantDefinitionForAddress(env, env.currentSigner.address);
  printSectionTitle("Current Session");
  console.log(`  participant: ${participant ? await participantDisplayName(env, participant) : env.currentLabel}`);
  console.log(`  address: ${env.currentSigner.address}`);
  console.log(`  on-chain role: ${roleName(onChainRole)}`);
  console.log(`  is owner: ${normalizeAddress(env.currentSigner.address) === normalizeAddress(env.owner.address)}`);
  console.log(`  contract: ${await env.contract.getAddress()}`);
}

async function showProduct(env, productId) {
  const contract = env.contract;
  const product = await contract.getProduct(productId);

  printSectionTitle(`Product ${productId.toString()}`);
  if (!product.exists) {
    console.log("  not found");
    return;
  }

  console.log(`  metadataHash: ${product.metadataHash}`);
  console.log(`  currentCustodian: ${await formatActor(env, product.currentCustodian)}`);
  console.log(`  status: ${statusName(product.status)} (${Number(product.status)})`);
  console.log(`  exists: ${product.exists}`);
}

async function showHistory(env, productId) {
  const contract = env.contract;
  const history = await contract.getProvenanceHistory(productId);

  printSectionTitle(`History For Product ${productId.toString()}`);
  console.log(`  records: ${history.length}`);
  if (history.length === 0) {
    return;
  }

  history.forEach((record, index) => {
    const ts = new Date(Number(record.timestamp) * 1000).toISOString();
    console.log(
      `  #${index + 1} ${ts} actor=${
        participantLabelForAddress(env, record.actor)
          ? participantLabelForAddress(env, record.actor).name
          : short(record.actor)
      } action=${record.action} details=${record.details}`
    );
  });
}

async function getRegisteredProductIds(env) {
  const events = await env.contract.queryFilter(
    env.contract.filters.ProductRegistered(),
    env.deploymentBlock
  );

  const ids = [];
  const seen = new Set();

  for (const event of events) {
    const productId = event.args?.productId;
    if (productId === undefined) continue;

    const key = productId.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(productId);
  }

  ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return ids;
}

async function getAllProducts(env) {
  const productIds = await getRegisteredProductIds(env);
  const products = [];

  for (const productId of productIds) {
    const product = await env.contract.getProduct(productId);
    if (product.exists) {
      products.push(product);
    }
  }

  return products;
}

async function printProductList(env, title, products) {
  printSectionTitle(title);
  console.log(`  count: ${products.length}`);
  if (products.length === 0) {
    return;
  }

  for (const product of products) {
    console.log(
      `  id=${product.productId.toString()} status=${statusName(product.status)} custodian=${await formatActor(
        env,
        product.currentCustodian
      )} metadata=${product.metadataHash}`
    );
  }
}

async function runAsCurrent(env, action) {
  try {
    return await action(env.contract.connect(env.currentSigner));
  } catch (error) {
    printSectionTitle("Transaction Failed");
    console.log(`  ${parseError(error)}`);
    return null;
  }
}

function printGasUsed(receipt) {
  if (!receipt?.gasUsed) return;
  console.log(`  gasUsed: ${receipt.gasUsed.toString()}`);
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
    printSectionTitle("Role Assignment");
    console.log("  default roles assigned");
  } catch (error) {
    printSectionTitle("Role Assignment Failed");
    console.log(`  ${parseError(error)}`);
  }
}

async function handleSwitchSigner(env, rl) {
  const selected = await askParticipant(env, rl, "Available signers:");
  if (!selected) return false;

  const [label, signer] = selected;
  env.currentLabel = label;
  env.currentSigner = signer;
  const participant = participantDefinitionForAddress(env, signer.address);
  printSectionTitle("Active Signer Updated");
  console.log(`  ${participant ? await participantDisplayName(env, participant) : label} (${signer.address})`);
  return true;
}

async function handleRegisterProduct(env, rl) {
  const productId = await askNumber(rl, "Product ID: ");
  if (productId === null) return false;
  const metadataHash = await askNonEmpty(rl, "Metadata hash / IPFS URI: ");
  if (metadataHash === null) return false;

  await runAsCurrent(env, async (contract) => {
    const tx = await contract.registerProduct(productId, metadataHash);
    const receipt = await tx.wait();
    printSectionTitle("Product Registered");
    console.log(`  productId: ${productId.toString()}`);
    printGasUsed(receipt);
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
    const receipt = await tx.wait();
    printSectionTitle("Custody Transferred");
    console.log(`  productId: ${productId.toString()}`);
    console.log(`  newCustodian: ${recipient.address}`);
    printGasUsed(receipt);
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
    const receipt = await tx.wait();
    printSectionTitle("Status Updated");
    console.log(`  productId: ${productId.toString()}`);
    console.log(`  status: ${statusName(nextStatus)}`);
    printGasUsed(receipt);
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
    const receipt = await tx.wait();
    printSectionTitle("Product Verified");
    console.log(`  productId: ${productId.toString()}`);
    printGasUsed(receipt);
  });
  return true;
}

async function handleViewProduct(env, rl) {
  const productId = await askNumber(rl, "Product ID: ");
  if (productId === null) return false;
  await showProduct(env, productId);
  return true;
}

async function handleViewHistory(env, rl) {
  const productId = await askNumber(rl, "Product ID: ");
  if (productId === null) return false;
  await showHistory(env, productId);
  return true;
}

async function handleViewAllProducts(env) {
  try {
    const products = await getAllProducts(env);
    await printProductList(env, "All registered products", products);
  } catch (error) {
    printSectionTitle("Unable To Load Products");
    console.log(`  ${parseError(error)}`);
  }
}

async function handleViewMyProducts(env) {
  try {
    const allProducts = await getAllProducts(env);
    const myProducts = allProducts.filter(
      (product) =>
        normalizeAddress(product.currentCustodian) === normalizeAddress(env.currentSigner.address)
    );
    const participant = participantDefinitionForAddress(env, env.currentSigner.address);
    await printProductList(
      env,
      `Products currently held by ${
        participant ? await participantDisplayName(env, participant) : env.currentLabel
      }`,
      myProducts
    );
  } catch (error) {
    printSectionTitle("Unable To Load Your Products");
    console.log(`  ${parseError(error)}`);
  }
}

function matchesPendingAction(role, product, currentAddress) {
  const sameCustodian =
    normalizeAddress(product.currentCustodian) === normalizeAddress(currentAddress);
  const status = Number(product.status);

  if (role === ROLE.Producer) {
    return sameCustodian && status === STATUS.Created;
  }

  if (role === ROLE.Distributor) {
    return sameCustodian && (status === STATUS.Created || status === STATUS.Shipped);
  }

  if (role === ROLE.Retailer) {
    return sameCustodian && status === STATUS.Stored;
  }

  if (role === ROLE.Regulator) {
    return status === STATUS.Delivered;
  }

  return false;
}

function pendingActionDescription(role) {
  if (role === ROLE.Producer) return "Products you registered and still need to hand off";
  if (role === ROLE.Distributor) return "Products in transit or storage that still need processing";
  if (role === ROLE.Retailer) return "Products waiting for final delivery confirmation";
  if (role === ROLE.Regulator) return "Delivered products waiting for verification";
  return "No role-specific pending actions for the current signer";
}

async function handleViewPendingActions(env) {
  try {
    const role = Number(await env.contract.getRole(env.currentSigner.address));
    const allProducts = await getAllProducts(env);
    const pendingProducts = allProducts.filter((product) =>
      matchesPendingAction(role, product, env.currentSigner.address)
    );
    const participant = participantDefinitionForAddress(env, env.currentSigner.address);

    printSectionTitle(
      `Pending Actions For ${
        participant ? await participantDisplayName(env, participant) : env.currentLabel
      }`
    );
    console.log(`  role: ${roleName(role)}`);
    console.log(`  summary: ${pendingActionDescription(role)}`);
    console.log(`  count: ${pendingProducts.length}`);

    for (const product of pendingProducts) {
      console.log(
        `  id=${product.productId.toString()} status=${statusName(product.status)} custodian=${await formatActor(
          env,
          product.currentCustodian
        )} metadata=${product.metadataHash}`
      );
    }
  } catch (error) {
    printSectionTitle("Unable To Load Pending Actions");
    console.log(`  ${parseError(error)}`);
  }
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

    printSectionTitle("Full Demo Completed");
    console.log("  productId: 9001");
    await showProduct(env, productId);
    await showHistory(env, productId);
  } catch (error) {
    printSectionTitle("Demo Failed");
    console.log(`  ${parseError(error)}`);
  }
}

async function handleReset(env) {
  const fresh = await deployEnvironment();
  Object.assign(env, fresh);
  printSectionTitle("Environment Reset");
  console.log("  deployed a new contract and reset active signer to owner");
}

function printMenu() {
  printSectionTitle("Menu");
  console.log("  1. Show participants and roles      alias: show, sh");
  console.log("  2. Assign default roles             alias: assign, as");
  console.log("  3. Switch active signer             alias: switch, sw");
  console.log("  4. Register product                 alias: register, reg");
  console.log("  5. Transfer custody                 alias: transfer, tr");
  console.log("  6. Update status                    alias: update, upd");
  console.log("  7. Verify product                   alias: verify, ver");
  console.log("  8. View product                     alias: product, prd");
  console.log("  9. View provenance history          alias: history, his");
  console.log("  10. View all products               alias: all, a");
  console.log("  11. View my products                alias: mine, m");
  console.log("  12. View pending actions            alias: pending, pen");
  console.log("  13. Run full demo lifecycle         alias: demo, d");
  console.log("  14. Reset environment               alias: reset, rs");
  console.log("  0. Exit                             alias: exit, q");
}

async function main() {
  const rl = readline.createInterface({ input, output });
  const env = await deployEnvironment();

  console.log("A fresh in-memory Hardhat network session is ready.");
  console.log("Use option 2 to assign roles, or option 13 to run the entire workflow.");

  try {
    await printHeader(env);
    while (true) {
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
        "12",
        "13",
        "14",
        "show",
        "sh",
        "assign",
        "as",
        "switch",
        "sw",
        "register",
        "reg",
        "transfer",
        "tr",
        "update",
        "upd",
        "verify",
        "ver",
        "product",
        "prd",
        "history",
        "his",
        "all",
        "a",
        "mine",
        "m",
        "pending",
        "pen",
        "demo",
        "d",
        "reset",
        "rs",
        "exit",
        "q",
        "whoami",
      ]);
      await printHeader(env);

      if (choice === null) {
        console.log("\nInput stream closed. Exiting CLI.");
        break;
      }

      if (choice === "0" || choice === "exit" || choice === "q") {
        console.log("\nExiting CLI.");
        break;
      }

      if (choice === "1" || choice === "show" || choice === "sh") await showParticipants(env);
      if (choice === "2" || choice === "assign" || choice === "as") await handleAssignDefaultRoles(env);
      if (choice === "3" || choice === "switch" || choice === "sw") await handleSwitchSigner(env, rl);
      if (choice === "4" || choice === "register" || choice === "reg") await handleRegisterProduct(env, rl);
      if (choice === "5" || choice === "transfer" || choice === "tr") await handleTransferCustody(env, rl);
      if (choice === "6" || choice === "update" || choice === "upd") await handleUpdateStatus(env, rl);
      if (choice === "7" || choice === "verify" || choice === "ver") await handleVerifyProduct(env, rl);
      if (choice === "8" || choice === "product" || choice === "prd") await handleViewProduct(env, rl);
      if (choice === "9" || choice === "history" || choice === "his") await handleViewHistory(env, rl);
      if (choice === "10" || choice === "all" || choice === "a") await handleViewAllProducts(env);
      if (choice === "11" || choice === "mine" || choice === "m") await handleViewMyProducts(env);
      if (choice === "12" || choice === "pending" || choice === "pen") await handleViewPendingActions(env);
      if (choice === "13" || choice === "demo" || choice === "d") await handleRunFullDemo(env);
      if (choice === "14" || choice === "reset" || choice === "rs") await handleReset(env);
      if (choice === "whoami") await showWhoAmI(env);
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
