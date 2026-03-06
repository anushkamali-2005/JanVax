// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * VaxGuardAudit.sol
 * -----------------
 * Stores SHA-256 hashes of VaxGuard AI decisions and vaccine records
 * on Polygon Amoy testnet (Mumbai was deprecated Nov 2023).
 *
 * Key properties:
 *   - Once stored, a hash CANNOT be overwritten (immutable audit trail)
 *   - storeHash reverts if entityId already has a hash
 *   - verifyHash lets anyone check a hash in one call (no Python comparison needed)
 *   - getRecord returns full metadata: hash + who stored it + when
 *
 * Deploy:
 *   npx hardhat run scripts/deploy.js --network amoy
 *
 * After deploy, set env var:
 *   POLYGON_CONTRACT_ADDRESS=<deployed address>
 *   POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
 *   POLYGON_CHAIN_ID=80002
 */

contract VaxGuardAudit {

    // ── Storage ──────────────────────────────────────────────────────────────

    // entityId (Firestore childId, predictionId, agentDecisionId) → SHA-256 hash
    mapping(string => string) private hashes;

    struct HashRecord {
        string  recordHash;
        address storedBy;
        uint256 storedAt;
    }
    mapping(string => HashRecord) private records;

    // ── Events ───────────────────────────────────────────────────────────────

    event HashStored(
        string  indexed entityId,
        string  recordHash,
        address indexed storedBy,
        uint256 storedAt
    );

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * @notice Store a SHA-256 hash for an entity.
     * @dev    Reverts if entityId already has a stored hash (immutability).
     * @param  entityId    Unique identifier (Firestore doc ID or prediction ID).
     * @param  recordHash  64-character hex SHA-256 hash string.
     */
    function storeHash(
        string calldata entityId,
        string calldata recordHash
    ) external {
        require(bytes(entityId).length > 0,          "VaxGuard: empty entityId");
        require(bytes(recordHash).length == 64,       "VaxGuard: hash must be 64 hex chars");
        require(
            bytes(hashes[entityId]).length == 0,
            "VaxGuard: hash already stored, record is immutable"
        );

        hashes[entityId]  = recordHash;
        records[entityId] = HashRecord({
            recordHash: recordHash,
            storedBy:   msg.sender,
            storedAt:   block.timestamp
        });

        emit HashStored(entityId, recordHash, msg.sender, block.timestamp);
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * @notice Retrieve stored hash for an entity.
     * @return Empty string if not found (entity not yet on chain).
     */
    function getHash(string calldata entityId)
        external view returns (string memory)
    {
        return hashes[entityId];
    }

    /**
     * @notice Retrieve full record: hash + who stored it + timestamp.
     */
    function getRecord(string calldata entityId)
        external view
        returns (
            string  memory recordHash,
            address        storedBy,
            uint256        storedAt
        )
    {
        HashRecord memory r = records[entityId];
        return (r.recordHash, r.storedBy, r.storedAt);
    }

    /**
     * @notice Verify a hash directly on-chain — returns true/false.
     * @dev    More gas-efficient than getHash + off-chain comparison
     *         when called from a frontend or another contract.
     */
    function verifyHash(
        string calldata entityId,
        string calldata providedHash
    ) external view returns (bool) {
        return (
            keccak256(bytes(hashes[entityId])) ==
            keccak256(bytes(providedHash))
        );
    }
}
