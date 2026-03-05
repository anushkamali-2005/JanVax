// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * VaxGuardAudit.sol
 * -----------------
 * Stores SHA-256 hashes of VaxGuard records on Polygon Mumbai testnet.
 * Simple key-value store: entityId → recordHash.
 * Once stored, a hash cannot be overwritten (immutable audit trail).
 *
 * Deploy with: npx hardhat run scripts/deploy.js --network mumbai
 */

contract VaxGuardAudit {

    // entityId (Firebase childId or predictionId) → SHA-256 hash string
    mapping(string => string) private hashes;

    // Track who stored what and when (for the audit dashboard)
    struct HashRecord {
        string  recordHash;
        address storedBy;
        uint256 storedAt;
    }
    mapping(string => HashRecord) private records;

    // Events — emitted on every store, queryable from frontend
    event HashStored(
        string  indexed entityId,
        string  recordHash,
        address storedBy,
        uint256 storedAt
    );

    /**
     * Store a hash for an entity.
     * CRITICAL: Once stored, cannot be overwritten.
     * If entityId already has a hash, this call reverts.
     */
    function storeHash(string calldata entityId, string calldata recordHash) external {
        require(bytes(hashes[entityId]).length == 0, "VaxGuard: hash already stored for this entity");
        require(bytes(entityId).length > 0,    "VaxGuard: entityId cannot be empty");
        require(bytes(recordHash).length == 64, "VaxGuard: invalid SHA-256 hash length");

        hashes[entityId] = recordHash;
        records[entityId] = HashRecord({
            recordHash: recordHash,
            storedBy:   msg.sender,
            storedAt:   block.timestamp
        });

        emit HashStored(entityId, recordHash, msg.sender, block.timestamp);
    }

    /**
     * Retrieve stored hash for an entity.
     * Returns empty string if not found.
     */
    function getHash(string calldata entityId) external view returns (string memory) {
        return hashes[entityId];
    }

    /**
     * Get full record metadata (hash + who stored it + when).
     */
    function getRecord(string calldata entityId)
        external
        view
        returns (string memory recordHash, address storedBy, uint256 storedAt)
    {
        HashRecord memory r = records[entityId];
        return (r.recordHash, r.storedBy, r.storedAt);
    }

    /**
     * Verify: returns true if stored hash matches provided hash.
     * Use this from the /verify endpoint instead of fetching + comparing in Python.
     */
    function verifyHash(string calldata entityId, string calldata providedHash)
        external
        view
        returns (bool)
    {
        return keccak256(bytes(hashes[entityId])) == keccak256(bytes(providedHash));
    }
}
