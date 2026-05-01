const hre = require("hardhat");

const ROLE = {
  None: 0,
  Producer: 1,
  Logistics: 2,
  Warehouse: 3,
  Retailer: 4,
  Regulator: 5,
};

const STATUS = {
  None: 0,
  Created: 1,
  Packed: 2,
  InTransit: 3,
  Stored: 4,
  OutForDelivery: 5,
  Delivered: 6,
  Verified: 7,
};

const ROLE_NAMES = ["None", "Producer", "Logistics", "Warehouse", "Retailer", "Regulator"];
const STATUS_NAMES = ["None", "Created", "Packed", "InTransit", "Stored", "OutForDelivery", "Delivered", "Verified"];

function roleName(value) {
  return ROLE_NAMES[Number(value)] ?? `Unknown(${value})`;
}

function statusName(value) {
  return STATUS_NAMES[Number(value)] ?? `Unknown(${value})`;
}

function formatTs(ts) {
  return new Date(Number(ts) * 1000).toISOString();
}

async function printProduct(contract, productId, title) {
  const p = await contract.getProduct(productId);
  console.log(`\n=== ${title} ===`);
  console.log(`productId:       ${p.productId.toString()}`);
  console.log(`metadataHash:    ${p.metadataHash}`);
  console.log(`custodian:       ${p.currentCustodian}`);
  console.log(`status:          ${statusName(p.status)} (${Number(p.status)})`);
  console.log(`exists:          ${p.exists}`);
}

async function printHistory(contract, productId) {
  const history = await contract.getProvenanceHistory(productId);
  console.log(`\n=== Provenance History for product ${productId} ===`);
  console.log(`total records: ${history.length}`);
  history.forEach((r, i) => {
    console.log(
      [`#${i + 1}`, `time=${formatTs(r.timestamp)}`, `actor=${r.actor}`, `action=${r.action}`, `details=${r.details}`].join(" | ")
    );
  });
}

async function main() {
  const [owner, producer, logistics, warehouse, retailer, regulator] = await hre.ethers.getSigners();

  console.log("Deployer / owner:", owner.address);
  console.log("Producer:         ", producer.address);
  console.log("Logistics:        ", logistics.address);
  console.log("Warehouse:        ", warehouse.address);
  console.log("Retailer:         ", retailer.address);
  console.log("Regulator:        ", regulator.address);

  const Factory = await hre.ethers.getContractFactory("SupplyChainProvenance");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();
  console.log("\nContract deployed to:", await contract.getAddress());

  const productId = 1001;
  const metadataHash = "ipfs://QmExampleHash123";

  console.log("\n--- Step 1: Assign roles ---");
  await (await contract.assignRole(producer.address, ROLE.Producer)).wait();
  await (await contract.assignRole(logistics.address, ROLE.Logistics)).wait();
  await (await contract.assignRole(warehouse.address, ROLE.Warehouse)).wait();
  await (await contract.assignRole(retailer.address, ROLE.Retailer)).wait();
  await (await contract.assignRole(regulator.address, ROLE.Regulator)).wait();

  console.log("Producer role:   ", roleName(await contract.getRole(producer.address)));
  console.log("Logistics role:  ", roleName(await contract.getRole(logistics.address)));
  console.log("Warehouse role:  ", roleName(await contract.getRole(warehouse.address)));
  console.log("Retailer role:   ", roleName(await contract.getRole(retailer.address)));
  console.log("Regulator role:  ", roleName(await contract.getRole(regulator.address)));

  console.log("\n--- Step 2: Register product ---");
  await (await contract.connect(producer).registerProduct(productId, metadataHash)).wait();
  await printProduct(contract, productId, "After registration");

  console.log("\n--- Step 3: Pack product ---");
  await (await contract.connect(producer).updateStatus(productId, STATUS.Packed, "Packed at origin")).wait();
  await printProduct(contract, productId, "After packing");

  console.log("\n--- Step 4: Transfer to logistics ---");
  await (await contract.connect(producer).transferCustody(productId, logistics.address, "Handoff to logistics")).wait();
  await printProduct(contract, productId, "After transfer to logistics");

  console.log("\n--- Step 5: Mark in transit ---");
  await (await contract.connect(logistics).updateStatus(productId, STATUS.InTransit, "Departed origin")).wait();

  console.log("\n--- Step 6: Transfer to warehouse ---");
  await (await contract.connect(logistics).transferCustody(productId, warehouse.address, "Arrived at warehouse")).wait();

  console.log("\n--- Step 7: Store product ---");
  await (await contract.connect(warehouse).updateStatus(productId, STATUS.Stored, "Stored in cold room")).wait();

  console.log("\n--- Step 8: Return to logistics for last-mile delivery ---");
  await (await contract.connect(warehouse).transferCustody(productId, logistics.address, "Released for last mile")).wait();

  console.log("\n--- Step 9: Mark out for delivery ---");
  await (await contract.connect(logistics).updateStatus(productId, STATUS.OutForDelivery, "Final route started")).wait();

  console.log("\n--- Step 10: Transfer to retailer ---");
  await (await contract.connect(logistics).transferCustody(productId, retailer.address, "Delivered to retailer")).wait();

  console.log("\n--- Step 11: Mark delivered ---");
  await (await contract.connect(retailer).updateStatus(productId, STATUS.Delivered, "Received by retailer")).wait();

  console.log("\n--- Step 12: Regulator verifies product ---");
  await (await contract.connect(regulator).verifyProduct(productId, "Compliance check passed")).wait();
  await printProduct(contract, productId, "After verification");
  await printHistory(contract, productId);

  console.log("\nDemo complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
