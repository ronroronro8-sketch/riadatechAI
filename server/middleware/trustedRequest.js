export function trustedRequest(allowedOrigins) {
  return (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("Origin");
      const sameOrigin = `${req.protocol}://${req.get("host")}`;
      if (req.get("X-RiadaTech-Request") !== "1" || (origin && origin !== sameOrigin && !allowedOrigins.has(origin))) {
        return res.status(403).json({ error: "Request origin is not allowed." });
      }
    }
    next();
  };
}
