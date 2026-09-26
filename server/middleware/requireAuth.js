// Never take identity from a body field, query parameter, or localStorage.
export function requireAuth(UserModel) {
  return async (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Authentication required." });
    try {
      const user = await UserModel.findById(req.session.userId).select("_id name email profilePic").lean();
      if (!user) return res.status(401).json({ error: "Authentication required." });
      req.user = user;
      next();
    } catch {
      res.status(503).json({ error: "Authentication storage is unavailable." });
    }
  };
}
