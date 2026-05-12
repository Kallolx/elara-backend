import multer from "multer";
import path from "path";
import fs from "fs";

// Storage settings for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../../uploads");
    // Ensure the folder exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate clean label: timestamp + sanitized alphanumeric file name
    const timestamp = Date.now();
    const parsed = path.parse(file.originalname);
    const sanitizedBase = parsed.name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-") // replace special chars with hyphen
      .replace(/-+/g, "-");         // remove consecutive hyphens
    
    const extension = parsed.ext.toLowerCase();
    cb(null, `${timestamp}-${sanitizedBase}${extension}`);
  },
});

// File filter to ensure images and video mime types are accepted
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = /jpeg|jpg|png|webp|gif|mp4|mov|avi|webm|quicktime/;
  const mimetype = allowedTypes.test(file.mimetype);
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error("Error: Only images and standard video files are allowed (jpg, png, mp4, webm)!"));
  }
};

// Create the Multer upload instance
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // limit files to 50MB each
});
