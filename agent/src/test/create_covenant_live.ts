import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const SUI_RPC_URL = process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
const PACKAGE_ID = process.env.ACCORD_PACKAGE_ID || '0x832f93729a8b1dfe9dd8067536dfa35231cf019f9401afe04a398df6d18c54cb';
const ARCA_PRIVATE_KEY = process.env.ARCA_PRIVATE_KEY;

async function main() {
  if (!ARCA_PRIVATE_KEY) {
    console.error('ARCA_PRIVATE_KEY is not set');
    process.exit(1);
  }

  const client = new SuiClient({ url: SUI_RPC_URL });
  const decoded = decodeSuiPrivateKey(ARCA_PRIVATE_KEY);
  const keypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
  const activeAddress = keypair.getPublicKey().toSuiAddress();

  console.log('Active address:', activeAddress);

  // Find USDSUI coin object
  const coins = await client.getCoins({
    owner: activeAddress,
    coinType: `${PACKAGE_ID}::usdsui::USDSUI`
  });

  if (coins.data.length === 0) {
    console.error('No USDSUI coins found for', activeAddress);
    process.exit(1);
  }

  const coinObjectId = coins.data[0].coinObjectId;
  console.log('Using USDSUI Coin ID:', coinObjectId);
  console.log('Balance:', coins.data[0].balance);

  const tx = new Transaction();

  // 1. Split USDSUI coin: 500 USDSUI ($500)
  const [splitCoin] = tx.splitCoins(tx.object(coinObjectId), [tx.pure.u64(500_000_000)]);

  // 2. Call create_covenant
  const title = Array.from(Buffer.from('Figma Website Design Wireframes', 'utf8'));
  const contractor = '0x5f53dc38f84bd317828407558a795f76c6834b73865adc5c6d47980c81c05cc1'; // charming-zircon

  const milestoneDescriptions = [
    Array.from(Buffer.from('Milestone 1: Figma desktop & mobile wireframes', 'utf8')),
    Array.from(Buffer.from('Milestone 2: Interactive prototype & feedback comments', 'utf8')),
    Array.from(Buffer.from('Milestone 3: Final design asset delivery', 'utf8'))
  ];

  const milestonePercentages = [
    3000n, // 30%
    4000n, // 40%
    3000n  // 30%
  ];

  tx.moveCall({
    target: `${PACKAGE_ID}::covenant::create_covenant`,
    arguments: [
      tx.pure.vector('u8', title),
      tx.pure.address(contractor),
      tx.pure.vector('vector<u8>', milestoneDescriptions),
      tx.pure.vector('u64', milestonePercentages),
      splitCoin,
      tx.pure.bool(false), // is_confidential
      tx.pure.address(activeAddress) // protocol_treasury (we receive the fee)
    ]
  });

  console.log('Submitting transaction to create covenant...');
  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: {
      showEffects: true,
      showObjectChanges: true
    }
  });

  console.log('Transaction Digest:', result.digest);
  console.log('Status:', result.effects?.status?.status);

  if (result.effects?.status?.status === 'success') {
    // Find Covenant object created
    const covenantChange = result.objectChanges?.find(
      change => change.type === 'created' && change.objectType?.includes('::covenant::Covenant')
    );
    const covenantId = covenantChange && 'objectId' in covenantChange ? (covenantChange as any).objectId : null;
    console.log('Covenant Object ID:', covenantId);

    // Save covenantId back to .env
    if (covenantId) {
      console.log('Updating .env with TEST_COVENANT_ID...');
      let envContent = fs.readFileSync('.env', 'utf8');
      if (envContent.includes('TEST_COVENANT_ID=')) {
        envContent = envContent.replace(/TEST_COVENANT_ID=[^\r\n]*/g, `TEST_COVENANT_ID=${covenantId}`);
      } else {
        envContent += `\nTEST_COVENANT_ID=${covenantId}\n`;
      }
      
      // Also add TEST_CLIENT_ADDR and TEST_CONTRACTOR_ADDR
      if (!envContent.includes('TEST_CLIENT_ADDR=')) {
        envContent += `TEST_CLIENT_ADDR=${activeAddress}\n`;
      }
      if (!envContent.includes('TEST_CONTRACTOR_ADDR=')) {
        envContent += `TEST_CONTRACTOR_ADDR=${contractor}\n`;
      }

      fs.writeFileSync('.env', envContent, 'utf8');
      console.log('.env updated successfully.');
    }
  } else {
    console.error('Error:', result.effects?.status?.error);
  }
}

main().catch(console.error);
