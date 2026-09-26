import mongoose from "mongoose";

const ConversationMessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, immutable: true },
  sequence: { type: Number, required: true, min: 1 },
  role: { type: String, enum: ["user", "assistant"], required: true },
  text: { type: String, default: "" },
  requestId: { type: String, required: true, maxlength: 128 },
  replyToMessageId: { type: mongoose.Schema.Types.ObjectId, default: null },
  status: { type: String, enum: ["pending", "streaming", "completed", "interrupted", "failed"], required: true },
  completedAt: { type: Date, default: null },
  attemptToken: { type: String, default: null },
  errorCode: { type: String, default: null },
  contextRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  generation: { model: String, finishReason: String },
}, { timestamps: true });
ConversationMessageSchema.index({ conversationId: 1, sequence: 1 }, { unique: true });
ConversationMessageSchema.index({ conversationId: 1, requestId: 1, role: 1 }, { unique: true });
ConversationMessageSchema.index({ conversationId: 1, role: 1, status: 1, sequence: -1 });

export default mongoose.model("ConversationMessage", ConversationMessageSchema);
