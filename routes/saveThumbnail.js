// routes/saveThumbnail.js
import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// __dirname workaround for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

router.post("/api/save-thumbnail", (req, res) => {
  const { dataUrl, filename } = req.body;

  if (!dataUrl || !filename) {
    return res.status(400).json({ error: "Missing dataUrl or filename" });
  }

  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");

  const thumbnailsDir = path.join(__dirname, "..", "public", "thumbnails");
  const filePath = path.join(thumbnailsDir, filename);

  if (!fs.existsSync(thumbnailsDir)) {
    fs.mkdirSync(thumbnailsDir, { recursive: true });
  }

  console.log("Saving to path:", filePath);
  console.log("Data size:", base64Data.length);

  fs.writeFile(filePath, base64Data, "base64", (err) => {
    if (err) {
      console.error("Error saving image:", err);
      return res.status(500).json({ error: "Failed to save image" });
    }

    console.log("✅ Image saved successfully!");

    return res
      .status(200)
      .json({ success: true, path: `/thumbnails/${filename}` });
  });
});

export default router;
