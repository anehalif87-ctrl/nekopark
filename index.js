export { Room } from "./room.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Neko Park multiplayer server (Cloudflare Workers) is running.\n", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const roomId = url.searchParams.get("room") || "default";
    const id = env.ROOMS.idFromName(roomId);
    const stub = env.ROOMS.get(id);
    return stub.fetch(request);
  },
};
