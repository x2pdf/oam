import { deserializeMessage } from '../oamp/protocol';
import { payloadDecode, ContentItem } from '../mypayload';
import { CryptoScheme, MessageType } from '../oamp/types';
import { isOAMP } from '../utils/oampHelper';
import { InputDataItem } from '../types';
import { isDisplayableItems, OampFilterResult, PipelineContext } from './types';

/**
 * OAMP filter:
 * - header deserialize fail → miss (coincidental prefix)
 * - crypto NONE + payload fail → miss (fall through UTF-8)
 * - crypto encrypted + any fail → OAMP_ENCRYPTED
 * - displayable payload → OAMP
 */
export async function tryOampFilter(
  item: InputDataItem,
  ctx: PipelineContext
): Promise<OampFilterResult> {
  try {
    if (!isOAMP(item.rawInput)) return { kind: 'miss' };

    const sender = item.from || item.address || '';
    const recipient = item.to || '';
    const chainId = item.chainId != null ? BigInt(item.chainId) : undefined;
    const msg = deserializeMessage(item.rawInput!, sender, recipient, chainId, item.txNonce);
    if (!msg) return { kind: 'miss' };

    if (msg.crypto === CryptoScheme.NONE) {
      const items = decodePayloadSafe(msg.payload);
      if (isDisplayableItems(items)) return { kind: 'OAMP', items };
      return { kind: 'miss' };
    }

    try {
      if (!ctx.client) return { kind: 'OAMP_ENCRYPTED' };

      const from = (item.from || '').toLowerCase();
      const to = (item.to || '').toLowerCase();
      const userAddr = (ctx.userAddress || '').toLowerCase();
      const canTryPersonal =
        msg.type === MessageType.PERSONAL &&
        !!userAddr &&
        from === to &&
        from === userAddr;

      // P2P still needs a recovered sender public key; without it this is encrypted-unreadable.
      if (canTryPersonal) {
        const decrypted = await ctx.client.decryptMessage(msg);
        if (decrypted && isDisplayableItems(decrypted.items)) {
          return { kind: 'OAMP', items: decrypted.items };
        }
      }

      return { kind: 'OAMP_ENCRYPTED' };
    } catch (e) {
      console.warn('OAMP decrypt failed for item:', item.id, e);
      return { kind: 'OAMP_ENCRYPTED' };
    }
  } catch (e) {
    console.warn('OAMP filter failed for item:', item.id, e);
    return { kind: 'miss' };
  }
}

function decodePayloadSafe(payload: Uint8Array): ContentItem[] {
  try {
    return payloadDecode(payload);
  } catch (e) {
    console.warn('OAMP payload decode failed:', e);
    return [];
  }
}
