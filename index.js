import { DB } from "./connect.js";
import cors from "cors";
import express, { application } from "express";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import fs from "fs";
import saveThumbnailRoute from "./routes/saveThumbnail.js";
import uploadRoute from "./routes/upload.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fetch from 'node-fetch';

const app = express();

app.use(cors());
app.use(express.static("public")); // để phục vụ file tĩnh
app.use(bodyParser.json({ limit: "10mb" }));
app.use(saveThumbnailRoute);
app.use(uploadRoute);

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  // Single hardcoded user
  const ADMIN_USER = "duc1811";
  const ADMIN_PASS = "secret123";

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    // You can use sessions or return a token
    res.status(200).json({ message: "Login success", token: "abc123" });
  } else {
    res.status(401).json({ message: "Invalid credentials" });
  }
});

// Upload setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(process.cwd(), "public", "models");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, req.body.filename || file.originalname);
  },
});

const upload = multer({ storage: storage });

app.post("/upload", upload.single("file"), (req, res) => {
  res
    .status(200)
    .json({ status: "success", path: `/models/${req.file.filename}` });
});

app.get("/", (req, res) => {
  res.status(200);
  res.send("Plant service is online");
});

app.get("/api", (req, res) => {
  res.set("content-type", "application/json");

  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const offset = (page - 1) * pageSize;
  const applications = req.query.applications ? req.query.applications.split(',') : [];
  const regions = req.query.regions ? req.query.regions.split(',') : [];
  const search = req.query.search ? req.query.search.trim() : '';

  let sql;
  let countSql;
  let params;
  let countParams;
  let whereConditions = [];
  let whereParams = [];

  if (req.query.id) {
    // If an ID is provided, fetch only that plant
    sql = "SELECT * FROM plants WHERE plant_id = ?";
    countSql = "SELECT COUNT(*) as total FROM plants WHERE plant_id = ?";
    params = [req.query.id];
    countParams = [req.query.id];
  } else {
    // Build WHERE clause for filtering
    if (applications.length > 0) {
      // Change to AND logic: each application must be present
      const appConditions = applications.map(app => {
        whereParams.push(`%${app}%`);
        return "plant_app LIKE ?";
      });
      whereConditions.push(`(${appConditions.join(" AND ")})`); // Changed from OR to AND
    }

    if (regions.length > 0) {
      // Change to AND logic: each region must be present
      const regionConditions = regions.map(region => {
        whereParams.push(`%${region}%`);
        return "plant_dist LIKE ?";
      });
      whereConditions.push(`(${regionConditions.join(" AND ")})`); // Changed from OR to AND
    }

    if (search) {
      whereParams.push(`%${search}%`, `%${search}%`);
      whereConditions.push(`(plant_name LIKE ? OR plant_family LIKE ?)`);
    }

    let whereClause = whereConditions.length > 0 
      ? "WHERE " + whereConditions.join(" AND ")
      : "";

    // Combine all parameters
    params = [...whereParams, pageSize, offset];
    countParams = [...whereParams];

    // Build final SQL queries
    sql = `SELECT * FROM plants ${whereClause} LIMIT ? OFFSET ?`;
    countSql = `SELECT COUNT(*) as total FROM plants ${whereClause}`;
  }

  try {
    // First get the total count
    DB.get(countSql, countParams, (err, countRow) => {
      if (err) throw err;

      const totalItems = countRow.total;

      // Then get the paginated data
      DB.all(sql, params, (err, rows) => {
        if (err) throw err;

        const data = {
          plants: rows.map(row => ({
            id: row.plant_id,
            name: row.plant_name,
            family: row.plant_family,
            description: row.plant_desc,
            distribution: row.plant_dist,
            value: row.plant_value,
            history: row.plant_history,
            growth: row.plant_growth,
            application: row.plant_app,
            model: row.plant_model_3D,
            preview: row.plant_preview,
          })),
          total: totalItems,
          currentPage: page,
          pageSize: pageSize,
          totalPages: Math.ceil(totalItems / pageSize)
        };

        res.json(data);
      });
    });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api", (req, res) => {
  console.log(req.body);

  res.set("content-type", "application/json");
  const sql =
    "INSERT INTO plants(plant_name, plant_family, plant_desc, plant_dist, plant_value, plant_history, plant_growth, plant_app, plant_model_3D, plant_preview) VALUES (? , ? , ? , ? , ? , ? , ? , ? , ?, ?)";
  let newId;
  try {
    DB.run(
      sql,
      [
        req.body.name,
        req.body.family,
        req.body.description,
        req.body.distribution.join(", "),
        req.body.value,
        req.body.history,
        req.body.growth,
        req.body.application.join(", "),
        req.body.model,
        req.body.preview,
      ],
      function (err) {
        if (err) throw err;
        newId = this.lastID; //provides the auto increment integer plant_id
        res.status(201);
        let data = { status: 201, message: `New plant ${newId} saved.` };
        let content = JSON.stringify(data);
        res.send(content);
      }
    );
  } catch (err) {
    console.log(err.message);
    res.status(468);
    res.send(`{"code":468, "status":"${err.message}"}`);
  }
});

const __filename = fileURLToPath(import.meta.url);


app.delete("/api", (req, res) => {
  res.set("content-type", "application/json");
  const sql =
    "SELECT plant_preview, plant_model_3D FROM plants WHERE plant_id = ?";
  const deleteSql = "DELETE FROM plants WHERE plant_id = ?";

  try {
    // First get the file paths
    DB.get(sql, [req.query.id], function (err, row) {
      if (err) throw err;

      if (!row) {
        return res.status(404).send(`{"message":"Plant not found."}`);
      }

      // Extract filenames from URLs
      const modelPath = row.plant_model_3D.split('/').pop(); // Get just the filename
      const thumbnailPath = row.plant_preview.split('/').pop(); // Get just the filename

      // Delete files first
      const filesToDelete = [
        path.join(process.cwd(), "public", "models", modelPath),
        path.join(process.cwd(), "public", "thumbnails", thumbnailPath),
      ];

      let filesDeleted = 0;
      filesToDelete.forEach((filePath) => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            filesDeleted++;
            console.log(`Deleted file: ${filePath}`);
          } else {
            console.log(`File not found: ${filePath}`);
          }
        } catch (fileErr) {
          console.error(`Error deleting file ${filePath}:`, fileErr);
        }
      });

      // Then delete from database
      DB.run(deleteSql, [req.query.id], function (err) {
        if (err) throw err;

        if (this.changes === 1) {
          res.status(200).json({
            message: `Item was removed successfully`,
            filesDeleted: filesDeleted,
            dbDeleted: true,
          });
        } else {
          res.status(200).json({
            message: "No database record deleted",
            filesDeleted: filesDeleted,
          });
        }
      });
    });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({
      code: 500,
      error: err.message,
    });
  }
});

// Get single plant by ID
app.get("/api/:id", (req, res) => {
  const sql = "SELECT * FROM plants WHERE plant_id = ?";
  
  try {
    DB.get(sql, [req.params.id], (err, row) => {
      if (err) throw err;
      
      if (!row) {
        return res.status(404).json({ error: "Plant not found" });
      }

      const plant = {
        id: row.plant_id,
        name: row.plant_name,
        family: row.plant_family,
        description: row.plant_desc,
        distribution: row.plant_dist.split(", "),
        value: row.plant_value,
        history: row.plant_history,
        growth: row.plant_growth,
        application: row.plant_app.split(", "),
        model: row.plant_model_3D,
        preview: row.plant_preview,
      };

      res.json(plant);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Update plant by ID
app.put("/api/:id", (req, res) => {
  const sql = `
    UPDATE plants 
    SET plant_name = ?,
        plant_family = ?,
        plant_desc = ?,
        plant_dist = ?,
        plant_value = ?,
        plant_history = ?,
        plant_growth = ?,
        plant_app = ?,
        plant_model_3D = ?,
        plant_preview = ?
    WHERE plant_id = ?
  `;

  try {
    const params = [
      req.body.name,
      req.body.family,
      req.body.description,
      Array.isArray(req.body.distribution) ? req.body.distribution.join(", ") : req.body.distribution,
      req.body.value,
      req.body.history,
      req.body.growth,
      Array.isArray(req.body.application) ? req.body.application.join(", ") : req.body.application,
      req.body.model,
      req.body.preview,
      req.params.id
    ];

    DB.run(sql, params, function(err) {
      if (err) throw err;

      if (this.changes === 0) {
        return res.status(404).json({ error: "Plant not found" });
      }

      res.json({ 
        message: "Plant updated successfully",
        changes: this.changes 
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// AI endpoint to process questions
app.post("/api/ask-ai", async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: "Question is required" });
  }

  try {
    // First, get relevant plants based on the question
    const searchTerms = question.toLowerCase().split(' ');
    
    // Build a query that searches across multiple columns
    const searchConditions = searchTerms.map(() => `
      (LOWER(plant_name) LIKE ? OR 
       LOWER(plant_family) LIKE ? OR 
       LOWER(plant_desc) LIKE ? OR 
       LOWER(plant_value) LIKE ? OR 
       LOWER(plant_history) LIKE ? OR 
       LOWER(plant_growth) LIKE ? OR 
       LOWER(plant_app) LIKE ?)
    `).join(' AND ');

    const searchParams = searchTerms.flatMap(term => 
      Array(7).fill(`%${term}%`)
    );

    const sql = `SELECT * FROM plants WHERE ${searchConditions} LIMIT 5`;

    DB.all(sql, searchParams, (err, plants) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: "Failed to search plants" });
      }

      if (!plants.length) {
        return res.json({
          answer: "I couldn't find any plants matching your question. Could you try rephrasing it or asking about something else?"
        });
      }

      // Generate a response based on the question type and found plants
      let answer = '';
      const questionLower = question.toLowerCase();

      if (questionLower.includes('where') || questionLower.includes('grow') || questionLower.includes('found')) {
        // Distribution question
        answer = `Based on our database, ${plants.map(p => p.plant_name).join(', ')} can be found in ${plants.map(p => p.plant_dist).join(', ')}.`;
      }
      else if (questionLower.includes('use') || questionLower.includes('application') || questionLower.includes('used for')) {
        // Usage question
        answer = `${plants.map(p => p.plant_name).join(', ')} ${plants.length > 1 ? 'are' : 'is'} commonly used for ${plants.map(p => p.plant_app).join(', ')}.`;
      }
      else if (questionLower.includes('history') || questionLower.includes('origin')) {
        // History question
        answer = plants.map(p => `${p.plant_name}: ${p.plant_history}`).join('\n\n');
      }
      else if (questionLower.includes('grow') || questionLower.includes('care')) {
        // Growth/care question
        answer = plants.map(p => `To grow ${p.plant_name}: ${p.plant_growth}`).join('\n\n');
      }
      else if (questionLower.includes('value') || questionLower.includes('benefit')) {
        // Value/benefit question
        answer = plants.map(p => `${p.plant_name} has the following values: ${p.plant_value}`).join('\n\n');
      }
      else {
        // General description
        answer = plants.map(p => `${p.plant_name} (${p.plant_family}): ${p.plant_desc}`).join('\n\n');
      }

      res.json({ answer });
    });
  } catch (error) {
    console.error('AI processing error:', error);
    res.status(500).json({ 
      error: "Failed to process question",
      details: error.message 
    });
  }
});

// OpenAI Chat Proxy Endpoint
app.post('/api/openai-chat', async (req, res) => {
  const { question, plant } = req.body;
  if (!question || !plant) {
    return res.status(400).json({ error: 'Missing question or plant metadata.' });
  }

  // Compose a prompt with plant metadata
  const plantInfo = `Plant Name: ${plant.name}\nFamily: ${plant.family}\nDescription: ${plant.description}\nApplication: ${plant.application}\nValue: ${plant.value}\nHistory: ${plant.history}\nGrowth: ${plant.growth}\nDistribution: ${plant.distribution}`;
  const prompt = `You are a helpful plant assistant. Use the following plant information to answer the user's question as accurately as possible.\n\n${plantInfo}\n\nUser question: ${question}`;

  try {
    const openaiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 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',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat-v3-0324:free',
        messages: [
          { role: 'system', content: 'You are a helpful plant assistant.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const error = await openaiRes.text();
      return res.status(500).json({ error: 'OpenAI API error', details: error });
    }

    const data = await openaiRes.json();
    const answer = data.choices?.[0]?.message?.content || 'No answer generated.';
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: 'Failed to contact OpenAI', details: err.message });
  }
});

app.listen(3000, (err) => {
  if (err) {
    console.log("ERROR:", err.message);
  }
  console.log("LISTENING on port 3000");
});
