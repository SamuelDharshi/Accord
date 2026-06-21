import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import dotenv from 'dotenv';

dotenv.config();

const SUI_RPC_URL = process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
const PACKAGE_ID = process.env.ACCORD_PACKAGE_ID || '0x832f93729a8b1dfe9dd8067536dfa35231cf019f9401afe04a398df6d18c54cb';
const ARCA_PRIVATE_KEY = process.env.ARCA_PRIVATE_KEY;

async function main() {
  if (!ARCA_PRIVATE_KEY) {
    console.error('ARCA_PRIVATE_KEY is not set');
    return;
  }

  const client = new SuiClient({ url: SUI_RPC_URL });
  const decoded = decodeSuiPrivateKey(ARCA_PRIVATE_KEY);
  const keypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
  const activeAddress = keypair.getPublicKey().toSuiAddress();

  console.log('Arca Address:', activeAddress);

  // Search for TreasuryCap
  const caps = await client.getOwnedObjects({
    owner: activeAddress,
    filter: { StructType: `0x2::coin::TreasuryCap<${PACKAGE_ID}::usdsui::USDSUI>` },
    options: { showContent: true }
  });

  console.log('Found Caps count:', caps.data.length);
  if (caps.data.length > 0) {
    console.log('TreasuryCap ID:', caps.data[0].data?.objectId);
  } else {
    // Search generally for any TreasuryCap
    const allCaps = await client.getOwnedObjects({
      owner: activeAddress,
      options: { showType: true }
    });
    console.log('All owned objects:');
    allCaps.data.forEach(obj => {
      console.log(`- ${obj.data?.objectId}: ${obj.data?.type}`);
    });
  }
}

main().catch(console.error);
