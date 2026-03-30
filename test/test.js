const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SupplyChainProvenance", function () {

    let contract;
    let owner, producer, distributor, retailer, regulator, stranger;

    const Role   = { None: 0, Producer: 1, Distributor: 2, Retailer: 3, Regulator: 4 };
    const Status = { None: 0, Created: 1, Shipped: 2, Stored: 3, Delivered: 4, Verified: 5 };

    const PRODUCT_ID    = 1001;
    const METADATA_HASH = "ipfs://QmExampleHash123";

    beforeEach(async function () {
        [owner, producer, distributor, retailer, regulator, stranger] = await ethers.getSigners();

        const Factory = await ethers.getContractFactory("SupplyChainProvenance");
        contract = await Factory.deploy();

        await contract.assignRole(producer.address,    Role.Producer);
        await contract.assignRole(distributor.address, Role.Distributor);
        await contract.assignRole(retailer.address,    Role.Retailer);
        await contract.assignRole(regulator.address,   Role.Regulator);
    });

    describe("Role Assignment", function () {

        it("should assign Producer role correctly", async function () {
            expect(await contract.getRole(producer.address)).to.equal(Role.Producer);
        });

        it("should assign all roles correctly", async function () {
            expect(await contract.getRole(distributor.address)).to.equal(Role.Distributor);
            expect(await contract.getRole(retailer.address)).to.equal(Role.Retailer);
            expect(await contract.getRole(regulator.address)).to.equal(Role.Regulator);
        });

        it("should emit RoleAssigned event", async function () {
            await expect(contract.assignRole(stranger.address, Role.Producer))
                .to.emit(contract, "RoleAssigned")
                .withArgs(stranger.address, Role.Producer);
        });

        it("should revert if non-owner tries to assign roles", async function () {
            await expect(
                contract.connect(stranger).assignRole(stranger.address, Role.Producer)
            ).to.be.revertedWith("Only owner");
        });

        it("should revert if assigning Role.None", async function () {
            await expect(
                contract.assignRole(stranger.address, Role.None)
            ).to.be.revertedWith("Invalid role");
        });
    });

    describe("registerProduct", function () {

        it("should register a product and set initial state to Created", async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);

            const product = await contract.getProduct(PRODUCT_ID);
            expect(product.productId).to.equal(PRODUCT_ID);
            expect(product.metadataHash).to.equal(METADATA_HASH);
            expect(product.currentCustodian).to.equal(producer.address);
            expect(product.status).to.equal(Status.Created);
            expect(product.exists).to.equal(true);
        });

        it("should emit ProductRegistered event", async function () {
            await expect(contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH))
                .to.emit(contract, "ProductRegistered")
                .withArgs(PRODUCT_ID, producer.address, METADATA_HASH);
        });

        it("should append a REGISTER record to provenance history", async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);

            const history = await contract.getProvenanceHistory(PRODUCT_ID);
            expect(history.length).to.equal(1);
            expect(history[0].actor).to.equal(producer.address);
            expect(history[0].action).to.equal("REGISTER");
        });

        it("should revert if caller does not have Producer role", async function () {
            await expect(
                contract.connect(distributor).registerProduct(PRODUCT_ID, METADATA_HASH)
            ).to.be.revertedWith("Only producer");
        });

        it("should revert if product ID is already registered", async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);
            await expect(
                contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH)
            ).to.be.revertedWith("Duplicate product");
        });

        it("should revert if metadataHash is empty", async function () {
            await expect(
                contract.connect(producer).registerProduct(PRODUCT_ID, "")
            ).to.be.revertedWith("Metadata required");
        });
    });

    describe("transferCustody", function () {

        beforeEach(async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);
        });

        it("should transfer custody to a new custodian", async function () {
            await contract.connect(producer).transferCustody(PRODUCT_ID, distributor.address, "To distributor");

            const product = await contract.getProduct(PRODUCT_ID);
            expect(product.currentCustodian).to.equal(distributor.address);
        });

        it("should emit CustodyTransferred event", async function () {
            await expect(
                contract.connect(producer).transferCustody(PRODUCT_ID, distributor.address, "To distributor")
            )
                .to.emit(contract, "CustodyTransferred")
                .withArgs(PRODUCT_ID, producer.address, distributor.address);
        });

        it("should append a TRANSFER_CUSTODY record to provenance history", async function () {
            await contract.connect(producer).transferCustody(PRODUCT_ID, distributor.address, "To distributor");

            const history = await contract.getProvenanceHistory(PRODUCT_ID);
            expect(history.length).to.equal(2);
            expect(history[1].action).to.equal("TRANSFER_CUSTODY");
            expect(history[1].actor).to.equal(producer.address);
        });

        it("should revert if caller is not the current custodian", async function () {
            await expect(
                contract.connect(distributor).transferCustody(PRODUCT_ID, retailer.address, "Unauthorized")
            ).to.be.revertedWith("Only current custodian");
        });

        it("should revert if new custodian has no role assigned", async function () {
            await expect(
                contract.connect(producer).transferCustody(PRODUCT_ID, stranger.address, "To stranger")
            ).to.be.revertedWith("Unassigned recipient");
        });

        it("should revert if product does not exist", async function () {
            await expect(
                contract.connect(producer).transferCustody(9999, distributor.address, "Ghost product")
            ).to.be.revertedWith("Product not found");
        });
    });

    describe("updateStatus", function () {

        beforeEach(async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);
            await contract.connect(producer).transferCustody(PRODUCT_ID, distributor.address, "To distributor");
        });

        it("should update status through valid transitions", async function () {
            await contract.connect(distributor).updateStatus(PRODUCT_ID, Status.Shipped, "Shipped");
            await contract.connect(distributor).updateStatus(PRODUCT_ID, Status.Stored, "Stored");

            const product = await contract.getProduct(PRODUCT_ID);
            expect(product.status).to.equal(Status.Stored);
        });

        it("should emit StatusUpdated event", async function () {
            await expect(
                contract.connect(distributor).updateStatus(PRODUCT_ID, Status.Shipped, "In transit")
            )
                .to.emit(contract, "StatusUpdated")
                .withArgs(PRODUCT_ID, Status.Shipped, distributor.address, "In transit");
        });

        it("should append an UPDATE_STATUS record to provenance history", async function () {
            await contract.connect(distributor).updateStatus(PRODUCT_ID, Status.Shipped, "In transit");

            const history = await contract.getProvenanceHistory(PRODUCT_ID);
            const last = history[history.length - 1];
            expect(last.action).to.equal("UPDATE_STATUS");
            expect(last.actor).to.equal(distributor.address);
        });

        it("should revert on invalid status transition", async function () {
            await expect(
                contract.connect(distributor).updateStatus(PRODUCT_ID, Status.Delivered, "Skipped steps")
            ).to.be.revertedWith("Invalid transition");
        });

        it("should revert if caller is not the current custodian", async function () {
            await expect(
                contract.connect(producer).updateStatus(PRODUCT_ID, Status.Shipped, "Not custodian")
            ).to.be.revertedWith("Only current custodian");
        });
    });

    describe("verifyProduct", function () {

        beforeEach(async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);
            await contract.connect(producer).transferCustody(PRODUCT_ID, distributor.address, "To distributor");
            await contract.connect(distributor).updateStatus(PRODUCT_ID, Status.Shipped, "Shipped");
            await contract.connect(distributor).updateStatus(PRODUCT_ID, Status.Stored, "Stored");
            await contract.connect(distributor).transferCustody(PRODUCT_ID, retailer.address, "To retailer");
            await contract.connect(retailer).updateStatus(PRODUCT_ID, Status.Delivered, "Delivered");
        });

        it("should allow regulator to verify a delivered product", async function () {
            await contract.connect(regulator).verifyProduct(PRODUCT_ID, "Passed inspection");

            const product = await contract.getProduct(PRODUCT_ID);
            expect(product.status).to.equal(Status.Verified);
        });

        it("should revert if product is not yet delivered", async function () {
            await contract.connect(producer).registerProduct(2002, METADATA_HASH);
            await expect(
                contract.connect(regulator).verifyProduct(2002, "Too early")
            ).to.be.revertedWith("Must be delivered first");
        });

        it("should revert if caller is not a Regulator", async function () {
            await expect(
                contract.connect(producer).verifyProduct(PRODUCT_ID, "Wrong role")
            ).to.be.revertedWith("Only regulator");
        });
    });

    describe("getProvenanceHistory", function () {

        it("should return complete history in order", async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);
            await contract.connect(producer).transferCustody(PRODUCT_ID, distributor.address, "step 2");
            await contract.connect(distributor).updateStatus(PRODUCT_ID, Status.Shipped, "step 3");

            const history = await contract.getProvenanceHistory(PRODUCT_ID);
            expect(history.length).to.equal(3);
            expect(history[0].action).to.equal("REGISTER");
            expect(history[1].action).to.equal("TRANSFER_CUSTODY");
            expect(history[2].action).to.equal("UPDATE_STATUS");
        });

        it("should return empty history for unregistered product", async function () {
            const history = await contract.getProvenanceHistory(9999);
            expect(history.length).to.equal(0);
        });
    });

    describe("Full Lifecycle", function () {

        it("should complete the full provenance lifecycle from Creation to Verified", async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);
            let p = await contract.getProduct(PRODUCT_ID);
            expect(p.status).to.equal(Status.Created);
            expect(p.currentCustodian).to.equal(producer.address);

            await contract.connect(producer).transferCustody(PRODUCT_ID, distributor.address, "From factory");
            p = await contract.getProduct(PRODUCT_ID);
            expect(p.currentCustodian).to.equal(distributor.address);

            await contract.connect(distributor).updateStatus(PRODUCT_ID, Status.Shipped, "In transit");
            p = await contract.getProduct(PRODUCT_ID);
            expect(p.status).to.equal(Status.Shipped);

            await contract.connect(distributor).updateStatus(PRODUCT_ID, Status.Stored, "At warehouse");
            p = await contract.getProduct(PRODUCT_ID);
            expect(p.status).to.equal(Status.Stored);

            await contract.connect(distributor).transferCustody(PRODUCT_ID, retailer.address, "To retailer");
            p = await contract.getProduct(PRODUCT_ID);
            expect(p.currentCustodian).to.equal(retailer.address);

            await contract.connect(retailer).updateStatus(PRODUCT_ID, Status.Delivered, "Received");
            p = await contract.getProduct(PRODUCT_ID);
            expect(p.status).to.equal(Status.Delivered);

            await contract.connect(regulator).verifyProduct(PRODUCT_ID, "Compliance confirmed");
            p = await contract.getProduct(PRODUCT_ID);
            expect(p.status).to.equal(Status.Verified);

            const history = await contract.getProvenanceHistory(PRODUCT_ID);
            expect(history.length).to.equal(7);

            const actions = history.map(h => h.action);
            expect(actions).to.deep.equal([
                "REGISTER",
                "TRANSFER_CUSTODY",
                "UPDATE_STATUS",
                "UPDATE_STATUS",
                "TRANSFER_CUSTODY",
                "UPDATE_STATUS",
                "VERIFY_PRODUCT"
            ]);

            for (const record of history) {
                expect(record.timestamp).to.be.gt(0);
                expect(record.actor).to.not.equal(ethers.ZeroAddress);
            }
        });
    });
});
