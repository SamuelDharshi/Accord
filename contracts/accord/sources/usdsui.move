/// Mock USDSUI coin for local test environment compilation.
/// On testnet/mainnet, the real `usdsui::usdsui::USDSUI` package is used instead.
/// This module exists solely to allow `sui move build` and `sui move test` to compile
/// without depending on an external on-chain package.
///
/// PRODUCTION BUILD NOTE:
///   Before deploying to mainnet, remove this module and update:
///   1. Move.toml: add usdsui = { git = "...", subdir = "...", rev = "..." }
///   2. covenant.move: change import to use usdsui::usdsui::USDSUI
module accord::usdsui {
    use sui::coin;
    use sui::tx_context::TxContext;

    /// One-time witness for the mock USDSUI coin.
    public struct USDSUI has drop {}

    /// Module initializer — mints the currency and gives the TreasuryCap to the deployer.
    /// In the real USDSUI package this is managed by the Sui Foundation.
    #[allow(deprecated_usage)]
    fun init(witness: USDSUI, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            6,                         // 6 decimal places (matches real USDSUI)
            b"USDSUI",
            b"USD Sui Stablecoin",
            b"Stablecoin pegged 1:1 to USD, issued on the Sui network.",
            std::option::none(),
            ctx
        );
        // Transfer metadata to be publicly queryable.
        transfer::public_freeze_object(metadata);
        // TreasuryCap goes to the deployer for test minting.
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }

    #[test_only]
    /// Test-only helper: mint `amount` USDSUI to `recipient`.
    public fun mint_for_testing(
        cap: &mut sui::coin::TreasuryCap<USDSUI>,
        amount: u64,
        ctx: &mut TxContext
    ): sui::coin::Coin<USDSUI> {
        coin::mint(cap, amount, ctx)
    }
}