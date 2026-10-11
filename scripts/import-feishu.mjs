import { resolve } from "node:path";
import { Store } from "../server/store.mjs";
import { previewImport, commitImport } from "../server/importer.mjs";
const store = new Store(resolve(".local-data"));
try {
  if (process.argv.includes("--commit")) {
    const batchId = process.argv[process.argv.indexOf("--commit") + 1];
    store.transaction(() => commitImport(store, batchId));
    console.log(
      JSON.stringify({
        batchId,
        status: "imported",
        counts: Object.fromEntries(
          ["applications", "artifacts", "reviews", "assets"].map((c) => [
            c,
            store.list(c).length,
          ]),
        ),
      }),
    );
  } else {
    const url = process.argv.find((a) => a.startsWith("https://"));
    if (!url) throw new Error("用法：npm run import:feishu -- <飞书Hub链接>");
    const batch = await previewImport(store, resolve(".local-data"), url, {
      followLinks: !process.argv.includes("--single"),
    });
    console.log(
      JSON.stringify(
        {
          batchId: batch.id,
          documents: batch.documents.map(({ id, title, kind }) => ({
            id,
            title,
            kind,
          })),
          errors: batch.errors,
          truncated: batch.truncated,
        },
        null,
        2,
      ),
    );
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  store.close();
}
