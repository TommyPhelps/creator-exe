//! SQLite access for CREATOR.EXE.
//!
//! The database lives in the user's app-data folder and is owned by a single
//! connection guarded by a mutex. The frontend owns the schema and runs its
//! versioned migrations through `batch`, which executes inside one
//! transaction so a failed migration or restore never leaves the database
//! half-written.

use base64::Engine;
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
    pub path: Option<PathBuf>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    pub rows_affected: u64,
    pub last_insert_id: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Statement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Value>,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn configure(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
    .map_err(err)?;
    // WAL is not available for in-memory databases; ignore its result there.
    let _ = conn.query_row("PRAGMA journal_mode = WAL", [], |_| Ok(()));
    Ok(())
}

/// Converts a JSON parameter into a SQLite value. Booleans become 0/1,
/// arrays and objects are stored as JSON text.
pub fn to_sql(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(if *b { 1 } else { 0 }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else {
                SqlValue::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

/// Converts a SQLite column value into JSON. Blobs are base64 encoded.
pub fn from_sql(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => serde_json::Number::from_f64(f)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => {
            Value::String(base64::engine::general_purpose::STANDARD.encode(b))
        }
    }
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(err)?;
        configure(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            path: Some(path.to_path_buf()),
        })
    }

    pub fn open_in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(err)?;
        configure(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            path: None,
        })
    }

    pub fn execute(&self, sql: &str, params: &[Value]) -> Result<ExecResult, String> {
        let conn = self.conn.lock().map_err(err)?;
        let mut stmt = conn.prepare(sql).map_err(err)?;
        let rows = stmt
            .execute(params_from_iter(params.iter().map(to_sql)))
            .map_err(err)?;
        Ok(ExecResult {
            rows_affected: rows as u64,
            last_insert_id: conn.last_insert_rowid(),
        })
    }

    pub fn select(&self, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
        let conn = self.conn.lock().map_err(err)?;
        let mut stmt = conn.prepare(sql).map_err(err)?;
        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let mut rows = stmt
            .query(params_from_iter(params.iter().map(to_sql)))
            .map_err(err)?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(err)? {
            let mut m = Map::new();
            for (i, name) in names.iter().enumerate() {
                let v = row.get_ref(i).map_err(err)?;
                m.insert(name.clone(), from_sql(v));
            }
            out.push(m);
        }
        Ok(out)
    }

    /// Runs every statement inside a single transaction. Either all succeed
    /// or none are applied.
    pub fn batch(&self, statements: &[Statement]) -> Result<u64, String> {
        let mut conn = self.conn.lock().map_err(err)?;
        let tx = conn.transaction().map_err(err)?;
        let mut total: u64 = 0;
        for (index, s) in statements.iter().enumerate() {
            let n = tx
                .execute(&s.sql, params_from_iter(s.params.iter().map(to_sql)))
                .map_err(|e| format!("statement {} failed: {}", index + 1, e))?;
            total += n as u64;
        }
        tx.commit().map_err(err)?;
        Ok(total)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn st(sql: &str, params: Vec<Value>) -> Statement {
        Statement {
            sql: sql.to_string(),
            params,
        }
    }

    #[test]
    fn round_trips_values() {
        let db = Database::open_in_memory().unwrap();
        db.execute(
            "CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER, r REAL, b INTEGER, j TEXT, z TEXT)",
            &[],
        )
        .unwrap();
        let res = db
            .execute(
                "INSERT INTO t VALUES (?, ?, ?, ?, ?, ?)",
                &[
                    json!("a"),
                    json!(42),
                    json!(1.5),
                    json!(true),
                    json!({"k": [1, 2]}),
                    Value::Null,
                ],
            )
            .unwrap();
        assert_eq!(res.rows_affected, 1);
        let rows = db.select("SELECT * FROM t", &[]).unwrap();
        assert_eq!(rows.len(), 1);
        let r = &rows[0];
        assert_eq!(r["id"], json!("a"));
        assert_eq!(r["n"], json!(42));
        assert_eq!(r["r"], json!(1.5));
        assert_eq!(r["b"], json!(1));
        assert_eq!(r["j"], json!("{\"k\":[1,2]}"));
        assert_eq!(r["z"], Value::Null);
    }

    #[test]
    fn batch_is_atomic() {
        let db = Database::open_in_memory().unwrap();
        db.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)", &[]).unwrap();
        let result = db.batch(&[
            st("INSERT INTO t (id) VALUES (?)", vec![json!(1)]),
            st("INSERT INTO t (id) VALUES (?)", vec![json!(1)]),
        ]);
        assert!(result.is_err(), "duplicate key must fail");
        let rows = db.select("SELECT COUNT(*) AS c FROM t", &[]).unwrap();
        assert_eq!(rows[0]["c"], json!(0), "first insert must be rolled back");

        let ok = db
            .batch(&[
                st("INSERT INTO t (id) VALUES (?)", vec![json!(1)]),
                st("INSERT INTO t (id) VALUES (?)", vec![json!(2)]),
            ])
            .unwrap();
        assert_eq!(ok, 2);
    }

    #[test]
    fn reports_sql_errors() {
        let db = Database::open_in_memory().unwrap();
        let e = db.select("SELECT * FROM missing_table", &[]).unwrap_err();
        assert!(e.contains("missing_table"));
    }

    #[test]
    fn persists_to_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creator.db");
        {
            let db = Database::open(&path).unwrap();
            db.execute("CREATE TABLE t (v TEXT)", &[]).unwrap();
            db.execute("INSERT INTO t VALUES (?)", &[json!("kept")]).unwrap();
        }
        let db = Database::open(&path).unwrap();
        let rows = db.select("SELECT v FROM t", &[]).unwrap();
        assert_eq!(rows[0]["v"], json!("kept"));
    }
}
