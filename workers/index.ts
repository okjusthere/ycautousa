import { handleRequest } from "./app";
import type { Env } from "./env";
import { processDueNotifications } from "./notifications";

export default {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await processDueNotifications(env);
  },
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
};
