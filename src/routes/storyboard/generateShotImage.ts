import express from "express";
import { success } from "@/lib/responseFormat";
import generateImageTool from "@/agents/storyboard/generateImageTool";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";

const router = express.Router();

const previewCellSchema = z.object({
  src: z.string().optional(),
  prompt: z.string(),
});

// Preview only: generate the storyboard grid image and return it without persistence.
export default router.post(
  "/",
  validateFields({
    segmentId: z.number().optional(),
    title: z.string().optional(),
    x: z.number().optional(),
    y: z.number().nullable().optional(),
    cells: z.array(previewCellSchema),
    scriptId: z.number(),
    projectId: z.number(),
  }),
  async (req, res) => {
    try {
      const { cells, scriptId, projectId } = req.body;
      const buffer = await generateImageTool(cells, scriptId, projectId);

      return res.json(success(buffer));
    } catch (error) {
      console.error("Failed to generate storyboard grid preview", error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate storyboard grid preview",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);
