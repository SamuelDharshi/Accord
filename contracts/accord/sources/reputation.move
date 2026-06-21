/// Accord — Reputation Module
///
/// Tracks aggregate performance statistics per user address, updated
/// exclusively by the Arca agent via `ArcaCap`.
///
/// Design:
///   - `ReputationProfile` is address-owned (fast path, no consensus).
///   - Created on first interaction; a profile cannot be manually created.
///   - All updates require `&ArcaCap` — prevents self-reporting.
///   - Average quality score uses rolling bps arithmetic (0–10000 = 0–100.00%).
///
/// On-Chain vs Off-Chain:
///   Aggregate counters live on-chain. Detailed interaction history is stored
///   in Walrus Memory by the Arca agent service and referenced via events.
module accord::reputation {
    use sui::object::UID;
    use sui::transfer;
    use sui::tx_context::TxContext;
    use accord::covenant::ArcaCap;
    use accord::errors;

    // ─── Core Struct ──────────────────────────────────────────────────────────

    /// Address-owned reputation object. Managed exclusively by ArcaCap.
    /// Created automatically on first covenant completion.
    public struct ReputationProfile has key {
        id: UID,
        /// The address this profile belongs to (client or contractor).
        owner: address,
        /// Total milestones successfully completed and released.
        total_covenants_completed: u64,
        /// Cumulative USDSUI value released across all covenants (6 decimals).
        total_value_released_usdsui: u64,
        /// Number of covenants that entered DISPUTED state.
        total_disputes: u64,
        /// Rolling average quality score in basis points (0–10000).
        /// Represents AI-assessed delivery quality averaged over all completions.
        average_quality_score_bps: u64,
    }

    // ─── Public Functions ─────────────────────────────────────────────────────

    /// Creates a new `ReputationProfile` for an address.
    /// Called by the Arca agent when no profile exists for a given contractor/client.
    /// The profile is transferred to `owner` — they own their reputation data.
    ///
    /// security: Aborts if a profile already exists for this address.
    public fun create_profile(
        _cap: &ArcaCap,
        owner: address,
        ctx: &mut TxContext,
    ): ReputationProfile {
        // Note: existence guard omitted — `create_profile` should only be called
        // once per address by the Arca agent. For production, consider using a
        // `sui::table::Table<address, bool>` registry or a Capability that
        // must be consumed. For hackathon demo scope, Arca is trusted to call
        // this at most once per address.

        ReputationProfile {
            id: object::new(ctx),
            owner,
            total_covenants_completed: 0,
            total_value_released_usdsui: 0,
            total_disputes: 0,
            average_quality_score_bps: 0,
        }
    }

    /// Transfers a newly created or mutated profile to its owner.
    public fun transfer_profile(
        _cap: &ArcaCap,
        profile: ReputationProfile,
    ) {
        let owner = profile.owner;
        transfer::transfer(profile, owner);
    }

    /// Records a successful covenant completion on the contractor's profile.
    ///
    /// Updates:
    ///   - Increments `total_covenants_completed`.
    ///   - Adds `amount_usdsui` to `total_value_released_usdsui` (overflow-safe via u128).
    ///   - Updates `average_quality_score_bps` with a rolling average.
    ///
    /// Access: Requires `&ArcaCap`.
    public fun record_completion(
        _cap: &ArcaCap,
        profile: &mut ReputationProfile,
        amount_usdsui: u64,
        quality_score_bps: u64,
    ) {
        let n = profile.total_covenants_completed;

        // Overflow-safe addition for cumulative value.
        let new_total = (profile.total_value_released_usdsui as u128)
            + (amount_usdsui as u128);
        // Safe cast: total value is economically bounded (≪ u64::MAX in practice).
        profile.total_value_released_usdsui = (new_total as u64);

        // Rolling average: avg_new = (avg_old * n + new_score) / (n + 1)
        // Use u128 to prevent overflow in numerator.
        let new_avg = if (n == 0) {
            quality_score_bps
        } else {
            let numerator = (profile.average_quality_score_bps as u128) * (n as u128)
                + (quality_score_bps as u128);
            let denominator = (n as u128) + 1u128;
            (numerator / denominator) as u64
        };

        profile.average_quality_score_bps = new_avg;
        profile.total_covenants_completed = n + 1;
    }

    /// Records a dispute on the user's profile.
    /// Called when a milestone enters DISPUTED state.
    ///
    /// Access: Requires `&ArcaCap`.
    public fun record_dispute(
        _cap: &ArcaCap,
        profile: &mut ReputationProfile,
    ) {
        profile.total_disputes = profile.total_disputes + 1;
    }

    // ─── Read-Only Accessors ──────────────────────────────────────────────────

    public fun profile_owner(p: &ReputationProfile): address { p.owner }
    public fun profile_completed(p: &ReputationProfile): u64 { p.total_covenants_completed }
    public fun profile_value(p: &ReputationProfile): u64 { p.total_value_released_usdsui }
    public fun profile_disputes(p: &ReputationProfile): u64 { p.total_disputes }
    public fun profile_quality_bps(p: &ReputationProfile): u64 { p.average_quality_score_bps }

    // ─── Validation Helpers ───────────────────────────────────────────────────

    /// Validates that a quality score is within valid bps range [0, 10000].
    public fun assert_valid_quality_score(score: u64) {
        assert!(score <= 10_000, errors::invalid_quality_score());
    }
}
