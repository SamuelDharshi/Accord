/// Accord — Core Covenant Module
///
/// Implements the Capability-Based Access Control pattern for autonomous
/// work agreements. An AI agent (Arca) holds the `ArcaCap` and is the
/// ONLY entity capable of releasing escrowed funds or recording deliveries.
///
/// Security Model:
///   - `ArcaCap` is minted ONCE in `init()`. No public constructor exists.
///   - All escrow mutations require `&ArcaCap` — impossible to forge.
///   - Milestone indices are bounds-checked before every access.
///   - Basis-point percentages are validated to sum to exactly 10,000 on creation.
///   - `release_milestone_payment` asserts status == 1 (DELIVERED) to prevent double-release.
///   - `Covenant` is a Shared Object: readable by all, mutable only via capabilities.
///
/// USDSUI Note:
///   Uses the local `accord::usdsui::USDSUI` type for test compilation.
///   Replace with `usdsui::usdsui::USDSUI` and update Move.toml for mainnet.
module accord::covenant {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::object::{Self, ID, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use std::option::{Self, Option};
    use std::vector;
    use accord::usdsui::USDSUI;
    use accord::errors;
    use sui::event;

    // ─── Status constants ─────────────────────────────────────────────────────
    const STATUS_PENDING: u8    = 0;
    const STATUS_DELIVERED: u8  = 1;
    const STATUS_RELEASED: u8   = 2;
    const STATUS_DISPUTED: u8   = 3;

    /// Emitted when a new Covenant is created (published as shared object).
    public struct CovenantCreated has copy, drop {
        covenant_id: ID,
        client: address,
        contractor: address,
        milestone_count: u64,
        original_escrow: u64,
    }

    /// Emitted when the 0.5% protocol fee is collected on a milestone release.
    public struct ProtocolFeeCollected has copy, drop {
        covenant_id: ID,
        milestone_index: u64,
        fee_amount_usdsui: u64,
        treasury: address,
    }

    /// Emitted when Arca records a delivery for a milestone.
    public struct DeliveryRecorded has copy, drop {
        covenant_id: ID,
        milestone_index: u64,
        walrus_blob_id: vector<u8>,
    }

    /// Emitted when a milestone payment is released (net of protocol fee).
    public struct MilestoneReleased has copy, drop {
        covenant_id: ID,
        milestone_index: u64,
        /// Gross amount before protocol fee deduction.
        gross_amount_usdsui: u64,
        /// Net amount sent to contractor (gross - protocol_fee).
        net_amount_usdsui: u64,
        recipient: address,
    }

    /// Maximum milestones per covenant to prevent gas-exhaustion vectors.
    const MAX_MILESTONES: u64 = 100;

    /// Protocol fee in basis points: 50 bps = 0.5%.
    /// Applied on each milestone gross payout before sending to contractor.
    const PROTOCOL_FEE_BPS: u128 = 50;

    // ─── Capabilities ─────────────────────────────────────────────────────────

    /// Issued to the client who created the covenant.
    /// Required to cancel or initiate a dispute (future v2 functions).
    /// address-owned → maximum throughput, no consensus overhead.
    public struct ClientCap has key, store {
        id: UID,
        covenant_id: ID,
    }

    /// Issued ONCE at package deployment to the Arca agent service wallet.
    /// This is the ONLY way to mutate covenant escrow or milestone state.
    /// CRITICAL: No public constructor. No getter that exposes inner UID.
    /// Held as a key-only object — cannot be wrapped, cannot be transferred
    /// after initial transfer in init().
    public struct ArcaCap has key {
        id: UID,
    }

    // ─── Core Structs ─────────────────────────────────────────────────────────

    /// Represents a single milestone within a covenant.
    /// Embedded in the `Covenant` vector — uses `store` + `drop` abilities.
    public struct Milestone has store, drop {
        /// Human-readable description of what must be delivered.
        description: vector<u8>,
        /// Basis points: 3000 = 30%. All milestones sum to 10000.
        percentage_bps: u64,
        /// Set by Arca when the contractor delivers (Walrus blob ID).
        walrus_blob_id: Option<vector<u8>>,
        /// 0=pending, 1=delivered, 2=released, 3=disputed
        status: u8,
        /// Optional deadline in Sui epoch units.
        deadline_epoch: Option<u64>,
    }

    /// The core agreement object. Shared so both client and contractor
    /// can read state without capability. All writes require ArcaCap.
    ///
    /// security: `original_escrow` is immutable — used for BPS calculations
    /// so payouts don't shrink as milestones are released (payment dilution fix).
    public struct Covenant has key {
        id: UID,
        client: address,
        contractor: address,
        title: vector<u8>,
        milestones: vector<Milestone>,
        /// Immortal total escrow — used to compute BPS splits, never modified.
        /// This prevents the payment-dilution bug where subsequent milestones
        /// were underpaid because the remaining balance was used instead.
        original_escrow: u64,
        /// Remaining USDSUI balance. Decreases with each milestone release.
        remaining_escrow: Balance<USDSUI>,
        created_at_epoch: u64,
        /// If true, payment amounts use Confidential Transfers in future v2.
        is_confidential: bool,
        /// Protocol treasury address — receives the 0.5% fee on each release.
        /// Set at covenant creation; immutable thereafter.
        protocol_treasury: address,
    }

    // ─── Module Init ──────────────────────────────────────────────────────────

    /// Called once at package deployment.
    /// Mints the singular `ArcaCap` and transfers it to the deployer (Arca wallet).
    fun init(ctx: &mut TxContext) {
        let arca_cap = ArcaCap {
            id: object::new(ctx),
        };
        // Transfer to the deployer address — the Arca agent service wallet.
        transfer::transfer(arca_cap, tx_context::sender(ctx));
    }

    // ─── Public Entry Functions ───────────────────────────────────────────────

    /// Client creates a new covenant and deposits the full escrow amount.
    ///
    /// Validates:
    ///   - `milestone_percentages` sums to exactly 10,000 bps
    ///   - `milestone_descriptions` and `milestone_percentages` have equal length
    ///
    /// Emits: Shares the `Covenant` object and transfers `ClientCap` to caller.
    public entry fun create_covenant(
        title: vector<u8>,
        contractor: address,
        milestone_descriptions: vector<vector<u8>>,
        milestone_percentages: vector<u64>,
        payment: Coin<USDSUI>,
        is_confidential: bool,
        /// Address that receives the 0.5% protocol fee on each milestone release.
        /// Pass the Accord treasury address; caller decides at creation time.
        protocol_treasury: address,
        ctx: &mut TxContext,
    ) {
        // Validate parallel vector lengths.
        let desc_len = vector::length(&milestone_descriptions);
        let pct_len = vector::length(&milestone_percentages);
        assert!(desc_len == pct_len, errors::index_out_of_bounds());

        // Validate milestone count bounds.
        assert!(desc_len > 0 && desc_len <= MAX_MILESTONES, errors::index_out_of_bounds());

        // Validate percentages sum to exactly 10,000 bps (100.00%).
        assert!(
            sum_bps(&milestone_percentages) == 10_000,
            errors::invalid_percentages()
        );

        let covenant_uid = object::new(ctx);
        let covenant_id = object::uid_to_inner(&covenant_uid);

        let milestones = build_milestones(milestone_descriptions, milestone_percentages);
        let milestone_count_total = vector::length(&milestones);
        let original_escrow_total = coin::value(&payment);

        let covenant = Covenant {
            id: covenant_uid,
            client: tx_context::sender(ctx),
            contractor,
            title,
            milestones,
            original_escrow: original_escrow_total,
            remaining_escrow: coin::into_balance(payment),
            created_at_epoch: tx_context::epoch(ctx),
            is_confidential,
            protocol_treasury,
        };

        transfer::share_object(covenant);

        // Emit CovenantCreated for frontend covenant discovery.
        event::emit(CovenantCreated {
            covenant_id,
            client: tx_context::sender(ctx),
            contractor,
            milestone_count: milestone_count_total,
            original_escrow: original_escrow_total,
        });

        // ClientCap is address-owned (fast path, no consensus).
        let client_cap = ClientCap {
            id: object::new(ctx),
            covenant_id,
        };
        transfer::transfer(client_cap, tx_context::sender(ctx));
    }

    /// Arca agent records the Walrus blob ID of a delivered milestone.
    /// Changes milestone status from PENDING (0) → DELIVERED (1).
    ///
    /// Access: Requires `&ArcaCap`.
    /// Safety: Bounds-checks `milestone_index` before vector access.
    public entry fun record_delivery(
        _cap: &ArcaCap,
        covenant: &mut Covenant,
        milestone_index: u64,
        walrus_blob_id: vector<u8>,
    ) {
        // Bounds check before indexing.
        assert!(
            milestone_index < vector::length(&covenant.milestones),
            errors::index_out_of_bounds()
        );

        let milestone = vector::borrow_mut(&mut covenant.milestones, milestone_index);
        assert!(milestone.status == STATUS_PENDING, errors::not_pending());

        milestone.walrus_blob_id = option::some(walrus_blob_id);
        milestone.status = STATUS_DELIVERED;

        event::emit(DeliveryRecorded {
            covenant_id: object::uid_to_inner(&covenant.id),
            milestone_index,
            walrus_blob_id,
        });
    }

    /// Releases the escrowed USDSUI for a specific milestone.
    ///
    /// PRD §7.2 — Protocol Fee: 0.5% (50 bps) of the gross payout is deducted
    /// and sent to `covenant.protocol_treasury` in the same PTB call.
    /// The contractor receives the remaining 99.5% net amount.
    ///
    /// Returns `(contractor_coin, fee_coin)` — caller must transfer both.
    ///
    /// Access: Requires `&ArcaCap`.
    /// Safety:
    ///   - Bounds-checks index.
    ///   - Asserts status == DELIVERED (1) — prevents double-release.
    ///   - Uses `original_escrow` (not remaining) to prevent payment dilution.
    ///   - Uses u128 intermediate for multiplication to prevent overflow.
    ///   - Guards against insufficient remaining balance (EInsufficientEscrow).
    public fun release_milestone_payment(
        _cap: &ArcaCap,
        covenant: &mut Covenant,
        milestone_index: u64,
        ctx: &mut TxContext,
    ): (Coin<USDSUI>, Coin<USDSUI>) {
        // Bounds check.
        assert!(
            milestone_index < vector::length(&covenant.milestones),
            errors::index_out_of_bounds()
        );

        let milestone = vector::borrow_mut(&mut covenant.milestones, milestone_index);
        assert!(milestone.status == STATUS_DELIVERED, errors::not_delivered());

        // Use original_escrow (not remaining) to prevent payment dilution.
        // Each milestone receives exactly its BPS percentage of the total pool.
        let total = (covenant.original_escrow as u128);
        let bps = (milestone.percentage_bps as u128);
        let gross_amount = (total * bps / 10_000u128) as u64;

        // Compute 0.5% protocol fee (50 bps of gross).
        // Use u128 to avoid overflow on large amounts.
        let fee_amount = ((gross_amount as u128) * PROTOCOL_FEE_BPS / 10_000u128) as u64;
        let net_amount = gross_amount - fee_amount;

        // Guard: ensure remaining balance can cover gross payout (fee + net).
        assert!(gross_amount <= balance::value(&covenant.remaining_escrow), errors::insufficient_escrow());

        // Mark as released BEFORE splitting to prevent re-entrancy.
        milestone.status = STATUS_RELEASED;

        let covenant_id = object::uid_to_inner(&covenant.id);
        let treasury = covenant.protocol_treasury;
        let contractor = covenant.contractor;

        // Split fee first, then contractor net — order matters for balance accounting.
        let fee_balance = balance::split(&mut covenant.remaining_escrow, fee_amount);
        let net_balance = balance::split(&mut covenant.remaining_escrow, net_amount);

        event::emit(ProtocolFeeCollected {
            covenant_id,
            milestone_index,
            fee_amount_usdsui: fee_amount,
            treasury,
        });

        event::emit(MilestoneReleased {
            covenant_id,
            milestone_index,
            gross_amount_usdsui: gross_amount,
            net_amount_usdsui: net_amount,
            recipient: contractor,
        });

        (
            coin::from_balance(net_balance, ctx),
            coin::from_balance(fee_balance, ctx),
        )
    }

    /// Marks a milestone as DISPUTED after the client initiates a dispute.
    /// Both PENDING and DELIVERED milestones can be disputed.
    ///
    /// Access: Requires `&ClientCap` (the client who created the covenant).
    /// Note: Arca agent's `record_dispute` on the ReputationProfile must be called
    /// separately in the same PTB if you want atomic dispute + profile update.
    public fun dispute_milestone(
        _cap: &ClientCap,
        covenant: &mut Covenant,
        milestone_index: u64,
    ) {
        assert!(
            milestone_index < vector::length(&covenant.milestones),
            errors::index_out_of_bounds()
        );

        let milestone = vector::borrow_mut(&mut covenant.milestones, milestone_index);
        // Can only dispute milestones that haven't been released yet.
        assert!(milestone.status != STATUS_RELEASED, errors::already_released());

        milestone.status = STATUS_DISPUTED;
    }

    // ─── Read-Only Accessors ──────────────────────────────────────────────────
    // These expose only non-sensitive data for frontend queries.

    public fun covenant_client(c: &Covenant): address { c.client }
    public fun covenant_contractor(c: &Covenant): address { c.contractor }
    public fun covenant_title(c: &Covenant): &vector<u8> { &c.title }
    public fun covenant_escrow_balance(c: &Covenant): u64 { balance::value(&c.remaining_escrow) }
    public fun covenant_is_confidential(c: &Covenant): bool { c.is_confidential }
    public fun covenant_original_escrow(c: &Covenant): u64 { c.original_escrow }
    public fun covenant_milestone_count(c: &Covenant): u64 { vector::length(&c.milestones) }
    public fun covenant_protocol_treasury(c: &Covenant): address { c.protocol_treasury }
    public fun protocol_fee_bps(): u128 { PROTOCOL_FEE_BPS }

    public fun milestone_status(c: &Covenant, index: u64): u8 {
        assert!(index < vector::length(&c.milestones), errors::index_out_of_bounds());
        vector::borrow(&c.milestones, index).status
    }

    public fun milestone_bps(c: &Covenant, index: u64): u64 {
        assert!(index < vector::length(&c.milestones), errors::index_out_of_bounds());
        vector::borrow(&c.milestones, index).percentage_bps
    }

    public fun milestone_blob_id(c: &Covenant, index: u64): &Option<vector<u8>> {
        assert!(index < vector::length(&c.milestones), errors::index_out_of_bounds());
        &vector::borrow(&c.milestones, index).walrus_blob_id
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    /// Sums a vector of u64 basis-point values.
    /// Uses overflow-safe u128 accumulation to handle large inputs.
    fun sum_bps(percentages: &vector<u64>): u64 {
        let len = vector::length(percentages);
        let mut total: u128 = 0;
        let mut i = 0;
        while (i < len) {
            total = total + (*vector::borrow(percentages, i) as u128);
            i = i + 1;
        };
        // Safe cast: valid BPS sums never exceed 10_000 which fits easily in u64.
        (total as u64)
    }

    /// Constructs the milestones vector from parallel description + percentage vectors.
    /// Validates each entry has a non-empty description and non-zero BPS.
    fun build_milestones(
        descriptions: vector<vector<u8>>,
        percentages: vector<u64>,
    ): vector<Milestone> {
        let len = vector::length(&descriptions);
        let mut milestones = vector[];
        let mut i = 0;
        while (i < len) {
            let desc = vector::borrow(&descriptions, i);
            let bps = *vector::borrow(&percentages, i);

            // Validate non-empty description.
            assert!(vector::length(desc) > 0, errors::index_out_of_bounds());
            // Validate non-zero BPS — zero-BPS milestones create useless zero-coin states.
            assert!(bps > 0, errors::invalid_percentages());

            let m = Milestone {
                description: *desc,
                percentage_bps: bps,
                walrus_blob_id: option::none(),
                status: STATUS_PENDING,
                deadline_epoch: option::none(),
            };
            vector::push_back(&mut milestones, m);
            i = i + 1;
        };
        milestones
    }

    // ─── Test-Only Helpers ────────────────────────────────────────────────────

    #[test_only]
    /// Creates a fresh ArcaCap for use in unit tests.
    public fun create_arca_cap_for_testing(ctx: &mut TxContext): ArcaCap {
        ArcaCap { id: object::new(ctx) }
    }

    #[test_only]
    /// Destroys an ArcaCap created for testing.
    public fun destroy_arca_cap_for_testing(cap: ArcaCap) {
        let ArcaCap { id } = cap;
        object::delete(id);
    }
}
