import multer from "multer";

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 16 * 1024 * 1024, // 16MB
    files: 5,
  },
});

export { upload };
