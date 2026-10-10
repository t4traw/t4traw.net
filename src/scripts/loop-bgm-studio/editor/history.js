/* 過去の曲：新規作成などで手放す前の曲を、このブラウザの IndexedDB に残しておく */
const DB = 'loop-bgm-editor', STORE = 'history', MAX = 100;

let dbp = null;
function open() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => { dbp = null; rej(rq.error); };
  });
  return dbp;
}
function done(tx) {
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error); });
}

/* 新しい順。中身（json）も入っている */
export async function list() {
  const db = await open();
  const rq = db.transaction(STORE).objectStore(STORE).getAll();
  const all = await new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

/* 同じ中身がもう残っていれば足さない。足したら true */
export async function add(entry) {
  const all = await list();
  if (all.some(e => e.json === entry.json)) return false;
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite'), os = tx.objectStore(STORE);
  os.add(Object.assign({ savedAt: Date.now() }, entry));
  // 古いものから捨てて、MAX 曲までにしておく
  for (const e of all.slice(MAX - 1)) os.delete(e.id);
  await done(tx);
  return true;
}

export async function remove(id) {
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  await done(tx);
}
