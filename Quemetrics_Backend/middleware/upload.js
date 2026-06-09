const multer = require("multer");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Configure local upload directory
const uploadDir = process.env.UPLOAD_DIR || "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || "";
    const sanitizedBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, "_");
    cb(null, `${sanitizedBase}_${timestamp}${ext}`);
  },
});

// Filter file types
const fileFilter = (req, file, cb) => {
  const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, GIF, and WEBP are allowed.`),
      false
    );
  }
};

// Create upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Middleware to handle upload errors - must be in correct order
const uploadErrorHandler = (err, req, res, next) => {
  console.error("Upload error:", err);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        error: "File size exceeds 5MB limit",
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        error: "Too many files uploaded",
      });
    }
  }

  if (err) {
    return res.status(400).json({
      success: false,
      error: err.message || "File upload error",
    });
  }

  next();
};

// Wrapper middleware to properly handle multer errors
const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    console.log(`[uploadSingle] Starting upload for field: ${fieldName}`);

    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        console.error(`[uploadSingle] Error uploading file:`, err);
        // Pass error to error handling middleware
        return next(err);
      }

      if (req.file) {
        console.log(`[uploadSingle] File uploaded successfully:`, {
          filename: req.file.filename,
          path: req.file.path,
          size: req.file.size,
          mimetype: req.file.mimetype
        });
      } else {
        console.log(`[uploadSingle] No file was uploaded (optional field)`);
      }

      next();
    });
  };
};

module.exports = {
  upload,
  uploadSingle,
  uploadErrorHandler,
};
