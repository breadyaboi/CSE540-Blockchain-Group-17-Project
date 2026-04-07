// scripts/demo.js
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

function formatTs(ts) {
  const n = Number(ts);
  return new Date(n * 1000).toISOString();
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
      [
        `#${i + 1}`,
        `time=${formatTs(r.timestamp)}`,
        `actor=${r.actor}`,
        `action=${r.action}`,
        `details=${r.details}`,
      ].join(" | ")
    );
  });
}

async function main() {
  const [owner, producer, distributor, retailer, regulator] = await hre.ethers.getSigners();

  console.log("Deployer / owner:", owner.address);
  console.log("Producer:         ", producer.address);
  console.log("Distributor:      ", distributor.address);
  console.log("Retailer:         ", retailer.address);
  console.log("Regulator:        ", regulator.address);

  const Factory = await hre.ethers.getContractFactory("SupplyChainProvenance");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("\nContract deployed to:", contractAddress);

  const productId = 1001;
  const metadataHash = "ipfs://QmExampleHash123";

  console.log("\n--- Step 1: Assign roles ---");
  await (await contract.assignRole(producer.address, ROLE.Producer)).wait();
  await (await contract.assignRole(distributor.address, ROLE.Distributor)).wait();
  await (await contract.assignRole(retailer.address, ROLE.Retailer)).wait();
  await (await contract.assignRole(regulator.address, ROLE.Regulator)).wait();

  console.log("Producer role:   ", roleName(await contract.getRole(producer.address)));
  console.log("Distributor role:", roleName(await contract.getRole(distributor.address)));
  console.log("Retailer role:   ", roleName(await contract.getRole(retailer.address)));
  console.log("Regulator role:  ", roleName(await contract.getRole(regulator.address)));

  console.log("\n--- Step 2: Register product ---");
  await (await contract.connect(producer).registerProduct(productId, metadataHash)).wait();
  await printProduct(contract, productId, "After registration");
  await printHistory(contract, productId);

  console.log("\n--- Step 3: Transfer custody to distributor ---");
  await (
    await contract
      .connect(producer)
      .transferCustody(productId, distributor.address, "Transferred from producer to distributor")
  ).wait();
  await printProduct(contract, productId, "After custody transfer to distributor");
  await printHistory(contract, productId);

  console.log("\n--- Step 4: Update status to Shipped ---");
  await (
    await contract
      .connect(distributor)
      .updateStatus(productId, STATUS.Shipped, "Product shipped from origin")
  ).wait();
  await printProduct(contract, productId, "After status update: Shipped");

  console.log("\n--- Step 5: Update status to Stored ---");
  await (
    await contract
      .connect(distributor)
      .updateStatus(productId, STATUS.Stored, "Product stored in warehouse")
  ).wait();
  await printProduct(contract, productId, "After status update: Stored");
  await printHistory(contract, productId);

  console.log("\n--- Step 6: Transfer custody to retailer ---");
  await (
    await contract
      .connect(distributor)
      .transferCustody(productId, retailer.address, "Transferred from distributor to retailer")
  ).wait();
  await printProduct(contract, productId, "After custody transfer to retailer");

  console.log("\n--- Step 7: Update status to Delivered ---");
  await (
    await contract
      .connect(retailer)
      .updateStatus(productId, STATUS.Delivered, "Delivered to final destination")
  ).wait();
  await printProduct(contract, productId, "After status update: Delivered");

  console.log("\n--- Step 8: Regulator verifies product ---");
  await (
    await contract
      .connect(regulator)
      .verifyProduct(productId, "Compliance check passed")
  ).wait();
  await printProduct(contract, productId, "After verification");
  await printHistory(contract, productId);

  console.log("\nDemo complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
