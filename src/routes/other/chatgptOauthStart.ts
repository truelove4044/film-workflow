import express from "express";
import { success } from "@/lib/responseFormat";
import chatgptOauthRuntimeManager from "@/lib/chatgptOauthRuntimeManager";

const router = express.Router();

export default router.post("/", async (req, res) => {
  const result = chatgptOauthRuntimeManager.triggerStartFlow();
  await chatgptOauthRuntimeManager.refreshStatus();
  const status = chatgptOauthRuntimeManager.getStatus();
  res.status(200).send(
    success({
      ...status,
      accepted: result.accepted,
      actionMessage: result.message,
    }),
  );
});
