/* 過去の曲：編集中の曲を、このブラウザの IndexedDB に1曲1件で残し続ける。
   取り消しの履歴も曲ごとに残すので、ページを閉じても開き直した曲で ⌘Z が効く */
const DB = 'loop-bgm-editor', SONGS = 'history', UNDO = 'undo';
const MAX = 100;        // 残す曲の数
const UNDO_KEEP = 10;   // 取り消しの履歴まで残すのは、新しい順にこの曲数まで（容量が大きいため）

let dbp = null;
function open() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 2);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(SONGS)) db.createObjectStore(SONGS, { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains(UNDO)) db.createObjectStore(UNDO);
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => { dbp = null; rej(rq.error); };
  });
  return dbp;
}
const req = rq => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
const done = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error); });

/* 新しい順。中身（json）も入っている */
export async function list() {
  const db = await open();
  const all = await req(db.transaction(SONGS).objectStore(SONGS).getAll());
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

/* 曲を残す（同じ id なら上書き）。undo を渡せば取り消しの履歴も残す */
export async function put(entry, undo) {
  const db = await open();
  const tx = db.transaction([SONGS, UNDO], 'readwrite'), os = tx.objectStore(SONGS), us = tx.objectStore(UNDO);
  const fresh = !(await req(os.getKey(entry.id)));
  os.put(Object.assign({}, entry, { savedAt: Date.now() }));
  if (undo) us.put(undo, entry.id);
  // 曲がふえたときだけ、古いものを捨てる
  if (fresh) {
    const all = (await req(os.getAll())).sort((a, b) => b.savedAt - a.savedAt);
    all.forEach((e, i) => {
      if (i >= MAX) os.delete(e.id);
      if (i >= UNDO_KEEP) us.delete(e.id);
    });
  }
  await done(tx);
}

export async function getUndo(id) {
  const db = await open();
  return (await req(db.transaction(UNDO).objectStore(UNDO).get(id))) || null;
}

export async function remove(id) {
  const db = await open();
  const tx = db.transaction([SONGS, UNDO], 'readwrite');
  tx.objectStore(SONGS).delete(id);
  tx.objectStore(UNDO).delete(id);
  await done(tx);
}
