import express from "express";
import { success } from "@/lib/responseFormat";
import chatgptOauthRuntimeManager from "@/lib/chatgptOauthRuntimeManager";

const router = express.Router();

const handler = async (req: express.Request, res: express.Response) => {
  await chatgptOauthRuntimeManager.refreshStatus();
  const status = chatgptOauthRuntimeManager.getStatus();
  res.status(200).send(success(status));
};

router.get("/", handler);
router.post("/", handler);

export default router;
