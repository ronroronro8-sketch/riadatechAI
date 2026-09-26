import mongoose from "mongoose";

const ConversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "userInfos", required: true, immutable: true },
  title: { type: String, default: "محادثة جديدة", trim: true, maxlength: 160 },
  businessId: { type: mongoose.Schema.Types.ObjectId, default: null },
  status: { type: String, enum: ["active", "archived", "deleted"], default: "active" },
  lastMessageAt: { type: Date, default: Date.now },
  archivedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  // Reserved only. No summarization or Business Memory is performed in phase 2B.
  summary: {
    text: { type: String, default: "" },
    throughSequence: { type: Number, default: 0 },
    version: { type: Number, default: 0 },
    updatedAt: { type: Date, default: null },
  },
  nextSequence: { type: Number, default: 0 },
  activeTurn: {
    type: new mongoose.Schema({ requestId: String, token: String, expiresAt: Date }, { _id: false }),
    default: null,
  },
}, { timestamps: true });
ConversationSchema.index({ userId: 1, status: 1, lastMessageAt: -1, _id: -1 });

export default mongoose.model("Conversation", ConversationSchema);
