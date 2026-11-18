import { DatabaseSync } from 'node:sqlite';

export function createStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS inbox (
      id TEXT PRIMARY KEY, key TEXT NOT NULL, payload TEXT, at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'queued'
    );
    UPDATE inbox SET state='failed', payload=NULL WHERE state='sending';
  `);

  return {
    enqueue(id, key, payload, at = Date.now()) {
      return Boolean(db.prepare('INSERT OR IGNORE INTO inbox(id,key,payload,at) VALUES(?,?,?,?)')
        .run(id, key, JSON.stringify(payload), at).changes);
    },
    queued() {
      return db.prepare("SELECT * FROM inbox WHERE state='queued' ORDER BY rowid LIMIT 1").get();
    },
    claim(id) {
      return Boolean(db.prepare("UPDATE inbox SET state='sending' WHERE id=? AND state='queued'").run(id).changes);
    },
    finish(id, ok) {
      db.prepare('UPDATE inbox SET state=?, payload=NULL WHERE id=?').run(ok ? 'done' : 'failed', id);
    },
  };
}
