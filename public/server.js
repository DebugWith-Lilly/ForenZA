
import express from "express";
import cors from "cors";
import multer from "multer";
import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Local Whisper Python environment
const pythonExecutable = path.join(
    __dirname,
    "whisper-env",
    "bin",
    "python"
);

const whisperScript = path.join(
    __dirname,
    "whisper_transcribe.py"
);

app.use(cors({
    origin: [
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:5501",
        "http://localhost:5501"
    ]
}));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 24 * 1024 * 1024
    }
});

app.get("/", (req, res) => {
    res.json({
        message: "FORENZA local transcription server is running."
    });
});

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    let temporaryFolder;

    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No audio file was received."
            });
        }

        const allowedTypes = [
            "audio/mpeg",
            "audio/mp3",
            "audio/mp4",
            "audio/wav",
            "audio/x-wav",
            "audio/webm",
            "audio/ogg",
            "audio/flac",
            "audio/mpga",
            "audio/x-m4a"
        ];

        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({
                error: "Unsupported audio format."
            });
        }

        temporaryFolder = await fs.mkdtemp(
            path.join(os.tmpdir(), "forenza-")
        );

        const extension =
            path.extname(req.file.originalname) || ".webm";

        const audioPath = path.join(
            temporaryFolder,
            `recording${extension}`
        );

        await fs.writeFile(audioPath, req.file.buffer);

        console.log("FORENZA: Starting LOCAL Whisper transcription...");

        const transcript = await new Promise((resolve, reject) => {
            const python = spawn(
                pythonExecutable,
                [whisperScript, audioPath]
            );

            let output = "";
            let errors = "";

            python.stdout.on("data", data => {
                output += data.toString();
            });

            python.stderr.on("data", data => {
                errors += data.toString();
            });

            python.on("error", reject);

            python.on("close", code => {
                if (code !== 0) {
                    console.error("Local Whisper error:", errors);

                    reject(
                        new Error("Local Whisper transcription failed.")
                    );
                    return;
                }

                resolve(output.trim());
            });
        });

        console.log("FORENZA: Local transcription completed.");

        return res.json({
            success: true,
            transcript
        });

    } catch (error) {
        console.error("FORENZA transcription error:", error);

        return res.status(500).json({
            error: "Local transcription failed. Check the server terminal."
        });

    } finally {
        if (temporaryFolder) {
            await fs.rm(temporaryFolder, {
                recursive: true,
                force: true
            }).catch(console.error);
        }
    }
});

app.listen(PORT, () => {
    console.log(`FORENZA local server running at http://localhost:${PORT}`);
});
