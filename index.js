import express from 'express';
// import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import authController from "./controller/authController.js";
// import dotenv from "dotenv";
dotenv.config();



const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection failed:", err));

app.use("/auth/api", authController);
app.get("/", (req, res) => {
  res.send("Server running");
});

app.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
