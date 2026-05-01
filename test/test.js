const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SupplyChainProvenance", function () {
    let contract;
    let owner, producer, logistics, warehouse, retailer, consumer, regulator, stranger;

    const Role = {
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

    const Status = {
        None: 0,
        Registered: 1,
        Certified: 2,
        ReadyForShipment: 3,
        PickedUp: 4,
        InTransit: 5,
        Delivered: 6,
        ReceivedAtWarehouse: 7,
        Stored: 8,
        ReleasedFromWarehouse: 9,
        ReceivedAtRetailer: 10,
        AvailableForSale: 11,
        Sold: 12,
        Verified: 13,
        Returned: 14,
        Recalled: 15,
        Damaged: 16,
        Expired: 17,
        Lost: 18,
    };

    const PRODUCT_ID = 1001;
    const METADATA_HASH = "ipfs://QmExampleHash123";

    beforeEach(async function () {
        [owner, producer, logistics, warehouse, retailer, consumer, regulator, stranger] =
            await ethers.getSigners();

        const Factory = await ethers.getContractFactory("SupplyChainProvenance");
        contract = await Factory.deploy();

        await contract.assignRole(producer.address, Role.Producer);
        await contract.assignRole(logistics.address, Role.Logistics);
        await contract.assignRole(warehouse.address, Role.Warehouse);
        await contract.assignRole(retailer.address, Role.Retailer);
        await contract.assignRole(consumer.address, Role.Consumer);
        await contract.assignRole(regulator.address, Role.Regulator);
    });

    async function moveProductToSold(productId = PRODUCT_ID) {
        await contract.connect(producer).registerProduct(productId, METADATA_HASH);
        await contract.connect(producer).updateStatus(productId, Status.Certified, "Certified");
        await contract.connect(producer).updateStatus(
            productId,
            Status.ReadyForShipment,
            "Ready for shipment"
        );
        await contract.connect(producer).transferCustody(productId, logistics.address, "To logistics");
        await contract.connect(logistics).updateStatus(productId, Status.PickedUp, "Picked up");
        await contract.connect(logistics).updateStatus(productId, Status.InTransit, "In transit");
        await contract.connect(logistics).updateStatus(productId, Status.Delivered, "Delivered");
        await contract.connect(logistics).transferCustody(productId, warehouse.address, "To warehouse");
        await contract.connect(warehouse).updateStatus(
            productId,
            Status.ReceivedAtWarehouse,
            "Received at warehouse"
        );
        await contract.connect(warehouse).updateStatus(productId, Status.Stored, "Stored");
        await contract.connect(warehouse).updateStatus(
            productId,
            Status.ReleasedFromWarehouse,
            "Released from warehouse"
        );
        await contract.connect(warehouse).transferCustody(productId, retailer.address, "To retailer");
        await contract.connect(retailer).updateStatus(
            productId,
            Status.ReceivedAtRetailer,
            "Received at retailer"
        );
        await contract.connect(retailer).updateStatus(
            productId,
            Status.AvailableForSale,
            "Available for sale"
        );
        await contract.connect(retailer).updateStatus(productId, Status.Sold, "Sold");
    }

    describe("Role Assignment", function () {
        it("assigns all roles correctly", async function () {
            expect(await contract.getRole(producer.address)).to.equal(Role.Producer);
            expect(await contract.getRole(logistics.address)).to.equal(Role.Logistics);
            expect(await contract.getRole(warehouse.address)).to.equal(Role.Warehouse);
            expect(await contract.getRole(retailer.address)).to.equal(Role.Retailer);
            expect(await contract.getRole(consumer.address)).to.equal(Role.Consumer);
            expect(await contract.getRole(regulator.address)).to.equal(Role.Regulator);
        });

        it("emits RoleAssigned", async function () {
            await expect(contract.assignRole(stranger.address, Role.Producer))
                .to.emit(contract, "RoleAssigned")
                .withArgs(stranger.address, Role.Producer);
        });

        it("rejects non-admin role assignment", async function () {
            await expect(
                contract.connect(stranger).assignRole(stranger.address, Role.Producer)
            ).to.be.revertedWith("Only admin");
        });
    });

    describe("registerProduct", function () {
        it("registers a product with the expected initial state", async function () {
            await contract.connect(producer).registerProduct(PRODUCT_ID, METADATA_HASH);

            const product = await contract.getProduct(PRODUCT_ID);
            expect(product.productId).to.equal(PRODUCT_ID);
            expect(product.metadataHash).to.equal(METADATA_HASH);
            expect(product.currentCustodian).to.equal(producer.address);
            expect(product.status).to.equal(Status.Registered);
            expect(product.exists).to.equal(true);
        });

        it("rejects non-producers", async function () {
            await expect(
                contract.connect(logistics).registerProduct(PRODUCT_ID, METADATA_HASH)
            ).to.be.revertedWith("Only producer");
        });
    });

    describe("verifyProduct", function () {
        beforeEach(async function () {
            await moveProductToSold();
        });

        it("allows a consumer to verify a sold product", async function () {
            await contract.connect(consumer).verifyProduct(PRODUCT_ID, "Verified by consumer");

            const product = await contract.getProduct(PRODUCT_ID);
            expect(product.status).to.equal(Status.Verified);
            expect(product.currentCustodian).to.equal(retailer.address);
        });

        it("rejects non-consumers", async function () {
            await expect(
                contract.connect(regulator).verifyProduct(PRODUCT_ID, "Not allowed")
            ).to.be.revertedWith("Only consumer");
        });

        it("rejects verification before sale", async function () {
            await contract.connect(producer).registerProduct(4004, METADATA_HASH);

            await expect(
                contract.connect(consumer).verifyProduct(4004, "Too early")
            ).to.be.revertedWith("Must be sold first");
        });

        it("allows repeated verification without changing status again", async function () {
            await contract.connect(consumer).verifyProduct(PRODUCT_ID, "First verification");

            await expect(
                contract.connect(consumer).verifyProduct(PRODUCT_ID, "Second verification")
            )
                .to.emit(contract, "ProductVerified")
                .withArgs(PRODUCT_ID, consumer.address, "Second verification");

            const product = await contract.getProduct(PRODUCT_ID);
            expect(product.status).to.equal(Status.Verified);

            const history = await contract.getProvenanceHistory(PRODUCT_ID);
            expect(history[history.length - 1].action).to.equal("VERIFY_PRODUCT");
            expect(history[history.length - 1].eventMetadata).to.equal("Second verification");
        });
    });

    describe("Recalled", function () {
        beforeEach(async function () {
            await moveProductToSold();
        });

        it("allows a regulator to recall without custody", async function () {
            await contract.connect(regulator).updateStatus(
                PRODUCT_ID,
                Status.Recalled,
                "Regulatory recall"
            );

            const product = await contract.getProduct(PRODUCT_ID);
            expect(product.status).to.equal(Status.Recalled);
            expect(product.currentCustodian).to.equal(retailer.address);
        });

        it("emits StatusUpdated for regulator recall", async function () {
            await expect(
                contract.connect(regulator).updateStatus(
                    PRODUCT_ID,
                    Status.Recalled,
                    "Recall notice"
                )
            )
                .to.emit(contract, "StatusUpdated")
                .withArgs(PRODUCT_ID, Status.Recalled, regulator.address, "Recall notice");
        });

        it("still rejects recalls from non-regulators without custody", async function () {
            await expect(
                contract.connect(stranger).updateStatus(PRODUCT_ID, Status.Recalled, "Fake recall")
            ).to.be.revertedWith("Only current custodian");
        });
    });

    describe("history", function () {
        it("records the sold-to-verified flow", async function () {
            await moveProductToSold();
            await contract.connect(consumer).verifyProduct(PRODUCT_ID, "Verified");

            const history = await contract.getProvenanceHistory(PRODUCT_ID);
            expect(history.length).to.equal(16);
            expect(history[0].action).to.equal("REGISTER");
            expect(history[history.length - 1].action).to.equal("VERIFY_PRODUCT");
        });
    });
});
