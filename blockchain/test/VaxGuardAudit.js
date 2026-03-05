const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VaxGuardAudit", function () {
    it("Should store and retrieve a record hash", async function () {
        const VaxGuardAudit = await ethers.getContractFactory("VaxGuardAudit");
        const vaxGuardAudit = await VaxGuardAudit.deploy();
        await vaxGuardAudit.waitForDeployment();

        const entityId = "child_001";
        const recordHash = "sha256_hash_of_vaccination_record";

        await vaxGuardAudit.storeHash(entityId, recordHash);
        const storedHash = await vaxGuardAudit.getHash(entityId);

        expect(storedHash).to.equal(recordHash);
    });

    it("Should emit an event when a hash is stored", async function () {
        const VaxGuardAudit = await ethers.getContractFactory("VaxGuardAudit");
        const vaxGuardAudit = await VaxGuardAudit.deploy();
        await vaxGuardAudit.waitForDeployment();

        const entityId = "child_002";
        const recordHash = "another_sha256_hash";

        await expect(vaxGuardAudit.storeHash(entityId, recordHash))
            .to.emit(vaxGuardAudit, "HashStored")
            .withArgs(entityId, recordHash, await (await ethers.provider.getSigner()).getAddress());
    });
});
