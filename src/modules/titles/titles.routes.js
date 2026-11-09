import { Router } from "express";
import { listTitles, createTitle, updateTitle, deleteTitle, addDefaultTitles } from "./titles.controller.js";

const router = Router();

router.get("/", listTitles);
router.post("/", createTitle);
router.post("/defaults", addDefaultTitles);
router.patch("/:id", updateTitle);
router.delete("/:id", deleteTitle);

export default router;
