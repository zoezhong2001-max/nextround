import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import {
  readRebuild,
  editRebuild,
  migrateWorkbench,
} from "../server/rebuild-edits.mjs";

test("人工修改持久化、保留历史；拒绝过期保存和原文改写；重新生成资料不覆盖人工修改", () => {
  const dir = mkdtempSync(join(tmpdir(), "rebuild-edit-test-"));
  mkdirSync(join(dir, "rebuild-2026-10"));
  const path = join(dir, "rebuild-2026-10/dossier.json");
  const base = {
    profile: [{ label: "姓名", value: "原名" }],
    fullReviews: [
      {
        sessionId: "session",
        questions: [
          {
            id: "q",
            question: { text: "原问" },
            answer: { text: "原答" },
            diagnosis: "初稿",
          },
        ],
      },
    ],
  };
  writeFileSync(path, JSON.stringify(base));
  let store = new Store(dir);
  try {
    const initial = readRebuild(store);
    const ref = { kind: "profile", id: "姓名" };
    const saved = editRebuild(store, {
      ref,
      revision: initial.editRevision,
      changes: { value: "新名" },
    });
    assert.equal(saved.profile[0].value, "新名");
    assert.equal(saved.editHistory[0].before.value, "原名");
    assert.throws(
      () =>
        editRebuild(store, {
          ref,
          revision: initial.editRevision,
          changes: { value: "过期" },
        }),
      { status: 409 },
    );
    assert.throws(() =>
      editRebuild(store, {
        ref: { kind: "question", id: "q", parent: "session" },
        revision: saved.editRevision,
        changes: { answer: "篡改" },
      }),
    );
    assert.equal(readRebuild(store).editHistory.length, 1);
    base.profile[0].value = "重新提取";
    writeFileSync(path, JSON.stringify(base));
    store.close();
    store = new Store(dir);
    assert.equal(readRebuild(store).profile[0].value, "新名");
    assert.equal(
      readRebuild(store).fullReviews[0].questions[0].answer.text,
      "原答",
    );
    const corrected = editRebuild(store, {
      ref: { kind: "question", id: "q", parent: "session" },
      revision: readRebuild(store).editRevision,
      changes: { correction: "用户补充" },
    });
    assert.equal(corrected.fullReviews[0].questions[0].correction, "用户补充");
    const migrated = migrateWorkbench(store);
    assert.equal(migrated.profile[0].value, "新名");
    assert.equal(migrated.fullReviews[0].questions[0].correction, "用户补充");
    assert.deepEqual(migrated.editHistory, corrected.editHistory);
    base.profile[0].value = "旧预览不得覆盖正式资料";
    writeFileSync(path, JSON.stringify(base));
    assert.equal(readRebuild(store).profile[0].value, "新名");
    assert.equal(
      migrateWorkbench(store).editRevision,
      readRebuild(store).editRevision,
    );
    const edited = editRebuild(store, {
      ref,
      revision: readRebuild(store).editRevision,
      changes: { value: "正式修改" },
    });
    assert.equal(edited.profile[0].value, "正式修改");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
