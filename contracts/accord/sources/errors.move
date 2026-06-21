/// Centralized error codes for the Accord protocol.
/// All modules import from here to prevent collision and ease auditing.
module accord::errors {

    /// Milestone basis-point percentages do not sum to exactly 10,000.
    const EInvalidPercentages: u64 = 1;

    /// The milestone is not in PENDING status (status != 0).
    const ENotPending: u64 = 2;

    /// The milestone is not in DELIVERED status (status != 1). Cannot release payment.
    const ENotDelivered: u64 = 3;

    /// The provided milestone index is out of bounds for the milestones vector.
    const EIndexOutOfBounds: u64 = 4;

    /// The milestone payment has already been released (status == 2).
    const EAlreadyReleased: u64 = 5;

    /// Escrow balance is insufficient to cover the requested split.
    const EInsufficientEscrow: u64 = 6;

    /// Reputation profile already exists for this address.
    const EProfileAlreadyExists: u64 = 7;

    /// Reputation profile does not exist for this address.
    const EProfileNotFound: u64 = 8;

    /// Quality score exceeds maximum BPS (10000).
    const EInvalidQualityScore: u64 = 9;

    // ─── Public accessor functions ──────────────────────────────────────────
    // These allow other modules to reference error codes without exposing
    // raw u64 constants that could be mistaken for non-error values.

    public fun invalid_percentages(): u64 { EInvalidPercentages }
    public fun not_pending(): u64 { ENotPending }
    public fun not_delivered(): u64 { ENotDelivered }
    public fun index_out_of_bounds(): u64 { EIndexOutOfBounds }
    public fun already_released(): u64 { EAlreadyReleased }
    public fun insufficient_escrow(): u64 { EInsufficientEscrow }
    public fun profile_already_exists(): u64 { EProfileAlreadyExists }
    public fun profile_not_found(): u64 { EProfileNotFound }
    public fun invalid_quality_score(): u64 { EInvalidQualityScore }
}
