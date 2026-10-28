// What the designer page needs from the server: the public catalog and settings,
// the earliest ready dates, and the spam-check key.
import 'server-only';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { countActiveOrders } from '@/lib/db/orders';
import { earliestReadyDate, localToday, refundPolicy } from '@/lib/order/rules';
import { env } from '@/lib/server/env';
import { publicCatalog, publicSettings } from '@/lib/server/public-catalog';

export async function designerData() {
  const [catalog, settings] = await Promise.all([loadCatalog({ enabledOnly: true }), loadSettings()]);
  const db = getDb();
  const active = db ? await countActiveOrders(db).catch(() => 0) : 0;
  const today = localToday(settings);
  return {
    catalog: publicCatalog(catalog),
    settings: publicSettings(settings),
    fullSettings: settings,
    earliest: { standard: earliestReadyDate(settings, today, false, active), rush: earliestReadyDate(settings, today, true, active) },
    turnstileSiteKey: settings.spam.turnstile ? env.turnstileSiteKey() : null,
    refundPolicy: refundPolicy(settings),
  };
}
