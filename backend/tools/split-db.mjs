#!/usr/bin/env node
/**
 * One-time, idempotent, COPY-ONLY database split (docs/MICROSERVICES.md section 6).
 *
 * Copies each service's collections out of the monolith's database (default `bhakti`) into that service's own
 * database on the same cluster. It never deletes or modifies anything in the source, so rollback is "point the
 * monolith back" (unset ENGAGEMENT_URL).
 *
 *   node tools/split-db.mjs --source mongodb://host/bhakti [--target mongodb://host] [--service engagement|identity|catalog|wallet|orders|calls]
 *                           [--dry-run] [--overwrite]
 *
 *   --source     monolith database URI (db name from the path). Env: SOURCE_MONGODB_URI.
 *   --target     cluster for the service databases (path ignored; each service uses its own database).
 *                Default: the source's cluster. Env: TARGET_MONGODB_URI.
 *   --service    only this service (repeatable). Default: every service in MANIFEST.
 *   --dry-run    read and count only; write nothing.
 *   --overwrite  also replace documents that already exist in the target (by _id). Default is insert-only, so
 *                re-running AFTER a service has taken writes never clobbers them with older source data.
 *
 * Idempotent: documents are matched by `_id`; running twice inserts nothing the second time.
 * Identity: after the copy the identity service's own seed only ADDS (default policy, first admin when there is no operator),
 * so copy before first starting it against a production source; a fresh seeded policy would otherwise have its own _id.
 * Catalog: copies the GridFS bucket too (`media.files` + `media.chunks`, ids unchanged, so every stored `/uploads/<id>.<ext>` keeps
 * resolving); the catalog service creates the GridFS indexes itself on boot. Copy BEFORE its first start on real data (its seeds only fill EMPTY
 * collections, so a copy afterwards is merged insert-only, but the seeded defaults would then sit beside your rows).
 * Wallet: copies wallets, the ledger (wallettxns), coin packs and coin orders as they are. Copy BEFORE its first start on real data (its seed only fills an EMPTY
 * packs collection). A pending ledger row is copied as pending; the wallet service's reconciler finishes it exactly once (the idempotent `settle`).
 * Orders: copies bookings, chadhavaorders, poojareviews and the money saga's intents. The monolith kept those intents in `walletintents`
 * (it also holds the CALL refunds, which the calls entry below copies); the orders service keeps its own in `orderintents`, so the copy is a RENAME with a FILTER: only the
 * booking / chadhava debit intents and the booking / chadhava refund intents cross over, field order and `_id` intact, unfinished (`pending`) ones included -
 * the orders service's sweeper resolves them against the wallet after it starts, exactly as the monolith's would have. Copy BEFORE the orders service's first
 * start on real data (it has no seed, so this is about ordering, not collisions), and before ORDERS_URL is set on the monolith: from then on the monolith's
 * sweeper ignores those rows.
 * Calls: copies astrologers, callsessions, astrologerearnings and payouts as they are, and the CALL refunds out of `walletintents` as `callintents` (the
 * mirror of the orders entry: a FILTER on kind `refund` / refType `call`, field order and `_id` intact, unfinished (`pending`) ones included - the calls
 * service's sweeper resolves them against the wallet after it starts; a goodwill refund the monolith queued crosses with its operator reason and is re-sent
 * under its OWN key). Copy BEFORE the calls service's first start on real data (it has no seed, so this is about ordering) and BEFORE CALLS_URL is set on
 * the monolith and on identity: from then on the monolith's billing ticker and sweeper no longer run. A call that is LIVE at the cut-over would be billed by neither
 * side, so cut over when none is: switch the kill switch off (`callsEnabled` = false: no new call), wait until the dashboard's call log shows no live call (or
 * force-end them), copy, start the service, set CALLS_URL, switch calls back on.
 * Indexes are not copied: each service creates its own on boot (mongoose `init`).
 * This tool reads no .env file; pass URIs explicitly.
 */
import { pathToFileURL } from 'node:url';

import mongoose from 'mongoose';

/** service -> collections it owns (real mongoose collection names, from the models' pluralisation). */
export const MANIFEST = {
  // pooja-api: Flag, Setting, Announcement, Visitor, Event
  engagement: ['flags', 'settings', 'announcements', 'visitors', 'events'],
  // pooja-api: User, Operator, AuditLog, Policy. There is no separate acceptances collection: a devotee's accepted policy
  // versions are the `acceptedPolicies` map on their `users` document, so they travel with it.
  identity: ['users', 'operators', 'auditlogs', 'policies'],
  // pooja-api: Deity, Temple, Aarti, Festival, Seva, Knowledge, Faq, HeroSlide, Reminder, Tone, WallpaperStyle, Horoscope, Panchang,
  // HomeSection, Pooja, Offering, ChadhavaCategory, ChadhavaListing, LiveStream, LiveCategory, LiveJaiLast, LiveJaiCount, plus the GridFS
  // bucket `media` (its `.files` and `.chunks` collections - the uploaded bytes behind every /uploads/<id>.<ext> URL). NOT the `settings`
  // collection (engagement's) and NOT bookings / poojareviews / chadhavaorders (orders', phase 5).
  catalog: [
    'deities', 'temples', 'aartis', 'festivals', 'sevas', 'knowledges', 'faqs', 'heroslides', 'reminders', 'tones', 'wallpaperstyles',
    'horoscopes', 'panchangs', 'homesections', 'poojas', 'offerings', 'chadhavacategories', 'chadhavalistings',
    'livestreams', 'livecategories', 'livejailasts', 'livejaicounts', 'media.files', 'media.chunks',
    // Home layout v2 is catalog-only (the monolith has no such collections, so the copy is empty); listed so the manifest names every model.
    'homelayoutdrafts', 'homelayoutversions',
    // The nearby-temples cache (OpenStreetMap answers); catalog-only, so the copy is empty. Listed so the manifest names every model.
    'placecaches',
  ],
  // pooja-api: Wallet, WalletTxn, CoinPack, CoinOrder (modules/wallet, modules/coins). The service keeps the very same collections, so the copy is
  // 1:1: balances, the append-only ledger (idempotency keys included - they are what keeps a retry from moving money twice), the packs and the orders
  // (with their Razorpay ids, which the webhook looks orders up by). NOT `settings` (engagement's: the coin rate and billing rules).
  // Copy BEFORE the wallet service's first start on real data: its seed only fills an EMPTY coinpacks collection, so a copy afterwards is merged
  // insert-only, but the seeded starter packs would then sit beside your own. Run `verifyWallet(uid)` (wallet.service) on a sample afterwards.
  wallet: ['wallets', 'wallettxns', 'coinpacks', 'coinorders'],
  // pooja-api: Booking (`bookings`), ChadhavaOrder (`chadhavaorders`), PoojaReview (`poojareviews`) - 1:1 - and the saga's WalletIntent (`walletintents`), which
  // becomes the orders service's OrderIntent (`orderintents`). Only the intents of the moving orders cross: kind booking / chadhava (the debits) and kind
  // refund whose refType is booking / chadhava (their refunds). The call refunds the monolith keeps queueing in `walletintents` are the calls service's (phase 6, below).
  orders: [
    'bookings', 'chadhavaorders', 'poojareviews',
    { from: 'walletintents', to: 'orderintents', filter: { $or: [{ kind: { $in: ['booking', 'chadhava'] } }, { kind: 'refund', refType: { $in: ['booking', 'chadhava'] } }] } },
  ],
  // pooja-api: Astrologer (`astrologers`), CallSession (`callsessions`), AstrologerEarning (`astrologerearnings`), Payout (`payouts`) - 1:1 - and the saga's WalletIntent
  // (`walletintents`), which becomes the calls service's CallIntent (`callintents`). Only the CALL refunds cross: kind `refund` with refType `call` (the connect-failure
  // refunds `call:<id>:refund:<n>` and the operator's goodwill refunds `call:<id>:goodwill:<rid>`). The booking / chadhava intents are the orders service's. A call's
  // per-minute debits have no intent (the call row's `nextBillAt` and the key `call:<id>:min:<n>` are the durable note). NOT `settings` (engagement's) and NOT the
  // devotee's `users` row (identity's: the astrologer role on it is re-derived at the next sign-in).
  calls: [
    'astrologers', 'callsessions', 'astrologerearnings', 'payouts',
    { from: 'walletintents', to: 'callintents', filter: { kind: 'refund', refType: 'call' } },
  ],
};

/** A manifest entry is a collection name (copied 1:1) or `{ from, to, filter }` (renamed and/or filtered). */
export const entryOf = (item) => (typeof item === 'string' ? { from: item, to: item, filter: {} } : { filter: {}, ...item });

const BATCH = 500;
/** GridFS chunks are ~255 KB each: a 500-document batch would hold ~125 MB. */
const batchFor = (name) => (name.endsWith('.chunks') ? 20 : BATCH);

const dbNameOf = (uri) => decodeURIComponent(new URL(uri).pathname.replace(/^\//, '')) || null;
const hostOf = (uri) => new URL(uri).host;

/**
 * @param {object} o
 * @param {string} o.sourceUri
 * @param {string} [o.targetUri]
 * @param {string[]} [o.services]
 * @param {boolean} [o.dryRun]
 * @param {boolean} [o.overwrite]
 * @param {(line: string) => void} [o.log]
 * @returns {Promise<Array<{service, collection, source, targetBefore, inserted, replaced, targetAfter}>>}
 */
export async function splitDb({ sourceUri, targetUri, services = Object.keys(MANIFEST), dryRun = false, overwrite = false, log = console.log, manifest = MANIFEST }) {
  const sourceDbName = dbNameOf(sourceUri);
  if (!sourceDbName) throw new Error('The source URI must name the monolith database, e.g. mongodb://host/bhakti');
  const targetCluster = targetUri || sourceUri;
  for (const s of services) if (!manifest[s]) throw new Error(`Unknown service "${s}". Known: ${Object.keys(manifest).join(', ')}`);
  for (const s of services) {
    if (hostOf(targetCluster) === hostOf(sourceUri) && s === sourceDbName) {
      throw new Error(`Refusing: target database "${s}" is the source database on the same host.`);
    }
  }

  const src = await mongoose.createConnection(sourceUri, { serverSelectionTimeoutMS: 10_000 }).asPromise();
  const tgtConn = hostOf(targetCluster) === hostOf(sourceUri) && !targetUri ? src : await mongoose.createConnection(targetCluster, { serverSelectionTimeoutMS: 10_000 }).asPromise();
  const rows = [];
  try {
    const have = new Set((await src.useDb(sourceDbName).db.listCollections().toArray()).map((c) => c.name));
    log(`${dryRun ? '[dry-run] ' : ''}source ${sourceDbName}@${hostOf(sourceUri)} -> ${hostOf(targetCluster)}${overwrite ? ' (overwrite)' : ' (insert-only)'}`);
    for (const service of services) {
      const target = tgtConn.useDb(service, { useCache: false }).db;
      for (const item of manifest[service]) {
        const { from: fromName, to: name, filter } = entryOf(item);
        const row = { service, collection: name, ...(fromName !== name ? { from: fromName } : {}), source: 0, targetBefore: 0, inserted: 0, replaced: 0, targetAfter: 0 };
        const from = src.useDb(sourceDbName, { useCache: true }).db.collection(fromName);
        const to = target.collection(name);
        row.source = have.has(fromName) ? await from.countDocuments(filter) : 0;
        row.targetBefore = await to.countDocuments();
        if (!dryRun && row.source) {
          const cursor = from.find(filter);
          let batch = [];
          const flush = async () => {
            if (!batch.length) return;
            if (overwrite) {
              // replaceOne + upsert stores the document exactly as it is (field order included).
              const res = await to.bulkWrite(batch.map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } })), { ordered: false });
              row.inserted += res.upsertedCount;
              row.replaced += res.modifiedCount;
            } else {
              // Insert-only: find what is missing and insertMany it. NOT `updateOne {$setOnInsert: doc} upsert`, which makes MongoDB store the
              // fields in alphabetical order - and field order is the key order of every API response served from the copy.
              const present = new Set((await to.find({ _id: { $in: batch.map((d) => d._id) } }, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id)));
              const fresh = batch.filter((d) => !present.has(String(d._id)));
              if (fresh.length) {
                try {
                  row.inserted += (await to.insertMany(fresh, { ordered: false })).insertedCount;
                } catch (e) {
                  if (e?.code !== 11000 && !e?.writeErrors) throw e; // a concurrent copy won the race for some ids: the rest still went in
                  row.inserted += e.insertedCount ?? e.result?.insertedCount ?? 0;
                }
              }
            }
            batch = [];
          };
          for await (const doc of cursor) {
            batch.push(doc);
            if (batch.length >= batchFor(name)) await flush();
          }
          await flush();
        }
        row.targetAfter = dryRun ? row.targetBefore : await to.countDocuments();
        rows.push(row);
        log(`  ${service}.${name}${fromName !== name ? ` (from ${fromName})` : ''}`.padEnd(46) + `source=${row.source}  target before=${row.targetBefore}  inserted=${row.inserted}  replaced=${row.replaced}  target after=${row.targetAfter}${dryRun ? '  (nothing written)' : ''}`);
      }
    }
  } finally {
    if (tgtConn !== src) await tgtConn.close();
    await src.close();
  }
  return rows;
}

function parseArgs(argv, env) {
  const o = { sourceUri: env.SOURCE_MONGODB_URI, targetUri: env.TARGET_MONGODB_URI, services: [], dryRun: false, overwrite: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') o.sourceUri = argv[++i];
    else if (a === '--target') o.targetUri = argv[++i];
    else if (a === '--service') o.services.push(argv[++i]);
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--overwrite') o.overwrite = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`Unknown argument ${a}`);
  }
  if (!o.services.length) o.services = Object.keys(MANIFEST);
  return o;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const o = parseArgs(process.argv.slice(2), process.env);
    if (o.help || !o.sourceUri) {
      console.log('usage: node tools/split-db.mjs --source <monolith mongodb uri incl. db name> [--target <cluster uri>] [--service engagement|identity|catalog|wallet|orders|calls] [--dry-run] [--overwrite]');
      process.exit(o.help ? 0 : 2);
    }
    await splitDb(o);
  } catch (e) {
    console.error(`split-db: ${e.message}`);
    process.exit(1);
  }
}
