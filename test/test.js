const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SupplyChainProvenance", function () {
    let contract;
    let owner, producer, logistics, warehouse, retailer, regulator, stranger;

    const Role = {
        None: 0,
        Producer: 1,
        Logistics: 2,
        Warehouse: 3,
        Retailer: 4,
        Regulator: 5,
    };

    const Status = {
        None: 0,
        Created: 1,
        Packed: 2,
        InTransit: 3,
        Stored: 4,
        OutForDelivery: 5,
        Delivered: 6,
        Verified: 7,
    };

    const PRODUCT_ID = 1001;
    const METADATA_HASH = "ipfs://QmExampleHash123";

    beforeEach(async function () {
        [owner, producer, logistics, warehouse, retailer, regulator, stranger] = await ethers.getSigners();

        const Factory = await ethers.getContractFactory("SupplyChainProvenance");
        contract = await Factory.deploy();

        await contract.assignRole(producer.address, Role.Producer);
        await contract.assignRole(logistics.address, Role.Logistics);
        await contract.assignRole(warehouse.address, Role.Warehouse);
        await contract.assignRole(retailer.address, Role.Retailer);
        await contract.assignRole(regulator.address, Role.Regulator);
    });

    describe("Role Assignment", function () {
        it("should assign all roles correctly", async function () {
            expect(await contract.getRole(producer.address)).to.equal(Role.Producer);
            expect(await contract.getRole(logistics.address)).to.equal(Role.Logistics);
            expect(await contract.getRole(warehouse.address)).to.equal(Role.Warehouse);
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
            await expect(contract.assignRole(stranger.address, Role.None))
                .to.be.revertedWith("Invalid role");
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

        it("should revert if caller does not have Producer role", async function () {
            await expect(
                contract.connect(logistics).registerProduct(PRODUCT_ID, METADATA_HASH)
            ).to.be.revertedWith("Only producer");
        });

        it("should revert if metadataHash is empty", async function () {
            await expect(contract.connect(producer).registerProduct(PRODUCT_ID, ""))
                .to.be.revertedWith("Metadata required");
        });
    });

    describe("updateStatus", function () {
        it("should allow producer to pack a created product", async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);
            await contract.connect(producer).updateStatus(PRODUCT_ID, Status.Packed, "Packed at origin");

            const product = await contract.getProduct(PRODUCT_ID);
            expect(product.status).to.equal(Status.Packed);
        });

        it("should revert if producer tries to set InTransit", async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);

            await expect(
                contract.connect(producer).updateStatus(PRODUCT_ID, Status.InTransit, "Skip packing")
            ).to.be.revertedWith("Invalid transition");
        });

        it("should revert if logistics tries to update before custody transfer", async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);
            await contract.connect(producer).updateStatus(PRODUCT_ID, Status.Packed, "Packed");

            await expect(
                contract.connect(logistics).updateStatus(PRODUCT_ID, Status.InTransit, "Unauthorized")
            ).to.be.revertedWith("Only current custodian");
        });

        it("should revert if current custodian has wrong role for target status", async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);
            await contract.connect(producer).updateStatus(PRODUCT_ID, Status.Packed, "Packed");
            await contract.connect(producer).transferCustody(PRODUCT_ID, logistics.address, "To logistics");
            await contract.connect(logistics).updateStatus(PRODUCT_ID, Status.InTransit, "In transit");
            await contract.connect(logistics).transferCustody(PRODUCT_ID, warehouse.address, "To warehouse");

            await expect(
                contract.connect(warehouse).updateStatus(PRODUCT_ID, Status.OutForDelivery, "Wrong role")
            ).to.be.revertedWith("Invalid transition");
        });
    });

    describe("transferCustody", function () {
        beforeEach(async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);
        });

        it("should allow producer to transfer a packed product to logistics", async function () {
            await contract.connect(producer).updateStatus(PRODUCT_ID, Status.Packed, "Packed");
            await contract.connect(producer).transferCustody(PRODUCT_ID, logistics.address, "To logistics");

            const product = await contract.getProduct(PRODUCT_ID);
            expect(product.currentCustodian).to.equal(logistics.address);
        });

        it("should revert if producer transfers before packing", async function () {
            await expect(
                contract.connect(producer).transferCustody(PRODUCT_ID, logistics.address, "Too early")
            ).to.be.revertedWith("Invalid custody transfer");
        });

        it("should revert if producer tries to transfer directly to retailer", async function () {
            await contract.connect(producer).updateStatus(PRODUCT_ID, Status.Packed, "Packed");

            await expect(
                contract.connect(producer).transferCustody(PRODUCT_ID, retailer.address, "Skip stages")
            ).to.be.revertedWith("Invalid custody transfer");
        });

        it("should allow logistics to transfer InTransit product to warehouse", async function () {
            await contract.connect(producer).updateStatus(PRODUCT_ID, Status.Packed, "Packed");
            await contract.connect(producer).transferCustody(PRODUCT_ID, logistics.address, "To logistics");
            await contract.connect(logistics).updateStatus(PRODUCT_ID, Status.InTransit, "In transit");
            await contract.connect(logistics).transferCustody(PRODUCT_ID, warehouse.address, "To warehouse");

            const product = await contract.getProduct(PRODUCT_ID);
            expect(product.currentCustodian).to.equal(warehouse.address);
        });

        it("should allow warehouse to transfer Stored product back to logistics", async function () {
            await contract.connect(producer).registerProduct(2002, METADATA_HASH);
            await contract.connect(producer).updateStatus(2002, Status.Packed, "Packed");
            await contract.connect(producer).transferCustody(2002, logistics.address, "To logistics");
            await contract.connect(logistics).updateStatus(2002, Status.InTransit, "In transit");
            await contract.connect(logistics).transferCustody(2002, warehouse.address, "To warehouse");
            await contract.connect(warehouse).updateStatus(2002, Status.Stored, "Stored");
            await contract.connect(warehouse).transferCustody(2002, logistics.address, "Back to logistics");

            const product = await contract.getProduct(2002);
            expect(product.currentCustodian).to.equal(logistics.address);
        });

        it("should allow logistics to transfer OutForDelivery product to retailer", async function () {
            await contract.connect(producer).registerProduct(3003, METADATA_HASH);
            await contract.connect(producer).updateStatus(3003, Status.Packed, "Packed");
            await contract.connect(producer).transferCustody(3003, logistics.address, "To logistics");
            await contract.connect(logistics).updateStatus(3003, Status.InTransit, "In transit");
            await contract.connect(logistics).transferCustody(3003, warehouse.address, "To warehouse");
            await contract.connect(warehouse).updateStatus(3003, Status.Stored, "Stored");
            await contract.connect(warehouse).transferCustody(3003, logistics.address, "Back to logistics");
            await contract.connect(logistics).updateStatus(3003, Status.OutForDelivery, "Last mile");
            await contract.connect(logistics).transferCustody(3003, retailer.address, "To retailer");

            const product = await contract.getProduct(3003);
            expect(product.currentCustodian).to.equal(retailer.address);
        });
    });

    describe("verifyProduct", function () {
        beforeEach(async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);
            await contract.connect(producer).updateStatus(PRODUCT_ID, Status.Packed, "Packed");
            await contract.connect(producer).transferCustody(PRODUCT_ID, logistics.address, "To logistics");
            await contract.connect(logistics).updateStatus(PRODUCT_ID, Status.InTransit, "In transit");
            await contract.connect(logistics).transferCustody(PRODUCT_ID, warehouse.address, "To warehouse");
            await contract.connect(warehouse).updateStatus(PRODUCT_ID, Status.Stored, "Stored");
            await contract.connect(warehouse).transferCustody(PRODUCT_ID, logistics.address, "Back to logistics");
            await contract.connect(logistics).updateStatus(PRODUCT_ID, Status.OutForDelivery, "Out for delivery");
            await contract.connect(logistics).transferCustody(PRODUCT_ID, retailer.address, "To retailer");
            await contract.connect(retailer).updateStatus(PRODUCT_ID, Status.Delivered, "Delivered");
        });

        it("should allow regulator to verify a delivered product", async function () {
            await contract.connect(regulator).verifyProduct(PRODUCT_ID, "Passed inspection");

            const product = await contract.getProduct(PRODUCT_ID);
            expect(product.status).to.equal(Status.Verified);
        });

        it("should emit StatusUpdated when regulator verifies product", async function () {
            await expect(contract.connect(regulator).verifyProduct(PRODUCT_ID, "Passed inspection"))
                .to.emit(contract, "StatusUpdated")
                .withArgs(PRODUCT_ID, Status.Verified, regulator.address, "Passed inspection");
        });

        it("should revert if product is not yet delivered", async function () {
            await contract.connect(producer).registerProduct(4004, METADATA_HASH);

            await expect(
                contract.connect(regulator).verifyProduct(4004, "Too early")
            ).to.be.revertedWith("Must be delivered first");
        });
    });

    describe("history and lifecycle", function () {
        it("should return complete history in order for the full lifecycle", async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);
            await contract.connect(producer).updateStatus(PRODUCT_ID, Status.Packed, "Packed");
            await contract.connect(producer).transferCustody(PRODUCT_ID, logistics.address, "To logistics");
            await contract.connect(logistics).updateStatus(PRODUCT_ID, Status.InTransit, "In transit");
            await contract.connect(logistics).transferCustody(PRODUCT_ID, warehouse.address, "To warehouse");
            await contract.connect(warehouse).updateStatus(PRODUCT_ID, Status.Stored, "Stored");
            await contract.connect(warehouse).transferCustody(PRODUCT_ID, logistics.address, "Back to logistics");
            await contract.connect(logistics).updateStatus(PRODUCT_ID, Status.OutForDelivery, "Out for delivery");
            await contract.connect(logistics).transferCustody(PRODUCT_ID, retailer.address, "To retailer");
            await contract.connect(retailer).updateStatus(PRODUCT_ID, Status.Delivered, "Delivered");
            await contract.connect(regulator).verifyProduct(PRODUCT_ID, "Verified");

            const product = await contract.getProduct(PRODUCT_ID);
            expect(product.status).to.equal(Status.Verified);
            expect(product.currentCustodian).to.equal(retailer.address);

            const history = await contract.getProvenanceHistory(PRODUCT_ID);
            expect(history.length).to.equal(11);
            expect(history.map((record) => record.action)).to.deep.equal([
                "REGISTER",
                "UPDATE_STATUS",
                "TRANSFER_CUSTODY",
                "UPDATE_STATUS",
                "TRANSFER_CUSTODY",
                "UPDATE_STATUS",
                "TRANSFER_CUSTODY",
                "UPDATE_STATUS",
                "TRANSFER_CUSTODY",
                "UPDATE_STATUS",
                "VERIFY_PRODUCT",
            ]);
        });

        it("should return empty history for unregistered product", async function () {
            const history = await contract.getProvenanceHistory(9999);
            expect(history.length).to.equal(0);
        });
    });
});
