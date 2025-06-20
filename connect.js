import sqlite3 from "sqlite3";
const sql3 = sqlite3.verbose();

const DB = new sql3.Database("./mydata.db", sqlite3.OPEN_READWRITE, connected);

function connected(err) {
  if (err) {
    console.log(err.message);
    return;
  }
  console.log("Created the DB or SQLite DB does already exist");
}

let sql = `CREATE TABLE IF NOT EXISTS plants(
  plant_id INTEGER PRIMARY KEY,
  plant_name TEXT NOT NULL,
  plant_family TEXT NOT NULL,
  plant_desc TEXT NOT NULL,
  plant_dist TEXT NOT NULL,
  plant_value TEXT NOT NULL,
  plant_history TEXT NOT NULL,
  plant_growth TEXT NOT NULL,
  plant_app TEXT NOT NULL,
  plant_model_3D TEXT NOT NULL,
  plant_preview TEXT NOT NULL
)`;
DB.run(sql, [], (err) => {
  //callback function
  if (err) {
    console.log("error creating plants table");
    return;
  }
  console.log("SUCCESS");
});

export { DB };
