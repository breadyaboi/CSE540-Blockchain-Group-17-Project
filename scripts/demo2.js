// scripts/demo_complex.js
const hre = require("hardhat");

const ROLE = {
  None: 0,
  Producer: 1,
  Distributor: 2,
  Retailer: 3,
  Regulator: 4,
};

const STATUS = {
  Created: 1,
  Shipped: 2,
  Stored: 3,
  Delivered: 4,
  Verified: 5,
};

async function tryAction(label, fn) {
  try {
    await fn();
    console.log(`SUCCESS: ${label}`);
  } catch (err) {
    console.log(`REJECTED: ${label}`);
  }
}

async function main() {
  const [
    owner,
    producer1,
    producer2,
    distributor,
    retailer,
    regulator,
    attacker
  ] = await hre.ethers.getSigners();

  const Factory = await hre.ethers.getContractFactory("SupplyChainProvenance");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  console.log("\n=== Contract Deployed ===");

  // Assign roles
  await contract.assignRole(producer1.address, ROLE.Producer);
  await contract.assignRole(producer2.address, ROLE.Producer);
  await contract.assignRole(distributor.address, ROLE.Distributor);
  await contract.assignRole(retailer.address, ROLE.Retailer);
  await contract.assignRole(regulator.address, ROLE.Regulator);

  console.log("\n=== Roles Assigned ===");

  const A = 1001;
  const B = 2002;

  // -----------------------
  // Product A (Producer1)
  // -----------------------
  console.log("\n=== Product A Flow ===");

  await contract.connect(producer1).registerProduct(A, "ipfs://A");
  console.log("Product A registered by Producer1");

  // Illegal: attacker tries to update
  await tryAction("Attacker updates status", async () => {
    await contract.connect(attacker).updateStatus(A, STATUS.Shipped, "hack");
  });

  await contract.connect(producer1).transferCustody(A, distributor.address, "to distributor");

  await contract.connect(distributor).updateStatus(A, STATUS.Shipped, "shipped");
  await contract.connect(distributor).updateStatus(A, STATUS.Stored, "stored");

  // -----------------------
  // Product B (Producer2)
  // -----------------------
  console.log("\n=== Product B Flow ===");

  await contract.connect(producer2).registerProduct(B, "ipfs://B");
  console.log("Product B registered by Producer2");

  // Illegal: distributor tries to register (should fail)
  await tryAction("Distributor registers product", async () => {
    await contract.connect(distributor).registerProduct(3003, "invalid");
  });

  await contract.connect(producer2).transferCustody(B, distributor.address, "to distributor");

  await contract.connect(distributor).updateStatus(B, STATUS.Shipped, "shipped");

  // -----------------------
  // Continue Product A
  // -----------------------
  console.log("\n=== Continue Product A ===");

  await contract.connect(distributor).transferCustody(A, retailer.address, "to retailer");
  await contract.connect(retailer).updateStatus(A, STATUS.Delivered, "delivered");

  // Illegal: wrong role tries to verify
  await tryAction("Retailer verifies product", async () => {
    await contract.connect(retailer).verifyProduct(A, "fake verify");
  });

  await contract.connect(regulator).verifyProduct(A, "verified");

  // -----------------------
  // Continue Product B
  // -----------------------
  console.log("\n=== Continue Product B ===");

  await contract.connect(distributor).updateStatus(B, STATUS.Stored, "stored");
  await contract.connect(distributor).transferCustody(B, retailer.address, "to retailer");
  await contract.connect(retailer).updateStatus(B, STATUS.Delivered, "delivered");
  await contract.connect(regulator).verifyProduct(B, "verified");

  // -----------------------
  // Final State
  // -----------------------
  console.log("\n=== Final States ===");

  const pA = await contract.getProduct(A);
  const pB = await contract.getProduct(B);

  console.log("Product A status:", pA.status.toString());
  console.log("Product B status:", pB.status.toString());

  const hA = await contract.getProvenanceHistory(A);
  const hB = await contract.getProvenanceHistory(B);

  console.log("Product A history length:", hA.length);
  console.log("Product B history length:", hB.length);

  console.log("\n=== Demo Complete ===");
}

main().catch(console.error);
